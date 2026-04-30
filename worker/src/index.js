/**
 * Nutrient Engine — live-data proxy Worker.
 *
 * Routes:
 *   GET  /off-prices?lat=..&lng=..&product=..       → Open Food Facts Prices
 *   GET  /off-prices?barcode=..                     → OFF Prices by barcode
 *   GET  /fatsecret/search?q=..                     → FatSecret food search
 *   GET  /fatsecret/food?id=..                      → FatSecret food details
 *
 * Cache strategy:
 *   - Every successful response is stored in KV under the request
 *     URL key for 24h. Stale-while-revalidate is NOT implemented in
 *     this scaffold (would need a queue/cron worker).
 *   - GET-only; mutations are explicitly rejected.
 *
 * IMPORTANT: this is a SCAFFOLD. The /fatsecret/* handlers stub the
 * OAuth1 signing — fill in `signOAuth1()` with HMAC-SHA1 + nonce/
 * timestamp + percent-encoded params before deploying. Recommend the
 * `oauth-1.0a` package or the inline implementation in FatSecret's docs.
 */

const CACHE_TTL_SECONDS = 24 * 60 * 60;     // 24h
const FATSECRET_BASE = 'https://platform.fatsecret.com/rest/server.api';
const OFF_PRICES_BASE = 'https://prices.openfoodfacts.org/api/v1';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflight(request, env);
    if (request.method !== 'GET')      return json({ error: 'GET only' }, 405, request, env);

    const url = new URL(request.url);
    try {
      let payload;
      switch (url.pathname) {
        case '/off-prices':       payload = await offPrices(url, env, ctx);    break;
        case '/fatsecret/search': payload = await fatsecretSearch(url, env);   break;
        case '/fatsecret/food':   payload = await fatsecretFood(url, env);     break;
        case '/health':           payload = { ok: true };                      break;
        default:                  return json({ error: 'not found' }, 404, request, env);
      }
      return json(payload, 200, request, env);
    } catch (err) {
      return json({ error: err.message || String(err) }, 502, request, env);
    }
  },
};

// ─── Open Food Facts Prices ─────────────────────────────────────────────────
//
// Public, no auth. Docs: https://prices.openfoodfacts.org/api/docs
//
// We call /prices?location_lat=..&location_lng=..&radius=..&product_code=..
// and reduce to {product_code, currency, median_price, n_observations}.

async function offPrices(url, env, ctx) {
  const lat     = url.searchParams.get('lat');
  const lng     = url.searchParams.get('lng');
  const product = url.searchParams.get('product');     // free-text
  const barcode = url.searchParams.get('barcode');     // EAN/UPC
  const radius  = url.searchParams.get('radius') || '20';   // km

  const cacheKey = `off:${barcode || product}:${lat},${lng}:${radius}`;
  const cached = await env.PRICE_CACHE?.get(cacheKey, 'json');
  if (cached) return { ...cached, cached: true };

  const params = new URLSearchParams({
    page_size: '50',
    ...(lat && lng ? { location_lat: lat, location_lng: lng, radius } : {}),
    ...(barcode ? { product_code: barcode } : {}),
    ...(product ? { product_name__icontains: product } : {}),
  });
  const r = await fetch(`${OFF_PRICES_BASE}/prices?${params}`);
  if (!r.ok) throw new Error(`OFF Prices ${r.status}`);
  const body = await r.json();

  const items = body.items || [];
  const prices = items.map(p => p.price).filter(p => p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;
  const result = {
    product:    barcode || product,
    median_price: median,
    currency:   items[0]?.currency || 'USD',
    n_observations: prices.length,
    sample:     items.slice(0, 5).map(p => ({ price: p.price, location: p.location?.osm_display_name })),
  };

  if (env.PRICE_CACHE && median) {
    ctx.waitUntil(env.PRICE_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: CACHE_TTL_SECONDS }));
  }
  return result;
}

// ─── FatSecret ──────────────────────────────────────────────────────────────
//
// REST endpoint, OAuth1 signed. Docs: https://platform.fatsecret.com/api
//
// Premier Free tier: US data, attribution required.
// Plain Basic tier: 5,000 calls/day, US only.

async function fatsecretSearch(url, env) {
  const q = url.searchParams.get('q');
  if (!q) throw new Error('missing q');
  const cacheKey = `fs:search:${q}`;
  const cached = await env.PRICE_CACHE?.get(cacheKey, 'json');
  if (cached) return { ...cached, cached: true };

  const params = { method: 'foods.search', search_expression: q, format: 'json' };
  const signed = await signOAuth1('GET', FATSECRET_BASE, params, env);
  const r = await fetch(`${FATSECRET_BASE}?${new URLSearchParams(signed)}`);
  if (!r.ok) throw new Error(`FatSecret ${r.status}`);
  const body = await r.json();
  if (env.PRICE_CACHE) await env.PRICE_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL_SECONDS });
  return body;
}

async function fatsecretFood(url, env) {
  const id = url.searchParams.get('id');
  if (!id) throw new Error('missing id');
  const cacheKey = `fs:food:${id}`;
  const cached = await env.PRICE_CACHE?.get(cacheKey, 'json');
  if (cached) return { ...cached, cached: true };

  const params = { method: 'food.get.v4', food_id: id, format: 'json' };
  const signed = await signOAuth1('GET', FATSECRET_BASE, params, env);
  const r = await fetch(`${FATSECRET_BASE}?${new URLSearchParams(signed)}`);
  if (!r.ok) throw new Error(`FatSecret ${r.status}`);
  const body = await r.json();
  if (env.PRICE_CACHE) await env.PRICE_CACHE.put(cacheKey, JSON.stringify(body), { expirationTtl: CACHE_TTL_SECONDS });
  return body;
}

// ─── OAuth1 signing for FatSecret ───────────────────────────────────────────
//
// SCAFFOLD: implement HMAC-SHA1 signing. The shape FatSecret expects:
//   1. Add oauth_consumer_key, oauth_nonce, oauth_signature_method=HMAC-SHA1,
//      oauth_timestamp, oauth_version=1.0 to params.
//   2. Build the base string: GET&urlencode(URL)&urlencode(sorted params).
//   3. Build the signing key: urlencode(consumer_secret) + '&' + ''.
//      (Two-legged auth — no token secret.)
//   4. Sign with HMAC-SHA1, base64 it, set as oauth_signature.
//
// See FatSecret docs § "Authentication via OAuth 1.0".

async function signOAuth1(method, baseUrl, params, env) {
  const consumerKey    = env.FATSECRET_CONSUMER_KEY;
  const consumerSecret = env.FATSECRET_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) throw new Error('FatSecret credentials not configured');

  const oauthParams = {
    oauth_consumer_key:     consumerKey,
    oauth_nonce:            crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        Math.floor(Date.now() / 1000).toString(),
    oauth_version:          '1.0',
    ...params,
  };
  const enc = (s) => encodeURIComponent(s).replace(/[!*'()]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  const sortedParamStr = Object.keys(oauthParams).sort()
    .map(k => `${enc(k)}=${enc(oauthParams[k])}`).join('&');
  const baseString  = [method, enc(baseUrl), enc(sortedParamStr)].join('&');
  const signingKey  = `${enc(consumerSecret)}&`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(baseString));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));

  return { ...oauthParams, oauth_signature: sigB64 };
}

// ─── CORS / response helpers ────────────────────────────────────────────────

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  const ok = allowed.includes(origin);
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
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      ...corsHeaders(request, env),
    },
  });
}
