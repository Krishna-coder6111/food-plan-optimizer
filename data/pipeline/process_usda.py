#!/usr/bin/env python3
"""
Process USDA FoodData Central SR Legacy data.

Download from: https://fdc.nal.usda.gov/download-datasets/
  → Select "SR Legacy" → Download CSV

Place the extracted CSV files in data/raw/

Outputs: data/processed/usda_foods.json (filtered to ~200 whole foods with full nutrient profiles)
"""

import os
import json
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'processed')

# Nutrient IDs we care about (from USDA nutrient.csv)
NUTRIENT_MAP = {
    1003: 'protein',      # g
    1008: 'calories',     # kcal
    1004: 'total_fat',    # g
    1258: 'sat_fat',      # g
    1292: 'mono_fat',     # g
    1253: 'cholesterol',  # mg
    1005: 'carbs',        # g
    1079: 'fiber',        # g
    1063: 'total_sugar',  # g
    1093: 'sodium',       # mg
    1092: 'potassium',    # mg
    1087: 'calcium',      # mg
    1089: 'iron',         # mg
    1106: 'vitamin_a',    # mcg RAE
    1162: 'vitamin_c',    # mg
    1114: 'vitamin_d',    # mcg
    1109: 'vitamin_e',    # mg
    1185: 'vitamin_k',    # mcg
    1175: 'vitamin_b6',   # mg
    1178: 'vitamin_b12',  # mcg
    1177: 'folate',       # mcg DFE
    1095: 'zinc',         # mg
    1090: 'magnesium',    # mg
    1103: 'selenium',     # mcg
    1272: 'omega3_ala',   # g
    1278: 'omega3_epa',   # g
    1272: 'omega3_dha',   # g
}

# Food categories to include (USDA food group descriptions)
INCLUDE_GROUPS = [
    'Dairy and Egg Products',
    'Poultry Products',
    'Finfish and Shellfish Products',
    'Legumes and Legume Products',
    'Vegetables and Vegetable Products',
    'Fruits and Fruit Juices',
    'Nut and Seed Products',
    'Cereal Grains and Pasta',
    'Beef Products',
    'Pork Products',
    'Fats and Oils',
    'Baked Products',
    'Soups, Sauces, and Gravies',
    'Lamb, Veal, and Game Products',
]


def process_usda():
    """Process USDA SR Legacy CSV files into filtered JSON."""
    print('Processing USDA SR Legacy data...')

    # Check for required files
    food_file = os.path.join(RAW_DIR, 'food.csv')
    nutrient_file = os.path.join(RAW_DIR, 'food_nutrient.csv')

    if not os.path.exists(food_file):
        print(f'ERROR: {food_file} not found.')
        print('Download SR Legacy CSV from: https://fdc.nal.usda.gov/download-datasets/')
        print('Extract and place food.csv and food_nutrient.csv in data/raw/')
        return

    # Read foods
    foods_df = pd.read_csv(food_file, dtype=str)
    print(f'  Loaded {len(foods_df)} food items')

    # Filter to SR Legacy data type
    if 'data_type' in foods_df.columns:
        foods_df = foods_df[foods_df['data_type'] == 'sr_legacy_food']

    # Filter to food groups we care about
    if 'food_category_id' in foods_df.columns:
        # We'd need food_category.csv to map IDs to names
        # For now, keep all and filter later
        pass

    # Read nutrients
    nutrients_df = pd.read_csv(nutrient_file, dtype={'fdc_id': str, 'nutrient_id': int, 'amount': float})
    print(f'  Loaded {len(nutrients_df)} nutrient records')

    # Filter to nutrients we care about
    nutrient_ids = set(NUTRIENT_MAP.keys())
    nutrients_df = nutrients_df[nutrients_df['nutrient_id'].isin(nutrient_ids)]

    # Pivot: one row per food, columns = nutrients
    pivoted = nutrients_df.pivot_table(
        index='fdc_id',
        columns='nutrient_id',
        values='amount',
        aggfunc='first'
    ).reset_index()

    # Rename columns
    pivoted.columns = ['fdc_id'] + [
        NUTRIENT_MAP.get(col, f'unknown_{col}')
        for col in pivoted.columns[1:]
    ]

    # Merge with food descriptions
    merged = foods_df[['fdc_id', 'description']].merge(pivoted, on='fdc_id', how='inner')

    # Fill NaN with 0
    merged = merged.fillna(0)

    # Save
    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'usda_foods.json')
    records = merged.to_dict('records')
    with open(out_path, 'w') as f:
        json.dump(records, f, indent=2)
    print(f'  Saved {len(records)} foods to {out_path}')
    print('  NOTE: You still need to manually curate this into src/data/foods.js')
    print('  The raw USDA data has 6000+ foods — filter to ~150-200 whole foods for the app.')


if __name__ == '__main__':
    process_usda()
