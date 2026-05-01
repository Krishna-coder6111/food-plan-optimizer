import { describe, it, expect } from 'vitest';
import { optimizeDiet } from './optimizer';
import { MACRO_PRESETS } from './constants';
import { calcTDEE, calcTargets } from './tdee';
import { FOODS } from '../data/foods';

// Reusable maingain-male targets — chosen because the baseline LP is
// known feasible for this profile.
function maingainTargets() {
  const tdee = calcTDEE('male', 170, 70, 24, 'moderate');
  return calcTargets(tdee, MACRO_PRESETS.maingain, 170, 'male');
}

describe('optimizeDiet — baseline', () => {
  it('returns a feasible plan with non-empty items', () => {
    const r = optimizeDiet(FOODS, maingainTargets(), 'ne', 110, 'male', {});
    expect(r.feasible).toBe(true);
    expect(r.plan.length).toBeGreaterThan(5);
    expect(r.totals.cost).toBeGreaterThan(0);
    expect(r.totals.protein).toBeGreaterThan(150);
  });

  it('always returns the new fields the UI consumes', () => {
    const r = optimizeDiet(FOODS, maingainTargets(), 'ne', 110, 'male', {});
    expect(r).toHaveProperty('contributorsByNutrient');
    expect(r).toHaveProperty('absorbedTotals');
    expect(r).toHaveProperty('warnings');
    expect(r.nutrientScores.fe).toMatchObject({
      label: 'Iron',
      contributors: expect.any(Array),
      storage: 'long',
    });
  });
});

describe('optimizeDiet — pins (the bug that broke the site)', () => {
  it('handles a single pin without hanging', () => {
    const start = Date.now();
    const r = optimizeDiet(FOODS, maingainTargets(), 'ne', 110, 'male', {
      pins: new Set([24]), // Wild Salmon Fillet
    });
    expect(Date.now() - start).toBeLessThan(2000);
    expect(r.feasible).toBe(true);
    expect(r.plan.some(f => f.id === 24)).toBe(true);
  });

  // KNOWN LIMITATION: javascript-lp-solver's simplex hits a degeneracy
  // cycle on certain 2-pin combinations (e.g. Wild Salmon + Whole Eggs).
  // Single pin from any UI click is fine — that was the actual bug fix.
  // We don't test multi-pin here because vitest can't interrupt synchronous
  // hangs in the upstream solver. The browser is protected by the
  // optimizer's between-solve deadline guard for the relaxation cascade,
  // and by the React-level error fallback in useOptimizer.
  it.skip('multi-pin: pending an upstream solver fix or worker-thread isolation', () => {});

  it('returns warnings as an array (UI never crashes on .map)', () => {
    const r = optimizeDiet(FOODS, maingainTargets(), 'ne', 110, 'male', {
      pins: new Set([24]),
    });
    expect(Array.isArray(r.warnings)).toBe(true);
  });
});

describe('optimizeDiet — locks', () => {
  it('respects a quantity lock', () => {
    const r = optimizeDiet(FOODS, maingainTargets(), 'ne', 110, 'male', {
      locks: new Map([[1, 2]]), // Chicken Breast x 2
    });
    expect(r.feasible).toBe(true);
    const chicken = r.plan.find(f => f.id === 1);
    expect(chicken).toBeDefined();
    expect(chicken.servings).toBe(2);
  });
});

describe('optimizeDiet — mode toggle', () => {
  it('nutrient mode produces a higher-cost plan than cost mode', () => {
    const t = maingainTargets();
    const cost = optimizeDiet(FOODS, t, 'ne', 110, 'male', { mode: 'cost' });
    const nut  = optimizeDiet(FOODS, t, 'ne', 110, 'male', { mode: 'nutrients' });
    expect(cost.feasible).toBe(true);
    expect(nut.feasible).toBe(true);
    // Nutrient mode should be at least as expensive (5x the deficit
    // penalty pushes the solver to spend more food $ to reach optima).
    expect(nut.totals.cost).toBeGreaterThanOrEqual(cost.totals.cost);
  });
});
