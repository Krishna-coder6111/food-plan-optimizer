# Nutrient Engine

**Minimum cost, maximum nutrition.** LP-optimized meal planning with real
regional pricing, store-tier-aware costing, and bioavailability scoring.

Every nutrition app on the market (Cronometer, MyFitnessPal, MacroFactor)
is a **tracker** — you log what you ate. This is an **optimizer** — it
solves the diet problem (Stigler 1945) and tells you what to eat to hit
your nutrient targets at the lowest possible cost in your city.

> **Live demo:** https://krishna-coder6111.github.io/food-plan-optimizer/
> *(After cloning: see [Deploying to GitHub Pages](#deploying-to-github-pages) for the one-time setup step before this URL works.)*

## What it does

- **Linear-programming solver** finds the cheapest food combination that
  hits every macro and micronutrient floor — runs entirely in the browser
  in ~25 ms.
- **1 g protein / lb bodyweight** as a hard constraint (not a suggestion).
- **13 micronutrient ranges** drawn from IOM Dietary Reference Intakes;
  the solver targets the *optimum*, not just the floor.
- **Slack-variable optimum targeting** + **single-nutrient progressive
  relaxation** when infeasible (no more "all floors halved" cliffs).
- **Bioavailability** built in — heme vs non-heme iron, dairy vs oxalate
  calcium, animal vs plant zinc/B12, food vs fortified folate. The UI
  shows both labeled %DV and what your body actually absorbs.
- **74-food database** with full USDA nutrient profiles, 5-region pricing,
  and antioxidant scores (loosely indexed to deprecated USDA ORAC).
- **20 US cities** with grocery cost indices, real US map (d3-geo Albers,
  Alaska + Hawaii inset), and local-food strategies.
- **7 store tiers** — Costco/Aldi/Trader Joe's/Kroger/Sprouts/Whole Foods/
  corner store — multipliers stack with city CPI.
- **Hormone optimization** — testosterone-support / hormonal-balance row
  per nutrient, with click-to-expand to see *which* foods are providing it.
- **Storage-horizon awareness** — vit C is a daily concern, B12 / Fe / Ca
  the body stores for months. The Micronutrient panel tags each accordingly.
- **9 macro presets** — maingain, lean bulk, standard bulk, cut, recomp,
  endurance, sport, 40/40/20, keto.
- **Saved profile slots** in localStorage (multi-eater households).
- **Sortable, filterable food + plan tables** with hover-to-see-which-
  micros tooltips.
- **Shopping List** view: same daily plan × N days, grouped by store
  section, with weekly totals.
- **Fully client-side and statically hosted** — no server, no database,
  no data collection. Your body stats never leave your browser.

## Quick Start

### Local development

```bash
git clone https://github.com/Krishna-coder6111/food-plan-optimizer.git
cd food-plan-optimizer
npm install
npm run dev
```

Open http://localhost:3000. Requires Node.js 18.17+ (Next 14 minimum).

### GitHub Codespaces

`Code → Codespaces → Create codespace on main` → wait → `npm install && npm run dev` → open the forwarded port.

## Deploying to GitHub Pages

The `.github/workflows/deploy.yml` workflow builds the static export and
publishes on every push to `main`.

**One-time manual step before your first deploy will succeed:**

1. Repo → **Settings** → **Pages**
2. Under **Build and deployment**, set **Source** to **GitHub Actions**
3. Save

(The workflow's `GITHUB_TOKEN` is scoped to `pages: write` but cannot
*create* the Pages site itself — that's an admin-level operation, hence
the "Resource not accessible by integration" failure mode if you skip the
manual toggle. See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the full
walkthrough.)

After that, the site lives at `https://<owner>.github.io/<repo-name>/`.

## Tabs

| Tab | What it shows |
|---|---|
| **Meal Plan** | The day's optimized plan. Sortable columns, ± to adjust quantities, lock to pin, × to exclude. Hover the Micro bar to see which nutrients each food provides. |
| **Shopping List** | The same daily plan × N days (default 7), grouped by store section, with per-section + weekly totals. Configurable up to 30 days. |
| **Micronutrients** | Per-nutrient bars. Click any nutrient to see which plan items are providing it. Each row tags the storage horizon — `daily` (water-soluble), `weekly` (fat-soluble), `months` (long-term stores like Fe / B12 / Ca). |
| **City Map** | Real US choropleth with Albers projection. Tap a city to switch. |
| **T Support / Hormones** | Per-target row (zinc, vit D, omega-3, magnesium, …). Click to expand and see all contributing foods with per-serving amounts. |
| **All Foods** | Sortable + filterable database. Filter by name + category, sort by any column including the new **Antiox** score. |

## How the optimizer works

LP formulation of the classic diet problem:

```
minimize    Σ ((cost_i × city_index × store_mult) − hormone_discount_i) · x_i

subject to:
  protein      ∈ [bodyweight_lbs, ×1.15]              — 1g/lb floor, no overshoot
  calories     ∈ [target ± 7%]                        — caloric window
  saturated_fat ≤ 10% of calories / 9                 — AHA guideline
  cholesterol  ≤ 300 mg                               — DGA 2020-2025
  added_sugar  ≤ 25–36 g                              — AHA, gender-dependent
  fiber        ≥ max(30g, 14g/1000kcal)               — DGA 2020-2025
  sodium       ≤ 2300 mg
  vit A,C,D,E,K,B6,B12,folate,Ca,Fe,Zn,Mg,Se          — DRI floors + UL caps
  Σ(food_n · x) − d_n + e_n = opt_n                   — slack variables target optimum
  x_i          ≤ max_servings[category]               — no "8 cans of tuna"
  vegetables   ≥ 2,  fruits ≥ 1,  legumes_or_grains ≥ 1
  x_i          ≥ 0    (continuous; rounded to int post-solve)
```

Solver: `javascript-lp-solver`, pure LP (no MIP — the int+slack
combination explodes in branch-and-bound, see commit history). Servings
are rounded to integers in post-processing. Solve time on 74 foods × 13
nutrient-slack pairs: **~25 ms** cold, **~5 ms** subsequent.

**Bioavailability:** absorbed-%DV is computed alongside labeled %DV using
per-category factors (heme vs non-heme Fe, dairy vs greens Ca, animal vs
plant Zn / B12 / folate). Vit-C synergy on non-heme Fe applied as a
post-hoc bonus. The constraints stay linear; the absorbed totals are
shown in the UI as a darker overlay.

**Hormone optimization** is a small cost discount in the objective —
foods supplying hormone-relevant nutrients (Zn / vit D / Mg / ω-3 for
males; Fe / folate / Ca / ω-3 for females) get a per-tag $0.015 discount,
capped. Gentle enough that it doesn't override actual nutrient targeting.

**Antioxidants** (`antioxScore` in `src/lib/constants.js`) are a 0–10
score per food derived from category defaults with name-keyword overrides
(berries 10, kale 9, dark chocolate 10, walnuts 8, EVOO 6, …). Loosely
indexed to USDA's deprecated ORAC database — useful for relative ranking.
Surfaced in the All Foods table and per-food tooltips.

## Project structure

```
food-plan-optimizer/
├── .github/workflows/
│   └── deploy.yml                     # Static export → GH Pages
├── docs/
│   ├── DEPLOY.md                      # Pages setup walkthrough
│   └── API_PROXY.md                   # Live grocery/nutrition API design + bottlenecks
├── src/
│   ├── app/
│   │   ├── layout.js
│   │   ├── page.js                    # Main app — all tabs
│   │   └── globals.css
│   ├── components/
│   │   ├── MealPlanTable.jsx          # Sortable plan table with carbs/fat
│   │   ├── MicronutrientPanel.jsx     # Bars w/ contributors + storage tags
│   │   ├── MicroBarWithTip.jsx        # Hover tooltip for top micros
│   │   ├── SortHeader.jsx             # Reusable sortable <th>
│   │   └── UsMap.jsx                  # d3-geo Albers projection
│   ├── lib/
│   │   ├── optimizer.js               # LP solver + bioavailability + contributors
│   │   ├── constants.js               # DRIs, store tiers, antiox, bioavail factors
│   │   ├── tdee.js                    # Mifflin-St Jeor
│   │   ├── useOptimizer.js            # Debounced solver hook (signature-based deps)
│   │   ├── usePersistentState.js      # localStorage-backed useState
│   │   ├── profiles.js                # Saved profile slots
│   │   ├── weeklyPlan.js              # Daily plan × N days, by section
│   │   └── livePrices.js              # Client SDK for the Worker proxy
│   └── data/
│       ├── foods.js                   # 74 foods with full nutrient profiles
│       ├── cities.js                  # 20 US cities with cost indices
│       └── blsOverrides.js            # Auto-generated by emit_overrides.py
├── data/pipeline/
│   ├── build_all.py                   # USDA + BLS download + process
│   ├── process_bls.py                 # BLS Average Prices → JSON
│   ├── process_usda.py                # USDA FoodData Central → JSON
│   ├── emit_overrides.py              # Pipeline JSON → blsOverrides.js
│   └── .env.example                   # Secrets template (BLS_API_KEY, USDA_API_KEY)
├── worker/                            # Cloudflare Worker — live API proxy (scaffold)
│   ├── src/index.js                   # OFF Prices + FatSecret + KV cache
│   ├── wrangler.toml
│   └── package.json
├── next.config.js                     # output: 'export', basePath from env
├── package.json
└── README.md
```

## Refreshing prices from BLS

```bash
cd data/pipeline
pip install -r requirements.txt
cp .env.example .env                 # add your BLS_API_KEY
python build_all.py                  # download + process
python emit_overrides.py             # → src/data/blsOverrides.js
cd ../..
npm run build                        # bake into bundle
```

`npm run pipeline` does both Python steps in one command.

## Live grocery / nutrition APIs (optional)

Scaffolded in `worker/`. Cloudflare Worker proxies:
- **Open Food Facts Prices** — global, public, lat/lng-aware, no key
- **FatSecret Premier Free** — US, OAuth1, free with attribution

Edge-cached in KV (24 h TTL). Client SDK in `src/lib/livePrices.js`
batches 8 in flight against the Worker. Setup walkthrough +
bottleneck analysis in [`docs/API_PROXY.md`](docs/API_PROXY.md).

To enable in your build: deploy the Worker (`cd worker && wrangler
deploy`), then set `NEXT_PUBLIC_PRICES_API` to its URL. Without that
env var, the SDK no-ops and the app uses baseline prices.

## Data sources

| Source | What | URL |
|---|---|---|
| USDA FoodData Central | Reference nutrition (Foundation + Branded) | [fdc.nal.usda.gov](https://fdc.nal.usda.gov/) |
| BLS Average Prices | Regional grocery prices | [download.bls.gov/pub/time.series/ap/](https://download.bls.gov/pub/time.series/ap/) |
| BLS CPI | Regional food inflation | [bls.gov/cpi/](https://www.bls.gov/cpi/) |
| Open Food Facts Prices | Global crowd-sourced grocery prices | [prices.openfoodfacts.org](https://prices.openfoodfacts.org/) |
| FatSecret Platform API | US nutrition + barcode + autocomplete | [platform.fatsecret.com](https://platform.fatsecret.com/) |

## Tech stack

- **Next.js 14** — React framework, static export (`output: 'export'`)
- **Tailwind CSS** — utility-first styling
- **javascript-lp-solver** — client-side LP, ~25 ms solves
- **d3-geo + topojson-client** — Albers USA projection for the city map
- **Cloudflare Workers** (optional) — live-API proxy + KV edge cache
- **Python 3 + pandas** — BLS / USDA pipeline

## Research foundation

### Diet optimization (LP)
- Prajapati et al. (2025) — *Linear Optimization for the Perfect Meal*
- Donkor et al. (2023) — Systematic review of 52 LP diet studies
- van Dooren et al. (2018) — LP review covering cost / nutrition / environment

### Dietary patterns
- 2025 Dietary Guidelines Advisory Committee
- Sebastian et al. (2024) — Mediterranean diet meta-analysis (MACE OR 0.52)
- Keshani et al. (2025) — Mediterranean + inflammation meta-analysis

### Protein targets
- Morton et al. (2018, BJSM) — 1.6 g/kg optimal for MPS
- Jäger et al. (2017) — ISSN position stand on protein and exercise

### Hormone optimization
- Pilz et al. (2011) — Vit D RCT (+25% T)
- Cinar et al. (2011) — Mg correlates with free T in athletes
- Prasad et al. (1996) — Zn deficiency impairs T synthesis
- Thys-Jacobs et al. (1998) — Ca + vit D reduced PMS severity by 48%

### Bioavailability
- Hurrell & Egli (2010) — Iron bioavailability factors
- Lönnerdal (2000) — Zinc absorption
- Weaver et al. (1999) — Calcium absorption from various sources

## Roadmap

- [x] LP optimizer with slack-variable optimum targeting
- [x] 74-food database with bioavailability factors
- [x] Regional pricing (5 BLS regions + 20 city indices + 7 store tiers)
- [x] 9 macro presets
- [x] Hormone-aware optimization with click-to-expand sources
- [x] Food exclusion + quantity locking + reset
- [x] Real US map (d3-geo Albers)
- [x] Sortable + filterable tables
- [x] Hover-to-see-micros tooltips
- [x] Antioxidant scoring
- [x] Storage-horizon awareness (water vs fat-soluble vs long-term)
- [x] Saved profile slots (multi-eater)
- [x] Shopping List view
- [x] Static GitHub Pages deploy
- [x] BLS pipeline → foods.js loader
- [x] Cloudflare Worker scaffold (OFF Prices + FatSecret)
- [ ] Worker deployed and wired to live UI
- [ ] Per-store filtering (once OFF Prices `location.osm_*` mapping exists)
- [ ] Background pre-warming via Worker Cron Trigger
- [ ] PWA support (offline, installable)
- [ ] International expansion (India, UK) once OFF Prices coverage warrants

## Contributing

PRs welcome. High-leverage areas:
1. **Expanding the food database** — add foods with accurate USDA
   nutrition + 5-region pricing to `src/data/foods.js`. Update the BLS
   item-name mapping in `data/pipeline/emit_overrides.py` so live
   prices apply to your additions.
2. **City coverage** — `src/data/cities.js` has 20 US metros. Add
   yours with a real `costIndex` (BLS regional CPI × state-level
   adjustment) and a `local` / `strategy` description.
3. **Worker deployment + wiring** — see `docs/API_PROXY.md`. The
   scaffold is in place; wiring it to the live UI (toggle, geolocation
   prompt, fallback to BLS) is the next concrete step.

## License

MIT

## Disclaimer

This tool provides general nutritional guidance based on USDA data and
published research. It is not medical advice. Consult a registered
dietitian or physician for personalized nutrition recommendations.
