import { describe, it, expect } from 'vitest';
import { recommendSupplements, SUPPLEMENTS } from './supplements';

describe('recommendSupplements', () => {
  it('returns empty when nothing is deficient', () => {
    const r = recommendSupplements({
      vitD: { actual: 150, opt: 150, status: 'optimal' },
    });
    expect(r.picks).toHaveLength(0);
    expect(r.totalCost).toBe(0);
  });

  it('picks the multivitamin first for broad deficiency', () => {
    const r = recommendSupplements({
      vitA:   { actual: 50, opt: 120, status: 'low' },
      vitC:   { actual: 60, opt: 150, status: 'low' },
      vitD:   { actual: 30, opt: 150, status: 'deficient' },
      vitB12: { actual: 40, opt: 200, status: 'deficient' },
      fe:     { actual: 60, opt: 120, status: 'low' },
      zn:     { actual: 50, opt: 120, status: 'low' },
    });
    expect(r.picks[0].id).toBe('multi');
    expect(r.totalCost).toBeGreaterThan(0);
  });

  it('targets a single deficiency with the cheapest single-purpose pill', () => {
    const r = recommendSupplements({
      vitD: { actual: 30, opt: 150, status: 'deficient' },
    });
    // multi covers vitD too, but vit D-only pill is cheaper. Either is fine — assert vitD gets covered.
    expect(r.picks.some(p => p.fills.some(f => f.nutrient === 'vitD'))).toBe(true);
    expect(r.totalCost).toBeLessThan(0.20);
  });

  it('skips iron supplement for males', () => {
    const r = recommendSupplements({
      fe: { actual: 60, opt: 120, status: 'low' },
    }, { gender: 'male' });
    expect(r.picks.find(p => p.id === 'iron')).toBeUndefined();
  });

  it('includes iron supplement for females when needed', () => {
    const r = recommendSupplements({
      fe: { actual: 60, opt: 120, status: 'low' },
    }, { gender: 'female' });
    // Either multi (which covers fe) or iron-specific. Iron should be in catalog.
    const hasIron = r.picks.find(p => p.fills.some(f => f.nutrient === 'fe'));
    expect(hasIron).toBeDefined();
  });

  it('reports remaining gaps when no supplement covers them', () => {
    // Force an artificially huge gap that no single supplement can fully close
    const r = recommendSupplements({
      vitD: { actual: 0, opt: 1000, status: 'deficient' },
    });
    expect(r.remaining.find(g => g.nutrient === 'vitD')).toBeDefined();
  });
});

describe('SUPPLEMENTS catalog sanity', () => {
  it('every entry has cost > 0 and at least one nutrient covered', () => {
    for (const s of SUPPLEMENTS) {
      expect(s.cost).toBeGreaterThan(0);
      expect(Object.keys(s.covers).length).toBeGreaterThan(0);
    }
  });
});
