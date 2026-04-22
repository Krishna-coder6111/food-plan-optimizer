#!/usr/bin/env python3
"""
Download and process BLS Average Retail Food Prices.
Downloads from: https://download.bls.gov/pub/time.series/ap/
"""

import os
import json
import pandas as pd
import requests

RAW_DIR = os.path.join(os.path.dirname(__file__), '..', 'raw')
OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'processed')

BLS_BASE = 'https://download.bls.gov/pub/time.series/ap'
BLS_FILES = ['ap.data.0.Current', 'ap.item', 'ap.area', 'ap.series']

# BLS requires a proper User-Agent or it returns 403
HEADERS = {
    'User-Agent': 'nutrient-engine/1.0 (research; contact@example.com)',
    'Accept': 'text/plain',
}

AREA_MAP = {
    '0000': 'us',
    '0100': 'ne',
    '0200': 'mw',
    '0300': 'so',
    '0400': 'we',
}


def download_bls_files():
    """Download BLS files if not already present."""
    os.makedirs(RAW_DIR, exist_ok=True)

    for fname in BLS_FILES:
        path = os.path.join(RAW_DIR, fname)
        if not os.path.exists(path):
            url = f'{BLS_BASE}/{fname}'
            print(f'  Downloading {url}...')
            resp = requests.get(url, headers=HEADERS, timeout=30)
            resp.raise_for_status()
            with open(path, 'w', encoding='utf-8') as f:
                f.write(resp.text)
            print(f'    Saved ({len(resp.text)} bytes)')
        else:
            print(f'  {fname} — already exists, skipping')


def process_prices():
    """Parse BLS data into regional price JSON."""
    print('  Processing BLS price data...')

    series_path = os.path.join(RAW_DIR, 'ap.series')
    if not os.path.exists(series_path):
        print('  ERROR: BLS files not found. Run download first.')
        return

    series_df = pd.read_csv(series_path, sep='\t', dtype=str)
    series_df.columns = series_df.columns.str.strip()

    data_path = os.path.join(RAW_DIR, 'ap.data.0.Current')
    data_df = pd.read_csv(data_path, sep='\t', dtype=str)
    data_df.columns = data_df.columns.str.strip()
    data_df['value'] = pd.to_numeric(data_df['value'].str.strip(), errors='coerce')
    data_df['year'] = pd.to_numeric(data_df['year'].str.strip(), errors='coerce')

    latest_year = data_df['year'].max()
    recent = data_df[data_df['year'] == latest_year].copy()
    recent['period'] = recent['period'].str.strip()
    latest_period = sorted(recent['period'].dropna().unique())[-1]
    recent = recent[recent['period'] == latest_period]

    print(f'    Latest data: {latest_year} {latest_period} ({len(recent)} obs)')

    item_path = os.path.join(RAW_DIR, 'ap.item')
    item_df = pd.read_csv(item_path, sep='\t', dtype=str)
    item_df.columns = item_df.columns.str.strip()

    # Merge series with item descriptions
    series_df['series_id'] = series_df['series_id'].str.strip()
    recent['series_id'] = recent['series_id'].str.strip()

    merged = recent.merge(series_df[['series_id', 'item_code', 'area_code']],
                          on='series_id', how='left')
    merged['area_code'] = merged['area_code'].str.strip()
    merged['item_code'] = merged['item_code'].str.strip()

    # Get item names
    item_df['item_code'] = item_df['item_code'].str.strip()
    item_df['item_name'] = item_df['item_name'].str.strip()
    item_lookup = dict(zip(item_df['item_code'], item_df['item_name']))

    # Pivot: item × region → price
    prices_out = {}
    for _, row in merged.iterrows():
        item_code = row.get('item_code', '')
        area_code = row.get('area_code', '')
        val = row.get('value')

        if pd.isna(val) or item_code == '' or area_code not in AREA_MAP:
            continue

        region = AREA_MAP[area_code]
        name = item_lookup.get(item_code, item_code)

        if name not in prices_out:
            prices_out[name] = {'item': name, 'item_code': item_code}
        prices_out[name][region] = round(float(val), 3)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'bls_prices.json')
    with open(out_path, 'w') as f:
        json.dump(list(prices_out.values()), f, indent=2)
    print(f'    Saved {len(prices_out)} items → {out_path}')


if __name__ == '__main__':
    download_bls_files()
    process_prices()
