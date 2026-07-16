'use client';

/**
 * Live grocery prices — Kroger Catalog via the Cloudflare Worker proxy.
 * `NEXT_PUBLIC_PRICES_API` points at the deployed Worker (OAuth2 secrets
 * stay server-side, responses edge-cached in KV). Without the env var,
 * every helper degrades to empty results and the app uses baseline prices.
 *
 * (The old Open Food Facts direct path was removed — community price data
 * is ~empty in the US; see git history if it's ever needed again.)
 */

const PROXY_BASE   = process.env.NEXT_PUBLIC_PRICES_API || '';
const TTL_MS       = 6 * 60 * 60 * 1000;

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
