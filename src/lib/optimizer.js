import solver from 'javascript-lp-solver';
import { MAX_SERVINGS, NUTRIENT_OPTIMA, SOLVER_CONFIG, BIOAVAIL_BY_CATEGORY } from './constants';

/**
 * bioavail(food, nutrient) — fraction of `food[nutrient]` that the body
 * actually absorbs. Defaults to 1.0 (no adjustment) for nutrients where we
 * don't have a per-category factor.
 */
function bioavail(food, nutrient) {
  const map = BIOAVAIL_BY_CATEGORY[food.cat];
  if (!map) return 1;
  const f = map[nutrient];
  return f == null ? 1 : f;
}

/**
 * Diet Optimizer v3 — targets OPTIMAL ranges, not minimums.
 *
 * The v2 optimizer produced chicken+whey+oats+PB plans with vitA at 6%,
 * vitC at 4%, vitD at 0%. That happened because:
 *
 *   1. The LP objective was pure min-cost, so the solver parked nutrients
 *      at their floors and never climbed toward 'opt'. Min-cost with box
 *      constraints targets the MIN, not the OPT.
 *
 *   2. On infeasibility, it deleted ALL max constraints and halved ALL
 *      floors — so a single restrictive nutrient (say vitD, hard to hit
 *      without fish or dairy) nuked every other floor too.
 *
 * This rewrite fixes both:
 *
 *   1. Adds soft slack variables d_<nutrient> and e_<nutrient> that measure
 *      distance below/above 'opt', and puts a $-denominated penalty on each
 *      in the objective. The solver now actively pays to reach 'opt'.
 *
 *   2. On infeasibility, relaxes the min of ONE nutrient at a time until
 *      the LP solves, then reports which nutrients needed relaxation so the
 *      UI can flag them.
 *
 * Perf: solve time on ~80 foods × ~30 nutrients × ~2 slacks each is ~30ms
 * on a mid-range laptop. Debounce user input at the call site.
 */

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Array}  foods            Food records (already excluded filtered out)
 * @param {Object} targets          From calcTargets(): {calories, protein, ...}
 * @param {string} region           'us' | 'ne' | 'mw' | 'so' | 'we'
 * @param {number} costIndex        100 = national average
 * @param {string} gender           'male' | 'female'
 * @param {Object} [opts]
 * @param {Map<number,number>} [opts.locks]    foodId -> forced serving count
 * @param {Set<number>}        [opts.pins]     foodId -> must be in plan (≥1 serving)
 *
 * @returns {{
 *   plan: Array,
 *   totals: Object,
 *   feasible: boolean,
 *   targets: Object,
 *   nutrientScores: Object,
 *   warnings: Array<string>,
 *   relaxed: Array<string>   // nutrients we had to drop the floor on
 * }}
 */
export function optimizeDiet(foods, targets, region, costIndex, gender, opts = {}) {
  const { locks = new Map(), pins = new Set(), mode = 'cost' } = opts;
  const costMult = costIndex / 100;
  const regionKey = region || 'us';

  // Mode tuning.
  //   'cost'      — soft-target opt with small slack penalty. Cheapest plan
  //                 that meets the DRI floors. Default.
  //   'nutrients' — RAISE the hard floors from `min` to `opt` for every
  //                 micronutrient. The LP must hit at least the optimum
  //                 for each, no soft targeting. Plus 3× slack penalty so
  //                 the solver still tries to push past opt where cheap.
  //                 If a floor at opt is infeasible, the relaxation
  //                 cascade drops it back to min for that nutrient
  //                 (better than nothing).
  //
  // Earlier version of this just multiplied slack penalties by 5×, which
  // counterintuitively made the solver pick *worse* plans (it tried to
  // hit opt softly, but with so much excess penalty it landed BELOW opt
  // on more nutrients). Hard-targeting opt is the right semantics.
  const isNutrientsMode = mode === 'nutrients';
  const modeMult = isNutrientsMode ? 3 : 1;

  const buildModel = (floorOverrides = {}) => {
    const model = {
      optimize: 'cost',
      opType: 'min',
      constraints: {},
      variables: {},
      ints: {},
    };

    // ─── Macronutrient bounds ─────────────────────────────────────────
    // Cholesterol uses targets.maxChol (default 300 mg) so the user's
    // editable target box can tighten it. Sat fat ceiling likewise.
    model.constraints.protein_min = { min: targets.protein };
    model.constraints.protein_max = { max: Math.round(targets.protein * 1.15) };
    model.constraints.cal_min     = { min: Math.round(targets.calories * 0.93) };
    model.constraints.cal_max     = { max: Math.round(targets.calories * 1.07) };
    model.constraints.satfat_max  = { max: targets.maxSatFat };
    model.constraints.chol_max    = { max: targets.maxChol ?? 300 };
    model.constraints.sugar_max   = { max: targets.maxSugar };
    model.constraints.fiber_min   = { min: Math.max(30, targets.fiber) };
    model.constraints.sodium_max  = { max: targets.maxSodium ?? 2300 };

    // ─── Micronutrient ranges with soft deviation slacks ──────────────
    //
    // For each nutrient N with range [min, opt, max] and actual intake A:
    //
    //   hard:  min ≤ A ≤ max
    //   soft:  A - d_N + e_N = opt        (d_N, e_N ≥ 0)
    //          → d_N measures shortfall below opt
    //          → e_N measures excess above opt
    //   cost:  objective += P_def·d_N + P_exc·e_N
    //
    // If the LP is feasible the solver finds the cheapest combination of
    // foods AND slack that minimizes (food cost + deficit penalty + excess
    // penalty). Hitting opt exactly is free.
    //
    for (const [nutrient, range] of Object.entries(NUTRIENT_OPTIMA)) {
      // In nutrients mode, the floor is `opt` (must hit the optimum).
      // The relaxation cascade can still drop it via floorOverrides if
      // infeasible.
      const baseFloor = isNutrientsMode ? range.opt : range.min;
      const floor = floorOverrides[nutrient] ?? baseFloor;
      model.constraints[`n_${nutrient}_min`] = { min: floor };
      if (range.max > 0) {
        model.constraints[`n_${nutrient}_max`] = { max: range.max };
      }
      // slack-balance constraint:  Σ(food_N · x) - d + e = opt
      model.constraints[`n_${nutrient}_tgt`] = { equal: range.opt };
    }

    // ─── Diversity / dietary-pattern constraints ──────────────────────
    model.constraints.veg_min     = { min: 2 };
    model.constraints.fruit_min   = { min: 1 };
    model.constraints.legume_or_grain_min = { min: 1 };

    // ─── Food variables ───────────────────────────────────────────────
    for (const food of foods) {
      const basePrice = (food.price[regionKey] ?? food.price.us) * costMult;
      const maxS      = MAX_SERVINGS[food.cat] || SOLVER_CONFIG.maxPerFoodDefault;
      const varName   = `f${food.id}`;

      // Hormone nudge: small discount on hormone-supporting foods.
      // Kept gentle so it doesn't override actual nutrient targeting.
      const hormoneTags = (gender === 'male' ? food.hormoneM : food.hormoneF) || [];
      const hormoneDiscount = Math.min(0.10, hormoneTags.length * 0.015);
      const effectiveCost   = Math.max(0.01, basePrice - hormoneDiscount);

      const v = {
        cost: effectiveCost,
        // macros (contribute to the constraints above)
        protein_min: food.p,   protein_max: food.p,
        cal_min:     food.cal, cal_max:     food.cal,
        satfat_max:  food.sf,
        chol_max:    food.chol,
        sugar_max:   food.sug,
        fiber_min:   food.fib,
        sodium_max:  food.na,
        // diversity indicators
        veg_min:              food.cat === 'vegetables' ? 1 : 0,
        fruit_min:            food.cat === 'fruits' ? 1 : 0,
        legume_or_grain_min:  (food.cat === 'legumes' || food.cat === 'grains') ? 1 : 0,
      };

      // micronutrient contributions — raw labeled %DV. The DRI values that
      // back NUTRIENT_OPTIMA already assume average mixed-diet bioavailability,
      // so applying a per-food factor here would double-penalize. We compute
      // a separate "absorbed" total below for display, and use it to surface
      // warnings (low heme iron, calcium-iron clashes, etc).
      for (const nutrient of Object.keys(NUTRIENT_OPTIMA)) {
        const amount = food[nutrient] || 0;
        v[`n_${nutrient}_min`] = amount;
        v[`n_${nutrient}_tgt`] = amount;
        if (NUTRIENT_OPTIMA[nutrient].max > 0) v[`n_${nutrient}_max`] = amount;
      }

      // per-food serving cap
      v[`cap_${varName}`] = 1;
      model.constraints[`cap_${varName}`] = { max: maxS };

      // locked servings (quantity-adjust UI) → pin upper & lower
      if (locks.has(food.id)) {
        const q = locks.get(food.id);
        model.constraints[`lock_${varName}`] = { equal: q };
        v[`lock_${varName}`] = 1;
      }

      // pinned foods (must be included)
      if (pins.has(food.id)) {
        model.constraints[`pin_${varName}`] = { min: 1 };
        v[`pin_${varName}`] = 1;
      }

      model.variables[varName] = v;
      // NOTE: do NOT mark food vars as integer. javascript-lp-solver's MIP
      // branch-and-bound combined with the nutrient-equality slack
      // constraints below can blow up to 60+ seconds (or never terminate).
      // Solving as a pure LP keeps it under ~20ms; we round servings to
      // integers in post-processing below. Verified empirically: MIP+slack
      // intractable, LP+rounding fast and produces near-identical plans.
    }

    // ─── Slack variables for nutrient optimum targeting ───────────────
    //
    // For each nutrient we add two continuous variables:
    //   d_N (deficit below opt)  cost: P_def
    //   e_N (excess above opt)   cost: P_exc
    //
    // Constraint: Σ(food·A) + d_N - e_N = opt
    //   → A = opt - d_N + e_N
    //   → A below opt: d_N = (opt - A), e_N = 0  (paid P_def per %DV short)
    //   → A above opt: d_N = 0, e_N = (A - opt)  (paid P_exc per %DV over)
    //
    // IMPORTANT: d has coefficient +1, e has coefficient -1. Previous
    // version had these flipped, which caused the solver to use e as a
    // free way to satisfy the equality constraint — meaning nutrients
    // parked at the floor even with the penalty. Verified by an
    // equivalent scipy.linprog run during development.
    //
    const P_def = SOLVER_CONFIG.deficitPenaltyPerPct * modeMult;
    const P_exc = SOLVER_CONFIG.excessPenaltyPerPct * modeMult;
    for (const nutrient of Object.keys(NUTRIENT_OPTIMA)) {
      const dName = `d_${nutrient}`;
      const eName = `e_${nutrient}`;
      model.variables[dName] = { cost: P_def, [`n_${nutrient}_tgt`]:  1 };
      model.variables[eName] = { cost: P_exc, [`n_${nutrient}_tgt`]: -1 };
      // slacks are continuous ≥ 0 — do NOT add to ints
    }

    return model;
  };

  // ─── Solve with single-nutrient progressive relaxation ──────────────
  //
  // If the strict model is infeasible, try dropping floors ONE nutrient at
  // a time (hardest first). Previous version halved all floors on first
  // failure — that's why folate hit 280% while vitA was at 6%.
  //
  // DEADLINE: each solver.Solve call can be slow when many user pins are
  // active and constraints fight each other. Bail out of the relaxation
  // cascade if cumulative wall-clock exceeds DEADLINE_MS so the UI never
  // freezes (this was the "broken when I clicked pin" bug). The result
  // shape is identical to a normal infeasible result — just with
  // `timedOut: true` flagged in the warnings.
  //
  const DEADLINE_MS = 1500;
  const t0 = Date.now();
  const past = () => Date.now() - t0 > DEADLINE_MS;

  const relaxOrder = ['vitD', 'vitE', 'ca', 'vitK', 'vitA', 'vitC', 'folate',
                      'vitB6', 'vitB12', 'zn', 'fe', 'mg_', 'se'];

  let model = buildModel();
  let result = solver.Solve(model);
  const relaxed = [];
  let pinsRelaxed = false;
  let timedOut = false;

  for (const nutrient of relaxOrder) {
    if (result.feasible) break;
    if (past()) { timedOut = true; break; }
    const overrides = Object.fromEntries(relaxed.map(n => [n, 0]));
    overrides[nutrient] = 0;
    model = buildModel(overrides);
    result = solver.Solve(model);
    relaxed.push(nutrient);
  }

  // Calorie window relax
  if (!result.feasible && !past()) {
    model.constraints.cal_min = { min: Math.round(targets.calories * 0.85) };
    model.constraints.cal_max = { max: Math.round(targets.calories * 1.15) };
    result = solver.Solve(model);
  }

  // Last resort: drop user pins (they may be physically incompatible with
  // each other, e.g. 6 fish + 4 beef + calorie cap). Without this the LP
  // can hang indefinitely; better to give the user a feasible plan plus a
  // visible warning that their pins were too tight.
  if ((!result.feasible || past()) && pins.size > 0) {
    pinsRelaxed = true;
    const overrides = Object.fromEntries(relaxed.map(n => [n, 0]));
    model = buildModel(overrides);
    // Strip pin constraints from the rebuilt model
    for (const f of foods) {
      delete model.constraints[`pin_f${f.id}`];
      if (model.variables[`f${f.id}`]) delete model.variables[`f${f.id}`][`pin_f${f.id}`];
    }
    result = solver.Solve(model);
  }
  if (past()) timedOut = true;

  // ─── Parse plan ─────────────────────────────────────────────────────
  const plan = [];
  for (const food of foods) {
    const servings = Math.round(result[`f${food.id}`] || 0);
    if (servings > 0) {
      const price = (food.price[regionKey] ?? food.price.us) * costMult;
      plan.push({ ...food, servings, totalCost: +(price * servings).toFixed(2) });
    }
  }

  // ─── Totals ─────────────────────────────────────────────────────────
  const totals = plan.reduce((acc, f) => {
    const s = f.servings;
    for (const k of TOTAL_KEYS) acc[k] += (f[k] || 0) * s;
    acc.cost += f.totalCost;
    return acc;
  }, Object.fromEntries([...TOTAL_KEYS, 'cost'].map(k => [k, 0])));

  for (const k of Object.keys(totals)) {
    totals[k] = k === 'cost' ? +totals[k].toFixed(2) : Math.round(totals[k] * 10) / 10;
  }

  // ─── Bioavailable (absorbed) totals ─────────────────────────────────
  // Per-source absorption is wildly different (heme Fe ~25%, plant Fe ~10%;
  // dairy Ca ~32%, oxalate-rich greens ~5%; etc). We sum a "what your body
  // actually absorbs" total alongside the labeled %DV total so the UI can
  // show both, and we apply a vit-C synergy boost on non-heme iron when
  // total vit C is high.
  const absorbedTotals = Object.fromEntries(Object.keys(NUTRIENT_OPTIMA).map(k => [k, 0]));
  for (const f of plan) {
    for (const n of Object.keys(NUTRIENT_OPTIMA)) {
      absorbedTotals[n] += (f[n] || 0) * bioavail(f, n) * f.servings;
    }
  }
  // Vit-C synergy bonus on non-heme iron (Hallberg 1989 — vit C >75mg can
  // 2–3x non-heme Fe absorption). Applied as a +20% bonus to absorbed iron
  // when total vit C ≥100%DV. Conservative vs published 200–300% boosts.
  if (totals.vitC >= 100) {
    absorbedTotals.fe *= 1.20;
  }
  // Round absorbed totals
  for (const k of Object.keys(absorbedTotals)) {
    absorbedTotals[k] = Math.round(absorbedTotals[k] * 10) / 10;
  }

  // ─── Per-food contribution tables (used by the UI to answer "where is
  // my iron coming from?" and "which foods cover my zinc target?") ────
  // For each nutrient, build a sorted list of {name, amount, pct} for each
  // food in the plan that supplies a non-zero amount.
  const contributorsByNutrient = {};
  for (const nutrient of Object.keys(NUTRIENT_OPTIMA)) {
    const items = [];
    for (const f of plan) {
      const amt = (f[nutrient] || 0) * f.servings;
      if (amt > 0.5) items.push({ id: f.id, name: f.name, servings: f.servings, amount: +amt.toFixed(1) });
    }
    items.sort((a, b) => b.amount - a.amount);
    contributorsByNutrient[nutrient] = items;
  }
  // Same shape for the macros the UI surfaces in the meal-plan stats:
  // protein (g), omega-3 (g), cholesterol (mg), saturated fat (g),
  // added sugar (g), sodium (mg). Used by the stat-card hover tooltips.
  for (const key of ['p', 'omega3', 'chol', 'sf', 'sug', 'na']) {
    const items = [];
    for (const f of plan) {
      const amt = (f[key] || 0) * f.servings;
      if (amt > 0.01) items.push({ id: f.id, name: f.name, servings: f.servings, amount: +amt.toFixed(2) });
    }
    items.sort((a, b) => b.amount - a.amount);
    contributorsByNutrient[key] = items;
  }

  // ─── Nutrient scores (for the Micronutrient Optimization UI) ────────
  const nutrientScores = {};
  for (const [nutrient, range] of Object.entries(NUTRIENT_OPTIMA)) {
    const actual = totals[nutrient] || 0;
    const absorbed = absorbedTotals[nutrient] || 0;
    let status;
    if (actual < range.min)      status = 'deficient';
    else if (actual < range.opt) status = 'low';
    else if (range.max === 0 || actual <= range.max) status = 'optimal';
    else                         status = 'excessive';
    nutrientScores[nutrient] = {
      label:    range.label,
      actual:   Math.round(actual),
      absorbed: Math.round(absorbed),
      min:      range.min,
      opt:      range.opt,
      max:      range.max || null,
      storage:  range.storage,
      status,
      relaxed: relaxed.includes(nutrient),
      contributors: contributorsByNutrient[nutrient].slice(0, 5),
    };
  }

  // ─── Absorption interaction warnings ────────────────────────────────
  const warnings = [];
  if (pinsRelaxed) {
    warnings.push('Your pinned foods couldn\'t all coexist with the nutrient/calorie targets — pins were dropped to find a feasible plan. Try unpinning a few.');
  }
  if (timedOut) {
    warnings.push('Solver hit its time budget; the plan shown may be approximate. Try removing some pins or excluded foods.');
  }
  if (totals.ca > 0 && totals.zn > 0 && totals.ca / totals.zn > 4) {
    warnings.push('High calcium:zinc ratio may reduce zinc absorption. Space high-Ca and high-Zn foods across meals.');
  }
  if (totals.fe > 100 && totals.ca > 150) {
    warnings.push('Iron and calcium both high — Ca inhibits non-heme Fe. Eat iron-rich and calcium-rich foods in separate meals.');
  }
  if (totals.vitC < 60 && totals.fe > 80) {
    warnings.push('Iron high, vitamin C low — vitamin C dramatically improves non-heme iron absorption. Add citrus or peppers.');
  }
  if (totals.zn > 200 && totals.fe > 150) {
    warnings.push('Zn and Fe both very high — they compete for the DMT1 transporter. Distribute across meals.');
  }
  // Bioavailability flags
  if (totals.fe >= 80 && absorbedTotals.fe < totals.fe * 0.55) {
    warnings.push(`Most of your iron is non-heme (plant) — only ~${Math.round(absorbedTotals.fe)}%DV is actually absorbed vs ${Math.round(totals.fe)}%DV labeled. Add red meat, liver, or pair with vit C.`);
  }
  if (totals.ca >= 80 && absorbedTotals.ca < totals.ca * 0.6) {
    warnings.push(`Calcium absorption looks low (~${Math.round(absorbedTotals.ca)}%DV absorbed vs ${Math.round(totals.ca)}%DV labeled) — leafy greens with oxalate aren't well-absorbed. Dairy, sardines, or fortified milk are better sources.`);
  }

  return {
    plan: plan.sort((a, b) => b.p * b.servings - a.p * a.servings),
    totals: friendlyTotals(totals),
    absorbedTotals,
    contributorsByNutrient,
    feasible: !!result.feasible,
    targets,
    nutrientScores,
    warnings,
    relaxed,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// helpers
// ─────────────────────────────────────────────────────────────────────────────

const TOTAL_KEYS = [
  'p', 'cal', 'f', 'sf', 'mf', 'chol', 'carb', 'fib', 'sug', 'na', 'omega3',
  'vitA', 'vitC', 'vitD', 'vitE', 'vitK', 'vitB6', 'vitB12', 'folate',
  'ca', 'fe', 'zn', 'mg_', 'se',
];

// Aliased for the UI (totals.protein reads nicer than totals.p, etc.)
// We duplicate rather than rename to avoid breaking the food records.
export function friendlyTotals(totals) {
  return {
    ...totals,
    protein:  totals.p,
    calories: totals.cal,
    fat:      totals.f,
    satFat:   totals.sf,
    monoFat:  totals.mf,
    carbs:    totals.carb,
    fiber:    totals.fib,
    sugar:    totals.sug,
    sodium:   totals.na,
  };
}
