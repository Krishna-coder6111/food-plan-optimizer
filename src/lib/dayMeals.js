/**
 * dayMeals — arrange the optimizer's basket into a plausible day of eating.
 *
 * The LP outputs quantities ("3× chicken breast, 2× rice"), which reads as
 * a procurement list, not food. This module partitions each food's PER-DAY
 * amount into Breakfast / Lunch / Dinner / Snacks using category + name
 * heuristics, with per-meal macro subtotals.
 *
 * Honesty contract: this is an ARRANGEMENT, not a new optimization. The
 * quantities are exactly the plan's per-day amounts (servings ÷ days);
 * eat them in any order — the daily totals are what the solver guaranteed.
 */

const SLOTS = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'lunch',     label: 'Lunch' },
  { id: 'dinner',    label: 'Dinner' },
  { id: 'snack',     label: 'Snacks' },
];

// Slot preference by category — first entry is the primary home.
const CAT_PREFS = {
  eggs:       ['breakfast', 'lunch'],
  dairy:      ['breakfast', 'snack'],
  fermented:  ['breakfast', 'snack'],
  fruits:     ['snack', 'breakfast'],
  grains:     ['lunch', 'dinner', 'breakfast'],
  poultry:    ['lunch', 'dinner'],
  beef:       ['dinner', 'lunch'],
  fish:       ['dinner', 'lunch'],
  legumes:    ['lunch', 'dinner'],
  vegetables: ['lunch', 'dinner'],
  nuts:       ['snack'],
  fats:       ['dinner', 'lunch'],
  spices:     ['dinner'],
  fermented_veg: ['dinner'],
  supplement: ['snack'],
};

// Name-based overrides — foods whose slot is obvious regardless of category.
const NAME_PREFS = [
  [/oat|cereal|granola|pancake|waffle|bagel|toast/i, ['breakfast']],
  [/yogurt|kefir|milk\b|cottage/i,                   ['breakfast', 'snack']],
  [/whey|casein|protein (powder|shake|bar)/i,        ['snack']],
  [/dark chocolate|kombucha|tea\b/i,                 ['snack']],
  [/egg/i,                                           ['breakfast', 'lunch']],
  [/bread|tortilla/i,                                ['lunch', 'breakfast']],
];

export function slotPrefs(food) {
  for (const [pat, prefs] of NAME_PREFS) {
    if (pat.test(food.name)) return prefs;
  }
  return CAT_PREFS[food.cat] || ['snack'];
}

/** Render 1.75 → "1¾", 0.5 → "½", 0.25 → "¼". Quarters only; never "0". */
export function formatQty(q) {
  const quarters = Math.max(1, Math.round(q * 4));
  const whole = Math.floor(quarters / 4);
  const frac = ['', '¼', '½', '¾'][quarters % 4];
  return whole > 0 ? `${whole}${frac}` : frac || '¼';
}

/**
 * @param {Array} plan  optimizer plan items ({...food, servings}) — servings
 *                      are PERIOD quantities
 * @param {number} days horizon the plan was solved for
 * @returns {{ meals: [{id,label,items,protein,calories}], hasItems }}
 *   items: { id, name, unit, qty (exact per-day), p, cal }
 */
export function buildDayMeals(plan, days = 1) {
  const meals = SLOTS.map(s => ({ ...s, items: [], protein: 0, calories: 0 }));
  const byId = Object.fromEntries(meals.map(m => [m.id, m]));

  // Biggest contributors first so the greedy balancing below sees the loads
  // that matter; deterministic for a given plan.
  const ordered = [...plan].sort(
    (a, b) => (b.cal || 0) * b.servings - (a.cal || 0) * a.servings,
  );

  for (const f of ordered) {
    const perDay = f.servings / Math.max(1, days);
    if (perDay <= 0) continue;
    const prefs = slotPrefs(f);
    // Split across more slots the more of it you eat per day: <¾ serving
    // goes to ONE slot; ≥¾ splits across two; ≥1½ across three.
    const nSlots = Math.min(prefs.length, perDay >= 1.5 ? 3 : perDay >= 0.75 ? 2 : 1);
    const share = perDay / nSlots;
    // Single-slot foods go to the LIGHTER of their two preferred slots
    // (ties → primary). Without this, every fractional protein/veg piles
    // into its category's primary home and lunch ends up with half the
    // day's calories.
    let slots;
    if (nSlots === 1 && prefs.length > 1) {
      const [a, b] = [byId[prefs[0]], byId[prefs[1]]];
      slots = [b.calories < a.calories ? prefs[1] : prefs[0]];
    } else {
      slots = prefs.slice(0, nSlots);
    }
    for (const slotId of slots) {
      const meal = byId[slotId];
      meal.items.push({
        id: f.id,
        name: f.name,
        unit: f.unit,
        qty: share,
        p: (f.p || 0) * share,
        cal: (f.cal || 0) * share,
      });
      meal.protein  += (f.p || 0) * share;
      meal.calories += (f.cal || 0) * share;
    }
  }

  for (const m of meals) {
    m.items.sort((a, b) => b.p - a.p);
    m.protein  = Math.round(m.protein * 10) / 10;
    m.calories = Math.round(m.calories);
  }

  return { meals, hasItems: meals.some(m => m.items.length > 0) };
}
