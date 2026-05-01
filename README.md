# Nutrient Engine

**Minimum cost, maximum nutrition.** LP-optimized meal planning with real
regional pricing, store-tier-aware costing, and bioavailability scoring.

Every nutrition app on the market (Cronometer, MyFitnessPal, MacroFactor)
is a **tracker** — you log what you ate. This is an **optimizer** — it
solves the diet problem (Stigler 1945) and tells you what to eat to hit
your nutrient targets at the lowest possible cost in your city.

> **Live demo:** https://krishna-coder6111.github.io/food-plan-optimizer/
> *(See [`docs/DEPLOY.md`](docs/DEPLOY.md) for the one-time setup step before pushing the deploy URL.)*

## What it does

**Solver**
- Linear-programming optimizer (~25 ms in a Web Worker) that finds the
  cheapest food combination hitting every macro and micronutrient floor.
- 1 g protein / lb bodyweight, 13 micronutrient ranges from IOM DRIs,
  slack-variable opt targeting, single-nutrient + ceiling progressive
  relaxation when infeasible.
- Two modes: **cost** (cheapest plan that hits floors) or **nutrients**
  (raises floors to opt — must hit the optimum, no soft target).
- Bioavailability adjusted (heme vs non-heme Fe, dairy vs greens Ca,
  animal vs plant Zn/B12, food vs fortified folate).

**Health-aware**
- **Multi-select health conditions** — anemia, PCOS, pregnancy, high BP,
  high cholesterol, diabetes, bone health, thyroid, IBS, vegan, lactose-
  intolerant, over-50. Each selection adjusts targets per NIH ODS / ACOG /
  AHA guidance and biases the supplement recommender.
- **Auto-recommend supplements** — greedy: cheapest catalog of generic
  supps that closes whatever micro gaps the food-only LP couldn't reach.
  "+ Daily Multivitamin ($0.10/day) — covers vitD, B12, fe, zn"
- **Hormone optimization** — testosterone-support / hormonal-balance
  per nutrient, click-to-expand sources.
- **Antioxidant + anti-inflammatory scoring** (DII-style, from Pahwa &
  Goyal 2024) per food, sortable in All Foods.
- **Storage-horizon tags** — vit C is daily, B12/Fe/Ca stored for
  months. Mostly daily-low warnings get softened.

**Pricing**
- 20 US cities × 5 BLS regions × 7 store tiers (Costco→corner store).
- BLS Average Retail Prices pipeline writes per-food per-region overrides.
- Live Kroger Catalog API for real per-store prices via a Cloudflare
  Worker proxy. Background Cron pre-warms the top 20 metros nightly so
  the user's first compare-prices click hits warm cache (~150 ms).
- Open Food Facts Prices for global crowd-sourced price data.

**Foods**
- ~80 hand-curated foods (with hormone tags, real serving units).
- + ~387 USDA Foundation Foods auto-merged from `npm run pipeline`.
- + Optional ~2000 USDA Branded Foods (`USDA_INCLUDE_BRANDED=1`).
- 9 macro presets (maingain / lean bulk / cut / recomp / keto / …).

**UI**
- 7-tab layout, sortable + filterable everywhere, editable target tiles,
  saved profile slots, shopping list view (configurable days), compare
  prices across multiple cities, hover-the-micro-bar tooltips, fade-in
  animation for newly-added plan rows, `?reset=1` URL escape hatch.

**Infra**
- Fully static, deployed on GitHub Pages.
- Cloudflare Worker proxies live API calls (FatSecret OAuth2 + Kroger
  OAuth2 + OFF Prices) with KV-cached tokens and 24h price cache.
- Vitest suite (24 passing) + GH Actions test workflow.

> **Live demo:** https://krishna-coder6111.github.io/food-plan-optimizer/

## How to run it all (clean install → live data)

### 1. Clone + install

```sh
git clone https://github.com/Krishna-coder6111/food-plan-optimizer.git
cd food-plan-optimizer
npm install
npm run dev          # http://localhost:3000
```

That's enough to see the app working with the curated 80-food database.

### 2. Pull live data into the bundle (optional but recommended)

```sh
# One-time: install Python deps
cd data/pipeline
pip install -r requirements.txt
cp .env.example .env       # then paste your BLS + USDA keys
cd ../..

# Run the full pipeline. Downloads BLS prices + USDA Foundation Foods,
# emits src/data/blsOverrides.js and src/data/usdaFoods.generated.js.
npm run pipeline

# To also include ~2000 USDA Branded Foods:
USDA_INCLUDE_BRANDED=1 npm run pipeline

# Rebuild so the new data is baked into the bundle:
npm run build
```

After this, FOODS expands from ~80 to ~470 (or ~2470 with branded).

### 3. Live grocery-store prices (optional)

```sh
# One-time: deploy the Cloudflare Worker proxy
cd worker
npm install
cp .dev.vars.example .dev.vars   # then paste your FatSecret + Kroger keys
npx wrangler login                # or use CLOUDFLARE_API_TOKEN env var
npx wrangler kv namespace create PRICE_CACHE
# Paste the printed `id` into wrangler.toml's REPLACE_WITH_NAMESPACE_ID
npx wrangler secret put FATSECRET_CLIENT_ID
npx wrangler secret put FATSECRET_CLIENT_SECRET
npx wrangler secret put KROGER_CLIENT_ID
npx wrangler secret put KROGER_CLIENT_SECRET
npx wrangler deploy
# This prints the Worker URL — note it for step 4.
cd ..
```

### 4. Wire the Worker into the site build

```sh
# For local dev:
echo 'NEXT_PUBLIC_PRICES_API=https://nutrient-engine-proxy.<account>.workers.dev' > .env.local
npm run build && npm run dev

# For the deployed site, the env var is already set in
# .github/workflows/deploy.yml — every push to main bakes it in.
```

### 5. Deploy to GitHub Pages

```sh
git push origin main     # the workflow does the rest
```

One-time setup before first deploy: Settings → Pages → Source = GitHub
Actions. Site appears at `https://<owner>.github.io/<repo>/`.

### 6. (Optional) Pre-warm the price cache nightly

Already configured. The Worker's `wrangler.toml` has a daily cron at
06:00 UTC that pre-warms ~600 cache entries (20 metros × 30 popular
foods). After it ships, the user's first compare-prices click in any of
the 20 cities returns in ~150ms instead of ~1.5s. Trigger manually:

```sh
curl https://nutrient-engine-proxy.<account>.workers.dev/warm
```

## Tabs

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

### Anti-inflammatory diet index
- Pahwa & Goyal (2024) — *Dietary Strategies in the Modulation of
  Chronic Inflammation*, [PMC11576095](https://pmc.ncbi.nlm.nih.gov/articles/PMC11576095/).
  Tables 1 + 2 are the source for the per-food anti-inflammatory score
  (`antiInflammScore` in `src/lib/constants.js`): nine dietary
  categories (ω-3, MUFA, antioxidants, polyphenols, fiber,
  phytochemicals, probiotics, vit/min, low-GI) plus the nine specific
  phytochemicals (curcumin, quercetin, resveratrol, catechin, luteolin,
  kaempferol, β-carotene, rutin, genistein).
- Shivappa et al. (2014) — Original DII methodology (sign convention:
  negative = anti-inflammatory).

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
- [x] Anti-inflammatory diet index (DII-style, from Pahwa & Goyal 2024)
- [x] Storage-horizon awareness (water vs fat-soluble vs long-term)
- [x] Saved profile slots (multi-eater)
- [x] Editable targets + cost/nutrients optimization mode
- [x] Click-to-pin food suggestions on deficient micronutrients
- [x] Shopping List view (with N-day customization)
- [x] BLS pipeline → foods.js loader
- [x] USDA Foundation Foods auto-merge (~387 added foods)
- [x] USDA Branded Foods (opt-in, ~2000 capped)
- [x] Cloudflare Worker (OFF Prices + FatSecret OAuth2 + Kroger OAuth2)
- [x] Direct OFF Prices fallback when Worker isn't deployed
- [x] Worker deployed + UI wired via `NEXT_PUBLIC_PRICES_API`
- [x] Solver in terminable Web Worker (multi-pin no longer freezes)
- [x] Auto-recommend supplements (greedy, gap-filling)
- [x] Health-condition multi-select (anemia, PCOS, pregnancy, HBP, etc.)
- [x] Compare prices across multiple cities live via Kroger API
- [x] Cron-triggered pre-warm of top-20-metro Kroger cache
- [ ] Worldwide expansion via OFF Prices (country picker + FX layer)
- [ ] Per-store filtering on OFF Prices (`location.osm_*` brand mapping)
- [ ] PWA support (offline, installable)
- [ ] FatSecret IP-allowlist setup for production

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
