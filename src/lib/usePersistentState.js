'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * usePersistentState — useState that mirrors to localStorage.
 *
 * Quirks worth knowing:
 *   - Reads happen in useEffect (post-mount) to avoid SSR/hydration drift.
 *     The first render uses `initial`; if a stored value exists we set it
 *     after mount. The optimizer hook will re-solve once that lands.
 *   - `serialize` / `deserialize` let callers persist Sets and Maps as
 *     arrays / entry-pairs. Falls back to JSON.
 *   - Quota errors (private mode, full storage) are swallowed — we only
 *     log so the app keeps working.
 */
export function usePersistentState(
  key,
  initial,
  { serialize = JSON.stringify, deserialize = JSON.parse } = {},
) {
  const [value, setValue] = useState(initial);
  const hydratedRef = useRef(false);

  // Load once, post-mount.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) {
        const parsed = deserialize(raw);
        if (parsed !== undefined) setValue(parsed);
      }
    } catch (e) {
      console.warn('usePersistentState: failed to read', key, e);
    } finally {
      hydratedRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Save on every change once hydrated.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, serialize(value));
    } catch (e) {
      console.warn('usePersistentState: failed to write', key, e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}

// Helpers for the Set/Map fields.
export const setSerialize   = (s) => JSON.stringify([...s]);
export const setDeserialize = (raw) => new Set(JSON.parse(raw));
export const mapSerialize   = (m) => JSON.stringify([...m]);
export const mapDeserialize = (raw) => new Map(JSON.parse(raw));
