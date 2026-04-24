import { ACTIVITY_LEVELS } from './constants';

/**
 * Mifflin-St Jeor equation (most accurate for non-obese adults)
 */
export function calcBMR(gender, weightLbs, heightInches, age) {
  const weightKg = weightLbs * 0.453592;
  const heightCm = heightInches * 2.54;
  if (gender === 'male') {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  }
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
}

export function calcTDEE(gender, weightLbs, heightInches, age, activityLevel) {
  const bmr = calcBMR(gender, weightLbs, heightInches, age);
  const level = ACTIVITY_LEVELS.find(a => a.value === activityLevel);
  return Math.round(bmr * (level?.mult || 1.55));
}

/**
 * Calculate all macro targets
 * Fiber: max(30g, 14g/1000kcal) — always at least 30g
 */
export function calcTargets(tdee, macroPreset, weightLbs, gender) {
  const adjustedCals = Math.round(tdee * (1 + macroPreset.calAdj / 100));

  const protFromMacro = Math.round((adjustedCals * macroPreset.p / 100) / 4);
  const protein = Math.max(protFromMacro, weightLbs); // 1g/lb minimum

  const carbs = Math.round((adjustedCals * macroPreset.c / 100) / 4);
  const fat = Math.round((adjustedCals * macroPreset.f / 100) / 9);
  const fiber = Math.max(30, Math.round((adjustedCals / 1000) * 14));
  const maxSatFat = Math.round((adjustedCals * 0.10) / 9);
  const maxSugar = gender === 'male' ? 36 : 25;

  return {
    calories: adjustedCals,
    protein,
    carbs,
    fat,
    fiber,
    maxSatFat,
    maxChol: 300,
    maxSodium: 2300,
    maxSugar,
  };
}