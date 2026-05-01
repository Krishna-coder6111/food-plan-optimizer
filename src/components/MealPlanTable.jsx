'use client';

import { useState } from 'react';
import { CATEGORIES } from '../data/foods';
import MicroBarWithTip from './MicroBarWithTip';
import { SortHeader, applySort } from './SortHeader';

/**
 * MealPlanTable — daily plan with:
 *   - per-row quantity adjust (−/+, with a lock icon to pin exactly)
 *   - per-row exclude (×)
 *   - sortable columns (click any header)
 *   - hover the Micro bar to see which nutrients the food provides
 *
 * Locks are passed as a Map(foodId → servings). When the user clicks
 * +/−, we bump the count and tell the parent, which updates the locks
 * prop and re-runs the optimizer.
 */

function QtyControl({ food, lockedQty, onLock, onUnlock }) {
  const isLocked = lockedQty != null;
  const current  = isLocked ? lockedQty : food.servings;

  const bump = (delta) => {
    const next = Math.max(0, current + delta);
    if (next === 0) onUnlock(food.id);
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

export default function MealPlanTable({ plan, totals, targets, locks, pins = new Set(), onLock, onUnlock, onExclude, onTogglePin, newlyAdded = new Set() }) {
  const [sort, setSort] = useState({ col: 'protein', dir: 'desc' });

  if (!plan.length) {
    return (
      <div className="bg-white rounded-2xl border border-stone-200 p-6 text-center text-sm text-stone-500">
        No plan yet — check that you haven&apos;t excluded every food.
      </div>
    );
  }

  // Pre-compute totals for each row that the user might want to sort by.
  const enriched = plan.map(f => ({
    ...f,
    _protein: +(f.p * f.servings).toFixed(0),
    _cal:     +(f.cal * f.servings).toFixed(0),
    _carbs:   +((f.carb || 0) * f.servings).toFixed(0),
    _fat:     +((f.f || 0) * f.servings).toFixed(0),
    _fib:     +((f.fib || 0) * f.servings).toFixed(0),
    _cost:    f.totalCost,
  }));

  const getters = {
    name:    f => f.name.toLowerCase(),
    qty:     f => f.servings,
    protein: f => f._protein,
    cal:     f => f._cal,
    carbs:   f => f._carbs,
    fat:     f => f._fat,
    cost:    f => f._cost,
    fib:     f => f._fib,
    micro:   f => f.micro,
  };
  const sorted = applySort(enriched, sort, getters);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 overflow-x-auto shadow-sm">
      <div className="flex justify-between items-baseline mb-3">
        <h2 className="font-display text-lg font-bold">Daily Meal Plan</h2>
        <span className="text-2xs text-stone-400">click a column to sort · −/+ adjust · 📌 pin · × exclude</span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b-2 border-stone-200">
            <th className="py-2 px-1 w-3" />
            <SortHeader id="name"    sort={sort} setSort={setSort}>Food</SortHeader>
            <SortHeader id="qty"     sort={sort} setSort={setSort}>Qty</SortHeader>
            <SortHeader id="protein" sort={sort} setSort={setSort}>Protein</SortHeader>
            <SortHeader id="cal"     sort={sort} setSort={setSort}>Cal</SortHeader>
            <SortHeader id="carbs"   sort={sort} setSort={setSort}>Carbs</SortHeader>
            <SortHeader id="fat"     sort={sort} setSort={setSort}>Fat</SortHeader>
            <SortHeader id="cost"    sort={sort} setSort={setSort}>Cost</SortHeader>
            <SortHeader id="fib"     sort={sort} setSort={setSort}>Fiber</SortHeader>
            <SortHeader id="micro"   sort={sort} setSort={setSort}>Micro</SortHeader>
            <th className="py-2 px-1" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => {
            const lockedQty = locks?.get(f.id);
            const isPinned = pins?.has?.(f.id);
            const isNew = newlyAdded?.has?.(f.id);
            // Pinned row gets a clear purple band on the left + tinted bg
            // so the user can tell at a glance which item is forced into
            // every solve. The fade-in for newly-added rows takes
            // precedence visually for ~1s.
            const rowClass = isNew
              ? 'bg-sage-100/60'
              : isPinned ? 'bg-purple-50/60 border-l-4 border-l-purple-500' : '';
            return (
              <tr key={f.id} className={`border-b border-stone-100 hover:bg-stone-50/50 transition-colors duration-1000 ${rowClass}`}>
                <td className="py-2 px-1">
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    title={CATEGORIES[f.cat]?.label}
                    style={{ background: CATEGORIES[f.cat]?.color || '#999' }}
                  />
                </td>
                <td className="py-2 px-1">
                  <div className="font-medium text-stone-800 flex items-center gap-1.5">
                    {f.name}
                    {isPinned && <span className="text-[9px] font-mono uppercase tracking-wider text-purple-600 bg-purple-100 px-1.5 py-0.5 rounded">PINNED</span>}
                  </div>
                  <div className="text-2xs text-stone-400">{f.unit}</div>
                </td>
                <td className="py-2 px-1">
                  <QtyControl food={f} lockedQty={lockedQty} onLock={onLock} onUnlock={onUnlock} />
                </td>
                <td className="py-2 px-1 font-mono font-bold text-sage-700">{f._protein}g</td>
                <td className="py-2 px-1 font-mono text-stone-500">{f._cal}</td>
                <td className="py-2 px-1 font-mono text-stone-500">{f._carbs}g</td>
                <td className="py-2 px-1 font-mono text-stone-500">{f._fat}g</td>
                <td className="py-2 px-1 font-mono font-semibold text-terra-600">${f._cost.toFixed(2)}</td>
                <td className="py-2 px-1 text-stone-500">{f._fib}g</td>
                <td className="py-2 px-1"><MicroBarWithTip food={f} servings={f.servings} /></td>
                <td className="py-2 px-1">
                  {/* 3-button action group: pin · qty-already-shown · exclude */}
                  <div className="flex items-center gap-1.5 justify-end">
                    {onTogglePin && (
                      <button
                        onClick={() => onTogglePin(f.id)}
                        className={`text-sm leading-none ${isPinned ? 'text-purple-600 hover:text-purple-700' : 'text-stone-300 hover:text-purple-500'}`}
                        title={isPinned ? `Unpin ${f.name} (currently forced into the plan)` : `Pin ${f.name} (force ≥1 serving in every plan)`}
                        aria-label={isPinned ? `Unpin ${f.name}` : `Pin ${f.name}`}
                      >📌</button>
                    )}
                    <button
                      onClick={() => onExclude(f.id)}
                      className="text-red-400 hover:text-red-600 text-base leading-none"
                      title={`Exclude ${f.name}`}
                      aria-label={`Exclude ${f.name}`}
                    >×</button>
                  </div>
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
              <span className="block text-2xs font-normal text-stone-400">target {targets.protein}g</span>
            </td>
            <td className="py-2 px-1 font-mono font-bold">
              {totals.calories}
              <span className="block text-2xs font-normal text-stone-400">target {targets.calories}</span>
            </td>
            <td className="py-2 px-1 font-mono font-bold">
              {totals.carbs}g
              <span className="block text-2xs font-normal text-stone-400">target {targets.carbs}g</span>
            </td>
            <td className="py-2 px-1 font-mono font-bold">
              {totals.fat}g
              <span className="block text-2xs font-normal text-stone-400">target {targets.fat}g</span>
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
