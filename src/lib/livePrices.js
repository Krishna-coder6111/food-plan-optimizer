'use client';

/**
 * Live grocery prices.
 *
 * Two paths:
 *   1. Cloudflare Worker proxy (preferred for production) —
 *      `NEXT_PUBLIC_PRICES_API` points to your deployed Worker, which
 *      hits OFF Prices + FatSecret + edge-caches in KV. See worker/.
 *   2. Direct from the browser to Open Food Facts Prices —
 *      `https://prices.openfoodfacts.org` is public + CORS-friendly so
 *      no proxy is strictly required for the OFF half. We fall back to
 *      direct fetches when the env var is unset.
 *
 * The OFF Prices API is community-sourced and SPARSE outside Western
 * Europe. Treat returned prices as INFORMATIONAL — we display them
 * alongside our baseline; we do NOT override the LP with them, because
 * one observation in the wrong currency can wreck the optimization.
 *
 * Coverage estimate (Apr 2026, OFF wiki):
 *   FR/DE/IT/ES: hundreds of obs per major city
 *   US:           dozens per major metro, mostly NYC/SF/LA
 *   Global:      growing but uneven
 */

const PROXY_BASE   = process.env.NEXT_PUBLIC_PRICES_API || '';
const OFF_API      = 'https://prices.openfoodfacts.org/api/v1';
const BATCH        = 6;
const TTL_MS       = 6 * 60 * 60 * 1000;
const SEARCH_RADIUS_KM = 50;

export function isLiveEnabled() {
  // OFF Prices works without the Worker, so always enabled.
  return true;
}

export function isUsingProxy() {
  return !!PROXY_BASE;
}

const memCache = new Map();

async function getCached(key, fetcher) {
  const hit = memCache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return hit.v;
  const v = await fetcher();
  memCache.set(key, { v, t: Date.now() });
  return v;
}

/**
 * Hit OFF Prices directly. Returns:
 *   { product, median_price, currency, n_observations, sample: [...] }
 * or null if no observations.
 */
async function offPricesDirect({ lat, lng, product, barcode }) {
  const params = new URLSearchParams({
    page_size: '50',
    ...(lat && lng ? { location_lat: String(lat), location_lng: String(lng) } : {}),
    ...(barcode ? { product_code: barcode } : {}),
    ...(product ? { product_name__icontains: product } : {}),
  });
  const r = await fetch(`${OFF_API}/prices?${params}`, { method: 'GET' });
  if (!r.ok) return null;
  const body = await r.json();
  const items = body.items || [];
  const valid = items.filter(p => typeof p.price === 'number' && p.price > 0);
  if (valid.length === 0) return null;
  const prices = valid.map(p => p.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  return {
    product:        barcode || product,
    median_price:   median,
    currency:       valid[0].currency || 'USD',
    n_observations: valid.length,
    sample:         valid.slice(0, 3).map(p => ({
      price:    p.price,
      currency: p.currency,
      location: p.location?.osm_display_name || p.location_id,
      date:     p.date,
    })),
  };
}

async function fetchOnePrice(food, lat, lng) {
  const key = `off:${food.name}:${lat?.toFixed?.(2)},${lng?.toFixed?.(2)}`;
  return getCached(key, async () => {
    if (PROXY_BASE) {
      try {
        const url = `${PROXY_BASE}/off-prices?${new URLSearchParams({
          lat: String(lat), lng: String(lng), product: food.name,
        })}`;
        const r = await fetch(url);
        if (r.ok) return await r.json();
      } catch { /* fall through to direct */ }
    }
    try {
      return await offPricesDirect({ lat, lng, product: food.name });
    } catch {
      return null;
    }
  });
}

/**
 * Batch lookup — returns Map<foodId, observation>.
 */
export async function fetchLivePricesBatch(foods, lat, lng) {
  const out = new Map();
  for (let i = 0; i < foods.length; i += BATCH) {
    const slice = foods.slice(i, i + BATCH);
    const results = await Promise.all(slice.map(f => fetchOnePrice(f, lat, lng).catch(() => null)));
    slice.forEach((f, j) => {
      if (results[j]) out.set(f.id, results[j]);
    });
  }
  return out;
}

// ─── Kroger ─────────────────────────────────────────────────────────────────
// Both endpoints REQUIRE the Worker proxy (OAuth2 secrets stay server-side).
// If the Worker isn't configured, these resolve to empty results so the
// compare-prices view degrades gracefully.

/**
 * List the nearest N Kroger-family stores to a ZIP code.
 * Returns [{ locationId, name, chain, address: { addressLine1, city, state, zipCode } }, ...]
 */
export async function fetchKrogerLocations(zip, radius = 15) {
  if (!PROXY_BASE || !zip) return [];
  const key = `kr:loc:${zip}:${radius}`;
  return getCached(key, async () => {
    try {
      const url = `${PROXY_BASE}/kroger/locations?${new URLSearchParams({ zip, radius })}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const body = await r.json();
      return body.locations || [];
    } catch {
      return [];
    }
  });
}

/**
 * Same as fetchKrogerLocations but takes lat/lng instead of ZIP.
 * Useful when the user picks a city by name and we have its coords from
 * the CITIES table.
 */
export async function fetchKrogerLocationsNear(lat, lng, radius = 15) {
  if (!PROXY_BASE || lat == null || lng == null) return [];
  const key = `kr:loc:${lat.toFixed(2)},${lng.toFixed(2)}:${radius}`;
  return getCached(key, async () => {
    try {
      const url = `${PROXY_BASE}/kroger/locations?${new URLSearchParams({
        lat: String(lat), lng: String(lng), radius,
      })}`;
      const r = await fetch(url);
      if (!r.ok) return [];
      const body = await r.json();
      return body.locations || [];
    } catch {
      return [];
    }
  });
}

/**
 * Search products at a specific Kroger store. Returns first ~10 hits.
 * { items: [{ productId, brand, desc, price, promo, size, image }] }
 */
export async function fetchKrogerProducts(term, locationId) {
  if (!PROXY_BASE || !term) return { items: [] };
  const key = `kr:p:${term}:${locationId || 'any'}`;
  return getCached(key, async () => {
    try {
      const url = `${PROXY_BASE}/kroger/products?${new URLSearchParams({
        term,
        ...(locationId ? { locationId } : {}),
      })}`;
      const r = await fetch(url);
      if (!r.ok) return { items: [] };
      return await r.json();
    } catch {
      return { items: [] };
    }
  });
}

/**
 * Compare a single food across multiple stores. Returns:
 *   { term, byLocation: Map<locationId, bestItem|null> }
 * `bestItem` is the cheapest (regular price, ignoring promos) result.
 */
export async function comparePriceAcrossStores(term, locationIds) {
  const results = await Promise.all(
    locationIds.map(id => fetchKrogerProducts(term, id).catch(() => ({ items: [] })))
  );
  const byLocation = new Map();
  results.forEach((r, i) => {
    const id = locationIds[i];
    const valid = (r.items || []).filter(p => typeof p.price === 'number' && p.price > 0);
    valid.sort((a, b) => a.price - b.price);
    byLocation.set(id, valid[0] || null);
  });
  return { term, byLocation };
}
