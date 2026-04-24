/**
 * Nutrient Engine — Constants & Targets
 *
 * NUTRIENT_OPTIMA lives here (not in optimizer.js) so the UI can render
 * the same ranges the solver optimizes against. Single source of truth.
 *
 * Sources: IOM DRIs, Linus Pauling Institute Micronutrient Info Center,
 * 2025 Dietary Guidelines Advisory Committee.
 */

export const MACRO_PRESETS = {
  maingain:      { id: 'maingain',      name: 'Maingaining',       p: 27, c: 58, f: 15, calAdj: 0,   desc: 'Maintenance calories. High protein for slow recomp.' },
  lean_bulk:     { id: 'lean_bulk',     name: 'Lean Bulk',         p: 25, c: 55, f: 20, calAdj: 10,  desc: '+10% surplus. Moderate surplus for lean mass gain.' },
  standard_bulk: { id: 'standard_bulk', name: 'Standard Bulk',     p: 22, c: 55, f: 23, calAdj: 15,  desc: '+15% surplus. Faster mass gain, some fat accepted.' },
  cut:           { id: 'cut',           name: 'Cutting',           p: 35, c: 40, f: 25, calAdj: -20, desc: '-20% deficit. High protein to preserve muscle.' },
  recomp:        { id: 'recomp',        name: 'Body Recomp',       p: 30, c: 45, f: 25, calAdj: -5,  desc: '-5% deficit. Slow body recomposition.' },
  endurance:     { id: 'endurance',     name: 'Endurance',         p: 18, c: 62, f: 20, calAdj: 10,  desc: '+10% surplus. Carb-heavy for glycogen stores.' },
  sport:         { id: 'sport',         name: 'Competitive Sport', p: 22, c: 55, f: 23, calAdj: 5,   desc: '+5% surplus. Balanced for performance.' },
  split_40_40_20:{ id: 'split_40_40_20',name: '40/40/20',          p: 40, c: 40, f: 20, calAdj: 0,   desc: 'Classic bodybuilding split. Very high protein.' },
  keto:          { id: 'keto',          name: 'Keto',              p: 25, c: 5,  f: 70, calAdj: 0,   desc: 'Very low carb, high fat. Ketogenic.' },
};

export const ACTIVITY_LEVELS = [
  { value: 'sedentary',  label: 'Sedentary (desk job, little exercise)',  mult: 1.2   },
  { value: 'light',      label: 'Light (1-2 workouts/week)',              mult: 1.375 },
  { value: 'moderate',   label: 'Moderate (3-5 workouts/week)',           mult: 1.55  },
  { value: 'active',     label: 'Active (6-7 workouts/week)',             mult: 1.725 },
  { value: 'very_active',label: 'Very Active (2x/day or physical job)',   mult: 1.9   },
];

// Max servings per food category (acceptability — prevents "8 cans of tuna" solutions)
export const MAX_SERVINGS = {
  poultry: 3,
  beef: 2,       // limit red meat per Mediterranean/DASH evidence
  fish: 3,
  dairy: 3,
  eggs: 2,       // max 4 eggs/day
  legumes: 4,
  grains: 5,
  vegetables: 5,
  fruits: 4,
  nuts: 3,
  fats: 3,
  supplement: 2,
};

/**
 * NUTRIENT_OPTIMA — all values in %DV.
 *
 *   min: absolute floor the solver will try to hit
 *   opt: the value we want to target ("optimum")
 *   max: UL-derived ceiling
 *
 * The optimizer treats `opt` as the target and penalizes distance from it
 * (below opt = deficiency penalty, above opt = waste/toxicity penalty).
 * The `min` and `max` are hard box constraints.
 *
 * Why 'opt' is above 100%DV for many nutrients:
 *   DV = Daily Value = the label claim floor. It's not "optimal intake".
 *   Linus Pauling Institute recommends ~150% DV for most vitamins.
 *   This is why the previous version kept hitting deficient on vitA/C/D —
 *   even with constraints met, the solver has no reason to go past min.
 */
export const NUTRIENT_OPTIMA = {
  vitA:   { min: 80,  opt: 120, max: 300,  label: 'Vitamin A' },
  vitC:   { min: 80,  opt: 150, max: 2000, label: 'Vitamin C' },
  vitD:   { min: 60,  opt: 150, max: 400,  label: 'Vitamin D' },
  vitE:   { min: 60,  opt: 120, max: 700,  label: 'Vitamin E' },
  vitK:   { min: 80,  opt: 150, max: 0,    label: 'Vitamin K' },  // max=0 → no ceiling
  vitB6:  { min: 80,  opt: 130, max: 5000, label: 'Vitamin B6' },
  vitB12: { min: 80,  opt: 200, max: 0,    label: 'Vitamin B12' },
  folate: { min: 70,  opt: 130, max: 250,  label: 'Folate' },
  ca:     { min: 70,  opt: 110, max: 250,  label: 'Calcium' },
  fe:     { min: 80,  opt: 120, max: 250,  label: 'Iron' },
  zn:     { min: 80,  opt: 120, max: 360,  label: 'Zinc' },
  mg_:    { min: 80,  opt: 130, max: 0,    label: 'Magnesium' },
  se:     { min: 70,  opt: 120, max: 730,  label: 'Selenium' },
};

/**
 * SOLVER_CONFIG — tuning knobs for the optimizer.
 *
 *   deficitPenalty: $ penalty per 1%DV below opt
 *   excessPenalty:  $ penalty per 1%DV above opt (within [opt, max])
 *   these get balanced against food cost in the LP objective.
 *
 * The values here were chosen so that a single food serving at $0.50
 * is preferred over walking a nutrient ~10%DV away from opt. Tuned
 * empirically — if the solver ignores vitamins, lower the food-cost
 * weight (or raise penalties).
 */
export const SOLVER_CONFIG = {
  deficitPenaltyPerPct: 0.015,  // $0.015 per %DV below opt
  excessPenaltyPerPct:  0.005,  // excess is less bad than deficit
  diversityBonus:       0.30,   // discount applied to encourage distinct foods
  maxPerFoodDefault:    3,
};
