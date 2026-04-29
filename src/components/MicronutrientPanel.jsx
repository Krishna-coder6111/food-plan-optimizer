'use client';

/**
 * Micronutrient Optimization — one bar per nutrient showing:
 *   - a green "optimal zone" [opt..max]
 *   - the actual intake rendered in red (deficient), amber (low),
 *     green (optimal) or orange (excessive)
 *
 * All data comes from result.nutrientScores which the optimizer builds.
 */

const BAR_SCALE = 300;  // %DV value that maps to 100% of the bar width
                        // anything above this gets clipped at 100%

function Bar({ nutrient, score }) {
  const { label, actual, absorbed, min, opt, max, status, relaxed } = score;
  const pct = Math.min(100, (actual / BAR_SCALE) * 100);
  // Show absorbed as a secondary subdued bar inside the main bar.
  const absPct = absorbed != null ? Math.min(100, (absorbed / BAR_SCALE) * 100) : null;
  const showAbsorbed = absorbed != null && absorbed < actual * 0.85;

  // Optimal zone: between opt and max (or opt+30% if no max)
  const zoneStart = (opt / BAR_SCALE) * 100;
  const zoneEnd   = ((max || opt * 2) / BAR_SCALE) * 100;

  const fill = {
    deficient: 'bg-red-500',
    low:       'bg-amber-500',
    optimal:   'bg-sage-600',
    excessive: 'bg-orange-500',
  }[status];

  const labelColor = {
    deficient: 'text-red-600',
    low:       'text-amber-600',
    optimal:   'text-sage-700',
    excessive: 'text-orange-600',
  }[status];

  return (
    <div className="grid grid-cols-[60px_1fr_56px] items-center gap-3 py-1.5">
      <div className="text-xs font-mono text-stone-500 text-right">{nutrient}</div>

      <div className="relative h-2.5 bg-stone-100 rounded-full overflow-hidden">
        {/* optimal zone */}
        <div
          className="absolute top-0 h-full bg-sage-200/60"
          style={{ left: `${zoneStart}%`, width: `${Math.max(0, Math.min(100, zoneEnd) - zoneStart)}%` }}
        />
        {/* actual intake (labeled %DV) */}
        <div
          className={`absolute top-0 h-full rounded-full ${fill}`}
          style={{ width: `${pct}%` }}
        />
        {/* absorbed (bioavailable %DV) — drawn on top, darker */}
        {showAbsorbed && (
          <div
            className="absolute top-0 h-full bg-stone-800/40 rounded-full"
            style={{ width: `${absPct}%` }}
            title={`Absorbed: ${absorbed}% (vs ${actual}% labeled)`}
          />
        )}
        {/* min marker */}
        <div
          className="absolute top-0 h-full w-px bg-stone-400/60"
          style={{ left: `${(min / BAR_SCALE) * 100}%` }}
          title={`Minimum: ${min}%`}
        />
      </div>

      <div className="text-right">
        <span className={`text-xs font-mono font-semibold ${labelColor}`}>
          {actual}%
        </span>
        {showAbsorbed && (
          <span className="block text-[9px] text-stone-500 font-mono leading-none" title="Bioavailable / absorbed %DV">
            ~{absorbed}% abs
          </span>
        )}
        {relaxed && (
          <span className="block text-[9px] text-stone-400 leading-none" title="Floor relaxed to make the plan feasible">
            relaxed
          </span>
        )}
      </div>
    </div>
  );
}

export default function MicronutrientPanel({ nutrientScores, relaxed = [] }) {
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
        Targeting optimal ranges, not just minimums. Green band = optimal zone. Where labeled and absorbed differ, the darker overlay shows what your body actually absorbs.
      </p>

      <div>
        {entries.map(([nutrient, score]) => (
          <Bar key={nutrient} nutrient={nutrient} score={score} />
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
    </div>
  );
}
