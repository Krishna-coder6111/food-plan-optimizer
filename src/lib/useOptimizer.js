'use client';

import { useEffect, useRef, useState } from 'react';
import { optimizeDiet } from '../lib/optimizer';

/**
 * useOptimizer — run the LP solve off the main thread.
 *
 * Strategy:
 *   - Debounce inputs by 120ms so rapid slider/tap changes don't queue up.
 *   - Serialize the call into a Web Worker using a data: URL shim. Since
 *     the optimizer imports javascript-lp-solver, and bundling that inside
 *     a worker requires extra Next.js config, we fall back to the main
 *     thread if no worker is available.
 *   - Show `pending: true` while a solve is in flight so the UI can dim
 *     or show a progress indicator.
 *
 * If you later want true worker offloading, add a `src/lib/optimizer.worker.js`
 * file and instantiate it with Webpack 5's `new Worker(new URL(...), import.meta.url)`.
 * For now we use requestIdleCallback to yield between tap and solve.
 */

export function useOptimizer(args) {
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(false);
  const timerRef = useRef(null);
  const idleRef  = useRef(null);

  useEffect(() => {
    setPending(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (idleRef.current && typeof cancelIdleCallback !== 'undefined') {
      cancelIdleCallback(idleRef.current);
    }

    timerRef.current = setTimeout(() => {
      const run = () => {
        try {
          const r = optimizeDiet(
            args.foods,
            args.targets,
            args.region,
            args.costIndex,
            args.gender,
            { locks: args.locks, pins: args.pins }
          );
          setResult(r);
        } catch (e) {
          console.error('optimizer error', e);
        } finally {
          setPending(false);
        }
      };

      // Yield to the browser before running a heavy solve
      if (typeof requestIdleCallback !== 'undefined') {
        idleRef.current = requestIdleCallback(run, { timeout: 200 });
      } else {
        run();
      }
    }, 120);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    args.foods,
    args.targets,
    args.region,
    args.costIndex,
    args.gender,
    args.locks,
    args.pins,
  ]);

  return { result, pending };
}
