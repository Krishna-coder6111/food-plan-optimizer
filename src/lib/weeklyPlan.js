import { optimizeDiet } from './optimizer';

/**
 * Weekly plan — runs the day-LP 7 times with a rotating "protein anchor"
 * so you don't eat lentils 7 days straight.
 *
 * Approach (intentionally simple — variety over optimality):
 *   - One day per element of ROTATION.
 *   - For each day, the food set is restricted to the day's allowed
 *     protein categories + all non-protein categories.
 *   - The day's LP runs with the same targets/locks/pins as the daily view.
 *
 * Why not a single 7-day MIP? javascript-lp-solver can barely handle the
 * single-day LP with slack equality constraints; 7-day cross-coupling
 * would explode. The rotation gives "good enough" variety in O(7×LP) time.
 */

const PROTEIN_CATS = ['poultry', 'beef', 'fish', 'eggs', 'dairy', 'legumes'];

export const ROTATION = [
  { day: 'Mon', allowed: ['poultry'],            label: 'Poultry',          icon: '🍗' },
  { day: 'Tue', allowed: ['fish'],               label: 'Fish (omega-3)',   icon: '🐟' },
  { day: 'Wed', allowed: ['legumes'],            label: 'Plant-protein',    icon: '🌱' },
  { day: 'Thu', allowed: ['beef'],               label: 'Red meat',         icon: '🥩' },
  { day: 'Fri', allowed: ['fish', 'eggs'],       label: 'Fish + eggs',      icon: '🐟' },
  { day: 'Sat', allowed: ['dairy', 'eggs'],      label: 'Dairy / eggs',     icon: '🥚' },
  { day: 'Sun', allowed: ['poultry', 'legumes'], label: 'Mixed',            icon: '🍱' },
];

export function buildWeek(foods, targets, region, costIndex, gender, opts = {}) {
  return ROTATION.map(r => {
    const dayFoods = foods.filter(f => {
      // Always allow non-protein categories.
      if (!PROTEIN_CATS.includes(f.cat)) return true;
      // Allow protein iff its category is in today's whitelist.
      return r.allowed.includes(f.cat);
    });
    // Locks/pins on excluded categories silently drop — that's fine, they
    // came from the daily view's user overrides which only meant "today".
    const safePins = new Set([...(opts.pins || [])].filter(id => dayFoods.some(f => f.id === id)));
    const safeLocks = new Map([...(opts.locks || [])].filter(([id]) => dayFoods.some(f => f.id === id)));

    const result = optimizeDiet(dayFoods, targets, region, costIndex, gender, {
      pins: safePins,
      locks: safeLocks,
    });
    return { ...r, ...result };
  });
}

/**
 * Aggregate week-level totals (avg-per-day) for a "weekly average" view.
 * Cost is summed across the week; macros are averaged.
 */
export function weeklyAverages(week) {
  const days = week.length;
  const sum = (k) => week.reduce((s, d) => s + (d.totals[k] || 0), 0);
  return {
    cost: +sum('cost').toFixed(2),
    avgCost: +(sum('cost') / days).toFixed(2),
    avgProtein:  Math.round(sum('protein') / days),
    avgCalories: Math.round(sum('calories') / days),
    avgCarbs:    Math.round(sum('carbs') / days),
    avgFat:      Math.round(sum('fat') / days),
    avgFiber:    Math.round(sum('fiber') / days),
  };
}
