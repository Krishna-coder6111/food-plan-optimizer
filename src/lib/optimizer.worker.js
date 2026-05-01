// Web Worker that runs `optimizeDiet` off the main thread.
//
// Why this exists: javascript-lp-solver's simplex synchronously cycles on
// certain constraint matrices (e.g. several user pins on protein-heavy
// foods). Pure-JS deadline guards can't interrupt a synchronous Solve()
// call. Putting the solver in a Worker means the main thread can call
// `worker.terminate()` after a deadline and the page never freezes.
//
// Caller protocol:
//   postMessage({ type: 'solve', requestId, args })
//   onmessage:
//     { type: 'result', requestId, result }   — success
//     { type: 'error',  requestId, message }  — Solve threw

import { optimizeDiet } from './optimizer';

self.addEventListener('message', (e) => {
  const { type, requestId, args } = e.data || {};
  if (type !== 'solve') return;

  // The args have to be plain serializable values when posted; locks/pins
  // come over as arrays which we rebuild into Map/Set here.
  const opts = {
    locks: new Map(args.locks || []),
    pins:  new Set(args.pins  || []),
    mode:  args.mode || 'cost',
  };

  try {
    const result = optimizeDiet(args.foods, args.targets, args.region, args.costIndex, args.gender, opts);
    self.postMessage({ type: 'result', requestId, result });
  } catch (err) {
    self.postMessage({ type: 'error', requestId, message: err?.message || String(err) });
  }
});
