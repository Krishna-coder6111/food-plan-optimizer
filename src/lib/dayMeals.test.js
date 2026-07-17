import { describe, it, expect } from 'vitest';
import { buildDayMeals, formatQty, slotPrefs } from './dayMeals';

const F = (over) => ({
  id: 1, name: 'Test Food', unit: '100g', cat: 'grains',
  p: 10, cal: 200, servings: 2, ...over,
});

describe('slotPrefs', () => {
  it('sends breakfast foods to breakfast regardless of category', () => {
    expect(slotPrefs(F({ name: 'Oatmeal (cooked)', cat: 'grains' }))[0]).toBe('breakfast');
    expect(slotPrefs(F({ name: 'Whole Eggs', cat: 'eggs' }))[0]).toBe('breakfast');
    expect(slotPrefs(F({ name: 'Gold Standard Whey (ON)', cat: 'supplement' }))[0]).toBe('snack');
  });
  it('falls back to category, then snack', () => {
    expect(slotPrefs(F({ name: 'Chicken, broiler, breast', cat: 'poultry' }))).toEqual(['lunch', 'dinner']);
    expect(slotPrefs(F({ name: 'mystery', cat: 'nope' }))).toEqual(['snack']);
  });
});

describe('formatQty', () => {
  it('renders quarters and never zero', () => {
    expect(formatQty(1.75)).toBe('1¾');
    expect(formatQty(0.5)).toBe('½');
    expect(formatQty(2)).toBe('2');
    expect(formatQty(0.05)).toBe('¼');
  });
});

describe('buildDayMeals', () => {
  it('conserves per-day quantities and macros exactly', () => {
    const plan = [
      F({ id: 1, name: 'Chicken breast', cat: 'poultry', p: 31, cal: 165, servings: 28 }), // 2/day over 14
      F({ id: 2, name: 'Oatmeal (cooked)', cat: 'grains', p: 6, cal: 166, servings: 14 }), // 1/day
      F({ id: 3, name: 'Almonds', cat: 'nuts', p: 21, cal: 579, servings: 7 }),            // 0.5/day
    ];
    const { meals } = buildDayMeals(plan, 14);
    const allItems = meals.flatMap(m => m.items);
    for (const f of plan) {
      const perDay = f.servings / 14;
      const got = allItems.filter(i => i.id === f.id).reduce((s, i) => s + i.qty, 0);
      expect(got).toBeCloseTo(perDay, 10);
    }
    const totalP = meals.reduce((s, m) => s + m.protein, 0);
    expect(totalP).toBeCloseTo(31 * 2 + 6 * 1 + 21 * 0.5, 1);
  });

  it('splits high-volume mains across lunch and dinner', () => {
    const plan = [F({ id: 9, name: 'Chicken thigh', cat: 'poultry', servings: 2 })]; // 2/day at days=1
    const { meals } = buildDayMeals(plan, 1);
    const lunch  = meals.find(m => m.id === 'lunch');
    const dinner = meals.find(m => m.id === 'dinner');
    expect(lunch.items).toHaveLength(1);
    expect(dinner.items).toHaveLength(1);
    expect(lunch.items[0].qty).toBeCloseTo(1);
  });

  it('keeps sub-serving amounts in one slot', () => {
    const plan = [F({ id: 9, name: 'Beef liver', cat: 'beef', servings: 3 })]; // 0.21/day over 14
    const { meals } = buildDayMeals(plan, 14);
    const slotsUsed = meals.filter(m => m.items.length > 0);
    expect(slotsUsed).toHaveLength(1);
    expect(slotsUsed[0].id).toBe('dinner');
  });

  it('balances fractional foods across their preferred slots', () => {
    // Two sub-¾/day poultry foods, both preferring lunch: the second must
    // land in dinner (the lighter slot) instead of piling into lunch.
    const plan = [
      F({ id: 1, name: 'Chicken A', cat: 'poultry', cal: 200, servings: 7 }),  // 0.5/day
      F({ id: 2, name: 'Chicken B', cat: 'poultry', cal: 180, servings: 7 }),  // 0.5/day
    ];
    const { meals } = buildDayMeals(plan, 14);
    const lunch  = meals.find(m => m.id === 'lunch');
    const dinner = meals.find(m => m.id === 'dinner');
    expect(lunch.items).toHaveLength(1);
    expect(dinner.items).toHaveLength(1);
  });

  it('handles an empty plan', () => {
    expect(buildDayMeals([], 7).hasItems).toBe(false);
  });
});
