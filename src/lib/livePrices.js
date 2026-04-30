'use client';

/**
 * livePrices — fetch real prices via the Cloudflare Worker proxy.
 *
 * `NEXT_PUBLIC_PRICES_API` is the deployed Worker URL (e.g.
 * https://nutrient-engine-proxy.<account>.workers.dev). If unset, this
 * module no-ops and the app falls back to baseline prices in foods.js.
 *
 * Concurrency: we batch food lookups in parallel (up to BATCH at a time)
 * to keep total wall-clock low. With ~80 foods this is the difference
 * between 8s sequential and ~1s batched (assuming 100ms per lookup).
 */

const BASE = process.env.NEXT_PUBLIC_PRICES_API || '';
const BATCH = 8;
const TTL_MS = 24 * 60 * 60 * 1000;

export function isLiveEnabled() {
  return !!BASE;
}

// Per-session in-memory cache; backstops the Worker's KV cache.
const memCache = new Map();

async function get(path, params) {
  const key = `${path}?${new URLSearchParams(params)}`;
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;

  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const r = await fetch(url, { method: 'GET' });
  if (!r.ok) throw new Error(`livePrices ${r.status}`);
  const v = await r.json();
  memCache.set(key, { v, t: Date.now() });
  return v;
}

/**
 * Fetch median price for a single food, near a given lat/lng.
 * Returns null if no observations.
 */
export async function fetchPrice(food, lat, lng) {
  if (!BASE) return null;
  try {
    const res = await get('/off-prices', {
      lat, lng,
      product: food.name,
    });
    return res?.median_price ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch prices for many foods in parallel (BATCH at a time). Returns
 * a Map<foodId, medianPrice>.
 */
export async function fetchPricesBatch(foods, lat, lng) {
  if (!BASE) return new Map();
  const out = new Map();
  for (let i = 0; i < foods.length; i += BATCH) {
    const slice = foods.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(f => fetchPrice(f, lat, lng).catch(() => null)));
    slice.forEach((f, j) => {
      if (results[j] != null) out.set(f.id, results[j]);
    });
  }
  return out;
}
