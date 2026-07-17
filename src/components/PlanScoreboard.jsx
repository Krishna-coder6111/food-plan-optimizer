'use client';

import { antiInflammScore } from '../lib/constants';

/**
 * PlanScoreboard — the plan tab's headline band, redesigned around
 * data-viz principles (storytellingwithdata / Tufte / Boston brand):
 *
 *   - ONE hero figure (daily cost — the LP's objective), everything else
 *     visually quieter.
 *   - Targets & limits are METERS (value vs benchmark), not text chips:
 *     the comparison is drawn, not narrated. Neutral by default; color
 *     appears only when state demands attention.
 *   - Status palette validated (chroma floor, CVD separation, 3:1
 *     contrast on white): good #3F8C47 · warning #D97706 · serious #EF4444.
 *   - Text wears ink tokens, never the status color; the fill carries
 *     state, the label + numbers carry identity and value (never
 *     color-alone).
 */

const STATUS = {
  good: { fill: '#3F8C47', track: '#E7F0E7' },
  warn: { fill: '#D97706', track: '#F7ECDA' },
  bad:  { fill: '#EF4444', track: '#FBE7E7' },
};

function Meter({ label, valueText, capText, value, cap, tick, status, title }) {
  const pct = Math.max(0, Math.min(100, (value / cap) * 100));
  const tickPct = tick != null ? Math.min(100, (tick / cap) * 100) : null;
  const c = STATUS[status] || STATUS.good;
  return (
    <div className="min-w-[150px]" title={title}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs text-stone-400">{label}</span>
        <span className="text-xs font-mono text-stone-800 font-semibold whitespace-nowrap">
          {valueText}
          <span className="text-stone-400 font-normal"> / {capText}</span>
        </span>
      </div>
      <div className="relative h-1.5 rounded-full mt-1" style={{ background: c.track }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: c.fill }}
        />
        {tickPct != null && (
          <div
            className="absolute -inset-y-0.5 w-px bg-stone-700/70"
            style={{ left: `${tickPct}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default function PlanScoreboard({ result, targets, city }) {
  const t = result.totals;
  const contrib = result.contributorsByNutrient || {};
  const topOf = (key, unit) =>
    (contrib[key] || []).slice(0, 3).map(c => `${c.name}: ${c.amount}${unit}`).join('\n') || undefined;

  // Targets — the LP promises these; meters show value against the tick.
  const protStatus = t.protein >= targets.protein ? 'good' : t.protein >= targets.protein * 0.9 ? 'warn' : 'bad';
  const calStatus  = t.calories >= targets.calories * 0.93 && t.calories <= targets.calories * 1.07 ? 'good' : 'warn';
  const fibTarget  = Math.max(30, targets.fiber);
  const fibStatus  = t.fiber >= fibTarget ? 'good' : 'warn';

  // Limits — budget used; quiet green until ~85%, amber to the cap, red past it.
  const limitStatus = (v, cap) => (v > cap ? 'bad' : v > cap * 0.85 ? 'warn' : 'good');
  const limits = [
    { label: 'Sat fat',  v: t.satFat, cap: targets.maxSatFat,        fmt: g => `${g}g`,  hover: topOf('sf', 'g') },
    { label: 'Cholesterol', v: t.chol, cap: targets.maxChol ?? 300,  fmt: g => `${g}mg`, hover: topOf('chol', 'mg') },
    { label: 'Added sugar', v: t.sugar, cap: targets.maxSugar,       fmt: g => `${g}g`,  hover: topOf('sug', 'g') },
    { label: 'Sodium',   v: t.sodium, cap: targets.maxSodium ?? 2300, fmt: g => `${Math.round(g)}mg`, hover: topOf('na', 'mg') },
  ];

  // Secondary one-liners — muted, no chrome.
  const totalServ = result.plan.reduce((s, f) => s + f.servings, 0) || 1;
  const inflam = result.plan.reduce((s, f) => s + antiInflammScore(f) * f.servings, 0) / totalServ;
  const protPerDollar = (t.protein / Math.max(0.01, t.cost)).toFixed(1);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 shadow-sm">
      <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-x-8 gap-y-4 items-start">
        {/* Hero — the one number this app leads with */}
        <div>
          <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium">Daily cost</div>
          <div className="font-body font-semibold text-stone-900 leading-none mt-1" style={{ fontSize: '48px' }}>
            ${t.cost}
          </div>
          <div className="text-2xs text-stone-400 mt-1.5">
            ≈ ${(t.cost * 30).toFixed(0)}/mo in {city.name} · {protPerDollar}g protein per $
            {inflam < -1 && ' · anti-inflammatory'}
          </div>
        </div>

        {/* Targets — hit the tick */}
        <div className="space-y-2.5">
          <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium">Targets</div>
          <Meter label="Protein" valueText={`${t.protein}g`} capText={`${targets.protein}g`}
            value={t.protein} cap={targets.protein * 1.3} tick={targets.protein}
            status={protStatus} title={topOf('p', 'g')} />
          <Meter label="Calories" valueText={String(t.calories)} capText={String(targets.calories)}
            value={t.calories} cap={targets.calories * 1.3} tick={targets.calories}
            status={calStatus} />
          <Meter label="Fiber" valueText={`${t.fiber}g`} capText={`${fibTarget}g`}
            value={t.fiber} cap={fibTarget * 1.3} tick={fibTarget}
            status={fibStatus} />
        </div>

        {/* Limits — stay inside the track */}
        <div className="space-y-2.5">
          <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium">Limits</div>
          {limits.map(l => (
            <Meter key={l.label} label={l.label}
              valueText={l.fmt(l.v)} capText={l.fmt(l.cap)}
              value={l.v} cap={l.cap}
              status={limitStatus(l.v, l.cap)} title={l.hover} />
          ))}
        </div>
      </div>
    </div>
  );
}
