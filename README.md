# Nutrient Engine

**Minimum cost, maximum nutrition.** LP-optimized meal planning with real regional pricing.

No existing nutrition app solves cost-constrained diet optimization with real regional pricing. Every app on the market (Cronometer, MyFitnessPal, MacroFactor) is a **tracker** — you log what you ate. This is an **optimizer** — it tells you what to eat based on your goals, budget, and location.

## What it does

- **Linear programming solver** finds the mathematically cheapest diet that meets all your nutrient targets
- **1g protein per lb bodyweight** as a hard constraint (not a suggestion)
- **84 micronutrient targets** from USDA Dietary Reference Intakes
- **Real regional pricing** from BLS Average Retail Food Prices (Northeast, Midwest, South, West)
- **20 US cities** with grocery cost indices and local food strategies
- **Hormone optimization** — gender-aware nutrient weighting (testosterone support / hormonal balance)
- **9 macro presets** — maingaining, lean bulk, standard bulk, cutting, recomp, endurance, sport, 40/40/20, keto
- **Food exclusion** — remove any food and the plan instantly recalculates
- **Fully client-side** — no server, no database, no data collection. Your body stats never leave your browser.

## Quick Start

### GitHub Codespaces (recommended)

1. Click **Code → Codespaces → Create codespace on main**
2. Wait for the container to build (~60s)
3. In the terminal:

```bash
npm install
npm run dev
```

4. Open the forwarded port (usually `localhost:3000`)

### Local Development

```bash
git clone https://github.com/YOUR_USERNAME/nutrient-engine.git
cd nutrient-engine
npm install
npm run dev
```

Requires Node.js 18+.

## Project Structure

```
nutrient-engine/
├── src/
│   ├── app/
│   │   ├── layout.js          # Root layout
│   │   ├── page.js            # Main app (client component)
│   │   └── globals.css        # Tailwind + custom styles
│   ├── lib/
│   │   ├── optimizer.js       # LP solver (javascript-lp-solver)
│   │   ├── tdee.js            # Mifflin-St Jeor TDEE calculator
│   │   ├── constants.js       # DRIs, macro presets, constraints
│   │   └── store.js           # Zustand state management
│   └── data/
│       ├── foods.js           # 80+ foods with USDA nutrition data
│       └── cities.js          # 20 US cities with cost indices
├── data/
│   ├── pipeline/              # Python scripts for real data processing
│   │   ├── process_usda.py    # USDA FoodData Central → foods.json
│   │   ├── process_bls.py     # BLS Average Prices → prices.json
│   │   ├── build_all.py       # Run full pipeline
│   │   └── requirements.txt
│   ├── raw/                   # Downloaded data files (gitignored)
│   └── processed/             # Pipeline output JSONs
├── package.json
├── tailwind.config.js
├── next.config.js
└── README.md
```

## How the Optimizer Works

The core is a **linear programming** (LP) formulation of the classic Diet Problem (Stigler, 1945):

```
minimize    Σ (cost_i × region_multiplier × x_i)    — total daily food cost

subject to:
  protein      ≥ bodyweight_lbs                      — 1g/lb hard floor
  protein      ≤ bodyweight_lbs × 1.15               — don't overshoot (wastes money)
  calories     ∈ [target ± 8%]                        — caloric window
  saturated_fat ≤ 10% of calories / 9                 — AHA guideline
  cholesterol  ≤ 300 mg                               — DGA 2020-2025
  added_sugar  ≤ 25-36g                               — AHA (gender-dependent)
  fiber        ≥ 14g per 1000 kcal                    — DGA 2020-2025
  sodium       ≤ 2300 mg                              — DGA 2020-2025
  vitamin_A    ≥ 50% DV                               — micronutrient floors
  vitamin_C    ≥ 60% DV                               — (relaxed from 100% for feasibility)
  ...          (13 vitamins + minerals)
  x_i          ≤ max_servings[category]               — acceptability (no 8 cans of tuna)
  vegetables   ≥ 2 servings                           — dietary diversity
  x_i          ≥ 0, integer                           — whole servings only
```

The solver uses `javascript-lp-solver` running entirely in the browser. No server round-trips.

**Hormone optimization** is implemented as a cost discount in the objective function: foods that contain hormone-supporting nutrients (zinc, vitamin D, magnesium, omega-3 for males; iron, folate, calcium, omega-3 for females) get a small effective cost reduction, making the solver prefer them when they're equally cost-efficient.

## Data Sources

| Source | What | URL |
|--------|------|-----|
| USDA FoodData Central | Nutrition data (6,220 foods × 117 nutrients) | [fdc.nal.usda.gov](https://fdc.nal.usda.gov/download-datasets/) |
| BLS Average Prices | Regional food prices (60 items × 4 regions) | [download.bls.gov/pub/time.series/ap/](https://download.bls.gov/pub/time.series/ap/) |
| BLS CPI | Regional food inflation indices | [bls.gov/cpi/](https://www.bls.gov/cpi/) |
| World Population Review | State-level grocery cost indices | [worldpopulationreview.com](https://worldpopulationreview.com/state-rankings/grocery-prices-by-state) |

### Updating Price Data

BLS publishes new average prices monthly. To update:

```bash
cd data/pipeline
pip install -r requirements.txt
python process_bls.py
```

This downloads the latest BLS files and regenerates `data/processed/prices.json`.

## Research Foundation

### Diet Optimization (Linear Programming)
- Prajapati et al. (2025) — "Linear Optimization for the Perfect Meal" using Gurobi with USDA data
- Donkor et al. (2023) — Systematic review of 52 LP diet studies in *Journal of Optimization*
- van Dooren et al. (2018) — LP review in *Frontiers in Nutrition* covering cost, nutrition, and environmental constraints

### Dietary Patterns
- 2025 Dietary Guidelines Advisory Committee — DASH, Mediterranean, and vegetarian patterns ranked highest
- Sebastian et al. (2024) — Meta-analysis: Mediterranean diet reduced MACE by 48% (OR 0.52)
- Keshani et al. (2025) — Meta-analysis: Mediterranean diet significantly reduces inflammatory markers

### Protein Targets
- Morton et al. (2018) — Meta-analysis in *BJSM*: 1.6g/kg optimal for muscle protein synthesis
- Jäger et al. (2017) — ISSN position stand on protein and exercise

### Hormone Optimization
- Pilz et al. (2011) — Vitamin D supplementation increased testosterone by ~25% (RCT)
- Cinar et al. (2011) — Magnesium correlates with free testosterone in athletes
- Prasad et al. (1996) — Zinc deficiency directly impairs testosterone synthesis
- Thys-Jacobs et al. (1998) — Calcium + vitamin D reduced PMS severity by 48% (RCT)

## Tech Stack

- **Next.js 14** — React framework with static export
- **Tailwind CSS** — Utility-first styling with custom design tokens
- **javascript-lp-solver** — Client-side linear programming (no server needed)
- **Zustand** — Lightweight state management
- **Python 3** — Data pipeline (pandas) for processing USDA/BLS raw data

## Roadmap

- [x] LP optimizer with 40+ constraints
- [x] 80+ food database with full nutrient profiles
- [x] Regional pricing (4 BLS regions + 20 city indices)
- [x] 9 macro strategy presets
- [x] Hormone-aware optimization (male/female)
- [x] Food exclusion with instant recalculation
- [ ] Real US map with state boundaries (D3 + TopoJSON)
- [ ] Weekly meal plan generation (7 unique days)
- [ ] Shopping list export
- [ ] Grocery store API integration (Kroger, Walmart) for real-time prices
- [ ] PWA support (offline, installable)
- [ ] User accounts and saved plans
- [ ] International expansion (India, UK)

## Contributing

PRs welcome. Priority areas:
1. **Expanding the food database** — add more foods with accurate USDA nutrition data to `src/data/foods.js`
2. **BLS price mapping** — improve the mapping between BLS item codes and our food database in `data/pipeline/process_bls.py`
3. **UI/UX improvements** — the design should feel editorial/magazine, not like a generic AI dashboard
4. **Mobile responsiveness** — the app should work great on phones

## License

MIT

## Disclaimer

This tool provides general nutritional guidance based on USDA data and published research. It is not medical advice. Consult a registered dietitian or physician for personalized nutrition recommendations.
