'use client';

/**
 * Saved profile slots — let the user store named snapshots of their full
 * profile (gender / age / metrics / activity / location / preset / store
 * tier) so a household with multiple eaters can switch between them.
 *
 * Storage shape in localStorage under key `ne.profiles`:
 *   [{ id: 'p_xxx', name: 'Krishna', snapshot: { gender, age, ... } }, ...]
 *
 * Excluded foods and locks are intentionally NOT part of the snapshot —
 * those are plan-tweaks, not identity.
 */

const KEY = 'ne.profiles';

export const PROFILE_FIELDS = [
  'gender', 'age', 'heightFt', 'heightIn', 'weightLbs',
  'activity', 'cityId', 'presetId', 'storeTierId',
];

export function loadProfiles() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProfiles(profiles) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('saveProfiles failed', e);
  }
}

export function captureSnapshot(state) {
  const out = {};
  for (const f of PROFILE_FIELDS) out[f] = state[f];
  return out;
}

export function makeProfileId() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
