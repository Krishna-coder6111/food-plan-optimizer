#!/usr/bin/env python3
"""
USDA FoodData Central pipeline — fully automated.

The previous version required you to manually download the SR Legacy zip and
extract the CSVs into data/raw/ before running. This caused it to appear
"broken" because running `python process_usda.py` just printed an error.

This rewrite:
  1. Downloads Foundation Foods zip from fdc.nal.usda.gov
  2. Unzips to data/raw/
  3. Parses food.csv + food_nutrient.csv + nutrient.csv
  4. Converts raw nutrient amounts (mg, mcg, etc.) to %DV values matching
     the keys used in src/data/foods.js
  5. Writes data/processed/usda_foods.json

Foundation Foods is the actively-updated dataset (~2,800 foods). If you want
the larger SR Legacy dataset (6,220 foods, frozen in 2019), set
USDA_DATASET=sr_legacy.

Outputs: data/processed/usda_foods.json
"""

import os
import json
import zipfile
import sys
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

try:
    import pandas as pd
except ImportError:
    print('ERROR: pandas not installed. Run: pip install -r requirements.txt')
    sys.exit(1)

HERE     = os.path.dirname(os.path.abspath(__file__))
RAW_DIR  = os.path.join(HERE, '..', 'raw')
OUT_DIR  = os.path.join(HERE, '..', 'processed')

# Foundation Foods: actively updated. SR Legacy: frozen 2019 but more foods.
# These URLs follow the pattern fdc.nal.usda.gov/fdc-datasets/<NAME>.zip and
# are stable across releases. If the date portion changes, update here.
DATASETS = {
    'foundation': {
        'url':    'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2024-10-31.zip',
        'prefix': 'FoodData_Central_foundation_food_csv_2024-10-31',
        'data_type_filter': 'foundation_food',
    },
    'sr_legacy': {
        'url':    'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip',
        'prefix': 'FoodData_Central_sr_legacy_food_csv_2018-04',
        'data_type_filter': 'sr_legacy_food',
    },
    'branded': {
        'url':    'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_branded_food_csv_2024-10-31.zip',
        'prefix': 'FoodData_Central_branded_food_csv_2024-10-31',
        'data_type_filter': 'branded_food',
    },
}

# Branded dataset has ~1.7M items. Bundling all of them into the static
# JS bundle would push it to 30MB+. Default cap to keep it usable;
# override with USDA_BRANDED_LIMIT env var. For true 1.7M coverage,
# use the runtime FatSecret API via the Cloudflare Worker instead.
BRANDED_DEFAULT_LIMIT = int(os.environ.get('USDA_BRANDED_LIMIT', '2000'))

# USDA nutrient IDs → our internal keys. These numeric IDs come from
# nutrient.csv and are stable across releases.
NUTRIENT_MAP = {
    1003: ('p',      'g'),    # protein
    1008: ('cal',    'kcal'), # energy
    1004: ('f',      'g'),    # total fat
    1258: ('sf',     'g'),    # saturated fat
    1292: ('mf',     'g'),    # monounsaturated fat
    1253: ('chol',   'mg'),   # cholesterol
    1005: ('carb',   'g'),    # carbohydrates
    1079: ('fib',    'g'),    # fiber
    2000: ('sug',    'g'),    # total sugars
    1093: ('na',     'mg'),   # sodium
    1092: ('k',      'mg'),   # potassium
    1087: ('ca',     'mg'),   # calcium → converted to %DV
    1089: ('fe',     'mg'),   # iron
    1106: ('vitA',   'mcg_rae'),
    1162: ('vitC',   'mg'),
    1114: ('vitD',   'mcg'),
    1109: ('vitE',   'mg'),
    1185: ('vitK',   'mcg'),
    1175: ('vitB6',  'mg'),
    1178: ('vitB12', 'mcg'),
    1177: ('folate', 'mcg_dfe'),
    1095: ('zn',     'mg'),
    1090: ('mg_',    'mg'),
    1103: ('se',     'mcg'),
    1404: ('omega3', 'g'),  # ALA (approximation for omega-3)
}

# FDA Daily Values (2016 update, used on current Nutrition Facts labels).
# We convert raw amounts to %DV because that's what the app uses.
DV = {
    'ca':     1300,  # mg
    'fe':     18,
    'vitA':   900,   # mcg RAE
    'vitC':   90,    # mg
    'vitD':   20,    # mcg
    'vitE':   15,    # mg
    'vitK':   120,   # mcg
    'vitB6':  1.7,   # mg
    'vitB12': 2.4,   # mcg
    'folate': 400,   # mcg DFE
    'zn':     11,    # mg
    'mg_':    420,   # mg
    'se':     55,    # mcg
}


def download_and_extract(dataset_key='foundation'):
    ds = DATASETS[dataset_key]
    os.makedirs(RAW_DIR, exist_ok=True)

    zip_path = os.path.join(RAW_DIR, f'{ds["prefix"]}.zip')
    extracted_marker = os.path.join(RAW_DIR, ds['prefix'], 'food.csv')

    if os.path.exists(extracted_marker):
        print(f'  Already extracted: {ds["prefix"]}')
        return os.path.join(RAW_DIR, ds['prefix'])

    if not os.path.exists(zip_path):
        print(f'  Downloading {ds["url"]}…')
        req = Request(ds['url'], headers={
            'User-Agent': 'nutrient-engine/1.0 (+https://github.com/Krishna-coder6111/food-plan-optimizer)',
        })
        try:
            with urlopen(req, timeout=120) as resp, open(zip_path, 'wb') as out:
                total = 0
                while True:
                    chunk = resp.read(1 << 16)
                    if not chunk: break
                    out.write(chunk)
                    total += len(chunk)
                    if total % (1 << 20) < (1 << 16):
                        print(f'    {total / 1e6:.1f} MB…', end='\r')
            print(f'    downloaded {total / 1e6:.1f} MB   ')
        except (HTTPError, URLError) as e:
            print(f'  ERROR downloading: {e}')
            print(f'  If that URL is stale, check https://fdc.nal.usda.gov/download-datasets for the current one.')
            print(f'  and update DATASETS[{dataset_key!r}]["url"] in process_usda.py.')
            raise

    print(f'  Extracting…')
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(RAW_DIR)

    return os.path.join(RAW_DIR, ds['prefix'])


def to_percent_dv(key, amount):
    """Convert raw nutrient amount to %DV. Macros stay as-is."""
    if key in DV:
        return round(amount / DV[key] * 100, 1)
    return round(amount, 2)


def process_usda(dataset_key='foundation', out_filename=None):
    print(f'Processing USDA {dataset_key} dataset…')

    base = download_and_extract(dataset_key)
    ds = DATASETS[dataset_key]

    food_path = os.path.join(base, 'food.csv')
    nutr_path = os.path.join(base, 'food_nutrient.csv')

    if not os.path.exists(food_path):
        raise FileNotFoundError(f'{food_path} — extraction likely failed')

    foods = pd.read_csv(food_path, dtype=str, low_memory=False)
    print(f'  Loaded {len(foods)} foods from food.csv')

    # Filter to the right data type (zip sometimes contains cross-references)
    if 'data_type' in foods.columns:
        foods = foods[foods['data_type'] == ds['data_type_filter']]
        print(f'    → {len(foods)} {ds["data_type_filter"]} rows')

    # Branded is huge (~1.7M). Cap to BRANDED_DEFAULT_LIMIT to keep the JS
    # bundle sane. Sort by description so the cut is deterministic across
    # runs. For the full set, use FatSecret API at runtime instead.
    if dataset_key == 'branded' and len(foods) > BRANDED_DEFAULT_LIMIT:
        print(f'    capping to {BRANDED_DEFAULT_LIMIT} (USDA_BRANDED_LIMIT to override)')
        foods = foods.sort_values('description').head(BRANDED_DEFAULT_LIMIT)

    # food_nutrient.csv is the big one — ~10M rows for SR Legacy and
    # ~25M for Branded. Loading the whole thing at once OOMs Codespaces
    # (4 GB RAM) on the branded set.
    #
    # Stream in 500K-row chunks and pre-filter to (a) the nutrient IDs we
    # actually use AND (b) the fdc_ids that survived the food-table cut
    # above (matters for branded, which we cap to BRANDED_DEFAULT_LIMIT).
    # Memory peak drops from ~5 GB to ~150 MB.
    kept_fdc_ids = set(foods['fdc_id'].astype(str))
    wanted_nids  = set(NUTRIENT_MAP.keys())
    print(f'  Streaming food_nutrient.csv (filtering to {len(kept_fdc_ids)} foods × {len(wanted_nids)} nutrients)…')
    chunks = []
    total_rows = 0
    for chunk in pd.read_csv(
        nutr_path,
        usecols=['fdc_id', 'nutrient_id', 'amount'],
        dtype={'fdc_id': str, 'nutrient_id': int, 'amount': float},
        chunksize=500_000,
    ):
        total_rows += len(chunk)
        chunks.append(chunk[
            chunk['nutrient_id'].isin(wanted_nids) &
            chunk['fdc_id'].isin(kept_fdc_ids)
        ])
    nutr = pd.concat(chunks, ignore_index=True) if chunks else pd.DataFrame(columns=['fdc_id','nutrient_id','amount'])
    print(f'    scanned {total_rows} rows, kept {len(nutr)} relevant')

    # Pivot to one row per food, columns = nutrient keys
    pivoted = nutr.pivot_table(
        index='fdc_id', columns='nutrient_id', values='amount', aggfunc='first'
    ).reset_index()
    pivoted = pivoted.fillna(0)

    # Convert to %DV and rename columns
    records = []
    for _, row in foods[['fdc_id', 'description']].iterrows():
        fdc_id = row['fdc_id']
        nutr_row = pivoted[pivoted['fdc_id'] == fdc_id]
        if len(nutr_row) == 0:
            continue
        nutr_row = nutr_row.iloc[0]

        rec = {'fdc_id': fdc_id, 'description': row['description']}
        for nid, (key, _unit) in NUTRIENT_MAP.items():
            amount = float(nutr_row.get(nid, 0) or 0)
            rec[key] = to_percent_dv(key, amount)
        records.append(rec)

    os.makedirs(OUT_DIR, exist_ok=True)
    out = os.path.join(OUT_DIR, out_filename or 'usda_foods.json')
    with open(out, 'w') as f:
        json.dump(records, f, indent=2)
    print(f'  Wrote {len(records)} foods → {out}')
    print()
    print(f'  Next step: open {out} and copy nutrient profiles into')
    print(f'  src/data/foods.js for the foods you want in the app.')
    print(f'  The keys match exactly: p, cal, f, sf, chol, fib, sug, na, ca, fe,')
    print(f'  vitA, vitC, vitD, vitE, vitK, vitB6, vitB12, folate, zn, mg_, se, omega3.')


if __name__ == '__main__':
    dataset = os.environ.get('USDA_DATASET', 'foundation')
    process_usda(dataset)
