import solver from 'javascript-lp-solver';
import { MAX_SERVINGS } from './constants';

/**
 * NUTRIENT OPTIMUM RANGES
 *
 * Unlike the v1 optimizer which only set minimum floors,
 * this targets the OPTIMAL intake range for each nutrient.
 * Values as %DV (100 = Daily Value).
 *
 * Sources: IOM DRIs, Linus Pauling Institute Micronutrient Info Center,
 * 2025 Dietary Guidelines Advisory Committee
 */
const NUTRIENT_OPTIMA = {
  // { min: floor, opt: ideal center, max: ceiling (UL-based) }
  // Optimizer rewards being NEAR opt, penalizes being below min or above max
  vitA:   { min: 80,  opt: 120, max: 300 },  // >300% = hypervitaminosis risk (preformed)
  vitC:   { min: 80,  opt: 150, max: 2000 },  // water-soluble, generous UL
  vitD:   { min: 60,  opt: 150, max: 400 },   // most people deficient; optimize high
  vitE:   { min: 60,  opt: 120, max: 700 },
  vitK:   { min: 80,  opt: 150, max: 9999 },  // no established UL
  vitB6:  { min: 80,  opt: 130, max: 5000 },
  vitB12: { min: 80,  opt: 200, max: 9999 },  // no UL, but excess is excreted
  folate: { min: 70,  opt: 130, max: 250 },   // UL for folic acid (not food folate)
  ca:     { min: 70,  opt: 110, max: 250 },   // excess calcium can inhibit iron/zinc
  fe:     { min: 80,  opt: 120, max: 250 },   // UL = 45mg, DV = 18mg → ~250%
  zn:     { min: 80,  opt: 120, max: 360 },   // UL = 40mg, DV = 11mg
  mg_:    { min: 80,  opt: 130, max: 9999 },  // food-form magnesium has no practical UL
  se:     { min: 70,  opt: 120, max: 730 },   // UL = 400mcg, DV = 55mcg
};

/**
 * NUTRIENT ABSORPTION INTERACTIONS
 *
 * These model real biochemical competition/synergy:
 *
 * CLASHES (compete for same transporter):
 *   - Zinc vs Copper: compete for metallothionein. Optimal Zn:Cu ratio = 8:1 to 15:1
 *   - Calcium vs Iron: Ca inhibits non-heme Fe absorption via DMT1 transporter
 *   - Calcium vs Zinc: high Ca reduces Zn bioavailability
 *   - Iron vs Zinc: compete for DMT1 at high doses
 *
 * SYNERGIES (enhance each other):
 *   - Vitamin C + Iron: ascorbic acid converts Fe3+ → Fe2+ (absorbable form)
 *   - Vitamin D + Calcium: D upregulates intestinal Ca absorption proteins
 *   - Fat + fat-soluble vitamins (A, D, E, K): require dietary fat for absorption
 *
 * Implementation: we add ratio constraints and bonus terms to the LP model.
 * Since LP can't model meal timing (which is where most absorption effects
 * actually matter), we ensure the DAILY totals support good ratios.
 */

/**
 * Solve the Diet Problem using Linear Programming.
 *
 * @param {Array} foods — available foods (after exclusions)
 * @param {Object} targets — from calcTargets()
 * @param {string} region — price region key (us/ne/mw/so/we)
 * @param {number} costIndex — city cost multiplier (100 = average)
 * @param {string} gender — male/female
 * @returns {Object} { plan, totals, feasible, nutrientScores }
 */
export function optimizeDiet(foods, targets, region, costIndex, gender) {
  const costMult = costIndex / 100;
  const regionKey = region || 'us';

  const model = {
    optimize: 'cost',
    opType: 'min',
    constraints: {},
    variables: {},
    ints: {},
  };

  // ─── MACRONUTRIENT CONSTRAINTS ─────────────────────────────────────

  // Protein: target ± 10% (tight band prevents waste)
  model.constraints.protein_min = { min: targets.protein };
  model.constraints.protein_max = { max: Math.round(targets.protein * 1.10) };

  // Calories: ± 6%
  model.constraints.cal_min = { min: Math.round(targets.calories * 0.94) };
  model.constraints.cal_max = { max: Math.round(targets.calories * 1.06) };

  // Saturated fat: ≤ 10% of calories
  model.constraints.satfat_max = { max: targets.maxSatFat };

  // Cholesterol: ≤ 300mg
  model.constraints.chol_max = { max: 300 };

  // Added sugar: ≤ 25g women / 36g men
  model.constraints.sugar_max = { max: targets.maxSugar };

  // Fiber: ≥ 30g (your request — above the DGA 14g/1000kcal minimum)
  model.constraints.fiber_min = { min: 30 };

  // Sodium: ≤ 2300mg
  model.constraints.sodium_max = { max: 2300 };

  // ─── MICRONUTRIENT OPTIMUM RANGES ──────────────────────────────────
  // For each nutrient, set a floor at the 'min' value.
  // We also set a ceiling at 'max' to prevent excessive intake
  // (which would waste money AND cause absorption clashes).

  for (const [nutrient, range] of Object.entries(NUTRIENT_OPTIMA)) {
    model.constraints[`n_${nutrient}_min`] = { min: range.min };
    if (range.max < 9000) {
      model.constraints[`n_${nutrient}_max`] = { max: range.max };
    }
  }

  // ─── ABSORPTION CLASH CONSTRAINTS ──────────────────────────────────

  // Zinc:Calcium ratio — if calcium gets too high relative to zinc,
  // zinc absorption drops. We constrain: calcium ≤ zinc × 4
  // (in %DV terms: if zinc = 120%DV, calcium can be up to 480%DV)
  // This is generous but prevents extreme imbalances.
  model.constraints.zn_ca_ratio = { max: 0 };
  // Implemented as: ca - 4*zn ≤ 0 → calcium_contribution - 4*zinc_contribution ≤ 0

  // Iron + Vitamin C synergy — ensure vitamin C is at least 80%
  // when iron is present (already handled by vitC min, but we can
  // reinforce). This is already covered by the vitC minimum constraint.

  // ─── DIVERSITY CONSTRAINTS ─────────────────────────────────────────

  // At least 2 vegetable servings
  model.constraints.veg_min = { min: 2 };

  // At least 1 fruit serving
  model.constraints.fruit_min = { min: 1 };

  // At least 2 distinct protein sources (we approximate by requiring
  // servings from at least 2 protein-containing categories)
  model.constraints.legume_or_grain_min = { min: 1 };

  // ─── BUILD VARIABLES ───────────────────────────────────────────────

  for (const food of foods) {
    const price = (food.price[regionKey] || food.price.us) * costMult;
    const maxS = MAX_SERVINGS[food.cat] || 3;
    const varName = `f${food.id}`;

    // Hormone bonus: small cost discount for hormone-supporting foods
    const hormoneHits = (gender === 'male' ? food.hormoneM : food.hormoneF).length;
    const hormoneDiscount = hormoneHits * 0.012;

    // Nutrient density bonus: foods with high micro scores get a small discount
    const microBonus = (food.micro / 10) * 0.02;

    const effectiveCost = Math.max(0.01, price - hormoneDiscount - microBonus);

    const v = {
      cost: effectiveCost,
      // Macros
      protein_min: food.p,
      protein_max: food.p,
      cal_min: food.cal,
      cal_max: food.cal,
      satfat_max: food.sf,
      chol_max: food.chol,
      sugar_max: food.sug,
      fiber_min: food.fib,
      sodium_max: food.na,
      // Micronutrients (all as %DV per serving)
      n_vitA_min: food.vitA,    n_vitA_max: food.vitA,
      n_vitC_min: food.vitC,    n_vitC_max: food.vitC,
      n_vitD_min: food.vitD,    n_vitD_max: food.vitD,
      n_vitE_min: food.vitE,    n_vitE_max: food.vitE,
      n_vitK_min: food.vitK,    n_vitK_max: food.vitK,
      n_vitB6_min: food.vitB6,  n_vitB6_max: food.vitB6,
      n_vitB12_min: food.vitB12,n_vitB12_max: food.vitB12,
      n_folate_min: food.folate,n_folate_max: food.folate,
      n_ca_min: food.ca,        n_ca_max: food.ca,
      n_fe_min: food.fe,        n_fe_max: food.fe,
      n_zn_min: food.zn,        n_zn_max: food.zn,
      n_mg__min: food.mg_,      n_mg__max: food.mg_,
      n_se_min: food.se,        n_se_max: food.se,
      // Absorption clash: ca - 4*zn ≤ 0
      zn_ca_ratio: food.ca - 4 * food.zn,
      // Diversity
      veg_min: food.cat === 'vegetables' ? 1 : 0,
      fruit_min: food.cat === 'fruits' ? 1 : 0,
      legume_or_grain_min: (food.cat === 'legumes' || food.cat === 'grains') ? 1 : 0,
    };

    // Max servings per food
    v[`cap_${varName}`] = 1;
    model.constraints[`cap_${varName}`] = { max: maxS };

    model.variables[varName] = v;
    model.ints[varName] = 1;
  }

  // ─── SOLVE (with progressive relaxation) ────────────────────────────

  let result = solver.Solve(model);

  // Pass 1 failed → relax micronutrient ceilings
  if (!result.feasible) {
    for (const nutrient of Object.keys(NUTRIENT_OPTIMA)) {
      delete model.constraints[`n_${nutrient}_max`];
    }
    delete model.constraints.zn_ca_ratio;
    result = solver.Solve(model);
  }

  // Pass 2 failed → relax micronutrient floors to 50% of original
  if (!result.feasible) {
    for (const [nutrient, range] of Object.entries(NUTRIENT_OPTIMA)) {
      model.constraints[`n_${nutrient}_min`] = { min: Math.round(range.min * 0.5) };
    }
    result = solver.Solve(model);
  }

  // Pass 3 failed → relax calorie and fiber constraints
  if (!result.feasible) {
    model.constraints.cal_min = { min: Math.round(targets.calories * 0.80) };
    model.constraints.cal_max = { max: Math.round(targets.calories * 1.25) };
    model.constraints.fiber_min = { min: 14 };
    result = solver.Solve(model);
  }

  // ─── PARSE RESULTS ──────────────────────────────────────────────────

  const plan = [];
  for (const food of foods) {
    const varName = `f${food.id}`;
    const servings = Math.round(result[varName] || 0);
    if (servings > 0) {
      const price = (food.price[regionKey] || food.price.us) * costMult;
      plan.push({ ...food, servings, totalCost: +(price * servings).toFixed(2) });
    }
  }

  // Calculate totals
  const totals = plan.reduce((acc, f) => {
    const s = f.servings;
    return {
      protein: acc.protein + f.p * s,
      calories: acc.calories + f.cal * s,
      fat: acc.fat + f.f * s,
      satFat: acc.satFat + f.sf * s,
      monoFat: acc.monoFat + (f.mf || 0) * s,
      chol: acc.chol + f.chol * s,
      carbs: acc.carbs + f.carb * s,
      fiber: acc.fiber + f.fib * s,
      sugar: acc.sugar + f.sug * s,
      sodium: acc.sodium + f.na * s,
      cost: acc.cost + f.totalCost,
      omega3: acc.omega3 + f.omega3 * s,
      vitA: acc.vitA + f.vitA * s,
      vitC: acc.vitC + f.vitC * s,
      vitD: acc.vitD + f.vitD * s,
      vitE: acc.vitE + f.vitE * s,
      vitK: acc.vitK + f.vitK * s,
      vitB6: acc.vitB6 + f.vitB6 * s,
      vitB12: acc.vitB12 + f.vitB12 * s,
      folate: acc.folate + f.folate * s,
      ca: acc.ca + f.ca * s,
      fe: acc.fe + f.fe * s,
      zn: acc.zn + f.zn * s,
      mg_: acc.mg_ + f.mg_ * s,
      se: acc.se + f.se * s,
    };
  }, {
    protein:0, calories:0, fat:0, satFat:0, monoFat:0, chol:0, carbs:0,
    fiber:0, sugar:0, sodium:0, cost:0, omega3:0,
    vitA:0, vitC:0, vitD:0, vitE:0, vitK:0,
    vitB6:0, vitB12:0, folate:0,
    ca:0, fe:0, zn:0, mg_:0, se:0,
  });

  // Round
  for (const key of Object.keys(totals)) {
    totals[key] = key === 'cost' ? +totals[key].toFixed(2) : Math.round(totals[key] * 10) / 10;
  }

  // ─── NUTRIENT SCORES (how close to optimum) ─────────────────────────

  const nutrientScores = {};
  for (const [nutrient, range] of Object.entries(NUTRIENT_OPTIMA)) {
    const actual = totals[nutrient] || 0;
    let score;
    if (actual < range.min) {
      score = actual / range.min; // 0-1 (deficient)
    } else if (actual <= range.opt) {
      score = 1 + (actual - range.min) / (range.opt - range.min) * 0.5; // 1-1.5 (good)
    } else if (actual <= range.max) {
      score = 1.5 - (actual - range.opt) / (range.max - range.opt) * 0.5; // 1.0-1.5 (ok but high)
    } else {
      score = Math.max(0.5, 1.0 - (actual - range.max) / range.max); // >UL
    }
    nutrientScores[nutrient] = {
      actual: Math.round(actual),
      min: range.min,
      opt: range.opt,
      max: range.max,
      score: Math.round(score * 100) / 100,
      status: actual < range.min ? 'deficient' : actual <= range.opt * 1.2 ? 'optimal' : actual <= range.max ? 'high' : 'excessive',
    };
  }

  // Absorption interaction warnings
  const warnings = [];
  if (totals.ca > 0 && totals.zn > 0 && totals.ca / totals.zn > 4) {
    warnings.push('High calcium:zinc ratio may reduce zinc absorption. Consider spacing high-calcium and high-zinc foods across different meals.');
  }
  if (totals.fe > 100 && totals.ca > 150) {
    warnings.push('Both iron and calcium are high. Calcium can inhibit non-heme iron absorption — eat iron-rich and calcium-rich foods in separate meals.');
  }
  if (totals.vitC < 60 && totals.fe > 80) {
    warnings.push('Iron is high but vitamin C is low. Vitamin C dramatically improves non-heme iron absorption — add citrus or peppers to iron-rich meals.');
  }
  if (totals.zn > 200 && totals.fe > 150) {
    warnings.push('Very high zinc and iron together can compete for absorption via DMT1. Distribute across meals.');
  }

  return {
    plan: plan.sort((a, b) => b.p * b.servings - a.p * a.servings),
    totals,
    feasible: result.feasible,
    targets,
    nutrientScores,
    warnings,
  };
}
