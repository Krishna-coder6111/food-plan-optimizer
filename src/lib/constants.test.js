import { describe, it, expect } from 'vitest';
import { antioxScore, antiInflammScore, NUTRIENT_OPTIMA, STORE_TIERS, BIOAVAIL_BY_CATEGORY } from './constants';

describe('antioxScore', () => {
  it('ranks blueberries near the top', () => {
    expect(antioxScore({ name: 'Frozen Mixed Berries', cat: 'fruits' })).toBeGreaterThanOrEqual(8);
  });
  it('ranks coconut oil near the bottom', () => {
    expect(antioxScore({ name: 'Coconut Oil', cat: 'fats' })).toBeLessThanOrEqual(3);
  });
  it('falls back to the category default when no name match', () => {
    expect(antioxScore({ name: 'Random Vegetable', cat: 'vegetables' })).toBeGreaterThanOrEqual(5);
  });
});

describe('antiInflammScore (DII-style)', () => {
  it('is strongly negative for the Pahwa & Goyal hero foods', () => {
    expect(antiInflammScore({ name: 'Turmeric (1 tsp)', cat: 'spices' })).toBeLessThanOrEqual(-9);
    expect(antiInflammScore({ name: 'Wild Salmon Fillet', cat: 'fish' })).toBeLessThanOrEqual(-7);
    expect(antiInflammScore({ name: 'Extra Virgin Olive Oil', cat: 'fats' })).toBeLessThanOrEqual(-6);
    expect(antiInflammScore({ name: 'Green Tea (1 cup)', cat: 'spices' })).toBeLessThanOrEqual(-7);
  });
  it('is positive (pro-inflammatory) for the bad actors', () => {
    expect(antiInflammScore({ name: 'Butter', cat: 'fats' })).toBeGreaterThanOrEqual(2);
    expect(antiInflammScore({ name: 'White Rice', cat: 'grains' })).toBeGreaterThanOrEqual(1);
  });
  it('is neutral-ish for whey', () => {
    expect(Math.abs(antiInflammScore({ name: 'Whey Protein', cat: 'supplement' }))).toBeLessThanOrEqual(1);
  });
});

describe('NUTRIENT_OPTIMA', () => {
  it('every entry has the storage horizon classification', () => {
    for (const [k, v] of Object.entries(NUTRIENT_OPTIMA)) {
      expect(['water', 'fat', 'long']).toContain(v.storage);
      expect(v.min).toBeGreaterThan(0);
      expect(v.opt).toBeGreaterThanOrEqual(v.min);
    }
  });
});

describe('STORE_TIERS', () => {
  it('Costco is the cheapest tier', () => {
    const cheapest = [...STORE_TIERS].sort((a, b) => a.mult - b.mult)[0];
    expect(cheapest.id).toBe('costco');
  });
  it('all multipliers are between 0.5 and 2.0 (sanity)', () => {
    for (const t of STORE_TIERS) {
      expect(t.mult).toBeGreaterThan(0.5);
      expect(t.mult).toBeLessThan(2.0);
    }
  });
});

describe('BIOAVAIL_BY_CATEGORY', () => {
  it('animal Fe is fully bioavailable, plant Fe is reduced', () => {
    expect(BIOAVAIL_BY_CATEGORY.beef.fe).toBeGreaterThanOrEqual(0.9);
    expect(BIOAVAIL_BY_CATEGORY.legumes.fe).toBeLessThanOrEqual(0.6);
  });
  it('B12 is zero for plant categories', () => {
    expect(BIOAVAIL_BY_CATEGORY.vegetables.vitB12).toBe(0);
    expect(BIOAVAIL_BY_CATEGORY.legumes.vitB12).toBe(0);
  });
});
