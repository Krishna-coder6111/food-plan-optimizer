/**
 * Weekly view — produces a 7-day shopping list from a single daily plan.
 *
 * The previous version rotated protein categories (Mon poultry, Tue fish,
 * etc) to force variety. We dropped it: the LP is already minimizing
 * cost, so forcing variety strictly increases the weekly bill — exactly
 * what someone trying to save money does NOT want. If you found chicken
 * thighs at $0.65/4oz to be the cheapest hit-targets food, you eat
 * chicken thighs every day. Boring but cheap is the point.
 *
 * What this gives you instead:
 *   - The daily plan multiplied by 7
 *   - Items grouped by category (so the shopping list maps onto store
 *     aisles)
 *   - Weekly total cost, weekly servings per item
 *   - A cost-per-day breakdown
 */

const CATEGORY_ORDER = [
  'poultry', 'beef', 'fish', 'eggs', 'dairy',
  'legumes', 'grains', 'vegetables', 'fruits',
  'nuts', 'fats', 'supplement',
];

export function buildShoppingList(dailyPlan, days = 7) {
  // Group plan items by category, scaling servings × days.
  const byCategory = new Map();
  for (const f of dailyPlan) {
    if (!byCategory.has(f.cat)) byCategory.set(f.cat, []);
    byCategory.get(f.cat).push({
      id: f.id,
      name: f.name,
      unit: f.unit,
      cat: f.cat,
      dailyServings: f.servings,
      weeklyServings: f.servings * days,
      dailyCost: f.totalCost,
      weeklyCost: +(f.totalCost * days).toFixed(2),
    });
  }
  // Stable category order (poultry/beef/.../supplement), with unknowns last.
  const sections = [];
  for (const cat of CATEGORY_ORDER) {
    if (byCategory.has(cat)) sections.push({ cat, items: byCategory.get(cat) });
  }
  for (const [cat, items] of byCategory) {
    if (!CATEGORY_ORDER.includes(cat)) sections.push({ cat, items });
  }

  const totalDaily  = +dailyPlan.reduce((s, f) => s + f.totalCost, 0).toFixed(2);
  const totalWeekly = +(totalDaily * days).toFixed(2);

  return { sections, totalDaily, totalWeekly, days };
}
