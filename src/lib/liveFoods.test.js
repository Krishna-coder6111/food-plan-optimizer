import { describe, it, expect } from 'vitest';
import { parseFoodDescription, normalizeHit, toFoodRecord, inferCat } from './liveFoods';

const WHEY_HIT = {
  food_id: '4268798',
  food_name: 'Gold Standard 100% Whey',
  brand_name: 'Optimum Nutrition',
  food_type: 'Brand',
  food_description: 'Per 1 scoop - Calories: 110kcal | Fat: 1.00g | Carbs: 2.00g | Protein: 24.00g',
};

describe('parseFoodDescription', () => {
  it('parses the standard FatSecret blurb', () => {
    expect(parseFoodDescription(WHEY_HIT.food_description)).toEqual({
      unit: '1 scoop', cal: 110, f: 1, carb: 2, p: 24,
    });
  });
  it('handles serving units with weights', () => {
    const r = parseFoodDescription('Per 100g - Calories: 597kcal | Fat: 51.00g | Carbs: 22.00g | Protein: 22.00g');
    expect(r.unit).toBe('100g');
    expect(r.cal).toBe(597);
  });
  it('returns null on garbage instead of guessing', () => {
    expect(parseFoodDescription('Calories only: 100')).toBeNull();
    expect(parseFoodDescription('')).toBeNull();
    expect(parseFoodDescription(undefined)).toBeNull();
  });
});

describe('toFoodRecord', () => {
  const rec = toFoodRecord(normalizeHit(WHEY_HIT));
  it('is FOODS-shaped: macros in, micros zeroed, price per region', () => {
    expect(rec.p).toBe(24);
    expect(rec.cal).toBe(110);
    expect(rec.vitD).toBe(0);
    expect(Object.keys(rec.price).sort()).toEqual(['mw', 'ne', 'so', 'us', 'we']);
    expect(rec.price.us).toBeGreaterThan(0);
  });
  it('ids clear the curated + USDA ranges and keep the fs id', () => {
    expect(rec.id).toBeGreaterThanOrEqual(500000);
    expect(rec._fsId).toBe('4268798');
    expect(rec._live).toBe(true);
  });
  it('categorizes whey as supplement', () => {
    expect(rec.cat).toBe('supplement');
    expect(inferCat('Chobani Greek Yogurt')).toBe('dairy');
    expect(inferCat('mystery item xyz')).toBe('supplement');
  });
});
