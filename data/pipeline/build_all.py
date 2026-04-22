#!/usr/bin/env python3
"""
Master data pipeline — run all processing scripts.

Usage:
  cd data/pipeline
  pip install -r requirements.txt
  python build_all.py
"""

from process_bls import download_bls_files, process_prices
from process_usda import process_usda

if __name__ == '__main__':
    print('=' * 60)
    print('NUTRIENT ENGINE — Data Pipeline')
    print('=' * 60)

    print('\n[1/2] BLS Average Retail Prices')
    print('-' * 40)
    download_bls_files()
    process_prices()

    print('\n[2/2] USDA FoodData Central')
    print('-' * 40)
    process_usda()

    print('\n' + '=' * 60)
    print('Pipeline complete.')
    print('Processed data in: data/processed/')
    print('=' * 60)
