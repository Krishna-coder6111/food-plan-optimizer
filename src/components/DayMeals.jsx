'use client';

import { useMemo } from 'react';
import { buildDayMeals, formatQty } from '../lib/dayMeals';

const MEAL_ICON = { breakfast: '🌅', lunch: '🥗', dinner: '🍽', snack: '🥜' };

/**
 * "A day on this plan" — the optimizer's per-day quantities arranged into
 * Breakfast / Lunch / Dinner / Snacks with per-meal macro subtotals. An
 * arrangement, not a new optimization: eat in any order, the daily totals
 * are what the solver guaranteed.
 */
export default function DayMeals({ plan, days }) {
  const { meals, hasItems } = useMemo(() => buildDayMeals(plan, days), [plan, days]);
  if (!hasItems) return null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
        <h3 className="font-display text-base font-bold">A day on this plan</h3>
        <span className="text-2xs text-stone-400">
          Your optimized quantities arranged into meals — rearrange freely, the daily totals are what count.
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-2">
        {meals.map(m => (
          <div key={m.id} className="border border-stone-100 rounded-xl p-3 flex flex-col">
            <div className="text-2xs uppercase tracking-wider text-stone-400 font-semibold mb-1.5">
              {MEAL_ICON[m.id]} {m.label}
            </div>
            {m.items.length === 0 ? (
              <div className="text-2xs text-stone-300 italic flex-1">—</div>
            ) : (
              <ul className="text-xs text-stone-700 space-y-1 flex-1">
                {m.items.map((it, i) => (
                  <li key={`${it.id}-${i}`} className="flex items-baseline gap-1.5">
                    <span className="font-mono text-terra-600 font-semibold whitespace-nowrap">{formatQty(it.qty)}×</span>
                    <span className="min-w-0">
                      {it.name}
                      <span className="text-stone-400 text-2xs"> {it.unit}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 pt-1.5 border-t border-stone-100 text-2xs font-mono text-stone-500">
              <span className="text-sage-700 font-semibold">{m.protein}g P</span> · {m.calories} kcal
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
