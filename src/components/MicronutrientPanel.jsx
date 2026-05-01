'use client';

import { useState } from 'react';
import { STORAGE_NOTES } from '../lib/constants';
import { recommendSupplements } from '../lib/supplements';

/**
 * Micronutrient Optimization — one bar per nutrient showing:
 *   - a green "optimal zone" [opt..max]
 *   - the actual intake colored by status (deficient/low/optimal/excessive)
 *   - a darker overlay for absorbed (bioavailable) %DV when it diverges
 *   - a "daily/weekly/months" tag explaining how fast you actually need it
 *   - click a row to expand and see which plan items are providing it
 *
 * Data comes from result.nutrientScores which the optimizer builds.
 */

const BAR_SCALE = 300;

const STORAGE_TAG_STYLE = {
  water: 'bg-stone-100 text-stone-600',           // strict: aim daily
  fat:   'bg-amber-50 text-amber-700',            // weekly avg matters
  long:  'bg-sage-50 text-sage-700',              // months of stores
};

function Bar({ nutrient, score, allFoods = [], planIds = new Set(), pins = new Set(), onPin }) {
  const { label, actual, absorbed, min, opt, max, status, relaxed, storage, contributors } = score;
  const [expanded, setExpanded] = useState(false);

  // Top food sources for this nutrient that aren't already in the plan.
  // Useful when deficient — gives the user a one-click way to add the
  // densest source for the missing nutrient.
  const suggestions = expanded
    ? allFoods
        .filter(f => !planIds.has(f.id))
        .map(f => ({ id: f.id, name: f.name, amount: f[nutrient] || 0 }))
        .filter(x => x.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
    : [];

  const pct = Math.min(100, (actual / BAR_SCALE) * 100);
  const absPct = absorbed != null ? Math.min(100, (absorbed / BAR_SCALE) * 100) : null;
  const showAbsorbed = absorbed != null && absorbed < actual * 0.85;

  // Optimal zone: between opt and max (or opt+30% if no max)
  const zoneStart = (opt / BAR_SCALE) * 100;
  const zoneEnd   = ((max || opt * 2) / BAR_SCALE) * 100;

  // For long-term-storage nutrients, soften "deficient" since one low day is fine.
  const effectiveStatus =
    storage === 'long' && status === 'deficient' && actual >= min * 0.5 ? 'low' : status;

  const fill = {
    deficient: 'bg-red-500',
    low:       'bg-amber-500',
    optimal:   'bg-sage-600',
    excessive: 'bg-orange-500',
  }[effectiveStatus];

  const labelColor = {
    deficient: 'text-red-600',
    low:       'text-amber-600',
    optimal:   'text-sage-700',
    excessive: 'text-orange-600',
  }[effectiveStatus];

  const storageInfo = STORAGE_NOTES[storage] || STORAGE_NOTES.water;

  return (
    <div className="border-b border-stone-50 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full grid grid-cols-[60px_1fr_72px_14px] items-center gap-3 py-1.5 text-left hover:bg-stone-50/50 -mx-2 px-2 rounded-lg transition"
      >
        <div className="text-xs font-mono text-stone-500 text-right">{nutrient}</div>

        <div className="relative h-2.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="absolute top-0 h-full bg-sage-200/60"
            style={{ left: `${zoneStart}%`, width: `${Math.max(0, Math.min(100, zoneEnd) - zoneStart)}%` }}
          />
          <div className={`absolute top-0 h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} />
          {showAbsorbed && (
            <div
              className="absolute top-0 h-full bg-stone-800/40 rounded-full"
              style={{ width: `${absPct}%` }}
              title={`Absorbed: ${absorbed}% (vs ${actual}% labeled)`}
            />
          )}
          <div
            className="absolute top-0 h-full w-px bg-stone-400/60"
            style={{ left: `${(min / BAR_SCALE) * 100}%` }}
            title={`Minimum: ${min}%`}
          />
        </div>

        <div className="text-right">
          <span className={`text-xs font-mono font-semibold ${labelColor}`}>{actual}%</span>
          <span className={`block text-[9px] font-mono mt-0.5 px-1 rounded ${STORAGE_TAG_STYLE[storage] || ''}`} title={storageInfo.label}>
            {storageInfo.tag}
          </span>
          {showAbsorbed && (
            <span className="block text-[9px] text-stone-500 font-mono leading-none mt-0.5" title="Bioavailable / absorbed %DV">
              ~{absorbed}% abs
            </span>
          )}
          {relaxed && (
            <span className="block text-[9px] text-stone-400 leading-none" title="Floor relaxed to make the plan feasible">
              relaxed
            </span>
          )}
        </div>

        <span className="text-stone-300 text-xs">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="ml-[60px] pl-3 mb-2 border-l-2 border-stone-100 text-xs text-stone-600">
          <div className="text-2xs text-stone-400 mb-1">{label} · {storageInfo.label}</div>
          {contributors && contributors.length > 0 ? (
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
              {contributors.map(c => (
                <div key={c.id} className="contents">
                  <span>{c.name}</span>
                  <span className="font-mono text-stone-400">{c.servings}×</span>
                  <span className="font-mono text-sage-700 text-right">{Math.round(c.amount)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="italic text-stone-400">No plan item supplies meaningful {label.toLowerCase()}.</div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <div className="text-2xs uppercase tracking-wider text-stone-400 font-semibold mb-1">Top sources NOT in plan</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5">
                {suggestions.map(s => (
                  <div key={s.id} className="contents">
                    <span>{s.name}</span>
                    <span className="font-mono text-sage-700 text-right">{Math.round(s.amount)}%/serv</span>
                    {pins.has(s.id) ? (
                      <span className="text-2xs text-purple-600 font-mono">in plan</span>
                    ) : (
                      <button
                        onClick={() => onPin?.(s.id)}
                        className="text-2xs text-sage-700 hover:text-sage-900 font-mono px-1.5 py-0.5 rounded hover:bg-sage-50 border border-sage-200"
                        title="Add this food to the plan. Use the 📌 pin button on the Meal Plan tab to keep it there permanently."
                      >+ Add to plan</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MicronutrientPanel({ nutrientScores, relaxed = [], allFoods = [], planIds = new Set(), pins = new Set(), onPin, gender = 'male' }) {
  if (!nutrientScores) return null;
  const entries = Object.entries(nutrientScores);

  const deficientCount = entries.filter(([, s]) => s.status === 'deficient').length;
  const optimalCount   = entries.filter(([, s]) => s.status === 'optimal').length;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-display text-lg font-bold">Micronutrient Optimization</h2>
        <div className="text-2xs text-stone-400 font-mono">
          <span className="text-sage-700">{optimalCount}</span> optimal
          {deficientCount > 0 && (
            <> · <span className="text-red-500">{deficientCount}</span> deficient</>
          )}
        </div>
      </div>
      <p className="text-xs text-stone-400 mb-3">
        Click any nutrient to see which foods are providing it. Tags: <span className="font-mono">daily</span> = needed every day, <span className="font-mono">weekly</span> = body stores ~1–4 weeks, <span className="font-mono">months</span> = body stores months to years.
      </p>

      <div>
        {entries.map(([nutrient, score]) => (
          <Bar key={nutrient} nutrient={nutrient} score={score}
            allFoods={allFoods} planIds={planIds} pins={pins} onPin={onPin} />
        ))}
      </div>

      {relaxed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-100 text-2xs text-stone-400">
          <span className="font-semibold text-amber-600">Note:</span> the floor for{' '}
          <span className="font-mono">{relaxed.join(', ')}</span>{' '}
          was relaxed because no feasible plan met all minimums simultaneously.
          Consider re-including excluded foods, or add a supplement.
        </div>
      )}

      <SupplementRecommender nutrientScores={nutrientScores} gender={gender} />
    </div>
  );
}

function SupplementRecommender({ nutrientScores, gender }) {
  const rec = recommendSupplements(nutrientScores, { gender });

  // No gaps — celebrate, don't suggest pills you don't need.
  if (rec.picks.length === 0 && Object.keys(rec.gaps).length === 0) {
    return (
      <div className="mt-3 pt-3 border-t border-stone-100 text-xs text-sage-700 leading-relaxed">
        <span className="font-semibold">No supplement gaps.</span>{' '}
        Your current plan covers every micronutrient at the floor or above. You don&apos;t need a multivitamin.
      </div>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-stone-100">
      <div className="text-xs text-stone-700 leading-relaxed mb-2">
        <span className="font-semibold">Close the gap with supplements.</span>{' '}
        Your plan is short on{' '}
        <span className="font-mono">{Object.keys(rec.gaps).join(', ')}</span>.
        Cheapest combo to fill it:
      </div>
      {rec.picks.length === 0 ? (
        <div className="text-xs text-stone-500 italic">No catalog supplement covers your specific gap profile — try re-including excluded foods or switching to nutrients mode.</div>
      ) : (
        <ul className="space-y-1.5">
          {rec.picks.map(p => (
            <li key={p.id} className="flex items-baseline gap-2 text-xs">
              <span className="text-sage-600 font-semibold">+</span>
              <div className="flex-1">
                <div>
                  <span className="font-medium text-stone-800">{p.name}</span>
                  <span className="text-2xs text-stone-400 ml-2">covers {p.fills.map(f => f.nutrient).join(', ')}</span>
                </div>
                <div className="text-2xs text-stone-400 italic">{p.note}</div>
              </div>
              <span className="font-mono font-semibold text-terra-600">${p.cost.toFixed(2)}/day</span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-baseline justify-between mt-2 pt-2 border-t border-stone-100 text-xs">
        <span className="font-semibold text-stone-700">
          {rec.picks.length === 0 ? 'No combo found' : `Total: $${rec.totalCost.toFixed(2)}/day`}
          {rec.picks.length > 0 && <span className="text-2xs text-stone-400 ml-2 font-normal">(${(rec.totalCost * 30).toFixed(2)}/month)</span>}
        </span>
        {rec.remaining.length > 0 && (
          <span className="text-2xs text-amber-600">Still short on {rec.remaining.map(r => r.nutrient).join(', ')}</span>
        )}
      </div>
    </div>
  );
}
