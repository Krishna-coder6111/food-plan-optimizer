# Live grocery / nutrition APIs — setup & operations

This app is statically hosted. To pull live prices and nutrition data,
requests go through a small **Cloudflare Worker** that holds the OAuth
secrets, bypasses CORS where needed, and edge-caches everything.

The Worker code is in [`worker/src/index.js`](../worker/src/index.js);
the React-side client is [`src/lib/livePrices.js`](../src/lib/livePrices.js).

## Providers

| Provider | What it gives | Cost | Auth | Coverage |
|---|---|---|---|---|
| **Open Food Facts Prices** | Crowd-sourced grocery prices, by lat/lng | Free | None | Global, sparse outside Western Europe |
| **FatSecret Premier Free** | Nutrition + barcode + autocomplete | Free for students/non-profits, attribution required | OAuth 2.0 client_credentials | US dataset |
| **Kroger Catalog** | First-party prices + store inventory | Free dev tier | OAuth 2.0 client_credentials | US, Kroger-family stores only |
| **USDA FoodData Central** | Reference nutrition (Foundation + Branded) | Free, optional key | API key | US |

OFF Prices works without the Worker (CORS-friendly), so the app falls
back to direct browser calls when `NEXT_PUBLIC_PRICES_API` isn't set.
FatSecret + Kroger require the Worker because their secrets must stay
server-side and FatSecret enforces an IP allowlist.

---

## Step-by-step: deploy the Cloudflare Worker

You need a Cloudflare account. Free tier is plenty (100k requests/day).

### 1. Install Wrangler

```sh
cd worker
npm install
npx wrangler --version    # confirms it's installed
```

### 2. Log in to Cloudflare

```sh
npx wrangler login
```

This opens a browser. Authorize Wrangler.

### 3. Create the KV namespace (cache for prices + OAuth tokens)

```sh
npx wrangler kv namespace create PRICE_CACHE
```

It prints something like:
```
[[kv_namespaces]]
binding = "PRICE_CACHE"
id = "abc123..."
```

Open `worker/wrangler.toml` and replace `REPLACE_WITH_NAMESPACE_ID` with
the printed `id`. (Don't bother with `preview_id` unless you want a
separate dev cache.)

### 4. Push your secrets

These never get baked into the Worker bundle. They live encrypted in
Cloudflare and are injected as `env.X` at request time.

```sh
npx wrangler secret put FATSECRET_CLIENT_ID
# (paste your FatSecret client id, hit Enter)

npx wrangler secret put FATSECRET_CLIENT_SECRET
npx wrangler secret put KROGER_CLIENT_ID
npx wrangler secret put KROGER_CLIENT_SECRET
```

### 5. Local dev

```sh
cp .dev.vars.example .dev.vars
# fill in the same values you just pushed
npx wrangler dev
```

`wrangler dev` runs the Worker on `http://localhost:8787` against the
real Cloudflare KV. Try `curl http://localhost:8787/health` — should
return `{"ok":true}`.

### 6. Deploy

```sh
npx wrangler deploy
```

This prints the deployed URL, e.g.
`https://nutrient-engine-proxy.<your-account>.workers.dev`.

### 7. Wire it into the React app

Set the env var at build time so the frontend knows where to call:

```sh
# Local dev
echo 'NEXT_PUBLIC_PRICES_API=https://nutrient-engine-proxy.<your-account>.workers.dev' >> .env.local

# Or for the GH Pages workflow, add to .github/workflows/deploy.yml
# under the build step:
#   env:
#     NEXT_PUBLIC_PRICES_API: https://...
```

Without the env var, `livePrices.js` falls back to direct OFF Prices
calls (no FatSecret or Kroger).

---

## FatSecret's IP allowlist (real gotcha)

FatSecret blocks API calls unless the source IP is in your account's
whitelist (15 max). Cloudflare Workers use a published, fixed range of
egress IPs.

**Option A — whitelist Cloudflare's egress range (recommended):**
Get the current list at https://www.cloudflare.com/ips-v4. There are
~15 ranges. FatSecret accepts CIDR; if not, ask their support to allow
the range or use a representative subset. Add them in your FatSecret
dashboard → API Keys → Whitelisted IP Addresses.

**Option B — request IP-restriction removal:** FatSecret will sometimes
disable IP restriction for accounts with a documented serverless use
case. Email their support and explain.

**For local `wrangler dev`:** your home IP. Add it once in the FatSecret
dashboard. Note: it can take up to 24h to propagate.

---

## Step-by-step: USDA API key

The FoodData Central key is just for higher rate limits — without one
you can use `DEMO_KEY` at 30 requests/hour. With your key (already
saved to `data/pipeline/.env`), it's 1,000 req/hour.

The Python pipeline auto-reads `USDA_API_KEY` from
`data/pipeline/.env`, so it just works for local pipeline runs.

USDA explicitly auto-deactivates keys that show up in public repos.
**Your key was visible in our chat — rotate it** at
https://fdc.nal.usda.gov/api-key-signup before the next pipeline run.

---

## Kroger setup — answers to your questions

### Production vs Certification environment

You picked **Certification** (`https://api-ce.kroger.com`). That's the
right choice for development:
- All catalog + locations endpoints work
- Test data, no real customer cart impact
- No 24h IP-whitelist wait

When you go live, register a **second app in Production**
(`https://api.kroger.com`) and switch `KROGER_API_BASE` to
`https://api.kroger.com/v1` for the deployed Worker. Production
credentials can't be tested in cert; cert credentials don't work in
prod.

The Worker reads `KROGER_API_BASE` from `wrangler.toml` (currently
`https://api-ce.kroger.com/v1`), so swapping environments is one
config edit + redeploy.

### API products

You enabled **locations + products**. That's exactly right for our
use case (look up prices and store IDs). You do **not** need:

- **cart** — we're not adding to a Kroger cart, just reading prices
- **profile** — we don't authenticate end-users against Kroger
- **identity** — same as profile

If you ever want "buy these for me" workflow, add `cart`. Otherwise
leave them off — fewer permissions = less attack surface.

---

## Per-store filtering — answer

You asked: *"How do I get OFF `location.osm_*` → store-name mapping?"*

Two paths, depending on which provider you query:

### Kroger (clean)
Kroger's `/locations` endpoint returns each store with a `locationId`
+ `name` + `chain`. The `/products?filter.locationId=` query then
returns prices for that specific store. No mapping needed — Kroger
gives you the IDs directly.

UI flow:
1. User enters ZIP → call `/kroger/locations?zip=02115`
2. Show "nearest 5 Krogers" with checkboxes
3. User picks one → save its `locationId` in localStorage
4. All `/kroger/products` calls include `filter.locationId=...`
5. Prices are now Kroger-store-specific

### Open Food Facts (messier)
OFF Prices items have a `location` object with OSM fields:
```json
"location": {
  "osm_id": 12345,
  "osm_type": "node",
  "osm_name": "Whole Foods Market",
  "osm_brand": "Whole Foods",
  "osm_display_name": "Whole Foods Market, 15 Westland Ave, Boston"
}
```

To filter by store, group items by `osm_brand` (or fall back to
`osm_name`). It's a string-match game — names vary ("Whole Foods" vs
"Whole Foods Market" vs "WHOLE FOODS"). Build a normalized
`brandKey(osm_brand)` that lowercases, strips punctuation, and maps
common variants:
```js
function brandKey(s) {
  if (!s) return null;
  const k = s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    'wholefoods': 'wholefoods', 'wholefoodsmarket': 'wholefoods',
    'kroger': 'kroger', 'fredmeyer': 'kroger', 'ralphs': 'kroger',  // Kroger family
    'aldi': 'aldi',
    'costco': 'costco', 'costcowholesale': 'costco',
    'walmart': 'walmart', 'walmartsupercenter': 'walmart',
    // ...
  };
  return aliases[k] || k;
}
```

Then group OFF observations by `brandKey` and present each as a tile.

This is half a day of mapping work. Not in this PR — when you want it,
the seam is clean: add a `brandKey()` utility and a `?brand=` query
param to `/off-prices` in the Worker.

---

## Bottlenecks and how we handle them

### 1. Per-food API latency

| Strategy | Wall-clock for 80 foods |
|---|---|
| Naive sequential | ~12s |
| Batched 8-in-flight (cold edge) | ~1.5s |
| Warm Cloudflare KV | ~150ms |
| Memory-warm reload | ~10ms |

`livePrices.js` does the batching client-side. The Worker handles the
KV layer. The client has its own per-session memory cache too.

### 2. CORS

OFF Prices sets CORS headers, so the browser can hit it directly
(client falls back to this when no Worker is configured). FatSecret +
Kroger reject browser calls — they require the Worker.

### 3. OAuth token churn

Both FatSecret and Kroger return tokens that live ~60 minutes. The
Worker caches them in KV under `oauth:fatsecret` and `oauth:kroger`
with a 50-minute TTL. So 99%+ of API calls skip the token endpoint.

### 4. Rate limits

| Provider | Limit |
|---|---|
| OFF Prices | None published; be polite. KV cache eats almost all repeat traffic. |
| FatSecret Basic | 5,000 / day per app |
| FatSecret Premier Free | Unlimited (with attribution) |
| Kroger Catalog | 10,000 / day per app |
| USDA FDC | 1,000 / hour with a key |

### 5. Sparse coverage

OFF Prices is community-driven. Some cities have hundreds of
observations, others have zero. Strategy: if `n_observations < 3` for
a food in a given location, fall back to the BLS regional average
(which is what the app uses today).

### 6. The LP itself

~25ms cold, ~5ms warm. Not a bottleneck.

---

## What's NOT in this PR

- **Worker actually deployed.** Code is ready; you run `wrangler deploy`.
- **UI toggle for live prices.** Once deployed, add a "use live prices"
  switch in the profile panel that flips the optimizer onto the live
  prices map.
- **Kroger location picker UI.** Same — endpoint works, UI not built.
- **Background pre-warming Cron Trigger.** Worth doing when you have
  more than a handful of users.
