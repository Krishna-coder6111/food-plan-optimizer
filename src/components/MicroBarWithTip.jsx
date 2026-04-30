'use client';

import { useState } from 'react';
import { NUTRIENT_OPTIMA, antioxScore } from '../lib/constants';

/**
 * MicroBarWithTip — the 10-segment micro bar, plus a hover/tap tooltip
 * listing the top micronutrients in that food (label + per-serving %DV).
 *
 * `food` is a row from the FOODS table; `servings` defaults to 1 so this
 * works for the All Foods table where each row is a single serving.
 */
export default function MicroBarWithTip({ food, servings = 1, max = 10 }) {
  const [open, setOpen] = useState(false);

  const value = food.micro || 0;
  const count = Math.round(Math.min(value / max, 1) * 10);

  // Rank the food's micros by per-serving %DV. Show the top 5.
  const top = Object.keys(NUTRIENT_OPTIMA)
    .map(k => ({ key: k, label: NUTRIENT_OPTIMA[k].label, pct: (food[k] || 0) * servings }))
    .filter(x => x.pct >= 5)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen(o => !o)}
    >
      <span className="flex gap-px cursor-help">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className="w-0.5 h-3 rounded-sm"
            style={{ background: i < count ? '#3D6340' : '#E8E4DD' }}
          />
        ))}
      </span>
      {open && top.length > 0 && (
        <span className="absolute z-30 left-1/2 -translate-x-1/2 top-5 w-[200px] bg-white border border-stone-200 rounded-lg shadow-lg p-2 text-xs text-stone-700">
          <span className="block text-2xs uppercase tracking-wider text-stone-400 font-semibold mb-1">
            Top micros / serving
          </span>
          <span className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
            {top.map(t => (
              <span key={t.key} className="contents">
                <span>{t.label}</span>
                <span className="font-mono text-sage-700 text-right">{Math.round(t.pct)}%</span>
              </span>
            ))}
          </span>
          <span className="block mt-1 pt-1 border-t border-stone-100 text-2xs text-stone-500">
            antiox <span className="font-mono text-stone-700">{antioxScore(food)}/10</span>
            {food.omega3 > 0 && <> · ω-3 {(food.omega3 * servings).toFixed(2)}g</>}
            {food.chol > 0 && <> · chol {Math.round((food.chol || 0) * servings)}mg</>}
          </span>
        </span>
      )}
    </span>
  );
}
