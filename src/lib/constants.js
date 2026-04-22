/**
 * Dietary Reference Intakes — OPTIMUM ranges, not just minimums
 * Sources: IOM DRIs, Linus Pauling Institute, 2025 DGAC
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

// Max servings per food category (acceptability — prevents "eat 8 cans of tuna" solutions)
export const MAX_SERVINGS = {
  poultry: 3,
  beef: 2,       // reduced from 3 — limit red meat per Mediterranean/DASH evidence
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
