# Live grocery / nutrition APIs

This app is statically hosted on GitHub Pages. To pull live prices and
nutrition data, requests need a server that can:
- hold OAuth secrets (FatSecret)
- bypass browser CORS for some upstreams
- cache responses near users (latency)

We use a small **Cloudflare Worker** for that. Code lives in `worker/`.

## Providers

| Provider | What it gives you | Cost | Auth | Coverage |
|---|---|---|---|---|
| **Open Food Facts Prices** | Crowd-sourced grocery prices, by lat/lng | Free, no key | None | Global (sparse outside EU) |
| **FatSecret Premier Free** | Nutrition data + barcode + autocomplete | Free for students/non-profits, attribution required | OAuth1 | US |
| **USDA FoodData Central** | Reference nutrition (Foundation + Branded) | Free, optional key | API key | US |
| **Kroger / Walmart** | First-party prices + availability | Business account required | OAuth2 | US, store-specific |

The Worker (`worker/src/index.js`) wraps these into a single,
cache-able JSON API. The React app talks to the Worker via
[`src/lib/livePrices.js`](../src/lib/livePrices.js).

## Setup

```sh
cd worker
npm install
npx wrangler login
npx wrangler kv namespace create PRICE_CACHE   # paste id into wrangler.toml
npx wrangler secret put FATSECRET_CONSUMER_KEY
npx wrangler secret put FATSECRET_CONSUMER_SECRET
npx wrangler deploy
```

Then in your Pages build, set:
```
NEXT_PUBLIC_PRICES_API=https://nutrient-engine-proxy.<your-account>.workers.dev
```

The client checks this env var; if it's blank, live prices are disabled
and the app uses baseline prices in `src/data/foods.js`.

## Bottlenecks and how we handle them

If the question is "how slow is this going to be when someone opens the
app and the optimizer needs live prices for ~80 foods", here's the
breakdown:

### 1. API latency per food (the big one)

Naive: 80 foods × 1 round-trip × 150ms = **~12 seconds wall-clock**.

What we do:
- **Batch parallel** (`livePrices.js` hits 8 in flight). 80 / 8 ≈ 10
  serial waves × 150ms ≈ **~1.5s**.
- **Worker edge cache** (Cloudflare KV, 24h TTL). Cache-warm round-trip
  is **~5–15ms**, so the second user from the same area sees ~120ms
  total for all 80 foods.
- **Per-session memory cache** in the client so a price fetched once
  isn't re-fetched when the user toggles a setting.

Realistic numbers:
- First visit, cold edge cache: **~1.5s** for prices, then ~25ms LP solve
- Subsequent visits / nearby users: **~150ms** for prices (KV-warm)
- Reload of same session: **~10ms** (memory-warm)

### 2. CORS

OFF Prices does send CORS headers, so technically the browser could
hit it directly. We proxy it anyway so:
- the client SDK has one URL to talk to
- we get the edge cache for free
- we can swap providers without redeploying the static site

FatSecret does NOT allow browser calls; the proxy is mandatory.

### 3. OAuth1 signing (FatSecret)

CPU-cheap (HMAC-SHA1 on tiny strings) but security-critical. Workers'
`crypto.subtle` handles it natively. The signing helper is in
`worker/src/index.js` (`signOAuth1()`). Implementation included; verify
against FatSecret's docs before relying on it for production traffic.

### 4. Rate limits

- OFF Prices: no published limit, but be polite. Edge cache = ~99% hit
  rate after warmup.
- FatSecret Basic: 5,000 calls/day (per app, not per user). With cache,
  this stretches a long way.
- FatSecret Premier Free: unlimited but attribution required.
- USDA FDC: 1,000 calls/hour with a free key.

### 5. The LP itself

~10–25ms regardless. Not a bottleneck. Stays purely client-side.

### 6. Sparse coverage

OFF Prices is community-driven; some cities have hundreds of
observations, others have none. Strategy: if `n_observations < 3` for a
food in a given location, fall back to the regional BLS price. The
client lib's `fetchPricesBatch` only fills in foods where the Worker
returned a non-null median.

## What's NOT in scope here

- **Per-store filtering** ("show me only Kroger prices") — needs
  store-tagged price data. OFF Prices includes `location.osm_*` fields
  which we'd have to map to store names. Doable but ~a day of mapping
  work.
- **Live availability / inventory** — neither OFF nor FatSecret tracks
  this. Kroger / Walmart APIs do but require business accounts.
- **Background pre-warming** — a Cron Trigger on the Worker could keep
  hot foods warm across all watched cities. Not implemented yet.
