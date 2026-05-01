#!/usr/bin/env python3
"""
emit_usda_foods.py — bridge USDA FoodData Central → app FOODS array.

Reads:    data/processed/usda_foods.json   (from process_usda.py)
Writes:   src/data/usdaFoods.generated.js  (auto-imported by foods.js)

The hand-curated FOODS_BASE in src/data/foods.js stays as-is; this
script generates an *additional* USDA_FOODS array that gets concatenated.
That way the curated entries (with hormone tags, real serving units,
known prices) keep their richness while the LP gains hundreds of options.

What we infer per food:
  - cat: from description keywords (chicken → poultry, broccoli → vegetables, etc.)
  - unit: hard-coded "100g" — USDA Foundation values are per 100g, simplest.
  - price: category baseline × region. Rough; user can override per-food
           in src/data/blsOverrides.js once they map BLS items to fdc_ids.
  - hormoneM/hormoneF: empty (manual curation only — auto-tagging is noise).
  - micro: derived from sum of vit/min %DV values, scaled to 0-10.

We deliberately SKIP foods whose name suggests "raw", "uncooked", "frozen"
of items already in the curated set, since those are duplicates the user
won't pick from the dropdown anyway. Heuristic, not perfect.
"""

import os
import json
import re

HERE = os.path.dirname(os.path.abspath(__file__))
IN_PATH         = os.path.join(HERE, '..', 'processed', 'usda_foods.json')
BRANDED_IN_PATH = os.path.join(HERE, '..', 'processed', 'branded_foods.json')
OUT_PATH        = os.path.join(HERE, '..', '..', 'src', 'data', 'usdaFoods.generated.js')

# Category inference — order matters (more specific first).
# Each tuple: (regex pattern, category id matching CATEGORIES in foods.js)
CAT_RULES = [
    (r'\b(chicken|turkey|duck|goose|quail|pheasant)\b',        'poultry'),
    (r'\b(beef|veal|pork|ham|bacon|sausage|lamb|liver|tongue|tripe)\b', 'beef'),
    (r'\b(salmon|tuna|cod|halibut|tilapia|trout|sardine|mackerel|herring|anchovy|shrimp|crab|lobster|oyster|scallop|fish|crustacean|mollusk)\b', 'fish'),
    (r'\b(milk|cheese|yogurt|kefir|butter|cream|whey|casein|cheddar|mozzarella|parmesan|feta|cottage)\b', 'dairy'),
    (r'\b(egg|eggs|omelet)\b',                                  'eggs'),
    (r'\b(bean|lentil|chickpea|garbanzo|tofu|tempeh|edamame|pea(s)?\b|legume|hummus|soybean)\b', 'legumes'),
    (r'\b(rice|oat|wheat|barley|quinoa|bread|pasta|noodle|tortilla|cereal|grain|bulgur|couscous|millet|farro|cracker|bagel|muffin|pancake|waffle)\b', 'grains'),
    (r'\b(potato|sweet potato|yam)\b',                          'grains'),
    (r'\b(broccoli|spinach|kale|cabbage|cauliflower|brussel|chard|collard|arugula|carrot|celery|cucumber|lettuce|tomato|pepper|onion|garlic|zucchini|squash|asparagus|mushroom|eggplant|radish|beet|turnip|leek|fennel|artichoke|kohlrabi|vegetable)\b', 'vegetables'),
    (r'\b(apple|banana|orange|grape|berry|berries|peach|plum|pear|melon|cherry|mango|pineapple|kiwi|papaya|fig|date|raisin|cranberry|pomegranate|fruit|citrus|grapefruit|tangerine|lime|lemon)\b', 'fruits'),
    (r'\b(almond|walnut|pecan|hazelnut|cashew|pistachio|peanut|nut|seed|chia|flax|sunflower|pumpkin seed|sesame|pine nut|brazil)\b', 'nuts'),
    (r'\b(oil|olive oil|coconut oil|avocado|lard|shortening|margarine|ghee)\b', 'fats'),
    (r'\b(supplement|powder|protein bar|shake)\b',              'supplement'),
    # spices / fermented hard to detect from descriptions reliably; fall through
]

# Per-100g price baselines (USD). Approximate retail. Will be applied to
# the regional cost index in foods.js so callers see proper variation.
CAT_PRICE_PER_100G = {
    'poultry':    1.10,
    'beef':       1.50,
    'fish':       1.80,
    'dairy':      0.40,
    'eggs':       0.50,
    'legumes':    0.30,
    'grains':     0.25,
    'vegetables': 0.40,
    'fruits':     0.50,
    'nuts':       1.20,
    'fats':       0.30,
    'spices':     0.80,
    'fermented':  0.50,
    'supplement': 1.00,
}
DEFAULT_PRICE = 0.60

# Region multipliers — match the existing 5 keys in foods.js.
REGION_MULT = { 'us': 1.00, 'ne': 1.10, 'mw': 0.95, 'so': 0.90, 'we': 1.07 }


def infer_cat(name):
    n = name.lower()
    for pat, cat in CAT_RULES:
        if re.search(pat, n):
            return cat
    # Default bucket — generic "vegetables" gets the most LP love but
    # also hides a lot of edge cases. We use 'supplement' as the catch-
    # all so the LP doesn't accidentally over-recommend mystery foods.
    return 'supplement'


def micro_score(rec):
    # Sum the %DV vit/min values, scale to 0-10 (cap at 10).
    keys = ['vitA','vitC','vitD','vitE','vitK','vitB6','vitB12','folate','ca','fe','zn','mg_','se']
    total = sum(rec.get(k, 0) or 0 for k in keys)
    return min(10, round(total / 30.0, 1))


def hormone_tags(rec, gender):
    # Light heuristic — only tag if a key %DV is high.
    tags = []
    if gender == 'M':
        if (rec.get('zn',0) or 0)    > 15: tags.append('zn')
        if (rec.get('vitD',0) or 0)  > 10: tags.append('vitD')
        if (rec.get('mg_',0) or 0)   > 15: tags.append('mg')
        if (rec.get('omega3',0) or 0)> 0.3:tags.append('o3')
        if (rec.get('se',0) or 0)    > 30: tags.append('se')
        if (rec.get('vitB12',0) or 0)> 30: tags.append('b12')
        if (rec.get('chol',0) or 0)  > 50: tags.append('chol')
    else:
        if (rec.get('fe',0) or 0)    > 15: tags.append('fe')
        if (rec.get('mg_',0) or 0)   > 15: tags.append('mg')
        if (rec.get('omega3',0) or 0)> 0.3:tags.append('o3')
        if (rec.get('vitB12',0) or 0)> 30: tags.append('b12')
        if (rec.get('vitD',0) or 0)  > 10: tags.append('vitD')
        if (rec.get('ca',0) or 0)    > 15: tags.append('ca')
        if (rec.get('folate',0) or 0)> 15: tags.append('folate')
    return tags


def main():
    if not os.path.exists(IN_PATH):
        print(f'  ⚠  {IN_PATH} not found. Run `python build_all.py` first.')
        return

    with open(IN_PATH) as f:
        usda = json.load(f)

    # Optional: extend with branded foods if the user processed them too
    # (USDA_INCLUDE_BRANDED=1 in build_all.py). Branded entries get a
    # `_branded` marker so the UI can show a small badge. We DEDUPE on
    # description-lowercased to avoid showing "Whole Milk" twice.
    if os.path.exists(BRANDED_IN_PATH):
        with open(BRANDED_IN_PATH) as f:
            branded = json.load(f)
        seen_names = {(r.get('description') or '').lower() for r in usda}
        added = 0
        for rec in branded:
            name = (rec.get('description') or '').lower()
            if name in seen_names: continue
            seen_names.add(name)
            rec['_branded'] = True
            usda.append(rec)
            added += 1
        print(f'  + merged {added} branded foods (dedupe vs Foundation by name)')

    # Skip USDA records with literally-zero calories — those are pure
    # water, salt, etc. Allow low-calorie items like turmeric (9 kcal/tsp),
    # garlic (4 kcal/clove), ginger (5 kcal/tbsp) — they have meaningful
    # antiox + DII contributions even at tiny calorie counts.
    foods = []
    for rec in usda:
        cal = rec.get('cal', 0) or 0
        # Keep low-cal items only if they have at least SOME nutrient
        # signal (vitC, fiber, omega-3, or any %DV). Pure-water rows still drop.
        if cal < 1:
            sig = sum((rec.get(k, 0) or 0) for k in ('vitC','vitA','fib','omega3','fe','ca','zn','mg_'))
            if sig < 5: continue
        cat = infer_cat(rec['description'])
        base_price = CAT_PRICE_PER_100G.get(cat, DEFAULT_PRICE)
        price = { region: round(base_price * mult, 3) for region, mult in REGION_MULT.items() }
        foods.append({
            # IDs start at 1000 to avoid collision with the curated 1-150 range
            'id':       1000 + int(rec['fdc_id']) % 100000,
            'name':     rec['description'][:60],   # truncate long names
            'unit':     '100g',
            'cat':      cat,
            'p':        rec.get('p', 0)    or 0,
            'cal':      rec.get('cal', 0)  or 0,
            'f':        rec.get('f', 0)    or 0,
            'sf':       rec.get('sf', 0)   or 0,
            'mf':       rec.get('mf', 0)   or 0,
            'chol':     rec.get('chol', 0) or 0,
            'carb':     rec.get('carb', 0) or 0,
            'fib':      rec.get('fib', 0)  or 0,
            'sug':      rec.get('sug', 0)  or 0,
            'na':       rec.get('na', 0)   or 0,
            'k':        rec.get('k', 0)    or 0,
            'ca':       rec.get('ca', 0)   or 0,
            'fe':       rec.get('fe', 0)   or 0,
            'vitA':     rec.get('vitA', 0) or 0,
            'vitC':     rec.get('vitC', 0) or 0,
            'vitD':     rec.get('vitD', 0) or 0,
            'vitE':     rec.get('vitE', 0) or 0,
            'vitK':     rec.get('vitK', 0) or 0,
            'vitB6':    rec.get('vitB6', 0)  or 0,
            'vitB12':   rec.get('vitB12', 0) or 0,
            'folate':   rec.get('folate', 0) or 0,
            'zn':       rec.get('zn', 0)   or 0,
            'mg_':      rec.get('mg_', 0)  or 0,
            'se':       rec.get('se', 0)   or 0,
            'omega3':   rec.get('omega3', 0) or 0,
            'micro':    micro_score(rec),
            'price':    price,
            'hormoneM': hormone_tags(rec, 'M'),
            'hormoneF': hormone_tags(rec, 'F'),
            '_usda':    True,
            '_branded': bool(rec.get('_branded')),   # marker for branded subset
        })

    # Dedupe by id (in case fdc_id mod-collides)
    seen, dedup = set(), []
    for f in foods:
        if f['id'] in seen: continue
        seen.add(f['id'])
        dedup.append(f)

    body = json.dumps(dedup, indent=2, ensure_ascii=False)
    js = (
        '// AUTO-GENERATED by data/pipeline/emit_usda_foods.py — do not edit by hand.\n'
        '// Re-generate after running the BLS+USDA pipeline:\n'
        '//   npm run pipeline\n'
        '\n'
        f'export const USDA_FOODS = {body};\n'
    )
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write(js)

    by_cat = {}
    for f in dedup:
        by_cat[f['cat']] = by_cat.get(f['cat'], 0) + 1
    print(f'  ✓ Wrote {len(dedup)} USDA-derived foods → {OUT_PATH}')
    print(f'    By category: {dict(sorted(by_cat.items(), key=lambda x: -x[1]))}')


if __name__ == '__main__':
    main()
