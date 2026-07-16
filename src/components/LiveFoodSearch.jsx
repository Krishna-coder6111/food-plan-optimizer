'use client';

import { useState } from 'react';
import { searchBrandedFoods, toFoodRecord, isLiveSearchEnabled } from '../lib/liveFoods';

/**
 * Live branded-food search (FatSecret via the Worker proxy).
 *
 * Replaces the old bundled 652-item branded slice: instead of shipping an
 * arbitrary chunk of the catalog to every visitor, search the full ~1.7M
 * products on demand and add just the ones you want ("whey" being the
 * canonical case). Added foods join the optimizer's candidate pool and are
 * pinned (≤4 pins) so they show up in the plan immediately.
 *
 * Honest limits, shown in the UI: search results carry macros only (micros
 * count as 0 toward floors) and prices are category estimates.
 */
export default function LiveFoodSearch({ customFoods, setCustomFoods, pins, togglePin }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ status: 'idle', hits: [], error: null });

  if (!isLiveSearchEnabled()) return null;

  const run = async (e) => {
    e?.preventDefault?.();
    if (!q.trim()) return;
    setState({ status: 'loading', hits: [], error: null });
    try {
      const hits = await searchBrandedFoods(q);
      setState({ status: 'done', hits, error: null });
    } catch (err) {
      setState({ status: 'error', hits: [], error: err?.message || String(err) });
    }
  };

  const addedFsIds = new Set(customFoods.map(f => f._fsId));

  const add = (hit) => {
    if (addedFsIds.has(hit.fsId)) return;
    const rec = toFoodRecord(hit);
    setCustomFoods([...customFoods, rec]);
    if (pins.size < 4 && !pins.has(rec.id)) togglePin(rec.id);
  };

  const remove = (rec) => {
    setCustomFoods(customFoods.filter(f => f._fsId !== rec._fsId));
    if (pins.has(rec.id)) togglePin(rec.id);
  };

  return (
    <div className="mb-2">
      <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium mb-1">
        Add branded foods <span className="normal-case font-normal">(live · FatSecret · macros only, est. price)</span>
      </div>
      <form onSubmit={run} className="flex gap-1.5">
        <input
          type="text"
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="whey protein, greek yogurt, quest bar…"
          className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-sage-400"
        />
        <button
          type="submit"
          disabled={state.status === 'loading' || !q.trim()}
          className="px-3 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold disabled:opacity-30 transition"
        >
          {state.status === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      {state.status === 'error' && (
        <div className="text-2xs text-red-600 mt-1">Search failed: {state.error}</div>
      )}
      {state.status === 'done' && state.hits.length === 0 && (
        <div className="text-2xs text-stone-400 italic mt-1">No results with usable nutrition data. Try a simpler term.</div>
      )}
      {state.hits.length > 0 && (
        <ul className="mt-1.5 border border-stone-100 rounded-lg divide-y divide-stone-50 max-h-56 overflow-y-auto">
          {state.hits.map(h => (
            <li key={h.fsId} className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-700 truncate">
                  {h.label}{h.brand && <span className="text-stone-400 font-normal"> · {h.brand}</span>}
                </div>
                <div className="text-2xs text-stone-400 font-mono">
                  per {h.macros.unit}: {h.macros.p}g P · {h.macros.cal} kcal · {h.macros.carb}g C · {h.macros.f}g F
                </div>
              </div>
              {addedFsIds.has(h.fsId) ? (
                <span className="text-2xs font-mono text-purple-600 whitespace-nowrap">added</span>
              ) : (
                <button
                  onClick={() => add(h)}
                  className="text-2xs text-sage-700 hover:text-sage-900 font-mono px-1.5 py-0.5 rounded hover:bg-sage-50 border border-sage-200 whitespace-nowrap"
                >+ Add to plan</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {customFoods.length > 0 && (
        <div className="flex gap-1.5 flex-wrap mt-1.5">
          {customFoods.map(f => (
            <span key={f._fsId} className="pill pill-inactive text-2xs flex items-center gap-1">
              {f.name}
              <button onClick={() => remove(f)} className="text-red-400 hover:text-red-600" title="Remove this live food">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
