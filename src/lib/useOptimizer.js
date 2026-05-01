'use client';

import { useEffect, useRef, useState } from 'react';
import { optimizeDiet } from '../lib/optimizer';

/**
 * useOptimizer — debounced LP solve in a Web Worker with a hard timeout.
 *
 * History note. Originally this ran the LP synchronously on the main
 * thread. The optimizer has its own between-solve deadline guard, but
 * a *single* solver.Solve() call inside javascript-lp-solver can cycle
 * for tens of seconds on certain constraint matrices (the multi-pin
 * freeze). Pure-JS deadlines can't interrupt synchronous code, so we
 * moved the solver into a Worker that we can `worker.terminate()` after
 * `WORKER_DEADLINE_MS`. The worker spins up lazily on first solve and
 * we recycle it after a timeout-kill or an unhandled error.
 *
 * Falls back to a synchronous main-thread solve when Workers aren't
 * available (server-side rendering, ancient browsers).
 *
 * Critical: useEffect MUST depend on a primitive signature, not on
 * object refs. Callers freshly create `targets` / `locks` / `pins`
 * every render, so referential deps would re-fire the effect every
 * render, clear the 120ms debounce timer, and the solver would never
 * run — leaving the UI stuck on the "Building your plan…" skeleton.
 */

const WORKER_DEADLINE_MS = 2500;

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

// Module-singleton worker. Created on first need, replaced on terminate.
let workerInstance = null;
function getWorker() {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (workerInstance) return workerInstance;
  try {
    workerInstance = new Worker(new URL('./optimizer.worker.js', import.meta.url), { type: 'module' });
    return workerInstance;
  } catch {
    return null;
  }
}
function recycleWorker() {
  try { workerInstance?.terminate(); } catch {}
  workerInstance = null;
}

function emptyResult(targets, message) {
  // Match the live optimizer's full return shape so UI null-derefs are
  // impossible (e.g. result.contributorsByNutrient.fe).
  const NUT_KEYS = ['vitA','vitC','vitD','vitE','vitK','vitB6','vitB12','folate','ca','fe','zn','mg_','se'];
  return {
    plan: [],
    totals: {
      p: 0, cal: 0, f: 0, sf: 0, mf: 0, chol: 0, carb: 0, fib: 0, sug: 0, na: 0, omega3: 0,
      ...Object.fromEntries(NUT_KEYS.map(k => [k, 0])),
      cost: 0, protein: 0, calories: 0, fat: 0, satFat: 0, monoFat: 0, carbs: 0, fiber: 0, sugar: 0, sodium: 0,
    },
    absorbedTotals: Object.fromEntries(NUT_KEYS.map(k => [k, 0])),
    contributorsByNutrient: {
      ...Object.fromEntries([...NUT_KEYS, 'omega3', 'chol', 'p', 'sf', 'sug'].map(k => [k, []])),
    },
    feasible: false,
    targets: targets || {},
    nutrientScores: {},
    warnings: message ? [message] : [],
    relaxed: [],
  };
}

// Pack args for postMessage — Maps/Sets become arrays; food records are
// already plain objects.
function packArgs(args) {
  return {
    foods:    args.foods,
    targets:  args.targets,
    region:   args.region,
    costIndex:args.costIndex,
    gender:   args.gender,
    locks:    [...(args.locks || new Map())],
    pins:     [...(args.pins  || new Set())],
    mode:     args.mode || 'cost',
  };
}

export function useOptimizer(args) {
  const [result, setResult]   = useState(null);
  const [pending, setPending] = useState(true);
  const [error, setError]     = useState(null);

  const argsRef    = useRef(args);
  const debounceRef= useRef(null);
  const idleRef    = useRef(null);
  const timeoutRef = useRef(null);
  const reqIdRef   = useRef(0);
  argsRef.current = args;

  const sig = buildSig(args);

  useEffect(() => {
    setPending(true);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    if (idleRef.current && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleRef.current);
      idleRef.current = null;
    }

    const run = () => {
      const a = argsRef.current;
      const reqId = ++reqIdRef.current;
      const w = getWorker();

      // Sync fallback: no Worker support
      if (!w) {
        try {
          setResult(optimizeDiet(a.foods, a.targets, a.region, a.costIndex, a.gender,
            { locks: a.locks, pins: a.pins, mode: a.mode }));
        } catch (e) {
          console.error('optimizer error (sync fallback)', e);
          setError(e?.message || String(e));
          setResult(emptyResult(a.targets, `Solver error: ${e?.message || String(e)}`));
        } finally {
          setPending(false);
        }
        return;
      }

      const onMessage = (ev) => {
        const { type, requestId, result: r, message } = ev.data || {};
        if (requestId !== reqId) return;     // stale response
        cleanup();
        if (type === 'result') {
          setResult(r);
        } else {
          console.error('optimizer worker error', message);
          setError(message);
          setResult(emptyResult(a.targets, `Solver error: ${message}`));
        }
        setPending(false);
      };
      const onError = (err) => {
        cleanup();
        recycleWorker();   // worker is now in unknown state
        const msg = err?.message || 'worker crashed';
        console.error('optimizer worker uncaught', err);
        setError(msg);
        setResult(emptyResult(a.targets, `Solver crashed: ${msg}`));
        setPending(false);
      };
      const cleanup = () => {
        try { w.removeEventListener('message', onMessage); } catch {}
        try { w.removeEventListener('error',   onError);   } catch {}
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      };

      w.addEventListener('message', onMessage);
      w.addEventListener('error',   onError);
      w.postMessage({ type: 'solve', requestId: reqId, args: packArgs(a) });

      // Hard deadline. If the solver hangs inside Solve(), terminate the
      // Worker and report a feasibility-failure result. Next solve will
      // spin up a fresh Worker.
      timeoutRef.current = setTimeout(() => {
        cleanup();
        recycleWorker();
        console.warn(`optimizer timed out after ${WORKER_DEADLINE_MS}ms — likely too many pins`);
        setError('Solver timed out');
        setResult(emptyResult(a.targets, `Solver timed out (${WORKER_DEADLINE_MS}ms). Try unpinning a food or re-including excluded items.`));
        setPending(false);
      }, WORKER_DEADLINE_MS);
    };

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      if (typeof requestIdleCallback !== 'undefined') {
        idleRef.current = requestIdleCallback(run, { timeout: 200 });
      } else {
        run();
      }
    }, 120);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [sig]);

  return { result, pending, error };
}
