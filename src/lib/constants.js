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
/**
 * `storage` describes the body's reservoir for that nutrient and is used
 * by the UI to soften "deficient" warnings for nutrients you don't need
 * every day:
 *   - 'water'  : water-soluble, no real storage. Aim daily.
 *   - 'fat'    : fat-soluble, body stockpiles a few days–weeks. Weekly avg matters.
 *   - 'long'   : multi-month+ stores (B12 in liver, Fe as ferritin, Ca in bones).
 *                A single low-intake day is irrelevant; chronic shortfall matters.
 */
export const NUTRIENT_OPTIMA = {
  vitA:   { min: 80,  opt: 120, max: 300,  label: 'Vitamin A',  storage: 'fat'   },
  vitC:   { min: 80,  opt: 150, max: 2000, label: 'Vitamin C',  storage: 'water' },
  vitD:   { min: 60,  opt: 150, max: 400,  label: 'Vitamin D',  storage: 'fat'   },
  vitE:   { min: 60,  opt: 120, max: 700,  label: 'Vitamin E',  storage: 'fat'   },
  vitK:   { min: 80,  opt: 150, max: 0,    label: 'Vitamin K',  storage: 'fat'   },
  vitB6:  { min: 80,  opt: 130, max: 5000, label: 'Vitamin B6', storage: 'water' },
  vitB12: { min: 80,  opt: 200, max: 0,    label: 'Vitamin B12',storage: 'long'  },
  folate: { min: 70,  opt: 130, max: 250,  label: 'Folate',     storage: 'water' },
  ca:     { min: 70,  opt: 110, max: 250,  label: 'Calcium',    storage: 'long'  },
  fe:     { min: 80,  opt: 120, max: 250,  label: 'Iron',       storage: 'long'  },
  zn:     { min: 80,  opt: 120, max: 360,  label: 'Zinc',       storage: 'water' },
  mg_:    { min: 80,  opt: 130, max: 0,    label: 'Magnesium',  storage: 'water' },
  se:     { min: 70,  opt: 120, max: 730,  label: 'Selenium',   storage: 'water' },
};

/**
 * Antioxidant capacity per food, expressed as a 0–10 score loosely
 * indexed to USDA ORAC values (Oxygen Radical Absorbance Capacity).
 *
 * USDA pulled their official ORAC database in 2012 because in-vitro
 * antioxidant numbers don't translate well to in-vivo benefit, but the
 * relative ordering across food categories is still useful as a rough
 * "phytonutrient density" signal — high-end berries / cocoa / dark
 * greens really do pack more polyphenols than chicken or rice.
 *
 * We compute it on the fly from category + name keyword to avoid
 * editing 80 food rows. Numbers are approximate, treat as ±2 points.
 */
const ANTIOX_BY_CAT = {
  fruits:     7,   // most berries blow this away, see overrides
  vegetables: 6,
  nuts:       6,
  legumes:    5,
  grains:     2,
  poultry:    1,
  beef:       2,
  fish:       2,
  eggs:       2,
  dairy:      1,
  fats:       2,
  supplement: 0,
};

// Name-keyword overrides for foods that punch above (or below) their category.
const ANTIOX_OVERRIDES = [
  [/berr|blueberr|blackberr|raspberr|cranberr/i, 10],
  [/kale|spinach|chard|collard/i,                 9],
  [/broccoli|brussels|cauliflower|cabbage/i,      8],
  [/walnut|pecan|chestnut/i,                      8],
  [/dark chocolate|cocoa/i,                       10],
  [/turmeric|cinnamon|clove|oregano/i,            10],
  [/liver/i,                                       7],   // organ meats are surprisingly high
  [/extra virgin olive oil/i,                      6],
  [/wild salmon|sardine|mackerel/i,                4],   // some astaxanthin
  [/orange|lemon|grapefruit/i,                     7],
  [/apple|grape/i,                                 6],
];

export function antioxScore(food) {
  for (const [pat, score] of ANTIOX_OVERRIDES) {
    if (pat.test(food.name)) return score;
  }
  return ANTIOX_BY_CAT[food.cat] ?? 3;
}

/**
 * STORAGE_NOTES — copy strings the UI uses to explain the storage horizon.
 */
export const STORAGE_NOTES = {
  water: { tag: 'daily',  label: 'Water-soluble — no body store, aim for the floor every day.' },
  fat:   { tag: 'weekly', label: 'Fat-soluble — body stockpiles for ~1–4 weeks, weekly average matters.' },
  long:  { tag: 'months', label: 'Long-term store — body holds months to years of supply, chronic shortfall is what counts.' },
};

/**
 * STORE_TIERS — empirical price multipliers per store category.
 *
 * Multiplies the city's costIndex. So a city with index 110 (10% above
 * national avg) shopping at Costco (mult 0.78) gets effective index
 * 110 × 0.78 ≈ 86. Tuned against published mystery-shopper datasets and
 * Consumer Reports surveys; treat as ±10% accurate.
 */
export const STORE_TIERS = [
  { id: 'costco',     name: "Costco / Sam's Club",  mult: 0.78, desc: 'Bulk warehouse — cheapest per unit if you can store it.' },
  { id: 'walmart',    name: 'Walmart / Aldi',       mult: 0.88, desc: 'Discount national chain — best baseline for staples.' },
  { id: 'tj',         name: "Trader Joe's",         mult: 0.95, desc: 'Private-label discount — cheap on a few categories.' },
  { id: 'mainstream', name: 'Kroger / Safeway',     mult: 1.00, desc: 'Mainstream supermarket — national average baseline.' },
  { id: 'sprouts',    name: 'Sprouts / Fresh Market', mult: 1.15, desc: 'Natural-foods chain — premium produce, mid-price center store.' },
  { id: 'wholefoods', name: 'Whole Foods',          mult: 1.32, desc: 'Premium organic — highest grocery prices in most markets.' },
  { id: 'corner',     name: 'Corner / Bodega',      mult: 1.45, desc: 'Convenience-store pricing — for emergencies only.' },
];

/**
 * BIOAVAILABILITY — fraction of stated nutrient that is actually absorbed.
 *
 * The %DV labels assume ideal absorption, but real human absorption varies
 * massively by source:
 *   - Heme iron (animal): ~25% absorbed | non-heme (plant): ~5–15%
 *   - Zinc from animal: ~30% | from plants (phytate-rich): ~15%
 *   - Calcium from dairy: ~32% | from oxalate-rich greens: ~5%
 *   - B12: animal sources are absorbed; plant foods don't contain it
 *   - Folate: synthetic (fortification) ~100%, food folate ~50%
 *
 * Applied to the displayed totals only — NOT to the LP constraints,
 * because the IOM DRIs that back NUTRIENT_OPTIMA already assume average
 * mixed-diet bioavailability (so applying it on the constraint side would
 * double-penalize). The optimizer reports both labeled %DV and absorbed
 * %DV; the UI shows them side-by-side and surfaces warnings when they
 * diverge meaningfully (e.g., a vegan plan with 100% labeled iron but
 * only 40% absorbed).
 *
 * Refs: Hurrell & Egli 2010 (Fe), Lönnerdal 2000 (Zn), Weaver et al 1999 (Ca).
 */
export const BIOAVAIL_BY_CATEGORY = {
  // category → { nutrient: factor }
  poultry:    { fe: 1.00, zn: 1.00, ca: 0.30, vitB12: 1.00 },
  beef:       { fe: 1.00, zn: 1.00, ca: 0.30, vitB12: 1.00 },
  fish:       { fe: 0.95, zn: 1.00, ca: 0.50, vitB12: 1.00 },
  eggs:       { fe: 0.50, zn: 0.85, ca: 0.40, vitB12: 1.00 },
  dairy:      { fe: 0.40, zn: 0.85, ca: 1.00, vitB12: 1.00, folate: 1.00 },
  legumes:    { fe: 0.40, zn: 0.65, ca: 0.50, vitB12: 0.00, folate: 0.55 },
  grains:     { fe: 0.45, zn: 0.55, ca: 0.40, vitB12: 0.30, folate: 0.85 }, // most US grains are folate-fortified
  vegetables: { fe: 0.40, zn: 0.60, ca: 0.40, vitB12: 0.00, folate: 0.55 },
  fruits:     { fe: 0.40, zn: 0.65, ca: 0.40, vitB12: 0.00, folate: 0.55 },
  nuts:       { fe: 0.45, zn: 0.55, ca: 0.30, vitB12: 0.00, folate: 0.55 },
  fats:       { fe: 1.00, zn: 1.00, ca: 1.00, vitB12: 1.00 },
  supplement: { fe: 0.85, zn: 1.00, ca: 1.00, vitB12: 0.50, folate: 1.00 }, // crystalline supplements
};

// Heme iron foods boosted further if vitamin C is present in the same plan.
// Applied as a small post-hoc bonus in the totals (10% for moderate vit C,
// 20% for high) — kept out of the LP so the model stays linear.

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
