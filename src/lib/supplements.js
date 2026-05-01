/**
 * Supplement recommender — pick the cheapest set of supplements that fills
 * whatever micronutrient gaps the food-only LP couldn't reach.
 *
 * Catalog reflects generic US drug-store SKUs (Costco/Walmart/CVS store
 * brand) at unit-price per day. Every entry's `covers` map says how
 * many %DV (or grams, for omega-3) of each nutrient one daily serving
 * provides.
 *
 * The recommender runs after the LP. It looks at the result's
 * `nutrientScores` and:
 *   1. Builds a "gap" map — for each deficient/low nutrient, how many
 *      %DV are missing to hit the OPTIMUM.
 *   2. Greedily picks supplements that cover the most missing %DV per
 *      dollar (gap-closing efficiency). Stops when no remaining
 *      supplement can close a still-open gap.
 *   3. Reports total daily cost + which gaps remain unfilled.
 *
 * Greedy is fine here — at most ~6 nutrients with gaps × ~8 supplements
 * is tiny. We always return a sensible answer in <0.1ms.
 */

export const SUPPLEMENTS = [
  {
    id: 'multi',
    name: 'Daily Multivitamin (generic, e.g. Centrum equivalent)',
    cost: 0.10,
    note: 'Single tablet covers nearly every micro at the DRI floor — best $/coverage ratio.',
    covers: {
      vitA: 100, vitC: 100, vitD: 100, vitE: 100, vitK: 70,
      vitB6: 100, vitB12: 100, folate: 100,
      ca: 25, fe: 100, zn: 100, mg_: 25, se: 100,
    },
  },
  {
    id: 'vitd',
    name: 'Vitamin D3 2000 IU',
    cost: 0.05,
    note: 'Cheapest fix for low vit D. 90% of US adults are below the optimum in winter.',
    covers: { vitD: 250 },
  },
  {
    id: 'fishoil',
    name: 'Fish Oil 1000 mg (EPA+DHA ~600 mg)',
    cost: 0.20,
    note: 'Direct EPA+DHA omega-3, cheaper than eating wild salmon daily.',
    covers: { omega3: 0.6 },     // grams
  },
  {
    id: 'mag',
    name: 'Magnesium Glycinate 400 mg',
    cost: 0.15,
    note: 'Glycinate form for absorption. Citrate is cheaper but laxative.',
    covers: { mg_: 100 },
  },
  {
    id: 'iron',
    name: 'Iron 18 mg ferrous bisglycinate',
    cost: 0.08,
    note: 'Pre-menopausal women only — men + post-menopausal women rarely need supplemental Fe.',
    covers: { fe: 100 },
    flag: 'female-only',
  },
  {
    id: 'cad',
    name: 'Calcium + D combo (600 mg Ca, 400 IU D)',
    cost: 0.10,
    note: 'Best for non-dairy plans. Ca takes the largest pill volume so this often replaces a multi.',
    covers: { ca: 60, vitD: 50 },
  },
  {
    id: 'bcomplex',
    name: 'B-Complex (50 mg)',
    cost: 0.08,
    note: 'All 8 B vitamins at high doses. Useful if the multi isn\'t enough or you skip it.',
    covers: { vitB6: 200, vitB12: 200, folate: 100 },
  },
  {
    id: 'zinc',
    name: 'Zinc 25 mg',
    cost: 0.05,
    note: 'Cheap and useful for vegetarian plans. Don\'t exceed 40 mg/day chronically.',
    covers: { zn: 200 },
  },
];

/**
 * Returns:
 *   {
 *     gaps:  { [nutrient]: missing%DV },     // initial deficits
 *     picks: [{ id, name, cost, note, fills: [{ nutrient, before, after }] }, ...],
 *     totalCost: number,
 *     remaining: [{ nutrient, missing }, ...]   // gaps still open
 *   }
 *
 * @param {Object} nutrientScores - result.nutrientScores from the optimizer
 * @param {Object} opts
 * @param {string} [opts.gender]  - 'female' lets us include the iron supp
 */
export function recommendSupplements(nutrientScores, { gender = 'male' } = {}) {
  if (!nutrientScores) return { gaps: {}, picks: [], totalCost: 0, remaining: [] };

  // 1. Initial gap = max(0, opt - actual) for each deficient/low nutrient
  const gaps = {};
  for (const [n, s] of Object.entries(nutrientScores)) {
    if (s.status === 'deficient' || s.status === 'low') {
      const missing = Math.max(0, s.opt - s.actual);
      if (missing > 5) gaps[n] = missing;     // ignore tiny gaps
    }
  }

  if (Object.keys(gaps).length === 0) {
    return { gaps: {}, picks: [], totalCost: 0, remaining: [] };
  }

  // 2. Greedy: pick the supplement that closes the most %DV per dollar
  const remaining = { ...gaps };
  const picks = [];
  const eligibleSupps = SUPPLEMENTS.filter(
    s => !s.flag || (s.flag === 'female-only' && gender === 'female')
  );

  while (true) {
    let best = null, bestScore = 0;
    for (const supp of eligibleSupps) {
      if (picks.find(p => p.id === supp.id)) continue;   // don't pick twice
      let closed = 0;
      for (const [n, amt] of Object.entries(supp.covers)) {
        if (remaining[n] != null && remaining[n] > 0) {
          closed += Math.min(remaining[n], amt);
        }
      }
      if (closed === 0) continue;
      const efficiency = closed / supp.cost;
      if (efficiency > bestScore) { bestScore = efficiency; best = supp; }
    }
    if (!best) break;

    const fills = [];
    for (const [n, amt] of Object.entries(best.covers)) {
      if (remaining[n] != null && remaining[n] > 0) {
        const before = remaining[n];
        remaining[n] = Math.max(0, before - amt);
        fills.push({ nutrient: n, before, after: remaining[n], from: amt });
      }
    }
    picks.push({ id: best.id, name: best.name, cost: best.cost, note: best.note, fills });
  }

  const totalCost = +picks.reduce((s, p) => s + p.cost, 0).toFixed(2);
  const stillOpen = Object.entries(remaining)
    .filter(([, v]) => v > 5)
    .map(([nutrient, missing]) => ({ nutrient, missing: Math.round(missing) }));

  return { gaps, picks, totalCost, remaining: stillOpen };
}
