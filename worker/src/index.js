/**
 * Nutrient Engine — live-data proxy Worker.
 *
 * Routes (all GET, all return JSON):
 *   /off-prices?lat&lng&product       → Open Food Facts Prices (no auth)
 *   /off-prices?barcode               → OFF Prices by EAN/UPC
 *   /fatsecret/search?q               → FatSecret food search (OAuth2)
 *   /fatsecret/food?id                → FatSecret food details
 *   /kroger/products?term&zip         → Kroger Catalog products + prices
 *   /kroger/locations?zip&radius      → nearest Kroger stores
 *   /health                           → liveness probe
 *
 * Why a Worker (and not direct browser calls)?
 *   - FatSecret + Kroger require OAuth2 client_credentials with secrets.
 *     Those secrets MUST stay server-side.
 *   - FatSecret enforces an IP allowlist; the Worker pins outbound traffic
 *     to Cloudflare's egress range, which we whitelist once.
 *   - Edge KV cache: 24h TTL on prices, 50min on OAuth tokens (they live
 *     for ~60min). Cache-warm round-trip ~5–15ms vs ~150–800ms cold.
 *
 * OAuth tokens are cached in KV under `oauth:fatsecret` and `oauth:kroger`.
 * The Worker fetches a fresh token on cache miss using the configured
 * client_id/secret.
 */

const PRICE_TTL = 24 * 60 * 60;   // 24h for grocery prices
const TOKEN_TTL = 50 * 60;        // 50min — tokens live 60min, refresh early

const OFF_API           = 'https://prices.openfoodfacts.org/api/v1';
const FATSECRET_TOKEN   = 'https://oauth.fatsecret.com/connect/token';
const FATSECRET_API     = 'https://platform.fatsecret.com/rest/server.api';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request, env);
    if (request.method !== 'GET')      return json({ error: 'GET only' }, 405, request, env);

    const url = new URL(request.url);
    try {
      let payload;
      switch (url.pathname) {
        case '/off-prices':         payload = await offPrices(url, env, ctx);          break;
        case '/fatsecret/search':   payload = await fatsecretSearch(url, env);         break;
        case '/fatsecret/food':     payload = await fatsecretFood(url, env);           break;
        case '/kroger/products':    payload = await krogerProducts(url, env);          break;
        case '/kroger/locations':   payload = await krogerLocations(url, env);         break;
        case '/health':             payload = { ok: true, ts: Date.now() };            break;
        case '/warm':               payload = await prewarm(env);                      break;
        default:                    return json({ error: 'not found' }, 404, request, env);
      }
      return json(payload, 200, request, env);
    } catch (err) {
      return json({ error: err.message || String(err) }, 502, request, env);
    }
  },

  // Cron Trigger — runs whatever schedule is in wrangler.toml.
  // We pre-warm the KV cache for the most-likely queries: Kroger
  // locations near each of our 20 tracked cities + the top 30 generic
  // food terms at the first store of each. After this runs, the next
  // user click on Compare hits a warm cache and returns in ~150ms
  // instead of ~1.5s.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(prewarm(env));
  },
};

// 20 cities × 30 terms = 600 KV writes / cron tick. Kroger limit 10k/day
// so daily cron is fine; budget allows hourly too if traffic warrants.
const PREWARM_CITIES = [
  // [name, lat, lng]
  ['Atlanta',     33.75, -84.39],
  ['Cincinnati',  39.10, -84.51],
  ['Chicago',     41.88, -87.63],
  ['Dallas',      32.78, -96.80],
  ['Houston',     29.76, -95.37],
  ['Denver',      39.74,-104.99],
  ['Phoenix',     33.45,-112.07],
  ['Memphis',     35.15, -90.05],
  ['Nashville',   36.16, -86.78],
  ['Indianapolis',39.77, -86.16],
  ['Columbus',    39.96, -82.99],
  ['Detroit',     42.33, -83.05],
  ['Charlotte',   35.23, -80.84],
  ['Louisville',  38.25, -85.76],
  ['Birmingham',  33.52, -86.80],
  ['Knoxville',   35.96, -83.92],
  ['Lexington',   38.04, -84.50],
  ['Toledo',      41.66, -83.55],
  ['Cleveland',   41.50, -81.69],
  ['Richmond',    37.54, -77.43],
];

const PREWARM_TERMS = [
  'chicken breast', 'ground beef', 'salmon', 'tuna', 'eggs', 'milk',
  'greek yogurt', 'cottage cheese', 'cheddar', 'rolled oats', 'brown rice',
  'whole wheat bread', 'pasta', 'sweet potato', 'broccoli', 'spinach',
  'kale', 'frozen berries', 'banana', 'apple', 'orange', 'lentils',
  'black beans', 'chickpeas', 'tofu', 'almonds', 'peanut butter',
  'olive oil', 'avocado', 'whey protein',
];

async function prewarm(env) {
  let warmed = 0;
  for (const [name, lat, lng] of PREWARM_CITIES) {
    // Warm /kroger/locations for each city
    const locKey = `kr:loc:${lat},${lng}:15`;
    const locHit = await kvGet(env, locKey);
    let firstLocId = null;
    if (locHit) {
      firstLocId = locHit.locations?.[0]?.locationId;
    } else {
      try {
        const u = new URL('https://example.com/kroger/locations');
        u.searchParams.set('lat', lat); u.searchParams.set('lng', lng);
        const out = await krogerLocations(u, env);
        firstLocId = out.locations?.[0]?.locationId;
        warmed++;
      } catch { /* skip dead cities */ }
    }
    if (!firstLocId) continue;
    // Warm /kroger/products for the popular terms at the first store
    for (const term of PREWARM_TERMS) {
      const pkey = `kr:products:${term}:${firstLocId}`;
      if (await kvGet(env, pkey)) continue;
      try {
        const u = new URL('https://example.com/kroger/products');
        u.searchParams.set('term', term);
        u.searchParams.set('locationId', firstLocId);
        await krogerProducts(u, env);
        warmed++;
      } catch { /* keep going */ }
    }
  }
  return { ok: true, warmed, ts: Date.now() };
}

// ─── Open Food Facts Prices ─────────────────────────────────────────────────

async function offPrices(url, env, ctx) {
  const lat     = url.searchParams.get('lat');
  const lng     = url.searchParams.get('lng');
  const product = url.searchParams.get('product');
  const barcode = url.searchParams.get('barcode');
  const radius  = url.searchParams.get('radius') || '20';

  const cacheKey = `off:${barcode || product || ''}:${lat},${lng}:${radius}`;
  const hit = await kvGet(env, cacheKey);
  if (hit) return { ...hit, cached: true };

  const params = new URLSearchParams({
    page_size: '50',
    ...(lat && lng ? { location_lat: lat, location_lng: lng, radius } : {}),
    ...(barcode   ? { product_code: barcode } : {}),
    ...(product   ? { product_name__icontains: product } : {}),
  });
  const r = await fetch(`${OFF_API}/prices?${params}`);
  if (!r.ok) throw new Error(`OFF Prices ${r.status}`);
  const body = await r.json();

  const items  = body.items || [];
  const valid  = items.filter(p => typeof p.price === 'number' && p.price > 0);
  const prices = valid.map(p => p.price).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const result = {
    product:        barcode || product,
    median_price:   median,
    currency:       valid[0]?.currency || 'USD',
    n_observations: prices.length,
    sample:         valid.slice(0, 5).map(p => ({
      price: p.price, currency: p.currency,
      location: p.location?.osm_display_name || p.location_id,
      date: p.date,
    })),
  };
  if (median) ctx.waitUntil(kvPut(env, cacheKey, result, PRICE_TTL));
  return result;
}

// ─── FatSecret (OAuth 2.0 client_credentials) ───────────────────────────────
//
// Token endpoint: POST /connect/token with grant_type=client_credentials,
//   scope=basic (or 'premier' if your account is Premier Free).
// API endpoint:   GET /rest/server.api with method=...&format=json,
//   Authorization: Bearer <token>
//
// FatSecret enforces an IP allowlist. Whitelist Cloudflare's egress IPs
// in your FatSecret dashboard — they publish a list at
// https://www.cloudflare.com/ips-v4 (Workers use the same egress as the
// edge network for outbound fetch).

async function fatsecretToken(env) {
  const cached = await kvGet(env, 'oauth:fatsecret');
  if (cached?.access_token) return cached.access_token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope:      'basic',
  });
  const auth = btoa(`${env.FATSECRET_CLIENT_ID}:${env.FATSECRET_CLIENT_SECRET}`);
  const r = await fetch(FATSECRET_TOKEN, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` },
    body,
  });
  if (!r.ok) throw new Error(`FatSecret token ${r.status}: ${await r.text()}`);
  const tok = await r.json();    // { access_token, expires_in, token_type, ... }
  await kvPut(env, 'oauth:fatsecret', tok, Math.min(TOKEN_TTL, (tok.expires_in || 3600) - 60));
  return tok.access_token;
}

async function fatsecretCall(method, params, env) {
  const token = await fatsecretToken(env);
  const qs = new URLSearchParams({ method, format: 'json', ...params });
  const r = await fetch(`${FATSECRET_API}?${qs}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`FatSecret ${method} ${r.status}`);
  return r.json();
}

async function fatsecretSearch(url, env) {
  const q = url.searchParams.get('q');
  if (!q) throw new Error('missing q');
  const cacheKey = `fs:search:${q}`;
  const hit = await kvGet(env, cacheKey);
  if (hit) return { ...hit, cached: true };
  const body = await fatsecretCall('foods.search', { search_expression: q }, env);
  await kvPut(env, cacheKey, body, PRICE_TTL);
  return body;
}

async function fatsecretFood(url, env) {
  const id = url.searchParams.get('id');
  if (!id) throw new Error('missing id');
  const cacheKey = `fs:food:${id}`;
  const hit = await kvGet(env, cacheKey);
  if (hit) return { ...hit, cached: true };
  const body = await fatsecretCall('food.get.v4', { food_id: id }, env);
  await kvPut(env, cacheKey, body, PRICE_TTL);
  return body;
}

// ─── Kroger (OAuth 2.0 client_credentials) ──────────────────────────────────
//
// Token: POST /v1/connect/oauth2/token with grant_type=client_credentials
//        & scope (depends on the API products you enabled).
// Products API: GET /v1/products with filter.term, filter.locationId.
//
// We use scope='product.compact' for the catalog read.

async function krogerToken(env) {
  const cached = await kvGet(env, 'oauth:kroger');
  if (cached?.access_token) return cached.access_token;

  const base = env.KROGER_API_BASE || 'https://api-ce.kroger.com/v1';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope:      'product.compact',
  });
  const auth = btoa(`${env.KROGER_CLIENT_ID}:${env.KROGER_CLIENT_SECRET}`);
  const r = await fetch(`${base}/connect/oauth2/token`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${auth}` },
    body,
  });
  if (!r.ok) throw new Error(`Kroger token ${r.status}: ${await r.text()}`);
  const tok = await r.json();    // { access_token, expires_in, ... }
  await kvPut(env, 'oauth:kroger', tok, Math.min(TOKEN_TTL, (tok.expires_in || 1800) - 60));
  return tok.access_token;
}

async function krogerProducts(url, env) {
  const term       = url.searchParams.get('term');
  const locationId = url.searchParams.get('locationId') || '';
  if (!term) throw new Error('missing term');
  const cacheKey = `kr:products:${term}:${locationId}`;
  const hit = await kvGet(env, cacheKey);
  if (hit) return { ...hit, cached: true };

  const token = await krogerToken(env);
  const base  = env.KROGER_API_BASE || 'https://api-ce.kroger.com/v1';
  const qs = new URLSearchParams({
    'filter.term':  term,
    ...(locationId ? { 'filter.locationId': locationId } : {}),
    'filter.limit': '20',
  });
  const r = await fetch(`${base}/products?${qs}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`Kroger products ${r.status}`);
  const body = await r.json();
  // Trim to what the client actually uses.
  const result = {
    term, locationId,
    items: (body.data || []).slice(0, 10).map(p => ({
      productId:  p.productId,
      brand:      p.brand,
      desc:       p.description,
      categories: p.categories,
      price:      p.items?.[0]?.price?.regular ?? null,
      promo:      p.items?.[0]?.price?.promo ?? null,
      size:       p.items?.[0]?.size,
      image:      p.images?.[0]?.sizes?.[0]?.url,
    })),
  };
  await kvPut(env, cacheKey, result, PRICE_TTL);
  return result;
}

async function krogerLocations(url, env) {
  const zip    = url.searchParams.get('zip');
  const lat    = url.searchParams.get('lat');
  const lng    = url.searchParams.get('lng');
  const radius = url.searchParams.get('radius') || '15';
  if (!zip && !(lat && lng)) throw new Error('missing zip or lat/lng');
  const cacheKey = zip ? `kr:loc:${zip}:${radius}` : `kr:loc:${lat},${lng}:${radius}`;
  const hit = await kvGet(env, cacheKey);
  if (hit) return { ...hit, cached: true };

  const token = await krogerToken(env);
  const base  = env.KROGER_API_BASE || 'https://api-ce.kroger.com/v1';
  // Kroger accepts either filter.zipCode.near OR filter.lat.near + filter.lon.near
  const qs = new URLSearchParams(zip
    ? { 'filter.zipCode.near': zip, 'filter.radiusInMiles': radius }
    : { 'filter.lat.near': lat, 'filter.lon.near': lng, 'filter.radiusInMiles': radius });
  const r = await fetch(`${base}/locations?${qs}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`Kroger locations ${r.status}`);
  const body = await r.json();
  const result = {
    zip,
    near: zip || `${lat},${lng}`,
    locations: (body.data || []).slice(0, 10).map(l => ({
      locationId: l.locationId,
      name:       l.name,
      chain:      l.chain,
      address:    l.address,
      latitude:   l.geolocation?.latitude,
      longitude:  l.geolocation?.longitude,
    })),
  };
  await kvPut(env, cacheKey, result, PRICE_TTL);
  return result;
}

// ─── KV helpers ─────────────────────────────────────────────────────────────

async function kvGet(env, key) {
  if (!env.PRICE_CACHE) return null;
  return env.PRICE_CACHE.get(key, 'json');
}
async function kvPut(env, key, value, ttl) {
  if (!env.PRICE_CACHE) return;
  return env.PRICE_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

// ─── CORS ───────────────────────────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const ok = allowed.includes(origin) || allowed.includes('*');
  return {
    'Access-Control-Allow-Origin':  ok ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
    'Vary':                         'Origin',
  };
}

function preflight(request, env) {
  return new Response(null, { status: 204, headers: corsHeaders(request, env) });
}

function json(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(request, env),
    },
  });
}
