#!/usr/bin/env python3
"""
Run the full data pipeline.

Usage:
  pip install -r requirements.txt
  python build_all.py                              # foundation (default)
  USDA_DATASET=sr_legacy python build_all.py       # larger but frozen 2018
  USDA_INCLUDE_BRANDED=1 python build_all.py       # also process branded
  USDA_BRANDED_LIMIT=5000 USDA_INCLUDE_BRANDED=1 \
      python build_all.py                          # cap branded to 5k items

Outputs:
  data/processed/bls_prices.json    — regional average prices from BLS
  data/processed/usda_foods.json    — Foundation/SR Legacy nutrition (%DV)
  data/processed/branded_foods.json — Branded foods (only if USDA_INCLUDE_BRANDED=1)
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

    print('\n[1/3] BLS Average Retail Prices')
    print('-' * 40)
    download_bls_files()
    process_prices()

    print('\n[2/3] USDA FoodData Central — primary dataset')
    print('-' * 40)
    dataset = os.environ.get('USDA_DATASET', 'foundation')
    process_usda(dataset)

    if os.environ.get('USDA_INCLUDE_BRANDED'):
        print('\n[3/3] USDA FoodData Central — branded foods')
        print('-' * 40)
        # Branded writes to a separate JSON so the foundation file isn't
        # clobbered. emit_usda_foods.py picks both up.
        import json
        from process_usda import process_usda as run
        # Tweak output path by monkey-patching env var; cheaper than a
        # full refactor. process_usda always writes to usda_foods.json so
        # we rename after.
        run('branded')
        os.rename(
            os.path.join(HERE, '..', 'processed', 'usda_foods.json'),
            os.path.join(HERE, '..', 'processed', 'branded_foods.json'),
        )
        # Re-run primary so usda_foods.json exists too
        run(dataset)

    print('\n' + '=' * 60)
    print('Done. Run `python emit_overrides.py && python emit_usda_foods.py`')
    print('to generate the JS modules the app imports.')
    print('=' * 60)
