import { create } from 'zustand';
import { MACRO_PRESETS } from './constants';

export const useStore = create((set) => ({
  // Profile
  gender: 'male',
  age: 24,
  heightFt: 5,
  heightIn: 10,
  weightLbs: 170,
  activity: 'moderate',
  cityId: 'boston',

  // Diet strategy
  presetId: 'maingain',

  // Food exclusions
  excluded: new Set(),

  // Active tab
  tab: 'plan',

  // Actions
  setProfile: (key, value) => set({ [key]: value }),
  setPreset: (id) => set({ presetId: id }),
  setCity: (id) => set({ cityId: id }),
  setTab: (tab) => set({ tab }),

  toggleExclude: (foodId) => set((state) => {
    const next = new Set(state.excluded);
    if (next.has(foodId)) next.delete(foodId);
    else next.add(foodId);
    return { excluded: next };
  }),

  clearExclusions: () => set({ excluded: new Set() }),
}));
