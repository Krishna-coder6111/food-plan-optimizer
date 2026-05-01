/**
 * Health-condition profile adjustments.
 *
 * Each entry shifts the optimizer's targets (raises floors, tightens
 * ceilings) and biases the supplement recommender toward what NIH ODS
 * fact sheets recommend for that condition.
 *
 * Sources for the per-condition tweaks:
 *   https://ods.od.nih.gov/factsheets/list-all/  (NIH Office of Dietary Supplements)
 *   ACOG (pregnancy) · ADA (diabetes) · AHA (cholesterol/HTN) · NOF (bone health)
 *
 * The adjustments are deliberately CONSERVATIVE — none of them
 * pharmacologic doses, and they're framed as "raise the optimum target"
 * rather than "force a specific intake". The user can still hit the
 * targets purely from food if they want.
 *
 * Shape:
 *   {
 *     id, name, group,
 *     summary,                          // shown in the UI
 *     macroTargets:    { fiber: '×1.3', sodium: '<= 1500', satFat: '<= 15g', sugar: '<= 15g' }
 *     micros:          { vitD: { min: 100, opt: 200 }, fe: { min: 100 } }
 *     suggestedSupps:  ['vitd', 'mag']  // ids in supplements.js
 *   }
 */

export const HEALTH_CONDITIONS = [
  // ── Reproductive / life-stage ──────────────────────────────────────────
  {
    id: 'pregnant', group: 'Life stage',
    name: 'Pregnant or trying to conceive',
    summary: 'Folate ↑ for neural tube; iron + B12 for blood volume; vit D + Ca for fetal bone.',
    micros: {
      folate: { min: 150, opt: 200 },
      fe:     { min: 150, opt: 220 },
      vitB12: { min: 100 },
      vitD:   { min: 100, opt: 200 },
      ca:     { min: 100 },
    },
    suggestedSupps: ['multi', 'vitd'],
  },
  {
    id: 'menstrual-fe', group: 'Life stage',
    name: 'Heavy menstrual cycles',
    summary: 'Pre-menopausal women lose ~1 mg Fe/day extra during menses; vit C aids absorption.',
    micros: { fe: { min: 130, opt: 180 }, vitC: { min: 100 } },
    suggestedSupps: ['iron', 'multi'],
  },
  {
    id: 'over-50', group: 'Life stage',
    name: 'Over 50',
    summary: 'Stomach acid drops with age — B12 absorption from food falls; vit D status declines.',
    micros: {
      vitD:   { min: 100, opt: 200 },
      vitB12: { min: 130, opt: 250 },
      ca:     { min: 100 },
    },
    suggestedSupps: ['multi', 'vitd', 'cad'],
  },

  // ── Cardiometabolic ────────────────────────────────────────────────────
  {
    id: 'hypertension', group: 'Cardiometabolic',
    name: 'High blood pressure (or family history)',
    summary: 'DASH-style: cap sodium ≤ 1500 mg, push potassium + Mg, more fiber.',
    macroOverrides: { maxSodium: 1500 },
    micros: { mg_: { min: 100, opt: 150 } },
    suggestedSupps: ['mag'],
  },
  {
    id: 'high-chol', group: 'Cardiometabolic',
    name: 'High cholesterol or heart disease risk',
    summary: 'Sat fat ≤ 7% of cals, fiber ↑, omega-3 ≥ 1g/day, monounsaturated > saturated.',
    macroOverrides: { satFatRatio: 0.07 },                 // overrides 0.10 default
    fiberFactor:    1.3,
    micros: {},                                            // no micro changes
    suggestedSupps: ['fishoil'],
  },
  {
    id: 'diabetes', group: 'Cardiometabolic',
    name: 'Diabetes / pre-diabetes',
    summary: 'Added sugar ≤ 15 g, fiber ↑ for glycemic control, Mg + Cr for insulin sensitivity.',
    macroOverrides: { maxSugar: 15 },
    fiberFactor: 1.3,
    micros: { mg_: { min: 100, opt: 130 } },
    suggestedSupps: ['mag'],
  },

  // ── Bone / hormonal ────────────────────────────────────────────────────
  {
    id: 'bone-health', group: 'Bone / hormonal',
    name: 'Bone health concerns / family osteoporosis',
    summary: 'Ca + vit D + vit K together; protein doesn\'t hurt bone density at our levels.',
    micros: {
      ca:   { min: 110, opt: 130 },
      vitD: { min: 120, opt: 200 },
      vitK: { min: 120, opt: 200 },
    },
    suggestedSupps: ['cad', 'vitd'],
  },
  {
    id: 'thyroid', group: 'Bone / hormonal',
    name: 'Thyroid issues (hypo/hyper)',
    summary: 'Selenium for T4→T3 conversion; iodine via dairy/eggs/seafood/iodized salt.',
    micros: { se: { min: 100, opt: 150 } },
    suggestedSupps: ['multi'],
  },

  // ── GI / inflammation ──────────────────────────────────────────────────
  {
    id: 'ibs', group: 'GI / inflammation',
    name: 'IBS / gut sensitivity',
    summary: 'Probiotic-rich foods; Mg if constipation-dominant; Mg-citrate is laxative — careful.',
    micros: { mg_: { min: 90 } },
    suggestedSupps: ['mag'],
  },
  {
    id: 'inflammation', group: 'GI / inflammation',
    name: 'Chronic inflammation / autoimmune',
    summary: 'Push omega-3, polyphenol-dense foods (berries, EVOO, dark chocolate), drop refined carbs.',
    micros: {},
    suggestedSupps: ['fishoil'],
    boostAntiInflam: true,                                 // UI hint only for now
  },

  // ── Diet pattern ───────────────────────────────────────────────────────
  {
    id: 'vegan', group: 'Diet pattern',
    name: 'Vegan / strict vegetarian',
    summary: 'B12 has no plant source; iron/zinc absorption is half of animal sources; vit D often low.',
    micros: {
      vitB12: { min: 130, opt: 200 },
      fe:     { min: 130, opt: 180 },
      zn:     { min: 110 },
      vitD:   { min: 100, opt: 200 },
      ca:     { min: 100 },
    },
    suggestedSupps: ['multi', 'vitd'],
  },
  {
    id: 'lactose', group: 'Diet pattern',
    name: 'Lactose intolerant / dairy-free',
    summary: 'Ca + vit D usually come from dairy — replace with sardines, kale, fortified plant milk.',
    micros: {
      ca:   { min: 100 },
      vitD: { min: 100, opt: 200 },
    },
    suggestedSupps: ['cad'],
  },
];

/**
 * Apply a set of selected condition ids to the LP targets object.
 * - Bumps fiber by the largest applicable factor
 * - Tightens macro caps to the most-restrictive override
 * - The optimizer's NUTRIENT_OPTIMA is unchanged here; we surface
 *   per-nutrient adjustments separately for the supplement recommender
 *   to reason about (since changing NUTRIENT_OPTIMA at runtime would
 *   need deeper plumbing).
 *
 * Returns: a NEW targets object plus a `microAdjustments` map that the
 * supplement recommender can use to compute "still-deficient under
 * the stricter targets".
 */
export function applyHealthConditions(targets, selectedIds = []) {
  if (!selectedIds || selectedIds.length === 0) return { targets, microAdjustments: {} };

  const next = { ...targets };
  let fiberMult = 1;
  const microAdjustments = {};

  for (const id of selectedIds) {
    const c = HEALTH_CONDITIONS.find(x => x.id === id);
    if (!c) continue;

    if (c.fiberFactor) fiberMult = Math.max(fiberMult, c.fiberFactor);

    const overrides = c.macroOverrides || {};
    if (overrides.maxSodium != null) next.maxSodium = Math.min(next.maxSodium ?? 2300, overrides.maxSodium);
    if (overrides.maxSugar  != null) next.maxSugar  = Math.min(next.maxSugar  ?? 36,   overrides.maxSugar);
    if (overrides.maxChol   != null) next.maxChol   = Math.min(next.maxChol   ?? 300,  overrides.maxChol);
    if (overrides.satFatRatio != null) {
      const newCap = Math.round((targets.calories * overrides.satFatRatio) / 9);
      next.maxSatFat = Math.min(next.maxSatFat ?? targets.maxSatFat, newCap);
    }

    for (const [k, v] of Object.entries(c.micros || {})) {
      const cur = microAdjustments[k] || {};
      microAdjustments[k] = {
        min: Math.max(cur.min ?? 0, v.min ?? 0),
        opt: Math.max(cur.opt ?? 0, v.opt ?? 0),
      };
    }
  }

  next.fiber = Math.round(targets.fiber * fiberMult);

  return { targets: next, microAdjustments };
}

/**
 * Return the union of suggested supplement ids across selected
 * conditions. The actual recommender still filters by gender + actual
 * gaps; this just biases the catalog toward condition-relevant SKUs.
 */
export function conditionsToSupps(selectedIds = []) {
  const out = new Set();
  for (const id of selectedIds) {
    const c = HEALTH_CONDITIONS.find(x => x.id === id);
    if (!c) continue;
    for (const s of c.suggestedSupps || []) out.add(s);
  }
  return [...out];
}
