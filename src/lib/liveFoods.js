'use client';

/**
 * Live branded-food search via the Worker's FatSecret proxy.
 *
 * Search results carry macros in a text blurb ("Per 1 scoop - Calories:
 * 160kcal | Fat: 2.00g | Carbs: 8.00g | Protein: 25.00g"); we parse that
 * into a food record the LP can consume. Micros are NOT in the blurb, so
 * added foods contribute 0 %DV to micronutrient floors — fine for the
 * whey/protein-bar use case (they're macro foods), surfaced honestly in
 * the UI as "macros only".
 *
 * Prices: FatSecret has no prices. We assign the same category-baseline
 * estimates the USDA pipeline uses (per serving, ± regional multipliers)
 * and label them "est." in the UI.
 */

const PROXY_BASE = process.env.NEXT_PUBLIC_PRICES_API || '';

export function isLiveSearchEnabled() {
  return !!PROXY_BASE;
}

// Mirror of the pipeline's category inference, compacted for brand names.
const CAT_RULES = [
  [/whey|casein|protein (powder|shake|isolate|blend)|creatine|supplement/i, 'supplement'],
  [/protein bar|energy bar|granola bar/i,                                   'supplement'],
  [/milk|yogurt|cheese|kefir|cottage|cream/i,                               'dairy'],
  [/chicken|turkey|duck/i,                                                  'poultry'],
  [/beef|pork|ham|bacon|sausage|jerky/i,                                    'beef'],
  [/salmon|tuna|fish|shrimp|sardine/i,                                      'fish'],
  [/egg/i,                                                                  'eggs'],
  [/bean|lentil|chickpea|tofu|hummus/i,                                     'legumes'],
  [/bread|rice|pasta|cereal|oat|tortilla|bagel|granola/i,                   'grains'],
  [/apple|banana|berr|fruit|orange/i,                                       'fruits'],
  [/almond|peanut|cashew|nut|seed/i,                                        'nuts'],
];

// $ per serving baseline by category (est. — FatSecret has no prices).
const CAT_PRICE = {
  supplement: 1.00, dairy: 0.45, poultry: 1.10, beef: 1.40, fish: 1.60,
  eggs: 0.55, legumes: 0.35, grains: 0.30, fruits: 0.50, nuts: 0.60,
};
const REGION_MULT = { us: 1.00, ne: 1.10, mw: 0.95, so: 0.90, we: 1.07 };

export function inferCat(name) {
  for (const [pat, cat] of CAT_RULES) {
    if (pat.test(name)) return cat;
  }
  return 'supplement';
}

/**
 * Parse FatSecret's food_description blurb. Returns null if it doesn't
 * match the known shape (we skip those results rather than guess).
 *   "Per 1 scoop - Calories: 160kcal | Fat: 2.00g | Carbs: 8.00g | Protein: 25.00g"
 */
export function parseFoodDescription(desc) {
  const m = /^Per\s+(.+?)\s*-\s*Calories:\s*([\d.]+)\s*kcal\s*\|\s*Fat:\s*([\d.]+)\s*g\s*\|\s*Carbs:\s*([\d.]+)\s*g\s*\|\s*Protein:\s*([\d.]+)\s*g/i.exec(desc || '');
  if (!m) return null;
  return {
    unit: m[1],
    cal:  +m[2],
    f:    +m[3],
    carb: +m[4],
    p:    +m[5],
  };
}

/**
 * Normalize one FatSecret search hit → { fsId, label, brand, macros } or
 * null when unparseable.
 */
export function normalizeHit(hit) {
  const macros = parseFoodDescription(hit.food_description);
  if (!macros) return null;
  return {
    fsId:  String(hit.food_id),
    label: hit.food_name,
    brand: hit.brand_name || (hit.food_type === 'Generic' ? 'Generic' : ''),
    macros,
  };
}

/**
 * Build a FOODS-shaped record from a normalized hit so the optimizer,
 * tables and exclusion logic all treat it like any other food.
 */
export function toFoodRecord(n) {
  const name = n.brand ? `${n.label} (${n.brand})` : n.label;
  const cat = inferCat(`${n.brand} ${n.label}`);
  const base = CAT_PRICE[cat] ?? 1.00;
  const price = Object.fromEntries(
    Object.entries(REGION_MULT).map(([r, m]) => [r, +(base * m).toFixed(3)]),
  );
  return {
    // 500000+ range: clear of curated (≤300) and USDA-generated (≥1000,
    // ≤~101000) ids. Collisions on the modulo are deduped by _fsId.
    id: 500000 + (parseInt(n.fsId, 10) % 400000),
    _fsId: n.fsId,
    _live: true,                      // marker: live-searched, macros only
    name: name.slice(0, 60),
    unit: n.macros.unit.slice(0, 20),
    cat,
    p: n.macros.p, cal: n.macros.cal, f: n.macros.f, carb: n.macros.carb,
    sf: 0, mf: 0, chol: 0, fib: 0, sug: 0, na: 0, k: 0,
    ca: 0, fe: 0, vitA: 0, vitC: 0, vitD: 0, vitE: 0, vitK: 0,
    vitB6: 0, vitB12: 0, folate: 0, zn: 0, mg_: 0, se: 0, omega3: 0,
    micro: 0,
    price,
    hormoneM: [], hormoneF: [],
  };
}

/** Query the Worker proxy. Returns up to `limit` normalized hits. */
export async function searchBrandedFoods(q, limit = 8) {
  if (!PROXY_BASE || !q?.trim()) return [];
  const r = await fetch(`${PROXY_BASE}/fatsecret/search?${new URLSearchParams({ q: q.trim() })}`);
  if (!r.ok) throw new Error(`search failed (${r.status})`);
  const body = await r.json();
  if (body.error) throw new Error(body.error.message || 'FatSecret error');
  const raw = body.foods?.food;
  const hits = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return hits.map(normalizeHit).filter(Boolean).slice(0, limit);
}
