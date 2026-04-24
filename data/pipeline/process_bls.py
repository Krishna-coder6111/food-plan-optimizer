#!/usr/bin/env python3
"""
BLS Average Retail Food Prices pipeline.

Downloads from https://download.bls.gov/pub/time.series/ap/ and produces
data/processed/bls_prices.json mapping BLS item codes × region → latest
average price.

Notes on the User-Agent: BLS began enforcing a contact-info requirement on
download.bls.gov in 2022. Requests without a real email in the UA get 403'd.
"""

import os
import json
import sys
from urllib.request import urlopen, Request
from urllib.error import HTTPError

try:
    import pandas as pd
except ImportError:
    print('ERROR: pandas not installed. Run: pip install -r requirements.txt')
    sys.exit(1)

HERE    = os.path.dirname(os.path.abspath(__file__))
RAW_DIR = os.path.join(HERE, '..', 'raw')
OUT_DIR = os.path.join(HERE, '..', 'processed')

BLS_BASE  = 'https://download.bls.gov/pub/time.series/ap'
BLS_FILES = ['ap.data.0.Current', 'ap.item', 'ap.area', 'ap.series']

# BLS wants a legit contact email in the UA. Replace with yours if forking.
HEADERS = {
    'User-Agent': 'nutrient-engine/1.0 (research; contact@nutrient-engine.app)',
    'Accept': 'text/plain',
}

# BLS area codes for the four CPI regions
AREA_MAP = {
    '0000': 'us',   # US city average
    '0100': 'ne',   # Northeast
    '0200': 'mw',   # Midwest
    '0300': 'so',   # South
    '0400': 'we',   # West
}


def download_bls_files():
    os.makedirs(RAW_DIR, exist_ok=True)
    for fname in BLS_FILES:
        path = os.path.join(RAW_DIR, fname)
        if os.path.exists(path) and os.path.getsize(path) > 0:
            print(f'  {fname} — already exists')
            continue
        url = f'{BLS_BASE}/{fname}'
        print(f'  Downloading {url}…')
        try:
            req = Request(url, headers=HEADERS)
            with urlopen(req, timeout=60) as resp, open(path, 'wb') as out:
                out.write(resp.read())
            print(f'    saved {os.path.getsize(path)} bytes')
        except HTTPError as e:
            print(f'  ERROR {e.code}: {e.reason}')
            if e.code == 403:
                print('  The BLS UA check failed. Edit HEADERS["User-Agent"] in process_bls.py')
                print('  to include a real contact email.')
            raise


def process_prices():
    print('  Processing BLS price data…')

    # series.csv, data.csv, item.csv — all tab-separated
    series = pd.read_csv(os.path.join(RAW_DIR, 'ap.series'), sep='\t', dtype=str)
    series.columns = series.columns.str.strip()
    for col in series.columns:
        if series[col].dtype == object:
            series[col] = series[col].astype(str).str.strip()

    data = pd.read_csv(os.path.join(RAW_DIR, 'ap.data.0.Current'), sep='\t', dtype=str)
    data.columns = data.columns.str.strip()
    for col in data.columns:
        if data[col].dtype == object:
            data[col] = data[col].astype(str).str.strip()
    data['value'] = pd.to_numeric(data['value'], errors='coerce')
    data['year']  = pd.to_numeric(data['year'],  errors='coerce')

    # Latest reporting period available
    latest_year   = int(data['year'].max())
    year_rows     = data[data['year'] == latest_year]
    latest_period = sorted(year_rows['period'].dropna().unique())[-1]
    recent        = year_rows[year_rows['period'] == latest_period]
    print(f'    latest: {latest_year} {latest_period} ({len(recent)} obs)')

    # Join series → item info
    items = pd.read_csv(os.path.join(RAW_DIR, 'ap.item'), sep='\t', dtype=str)
    items.columns = items.columns.str.strip()
    items['item_code'] = items['item_code'].str.strip()
    items['item_name'] = items['item_name'].str.strip()
    item_name_by_code = dict(zip(items['item_code'], items['item_name']))

    merged = recent.merge(
        series[['series_id', 'item_code', 'area_code']],
        on='series_id', how='left',
    )

    # Build item → region → price mapping
    out = {}
    for _, r in merged.iterrows():
        item_code = r.get('item_code')
        area_code = r.get('area_code')
        value     = r.get('value')
        if pd.isna(value) or not item_code or area_code not in AREA_MAP:
            continue
        region = AREA_MAP[area_code]
        name   = item_name_by_code.get(item_code, item_code)
        rec    = out.setdefault(name, {'item': name, 'item_code': item_code})
        rec[region] = round(float(value), 3)

    os.makedirs(OUT_DIR, exist_ok=True)
    out_path = os.path.join(OUT_DIR, 'bls_prices.json')
    with open(out_path, 'w') as f:
        json.dump(list(out.values()), f, indent=2)
    print(f'    wrote {len(out)} items → {out_path}')


if __name__ == '__main__':
    download_bls_files()
    process_prices()
