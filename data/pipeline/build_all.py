#!/usr/bin/env python3
"""
Run the full data pipeline.

Usage:
  pip install -r requirements.txt
  python build_all.py                    # Foundation Foods (default)
  USDA_DATASET=sr_legacy python build_all.py   # Larger but frozen

Outputs:
  data/processed/bls_prices.json   — regional average prices from BLS
  data/processed/usda_foods.json   — nutrition profiles in %DV
"""

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from process_bls  import download_bls_files, process_prices
from process_usda import process_usda


if __name__ == '__main__':
    print('=' * 60)
    print('Nutrient Engine — Data Pipeline')
    print('=' * 60)

    print('\n[1/2] BLS Average Retail Prices')
    print('-' * 40)
    download_bls_files()
    process_prices()

    print('\n[2/2] USDA FoodData Central')
    print('-' * 40)
    dataset = os.environ.get('USDA_DATASET', 'foundation')
    process_usda(dataset)

    print('\n' + '=' * 60)
    print('Done. Next step: integrate data/processed/*.json into src/data/')
    print('=' * 60)
