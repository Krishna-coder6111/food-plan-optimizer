'use client';

import { CATEGORIES } from '../data/foods';

/**
 * MealPlanTable — the daily plan with:
 *   - per-row quantity adjust (−/+ with a lock icon to pin exactly)
 *   - per-row exclude (×)
 *
 * Locks are passed as a Map(foodId → servings). When the user clicks
 * +/−, we bump the count and tell the parent, which updates the locks
 * prop and re-runs the optimizer. The optimizer will keep that food at
 * exactly that count and re-solve the rest of the plan around it.
 *
 * Leaving a food "unlocked" means the optimizer is free to place it
 * anywhere in [0, MAX_SERVINGS[cat]].
 */

function MicroBar({ value, max = 10 }) {
  const count = Math.round(Math.min(value / max, 1) * 10);
  return (
    <div className="flex gap-px">
      {Array.from({ length: 10 }, (_, i) => (
        <div
          key={i}
          className="w-0.5 h-3 rounded-sm"
          style={{ background: i < count ? '#3D6340' : '#E8E4DD' }}
        />
      ))}
    </div>
  );
}

function QtyControl({ food, lockedQty, onLock, onUnlock }) {
  const isLocked = lockedQty != null;
  const current  = isLocked ? lockedQty : food.servings;

  const bump = (delta) => {
    const next = Math.max(0, current + delta);
    if (next === 0) onUnlock(food.id);  // unlock + exclude route — but 0 means just remove it from plan
    else onLock(food.id, next);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => bump(-1)}
        disabled={current <= 0}
        aria-label="Decrease quantity"
        className="w-5 h-5 rounded border border-stone-200 text-stone-500 hover:border-terra-400 hover:text-terra-600 disabled:opacity-30 flex items-center justify-center text-xs leading-none"
      >−</button>
      <span className={`text-xs font-mono w-5 text-center ${isLocked ? 'text-terra-600 font-bold' : 'text-stone-600'}`}>
        {current}
      </span>
      <button
        onClick={() => bump(1)}
        aria-label="Increase quantity"
        className="w-5 h-5 rounded border border-stone-200 text-stone-500 hover:border-sage-600 hover:text-sage-700 flex items-center justify-center text-xs leading-none"
      >+</button>
      {isLocked && (
        <button
          onClick={() => onUnlock(food.id)}
          aria-label="Unlock (let optimizer decide)"
          title="Unlock — let the optimizer decide this quantity"
          className="text-terra-600 hover:text-terra-700 text-xs ml-0.5"
        >🔒</button>
      )}
    </div>
  );
}

export default function MealPlanTable({ plan, totals, targets, locks, onLock, onUnlock, onExclude }) {
  if (!plan.length) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-6 text-center text-sm text-stone-500">
        No plan yet — check that you haven&apos;t excluded every food.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 overflow-x-auto shadow-sm">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-display text-lg font-bold">Daily Meal Plan</h2>
        <span className="text-2xs text-stone-400">−/+ to adjust · × to exclude</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-stone-200 text-left">
            {['', 'Food', 'Qty', 'Protein', 'Cal', 'Cost', 'Fiber', 'Micro', ''].map((h, i) => (
              <th key={i} className="py-2 px-1 text-2xs uppercase tracking-wider text-stone-400 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {plan.map(f => {
            const lockedQty = locks?.get(f.id);
            return (
              <tr key={f.id} className="border-b border-stone-100 hover:bg-stone-50/50">
                <td className="py-2 px-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ background: CATEGORIES[f.cat]?.color || '#999' }}
                  />
                </td>
                <td className="py-2 px-1">
                  <div className="font-medium text-stone-800">{f.name}</div>
                  <div className="text-2xs text-stone-400">{f.unit}</div>
                </td>
                <td className="py-2 px-1">
                  <QtyControl
                    food={f}
                    lockedQty={lockedQty}
                    onLock={onLock}
                    onUnlock={onUnlock}
                  />
                </td>
                <td className="py-2 px-1 font-mono font-bold text-sage-700">{(f.p * f.servings).toFixed(0)}g</td>
                <td className="py-2 px-1 font-mono text-stone-500">{(f.cal * f.servings).toFixed(0)}</td>
                <td className="py-2 px-1 font-mono font-semibold text-terra-600">${f.totalCost.toFixed(2)}</td>
                <td className="py-2 px-1 text-stone-500">{(f.fib * f.servings).toFixed(0)}g</td>
                <td className="py-2 px-1"><MicroBar value={f.micro} /></td>
                <td className="py-2 px-1">
                  <button
                    onClick={() => onExclude(f.id)}
                    className="text-red-400 hover:text-red-600 text-sm"
                    aria-label={`Exclude ${f.name}`}
                  >×</button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-stone-300">
            <td colSpan={2} className="py-2 px-1 font-display font-bold">TOTAL</td>
            <td className="py-2 px-1" />
            <td className="py-2 px-1 font-mono font-bold text-sage-700">
              {totals.protein}g
              <span className="block text-2xs font-normal text-stone-400">
                target {targets.protein}g
              </span>
            </td>
            <td className="py-2 px-1 font-mono font-bold">
              {totals.calories}
              <span className="block text-2xs font-normal text-stone-400">
                target {targets.calories}
              </span>
            </td>
            <td className="py-2 px-1 font-mono font-bold text-terra-600">${totals.cost}</td>
            <td className="py-2 px-1 font-bold">{totals.fiber}g</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
