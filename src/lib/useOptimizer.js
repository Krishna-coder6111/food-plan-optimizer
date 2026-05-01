'use client';

import { useEffect, useRef, useState } from 'react';
import { optimizeDiet } from '../lib/optimizer';

/**
 * useOptimizer — debounced LP solve.
 *
 * Critical: useEffect MUST depend on a primitive signature, not on object
 * refs. Callers freshly create `targets` / `locks` / `pins` every render,
 * so referential deps would re-fire the effect every render, clear the
 * 120ms debounce timer, and the solver would never run — leaving the UI
 * stuck on the "Building your plan…" skeleton.
 *
 * The signature is a string built from the values that actually matter:
 * food IDs, target macros, region/cost/gender, and the lock/pin entries.
 * The hook holds the latest args in a ref so the effect can read them
 * without introducing object-ref deps.
 */

function buildSig(args) {
  const foods   = args.foods   || [];
  const targets = args.targets || {};
  const locks   = args.locks   || new Map();
  const pins    = args.pins    || new Set();

  const foodIds = foods.map(f => f.id).join(',');
  const tgt     = `${targets.calories}|${targets.protein}|${targets.carbs}|${targets.fat}|${targets.fiber}|${targets.maxSatFat}|${targets.maxSugar}|${targets.maxChol}`;
  const lockSig = [...locks].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(',');
  const pinSig  = [...pins].sort((a, b) => a - b).join(',');
  return `${foodIds}::${tgt}::${args.region}::${args.costIndex}::${args.gender}::${lockSig}::${pinSig}::${args.mode || 'cost'}`;
}

export function useOptimizer(args) {
  const [result, setResult]   = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError]     = useState(null);

  const argsRef  = useRef(args);
  const timerRef = useRef(null);
  const idleRef  = useRef(null);
  argsRef.current = args;

  const sig = buildSig(args);

  useEffect(() => {
    setPending(true);
    setError(null);

    if (timerRef.current) clearTimeout(timerRef.current);
    if (idleRef.current && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleRef.current);
      idleRef.current = null;
    }

    const run = () => {
      const a = argsRef.current;
      try {
        const r = optimizeDiet(
          a.foods,
          a.targets,
          a.region,
          a.costIndex,
          a.gender,
          { locks: a.locks, pins: a.pins, mode: a.mode }
        );
        setResult(r);
      } catch (e) {
        // The UI shows a reset button when result is null, so set an empty
        // feasible-shaped object plus the error message instead of leaving
        // the user stuck on the skeleton.
        console.error('optimizer error', e);
        setError(e?.message || String(e));
        setResult({
          plan: [],
          totals: { cost: 0, protein: 0, calories: 0, fiber: 0, satFat: 0, chol: 0, sugar: 0 },
          feasible: false,
          targets: a.targets,
          nutrientScores: {},
          warnings: [],
          relaxed: [],
        });
      } finally {
        setPending(false);
      }
    };

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (typeof requestIdleCallback !== 'undefined') {
        idleRef.current = requestIdleCallback(run, { timeout: 200 });
      } else {
        run();
      }
    }, 120);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sig]);

  return { result, pending, error };
}
