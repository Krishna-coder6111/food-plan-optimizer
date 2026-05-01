'use client';

import { useState, useMemo, useCallback, useEffect, useRef, Fragment } from 'react';
import { FOODS, CATEGORIES, REGIONS } from '../data/foods';
import { CITIES, CITY_MAP } from '../data/cities';
import { MACRO_PRESETS, ACTIVITY_LEVELS, MAX_SERVINGS, STORE_TIERS, antioxScore, antiInflammScore } from '../lib/constants';
import { calcTDEE, calcTargets } from '../lib/tdee';
import { useOptimizer } from '../lib/useOptimizer';
import { usePersistentState, setSerialize, setDeserialize, mapSerialize, mapDeserialize } from '../lib/usePersistentState';
import { loadProfiles, saveProfiles, captureSnapshot, makeProfileId, PROFILE_FIELDS } from '../lib/profiles';
import { buildShoppingList } from '../lib/weeklyPlan';
import { fetchLivePricesBatch, isUsingProxy } from '../lib/livePrices';

import UsMap from '../components/UsMap';
import MealPlanTable from '../components/MealPlanTable';
import MicronutrientPanel from '../components/MicronutrientPanel';
import MicroBarWithTip from '../components/MicroBarWithTip';
import { SortHeader, applySort } from '../components/SortHeader';

// ─── small display components ────────────────────────────────────────────────

function Stat({ label, value, sub, warn, accent, hover, editable, onEdit, unit, overridden }) {
  const color = warn ? 'text-red-600' : overridden ? 'text-purple-600' : accent ? 'text-terra-600' : 'text-stone-900';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [showHover, setShowHover] = useState(false);

  const startEdit = () => {
    if (!editable) return;
    setDraft(typeof value === 'string' ? value.replace(/[^0-9.]/g, '') : String(value));
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (Number.isFinite(n)) onEdit?.(n);
    else if (draft === '') onEdit?.(null); // clear override
  };

  // Visible affordance for editable tiles: dashed border (vs solid for
  // read-only), subtle "pencil" indicator that shows on hover, and a
  // "click to edit" tooltip via title attr. Without this the tiles look
  // identical to read-only stats and you don't know they're interactive.
  const editableShell = editable && !editing
    ? 'border-dashed border-stone-300 hover:border-purple-400 hover:bg-purple-50/30 hover:shadow-sm'
    : '';
  const tooltip = editable && !editing && !overridden ? 'Click to set a custom value' : undefined;

  return (
    <div
      title={tooltip}
      className={`relative bg-white rounded-xl p-3 border ${overridden ? 'border-purple-400 border-solid bg-purple-50/40' : 'border-stone-200'} ${editableShell} transition flex-1 min-w-[90px] ${editable ? 'cursor-pointer' : ''}`}
      onMouseEnter={() => setShowHover(true)}
      onMouseLeave={() => setShowHover(false)}
      onClick={() => !editing && startEdit()}
    >
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-2xs uppercase tracking-wider text-stone-400 font-medium flex items-center gap-1">
          {label}
          {editable && !editing && !overridden && (
            <span className="text-[9px] text-stone-300 group-hover:text-purple-400" aria-hidden>✎</span>
          )}
        </span>
        {overridden && (
          <button
            onClick={(e) => { e.stopPropagation(); onEdit?.(null); }}
            className="text-[9px] text-purple-500 hover:text-purple-700 font-semibold"
            title="Reset to calculated value"
          >reset</button>
        )}
      </div>
      {editing ? (
        <input
          type="number"
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
          className={`w-full text-lg font-bold font-mono bg-transparent border-b-2 border-purple-500 outline-none ${color}`}
        />
      ) : (
        <div className={`text-lg font-bold font-mono ${color}`}>{value}{unit && <span className="text-sm font-normal text-stone-400 ml-0.5">{unit}</span>}</div>
      )}
      {sub && <div className="text-2xs text-stone-400 mt-0.5">{sub}</div>}
      {hover && showHover && !editing && (
        <div className="absolute z-30 left-0 top-full mt-1 w-[220px] bg-white border border-stone-200 rounded-lg shadow-lg p-2 text-xs text-stone-700 cursor-default" onClick={(e) => e.stopPropagation()}>
          {hover}
        </div>
      )}
    </div>
  );
}

// Hover-content factory for "top contributors" of a single nutrient.
function ContribHover({ contributors = [], unit = '', label }) {
  if (!contributors.length) return <span className="italic text-stone-400">No plan item supplies meaningful {label}.</span>;
  return (
    <>
      <span className="block text-2xs uppercase tracking-wider text-stone-400 font-semibold mb-1">Top sources / day</span>
      <span className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
        {contributors.slice(0, 5).map(c => (
          <span key={c.id} className="contents">
            <span className="truncate">{c.servings}× {c.name}</span>
            <span className="font-mono text-sage-700 text-right">{c.amount}{unit}</span>
          </span>
        ))}
      </span>
    </>
  );
}

// ─── main ────────────────────────────────────────────────────────────────────

export default function Home() {
  // profile (persisted)
  const [gender, setGender]     = usePersistentState('ne.gender', 'male');
  const [age, setAge]           = usePersistentState('ne.age', 24);
  const [heightFt, setHeightFt] = usePersistentState('ne.heightFt', 5);
  const [heightIn, setHeightIn] = usePersistentState('ne.heightIn', 10);
  const [weightLbs, setWeightLbs] = usePersistentState('ne.weightLbs', 170);
  const [activity, setActivity] = usePersistentState('ne.activity', 'moderate');
  const [cityId, setCityId]     = usePersistentState('ne.cityId', 'boston');
  const [presetId, setPresetId] = usePersistentState('ne.presetId', 'maingain');
  const [storeTierId, setStoreTierId] = usePersistentState('ne.storeTierId', 'mainstream');

  // plan controls (excluded + locks + pins persisted; tab + profile-visibility ephemeral)
  const [excluded, setExcluded] = usePersistentState('ne.excluded', new Set(), {
    serialize: setSerialize, deserialize: setDeserialize,
  });
  const [locks, setLocks]       = usePersistentState('ne.locks', new Map(), {
    serialize: mapSerialize, deserialize: mapDeserialize,
  });
  const [pins, setPins]         = usePersistentState('ne.pins', new Set(), {
    serialize: setSerialize, deserialize: setDeserialize,
  });
  // Target overrides — user can type custom values that take precedence
  // over the calculated TDEE-driven targets. `null` for a field means "use
  // the calculated value". Persisted so they survive refresh.
  const [targetOverrides, setTargetOverrides] = usePersistentState('ne.targetOverrides', {});
  // Optimization mode: 'cost' (default) minimizes $ subject to nutrient
  // constraints; 'nutrients' weights the nutrient-deficit penalty 5× higher
  // so the solver pays more for distance from the optimum.
  const [mode, setMode]         = usePersistentState('ne.mode', 'cost');
  const [tab, setTab]           = useState('plan');
  const [showProfile, setShowProfile] = useState(true);

  // Saved profile slots — multiple named snapshots of the full profile.
  // Lives in localStorage under `ne.profiles`; loaded post-mount to avoid
  // SSR/hydration drift.
  const [savedProfiles, setSavedProfiles] = useState([]);
  useEffect(() => { setSavedProfiles(loadProfiles()); }, []);

  // SELF-HEAL stuck state from older app versions:
  // Older builds let the user pin multiple foods, which combined with the
  // javascript-lp-solver's simplex degeneracy could freeze the page on
  // first solve. Watch `pins` and trim down to ≤1 — fires on initial
  // mount AND on every hydration (`usePersistentState` reads localStorage
  // post-mount and re-emits, which is the case that was getting stuck for
  // returning users).
  useEffect(() => {
    if (pins.size > 1) {
      setPins(new Set([...pins].slice(0, 1)));
    }
  }, [pins, setPins]);

  // Nuclear option: clear every localStorage key the app owns and reload.
  // Bound to the "Reset my data" button below. Useful when stuck state
  // (bad pins, conflicting locks, etc.) prevents the app from rendering.
  const resetAllData = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!window.confirm('This will erase your saved profile, excluded foods, locks, pins, and target overrides on THIS browser. Continue?')) return;
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith('ne.')) window.localStorage.removeItem(k);
    }
    window.location.reload();
  }, []);

  const profileSetters = {
    gender: setGender, age: setAge, heightFt: setHeightFt, heightIn: setHeightIn,
    weightLbs: setWeightLbs, activity: setActivity, cityId: setCityId,
    presetId: setPresetId, storeTierId: setStoreTierId,
  };
  const currentSnapshot = { gender, age, heightFt, heightIn, weightLbs, activity, cityId, presetId, storeTierId };

  const onLoadProfile = useCallback((id) => {
    const p = savedProfiles.find(x => x.id === id);
    if (!p) return;
    for (const field of PROFILE_FIELDS) {
      if (p.snapshot[field] != null && profileSetters[field]) profileSetters[field](p.snapshot[field]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedProfiles]);

  const onSaveProfile = useCallback((name) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return;
    setSavedProfiles(prev => {
      // Replace if same name exists, else append.
      const existing = prev.find(p => p.name === trimmed);
      const snapshot = captureSnapshot(currentSnapshot);
      const next = existing
        ? prev.map(p => p.name === trimmed ? { ...p, snapshot } : p)
        : [...prev, { id: makeProfileId(), name: trimmed, snapshot }];
      saveProfiles(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gender, age, heightFt, heightIn, weightLbs, activity, cityId, presetId, storeTierId]);

  const onDeleteProfile = useCallback((id) => {
    setSavedProfiles(prev => {
      const next = prev.filter(p => p.id !== id);
      saveProfiles(next);
      return next;
    });
  }, []);

  const city    = CITIES[CITY_MAP[cityId]] || CITIES[0];
  const preset  = MACRO_PRESETS[presetId];
  const storeTier = STORE_TIERS.find(s => s.id === storeTierId) || STORE_TIERS[3];
  const effectiveCostIndex = Math.round(city.costIndex * storeTier.mult);
  const totalHeightIn = heightFt * 12 + heightIn;
  const calculatedTdee = calcTDEE(gender, weightLbs, totalHeightIn, age, activity);
  const tdee = targetOverrides.tdee ?? calculatedTdee;
  const baseTargets = calcTargets(tdee, preset, weightLbs, gender);
  // User overrides take precedence over the calculated targets.
  const targets = {
    ...baseTargets,
    ...Object.fromEntries(Object.entries(targetOverrides).filter(([k, v]) => v != null && k !== 'tdee')),
  };

  const setOverride = useCallback((field, val) => {
    setTargetOverrides(prev => {
      const next = { ...prev };
      if (val == null) delete next[field];
      else next[field] = val;
      return next;
    });
  }, [setTargetOverrides]);

  const availableFoods = useMemo(
    () => FOODS.filter(f => !excluded.has(f.id)),
    [excluded],
  );

  // Track which foods just appeared in the plan since the last solve so the
  // table can flash a green-fade highlight on those rows. The ref holds the
  // previous plan's ids; the state holds the diff for ~1.5s, then clears.
  const prevPlanIdsRef = useRef(new Set());
  const [newlyAdded, setNewlyAdded] = useState(new Set());

  // run the solver (debounced, off idle)
  const { result, pending } = useOptimizer({
    foods: availableFoods,
    targets,
    region: city.region,
    costIndex: effectiveCostIndex,
    gender,
    locks,
    pins,
    mode,
  });

  // Diff plan ids to flag newly-added rows. Skip the very first solve
  // (everything would be "new"). Clear after 1500ms so the row settles
  // back to its normal background.
  useEffect(() => {
    if (!result?.plan) return;
    const ids = new Set(result.plan.map(f => f.id));
    if (prevPlanIdsRef.current.size > 0) {
      const added = new Set();
      for (const id of ids) if (!prevPlanIdsRef.current.has(id)) added.add(id);
      if (added.size > 0) {
        setNewlyAdded(added);
        const t = setTimeout(() => setNewlyAdded(new Set()), 1500);
        prevPlanIdsRef.current = ids;
        return () => clearTimeout(t);
      }
    }
    prevPlanIdsRef.current = ids;
  }, [result]);

  // ─── callbacks ────────────────────────────────────────────────────────
  const toggleExclude = useCallback((id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    // if we exclude a locked food, unlock it too
    setLocks(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const lockQty = useCallback((id, qty) => {
    setLocks(prev => {
      const next = new Map(prev);
      next.set(id, qty);
      return next;
    });
  }, []);

  const unlockQty = useCallback((id) => {
    setLocks(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const togglePin = useCallback((id) => {
    setPins(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        return next;
      }
      // CAP at 1 active pin. javascript-lp-solver's simplex degenerates
      // on certain 2+ pin combinations (cycles internally with no way for
      // us to interrupt — the deadline guard only checks between solver
      // calls). Until we move the solver into a terminable Web Worker,
      // hard-cap to 1 to keep the UI responsive. Pinning a 2nd food
      // replaces the first.
      next.clear();
      next.add(id);
      return next;
    });
    // Pinning a food un-excludes it (otherwise the LP can't include it).
    setExcluded(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [setPins, setExcluded]);

  const unpin = useCallback((id) => {
    setPins(prev => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [setPins]);

  const clearAll = useCallback(() => {
    setExcluded(new Set());
    setLocks(new Map());
    setPins(new Set());
    setTargetOverrides({});
  }, [setExcluded, setLocks, setPins, setTargetOverrides]);

  const tabs = [
    { id: 'plan',     label: 'Meal Plan' },
    { id: 'weekly',   label: 'Shopping List' },
    { id: 'micro',    label: 'Micronutrients' },
    { id: 'map',      label: 'City Map' },
    { id: 'hormones', label: gender === 'male' ? 'T Support' : 'Hormones' },
    { id: 'foods',    label: 'All Foods' },
  ];

  // Skeleton while first solve is running
  if (!result) {
    return (
      <div className="max-w-[960px] mx-auto px-4 py-20 text-center text-sm text-stone-500">
        Building your first plan…
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      {/* header */}
      <header className="mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xs font-mono font-bold tracking-[0.2em] text-terra-600 uppercase">Nutrient Engine</span>
            <span className="text-2xs text-stone-300">v3</span>
            {pending && <span className="text-2xs text-stone-400 animate-pulse">solving…</span>}
          </div>
          <div className="flex items-baseline gap-3">
            <button
              onClick={resetAllData}
              className="text-2xs text-stone-300 hover:text-red-500 transition"
              title="Erase all your saved data on this browser (use this if the app gets stuck)"
            >Reset</button>
            <button
              onClick={() => setShowProfile(p => !p)}
              className="text-xs text-stone-400 hover:text-stone-600 transition"
            >
              {showProfile ? 'Hide Profile ▲' : 'Edit Profile ▼'}
            </button>
          </div>
        </div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-stone-900 leading-tight tracking-tight">
          Minimum Cost,<br />Maximum Nutrition
        </h1>
        <p className="text-xs text-stone-400 mt-1">
          LP-optimized · 1g/lb protein · hormone-aware · regional pricing · {city.name}, {city.state}
        </p>
      </header>

      {/* profile panel */}
      {showProfile && (
        <section className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 shadow-sm">
          <ProfileSlots
            saved={savedProfiles}
            onLoad={onLoadProfile}
            onSave={onSaveProfile}
            onDelete={onDeleteProfile}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Gender</label>
              <div className="flex gap-1">
                {['male', 'female'].map(g => (
                  <button key={g} onClick={() => setGender(g)}
                    className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold border transition ${gender === g ? 'border-terra-600 bg-terra-600/10 text-terra-600' : 'border-stone-200 text-stone-400'}`}>
                    {g === 'male' ? '♂ Male' : '♀ Female'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Age</label>
              <input type="number" value={age} onChange={e => setAge(+e.target.value)} min={14} max={80}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Height</label>
              <div className="flex gap-1">
                <input type="number" value={heightFt} onChange={e => setHeightFt(+e.target.value)} min={4} max={7}
                  className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
                <input type="number" value={heightIn} onChange={e => setHeightIn(+e.target.value)} min={0} max={11}
                  className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
              </div>
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Weight (lbs)</label>
              <input type="number" value={weightLbs} onChange={e => setWeightLbs(+e.target.value)} min={80} max={350}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Activity Level</label>
              <select value={activity} onChange={e => setActivity(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm bg-white focus:outline-none focus:border-terra-400">
                {ACTIVITY_LEVELS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Location</label>
              <select value={cityId} onChange={e => setCityId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm bg-white focus:outline-none focus:border-terra-400">
                {CITIES.map(c => <option key={c.id} value={c.id}>{c.name}, {c.state} ({c.costIndex > 100 ? '+' : ''}{c.costIndex - 100}%)</option>)}
              </select>
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1" title={storeTier.desc}>Store Tier</label>
              <select value={storeTierId} onChange={e => setStoreTierId(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm bg-white focus:outline-none focus:border-terra-400">
                {STORE_TIERS.map(s => <option key={s.id} value={s.id}>{s.name} ({s.mult < 1 ? '−' : '+'}{Math.abs(Math.round((s.mult - 1) * 100))}%)</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Stat label="TDEE" value={tdee} sub="maintenance kcal"
              editable onEdit={(v) => setOverride('tdee', v)}
              overridden={targetOverrides.tdee != null} />
            <Stat label="Target Cals" value={targets.calories} sub={targetOverrides.calories != null ? 'custom' : `${preset.calAdj > 0 ? '+' : ''}${preset.calAdj}% ${preset.calAdj > 0 ? 'surplus' : preset.calAdj < 0 ? 'deficit' : 'maint'}`} accent
              editable onEdit={(v) => setOverride('calories', v)}
              overridden={targetOverrides.calories != null} />
            <Stat label="Protein" value={`${targets.protein}g`} sub={targetOverrides.protein != null ? 'custom' : '1g/lb BW'}
              editable onEdit={(v) => setOverride('protein', v)}
              overridden={targetOverrides.protein != null} />
            <Stat label="Fiber" value={`${targets.fiber}g`} sub={targetOverrides.fiber != null ? 'custom' : '14g/1000kcal'}
              editable onEdit={(v) => setOverride('fiber', v)}
              overridden={targetOverrides.fiber != null} />
            <Stat label="Max Sat Fat" value={`${targets.maxSatFat}g`} sub={targetOverrides.maxSatFat != null ? 'custom' : '10% of cal'}
              editable onEdit={(v) => setOverride('maxSatFat', v)}
              overridden={targetOverrides.maxSatFat != null} />
            <Stat label="Max Chol" value={`${targets.maxChol}mg`} sub={targetOverrides.maxChol != null ? 'custom' : 'DGA 2020'}
              editable onEdit={(v) => setOverride('maxChol', v)}
              overridden={targetOverrides.maxChol != null} />
          </div>
          <div className="text-2xs text-stone-400 mt-2">Click any value above to override. Purple = custom; click "reset" to clear.</div>
        </section>
      )}

      {/* macro strategy */}
      <section className="mb-4">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-2xs uppercase tracking-wider text-stone-400 font-medium">Caloric Strategy</span>
          <div className="inline-flex bg-stone-100 rounded-lg p-0.5 text-2xs">
            <button
              onClick={() => setMode('cost')}
              className={`px-2 py-1 rounded-md font-semibold transition ${mode === 'cost' ? 'bg-white text-terra-600 shadow-sm' : 'text-stone-500'}`}
              title="Find the cheapest plan that hits the floors. Default."
            >$ minimize cost</button>
            <button
              onClick={() => setMode('nutrients')}
              className={`px-2 py-1 rounded-md font-semibold transition ${mode === 'nutrients' ? 'bg-white text-sage-700 shadow-sm' : 'text-stone-500'}`}
              title="Pay more food cost to push each micronutrient toward its optimum (5× deficit penalty)."
            >★ optimize nutrients</button>
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {Object.values(MACRO_PRESETS).map(p => (
            <button key={p.id} onClick={() => setPresetId(p.id)}
              className={`pill ${presetId === p.id ? 'pill-active' : 'pill-inactive'}`}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-2 text-xs text-stone-400 bg-stone-50 rounded-lg px-3 py-2 border border-stone-100">
          {preset.desc} —{' '}
          <span className="font-mono font-semibold text-terra-600">{targets.calories} kcal</span>{' · '}
          <span className="font-mono font-semibold text-sage-600">{targets.protein}g P</span>{' / '}
          {targets.carbs}g C / {targets.fat}g F
        </div>
      </section>

      {/* tabs */}
      <nav className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap py-2 px-3 rounded-lg text-xs font-semibold transition ${
              tab === t.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-400 hover:text-stone-600'
            }`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ═══════ MEAL PLAN TAB ═══════ */}
      {tab === 'plan' && (
        <div>
          {!result.feasible && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-xs text-red-700">
              ⚠ Could not meet all nutrient targets with current constraints.
              Some floors were relaxed: {result.relaxed.join(', ') || '(none)'}.
              Try re-including excluded foods or switching macro strategy.
            </div>
          )}

          <div className="flex gap-2 flex-wrap mb-3">
            <Stat label="Daily Cost" value={`$${result.totals.cost}`} sub={`$${(result.totals.cost * 30).toFixed(0)}/mo in ${city.name}`} accent />
            <Stat label="Protein" value={`${result.totals.protein}g`} sub={`target ${targets.protein}g`}
              warn={result.totals.protein < targets.protein * 0.9}
              hover={<ContribHover contributors={result.contributorsByNutrient?.p?.map?.(c => ({...c, amount: `${c.amount}g`})) || []} unit="" label="protein" />} />
            <Stat label="Calories" value={result.totals.calories} sub={`target ${targets.calories}`} />
            <Stat label="Fiber" value={`${result.totals.fiber}g`} sub={`target ${targets.fiber}g`} />
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <Stat label="Sat Fat" value={`${result.totals.satFat}g`} sub={`max ${targets.maxSatFat}g`}
              warn={result.totals.satFat > targets.maxSatFat}
              hover={<ContribHover contributors={result.contributorsByNutrient?.sf || []} unit="g" label="saturated fat" />} />
            <Stat label="Cholesterol" value={`${result.totals.chol}mg`} sub={`max ${targets.maxChol}mg`}
              warn={result.totals.chol > targets.maxChol}
              hover={<ContribHover contributors={result.contributorsByNutrient?.chol || []} unit="mg" label="cholesterol" />} />
            <Stat label="Added Sugar" value={`${result.totals.sugar}g`} sub={`max ${targets.maxSugar}g`}
              warn={result.totals.sugar > targets.maxSugar}
              hover={<ContribHover contributors={result.contributorsByNutrient?.sug || []} unit="g" label="added sugar" />} />
            <Stat label="Prot/Dollar" value={`${(result.totals.protein / Math.max(0.01, result.totals.cost)).toFixed(1)}g`} sub="efficiency" />
            <Stat
              label="Inflam Score"
              value={(() => {
                const totalServ = result.plan.reduce((s, f) => s + f.servings, 0) || 1;
                const weighted = result.plan.reduce((s, f) => s + antiInflammScore(f) * f.servings, 0) / totalServ;
                return (weighted > 0 ? '+' : '') + weighted.toFixed(1);
              })()}
              sub="DII (neg = anti)"
              warn={false}
              accent={result.plan.reduce((s, f) => s + antiInflammScore(f) * f.servings, 0) / Math.max(1, result.plan.reduce((s, f) => s + f.servings, 0)) < -2}
            />
          </div>

          <MealPlanTable
            plan={result.plan}
            totals={result.totals}
            targets={targets}
            locks={locks}
            pins={pins}
            onLock={lockQty}
            onUnlock={unlockQty}
            onExclude={toggleExclude}
            onTogglePin={togglePin}
            newlyAdded={newlyAdded}
          />

          <LivePricesPanel plan={result.plan} city={city} />

          {(excluded.size > 0 || locks.size > 0 || pins.size > 0) && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
              <div className="text-sm font-semibold mb-2 flex items-center justify-between">
                <span>Your Overrides</span>
                <button onClick={clearAll} className="pill pill-inactive text-red-400 text-xs">Clear All</button>
              </div>
              {locks.size > 0 && (
                <div className="mb-2">
                  <div className="text-2xs uppercase tracking-wider text-terra-600 font-semibold mb-1">🔒 Locked quantities</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[...locks.entries()].map(([id, q]) => {
                      const f = FOODS.find(x => x.id === id);
                      return f ? (
                        <button key={id} onClick={() => unlockQty(id)} className="pill pill-inactive text-xs">
                          <span className="font-mono">{q}×</span> {f.name} <span className="text-stone-400 ml-1">unlock</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {pins.size > 0 && (
                <div className="mb-2">
                  <div className="text-2xs uppercase tracking-wider text-purple-600 font-semibold mb-1">📌 Pinned foods (forced into plan)</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[...pins].map(id => {
                      const f = FOODS.find(x => x.id === id);
                      return f ? (
                        <button key={id} onClick={() => unpin(id)} className="pill pill-inactive text-xs">
                          {f.name} <span className="text-stone-400 ml-1">unpin</span>
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
              {excluded.size > 0 && (
                <div>
                  <div className="text-2xs uppercase tracking-wider text-stone-500 font-semibold mb-1">✕ Excluded foods</div>
                  <div className="flex gap-1.5 flex-wrap">
                    {[...excluded].map(id => {
                      const f = FOODS.find(x => x.id === id);
                      return f ? (
                        <button key={id} onClick={() => toggleExclude(id)} className="pill pill-inactive text-xs flex items-center gap-1">
                          <span className="text-sage-600">+</span> {f.name}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {result.warnings.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
              <div className="text-xs font-semibold text-amber-800 mb-2">Absorption Notes</div>
              <ul className="text-xs text-amber-700 leading-relaxed space-y-1 list-disc pl-4">
                {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {/* local food tips */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <h3 className="font-display text-base font-bold mb-3 flex items-center gap-2">
              <span>📍</span> Local Food — {city.name}, {city.state}
            </h3>
            <div className="pl-3 mb-3 border-l-[3px]" style={{ borderLeftColor: '#6B9A6B' }}>
              <div className="text-2xs uppercase tracking-wider text-sage-600 font-semibold mb-1">Available Locally</div>
              <div className="text-sm text-stone-700 leading-relaxed">{city.local}</div>
              <div className="text-xs text-stone-400 mt-1">Peak season: {city.season}</div>
            </div>
            <div className="pl-3 border-l-[3px]" style={{ borderLeftColor: '#E8854E' }}>
              <div className="text-2xs uppercase tracking-wider text-terra-600 font-semibold mb-1">Cost-Saving Strategy</div>
              <div className="text-sm text-stone-700 leading-relaxed">{city.strategy}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ WEEKLY TAB ═══════ */}
      {tab === 'weekly' && (
        <ShoppingListView plan={result.plan} city={city} storeTier={storeTier} />
      )}

      {/* ═══════ MICRONUTRIENT TAB ═══════ */}
      {tab === 'micro' && (
        <MicronutrientPanel
          nutrientScores={result.nutrientScores}
          relaxed={result.relaxed}
          allFoods={FOODS}
          planIds={new Set(result.plan.map(f => f.id))}
          pins={pins}
          onPin={togglePin}
        />
      )}

      {/* ═══════ CITY MAP TAB ═══════ */}
      {tab === 'map' && (
        <div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
            <h2 className="font-display text-lg font-bold mb-1">US Grocery Cost Map</h2>
            <p className="text-xs text-stone-400 mb-3">Tap a city to see adjusted costs and local strategies</p>
            <UsMap cities={CITIES} selectedId={cityId} onSelect={setCityId} />
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <Stat label={city.name} value={city.costIndex} sub="cost index (100=avg)" warn={city.costIndex > 115} accent={city.costIndex < 100} />
            <Stat label="Monthly Grocery" value={`$${city.monthlyGrocery}`} sub="avg household" accent />
            <Stat label="Your Plan" value={`$${(result.totals.cost * 30).toFixed(0)}`} sub="/month optimized" />
          </div>

          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <h3 className="font-display text-base font-bold mb-3">All Cities — Cheapest to Most Expensive</h3>
            {[...CITIES].sort((a, b) => a.costIndex - b.costIndex).map((c, i) => {
              const sel = c.id === cityId;
              const barW = ((c.costIndex - 84) / 50) * 100;
              const t = (c.costIndex - 85) / 50;
              return (
                <div key={c.id} onClick={() => setCityId(c.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition ${sel ? 'bg-terra-600/5 border border-terra-600/20' : 'hover:bg-stone-50 border border-transparent'}`}>
                  <span className="w-4 text-xs text-stone-300 font-mono">{i + 1}</span>
                  <span className={`w-24 text-xs truncate ${sel ? 'text-stone-900 font-bold' : 'text-stone-600'}`}>{c.name}</span>
                  <div className="flex-1 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, barW))}%`, background: `hsl(${150 - t * 150}, 50%, 45%)` }} />
                  </div>
                  <span className="w-7 text-xs text-stone-400 font-mono text-right">{c.costIndex}</span>
                  <span className="w-14 text-xs text-stone-300 text-right">${c.monthlyGrocery}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════ HORMONES TAB ═══════ */}
      {tab === 'hormones' && (
        <div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
            <h2 className="font-display text-lg font-bold mb-3">
              {gender === 'male' ? '⚡ Testosterone Optimization' : '🌸 Hormonal Balance'}
            </h2>
            <p className="text-xs text-stone-400 mb-3">Counts <em>real</em> nutrient amounts in each plan item — click a row to expand all sources.</p>
            {getHormoneGoals(gender).map((goal, i) => (
              <HormoneRow
                key={i}
                goal={goal}
                plan={result.plan}
                totals={result.totals}
                contributorsByNutrient={result.contributorsByNutrient}
                allFoods={FOODS}
                pins={pins}
                onPin={togglePin}
              />
            ))}
          </div>

          <div className="bg-stone-50 rounded-2xl border border-stone-200 p-4">
            <div className="text-2xs uppercase tracking-wider text-sage-600 font-semibold mb-2">
              {gender === 'male' ? 'Key Principles for Testosterone' : 'Key Principles for Hormonal Health'}
            </div>
            <p className="text-sm text-stone-600 leading-relaxed">
              {gender === 'male'
                ? 'Zinc (oysters, pumpkin seeds, liver) is the #1 mineral for T synthesis. Vitamin D acts as a hormone itself — deficiency correlates with low T. Magnesium increases free testosterone by reducing SHBG. Omega-3s lower inflammatory cytokines that suppress production. Cruciferous vegetables contain DIM which metabolizes excess estrogen. Cholesterol is the precursor for all steroid hormones, so don\'t over-restrict fat.'
                : 'Iron replaces menstrual losses and prevents hormonal disruption from anemia. Omega-3s support prostaglandin balance and reduce cycle-related inflammation. Magnesium supports progesterone production and calms the nervous system. B12 and folate are essential for ovulatory health. DIM supports healthy estrogen detoxification. Calcium and vitamin D together reduce PMS severity.'
              }
            </p>
          </div>
        </div>
      )}

      {/* ═══════ ALL FOODS TAB ═══════ */}
      {tab === 'foods' && (
        <FoodsTab
          city={city}
          effectiveCostIndex={effectiveCostIndex}
          excluded={excluded}
          setExcluded={setExcluded}
          toggleExclude={toggleExclude}
          pins={pins}
          togglePin={togglePin}
          planIds={new Set(result.plan.map(f => f.id))}
        />
      )}

      <footer className="mt-8 py-4 border-t border-stone-200 text-center">
        <p className="text-2xs text-stone-300 leading-relaxed">
          Nutrition data from USDA FoodData Central. Pricing from BLS Average Retail Prices, adjusted by regional CPI.
          <br />Hormone optimization based on peer-reviewed research. Not medical advice — consult a registered dietitian.
        </p>
      </footer>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

// Each goal binds the display label to a real food field on the FOODS records
// + a per-serving threshold above which a food counts as a "source", and a
// target total for the day (used to color-grade the row).
//
// `field` maps to FOODS keys (note `mg_` not `mg`, and `omega3` not `o3`,
// `vitB12` not `b12`). `unit` is what we render. `dimByCat` is special-cased
// for DIM since it isn't a numeric field — we count cruciferous vegetables.
function getHormoneGoals(gender) {
  if (gender === 'male') return [
    { nutrient: 'Zinc',                key: 'zn',     field: 'zn',     unit: '%DV', threshold: 8,  target: 100, why: 'Directly supports testosterone synthesis in Leydig cells' },
    { nutrient: 'Vitamin D',           key: 'vitD',   field: 'vitD',   unit: '%DV', threshold: 5,  target: 100, why: 'Correlates with T levels; RCT showed +25% T with supplementation' },
    { nutrient: 'Magnesium',           key: 'mg',     field: 'mg_',    unit: '%DV', threshold: 8,  target: 100, why: 'Increases free testosterone by reducing SHBG binding' },
    { nutrient: 'Omega-3',             key: 'o3',     field: 'omega3', unit: 'g',   threshold: 0.1,target: 1.6, why: 'Reduces inflammatory cytokines that suppress T production' },
    { nutrient: 'Selenium',            key: 'se',     field: 'se',     unit: '%DV', threshold: 15, target: 100, why: 'Essential for sperm production and thyroid conversion (T4→T3)' },
    { nutrient: 'B12',                 key: 'b12',    field: 'vitB12', unit: '%DV', threshold: 8,  target: 100, why: 'Supports energy metabolism and red blood cell production' },
    { nutrient: 'DIM (cruciferous)',   key: 'DIM',    dimByCat: true,                              target: 1,   why: 'Promotes healthy estrogen metabolism via 2-OH pathway' },
    { nutrient: 'Cholesterol (dietary)', key: 'chol', field: 'chol',   unit: 'mg',  threshold: 30, target: 200, why: 'Precursor for pregnenolone→testosterone pathway' },
  ];
  return [
    { nutrient: 'Iron',              key: 'fe',     field: 'fe',     unit: '%DV', threshold: 8,  target: 100, why: 'Replaces menstrual losses; deficiency disrupts thyroid and ovulation' },
    { nutrient: 'Magnesium',         key: 'mg',     field: 'mg_',    unit: '%DV', threshold: 8,  target: 100, why: 'Supports progesterone production and reduces cortisol' },
    { nutrient: 'Omega-3',           key: 'o3',     field: 'omega3', unit: 'g',   threshold: 0.1,target: 1.1, why: 'Anti-inflammatory prostaglandin balance, reduces dysmenorrhea' },
    { nutrient: 'B12',               key: 'b12',    field: 'vitB12', unit: '%DV', threshold: 8,  target: 100, why: 'Supports ovulation regularity and energy metabolism' },
    { nutrient: 'Vitamin D',         key: 'vitD',   field: 'vitD',   unit: '%DV', threshold: 5,  target: 100, why: 'Linked to fertility, PCOS management, and mood regulation' },
    { nutrient: 'Calcium',           key: 'ca',     field: 'ca',     unit: '%DV', threshold: 8,  target: 100, why: 'Alleviates PMS symptoms; supports bone density' },
    { nutrient: 'Folate',            key: 'folate', field: 'folate', unit: '%DV', threshold: 8,  target: 100, why: 'Essential for reproductive health and DNA methylation' },
    { nutrient: 'DIM (cruciferous)', key: 'DIM',    dimByCat: true,                              target: 1,   why: 'Supports healthy estrogen detoxification pathways' },
  ];
}

// Foods that supply DIM via glucosinolate→DIM conversion. Match by name
// substring against the FOODS list since there's no `dim` numeric column.
const CRUCIFEROUS = /broccoli|cabbage|kale|cauliflower|brussels|bok choy|collard|arugula/i;

function HormoneRow({ goal, plan, totals, contributorsByNutrient, allFoods = [], pins = new Set(), onPin }) {
  const [expanded, setExpanded] = useState(false);
  const planIds = useMemo(() => new Set(plan.map(f => f.id)), [plan]);

  // Build the contributors list from the plan based on the goal's binding.
  let sources = [];
  let totalAmount = 0;
  let suggestions = [];
  if (goal.dimByCat) {
    sources = plan
      .filter(f => CRUCIFEROUS.test(f.name))
      .map(f => ({ id: f.id, name: f.name, servings: f.servings, amount: f.servings }))
      .sort((a, b) => b.amount - a.amount);
    totalAmount = sources.reduce((s, x) => s + x.amount, 0);
    suggestions = expanded
      ? allFoods.filter(f => CRUCIFEROUS.test(f.name) && !planIds.has(f.id)).slice(0, 5)
      : [];
  } else {
    sources = plan
      .map(f => ({ id: f.id, name: f.name, servings: f.servings, amount: +(((f[goal.field] || 0) * f.servings).toFixed(2)) }))
      .filter(x => x.amount >= goal.threshold)
      .sort((a, b) => b.amount - a.amount);
    totalAmount = +(plan.reduce((s, f) => s + (f[goal.field] || 0) * f.servings, 0).toFixed(1));
    suggestions = expanded
      ? allFoods
          .filter(f => !planIds.has(f.id))
          .map(f => ({ id: f.id, name: f.name, amount: +(f[goal.field] || 0).toFixed(2) }))
          .filter(x => x.amount >= goal.threshold)
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 5)
      : [];
  }

  const pct       = goal.target > 0 ? totalAmount / goal.target : 0;
  const status    = pct >= 1 ? 'good' : pct >= 0.5 ? 'partial' : 'short';
  const dotColor  = status === 'good' ? 'bg-sage-400' : status === 'partial' ? 'bg-terra-400' : 'bg-red-400';
  const numColor  = status === 'good' ? 'text-sage-600' : status === 'partial' ? 'text-terra-600' : 'text-red-500';

  const totalLabel = goal.dimByCat
    ? `${totalAmount} serv${totalAmount === 1 ? '' : 's'}`
    : `${totalAmount}${goal.unit === '%DV' ? '%' : goal.unit}`;

  return (
    <div className="py-2 border-b border-stone-100 last:border-0">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 text-left hover:bg-stone-50 -mx-2 px-2 py-1 rounded-lg transition"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-800">{goal.nutrient}</div>
          <div className="text-xs text-stone-400 leading-snug">{goal.why}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`text-xs font-bold font-mono ${numColor}`}>
            {sources.length} source{sources.length !== 1 ? 's' : ''} · {totalLabel}
          </div>
          {!expanded && sources.length > 0 && (
            <div className="text-2xs text-stone-400 max-w-[180px] text-right truncate">
              {sources.slice(0, 2).map(s => s.name).join(', ')}{sources.length > 2 ? '…' : ''}
            </div>
          )}
        </div>
        <span className="text-stone-300 text-xs ml-1">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-2 ml-5 pl-3 border-l-2 border-stone-100">
          {sources.length === 0 ? (
            <div className="text-xs text-stone-400 italic mb-2">
              No plan items contribute meaningful {goal.nutrient.toLowerCase()}. Try adding {goal.dimByCat
                ? 'broccoli, cabbage, kale, or cauliflower.'
                : suggestionsFor(goal.key)}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs">
              {sources.map(s => (
                <Fragment key={s.id}>
                  <span className="text-stone-700">{s.name}</span>
                  <span className="font-mono text-stone-400">{s.servings}×</span>
                  <span className="font-mono text-stone-700 text-right">
                    {goal.dimByCat ? '✓' : `${s.amount}${goal.unit === '%DV' ? '%' : goal.unit}`}
                  </span>
                </Fragment>
              ))}
            </div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 pt-2 border-t border-stone-100">
              <div className="text-2xs uppercase tracking-wider text-stone-400 font-semibold mb-1">Top sources NOT in plan</div>
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-xs">
                {suggestions.map(s => (
                  <Fragment key={s.id}>
                    <span className="text-stone-700">{s.name}</span>
                    <span className="font-mono text-sage-700 text-right">
                      {goal.dimByCat ? 'cruciferous' : `${s.amount}${goal.unit === '%DV' ? '%' : goal.unit}/serv`}
                    </span>
                    {pins.has(s.id) ? (
                      <span className="text-2xs text-purple-600 font-mono">in plan</span>
                    ) : (
                      <button
                        onClick={() => onPin?.(s.id)}
                        className="text-2xs text-sage-700 hover:text-sage-900 font-mono px-1.5 py-0.5 rounded hover:bg-sage-50 border border-sage-200"
                        title="Add this food to the plan. To keep it forced into every plan, use the 📌 pin button on the Meal Plan tab."
                      >+ Add to plan</button>
                    )}
                  </Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LivePricesPanel({ plan, city }) {
  const [state, setState] = useState({ status: 'idle', results: null, error: null });

  const fetchLive = async () => {
    setState({ status: 'loading', results: null, error: null });
    try {
      const map = await fetchLivePricesBatch(plan, city.lat, city.lng);
      setState({ status: 'done', results: map, error: null });
    } catch (e) {
      setState({ status: 'error', results: null, error: e?.message || String(e) });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
      <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
        <div>
          <h3 className="font-display text-base font-bold flex items-center gap-2">
            🌍 Live Open Food Facts Prices
          </h3>
          <p className="text-2xs text-stone-400">
            Crowd-sourced. Sparse outside western Europe — treat as informational, not authoritative. {isUsingProxy() ? 'Via Worker proxy.' : 'Direct from prices.openfoodfacts.org.'}
          </p>
        </div>
        <button
          onClick={fetchLive}
          disabled={state.status === 'loading'}
          className="px-3 py-1.5 rounded-lg bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold disabled:opacity-30 transition"
        >
          {state.status === 'loading' ? 'Fetching…' : `Compare near ${city.name}`}
        </button>
      </div>
      {state.status === 'error' && (
        <div className="text-xs text-red-600 italic">Live fetch failed: {state.error}</div>
      )}
      {state.status === 'done' && state.results.size === 0 && (
        <div className="text-xs text-stone-400 italic">No matching observations near {city.name}. Coverage is best in major US/EU cities.</div>
      )}
      {state.status === 'done' && state.results.size > 0 && (
        <table className="w-full text-xs mt-2">
          <thead>
            <tr className="border-b border-stone-200">
              <th className="text-left py-1 text-2xs uppercase tracking-wider text-stone-400 font-medium">Food</th>
              <th className="text-right py-1 text-2xs uppercase tracking-wider text-stone-400 font-medium">Baseline</th>
              <th className="text-right py-1 text-2xs uppercase tracking-wider text-stone-400 font-medium">OFF median</th>
              <th className="text-right py-1 text-2xs uppercase tracking-wider text-stone-400 font-medium"># obs</th>
            </tr>
          </thead>
          <tbody>
            {plan.map(f => {
              const live = state.results.get(f.id);
              if (!live) return null;
              const baseline = (f.price[city.region] ?? f.price.us) * (city.costIndex / 100);
              const liveCcy = live.currency || 'USD';
              const delta = live.median_price - baseline;
              return (
                <tr key={f.id} className="border-b border-stone-50">
                  <td className="py-1 text-stone-700">{f.name}</td>
                  <td className="py-1 font-mono text-stone-500 text-right">${baseline.toFixed(2)}</td>
                  <td className={`py-1 font-mono text-right ${delta > 0 ? 'text-red-600' : 'text-sage-600'}`}>
                    {liveCcy === 'USD' ? '$' : ''}{live.median_price.toFixed(2)}{liveCcy !== 'USD' ? ` ${liveCcy}` : ''}
                  </td>
                  <td className="py-1 font-mono text-stone-400 text-right">{live.n_observations}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ShoppingListView({ plan, city, storeTier }) {
  const [days, setDays] = useState(7);
  const list = useMemo(() => buildShoppingList(plan, days), [plan, days]);

  return (
    <div>
      <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 shadow-sm">
        <div className="flex items-baseline justify-between mb-1 flex-wrap gap-2">
          <h2 className="font-display text-lg font-bold">Shopping List</h2>
          <div className="flex items-center gap-3 text-2xs font-mono">
            <label className="flex items-center gap-1.5 text-stone-400">
              <span>Days</span>
              <input
                type="number" min={1} max={30}
                value={days}
                onChange={e => setDays(Math.max(1, Math.min(30, +e.target.value || 1)))}
                className="w-12 px-1.5 py-0.5 rounded border border-stone-200 text-center font-mono"
              />
            </label>
            <span className="text-terra-600 font-bold">${list.totalWeekly}</span>
            <span className="text-stone-400">total · ${list.totalDaily}/day</span>
          </div>
        </div>
        <p className="text-xs text-stone-400 mb-1">
          Same daily plan × {days} days, grouped by store section. The optimizer already picked the cheapest combo that hits your targets — eating the same thing every day is what minimizes cost.
        </p>
        <p className="text-2xs text-stone-400">
          Prices reflect <span className="font-mono">{city.name}</span> at <span className="font-mono">{storeTier.name}</span> ({storeTier.mult < 1 ? '−' : '+'}{Math.abs(Math.round((storeTier.mult - 1) * 100))}% vs national avg).
        </p>
      </div>

      {list.sections.map(({ cat, items }) => (
        <div key={cat} className="bg-white rounded-2xl border border-stone-200 p-3 mb-3 shadow-sm">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: CATEGORIES[cat]?.color }} />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-stone-700">{CATEGORIES[cat]?.label || cat}</h3>
            <span className="text-2xs text-stone-300 font-mono ml-auto">
              ${items.reduce((s, x) => s + x.weeklyCost, 0).toFixed(2)}
            </span>
          </div>
          <table className="w-full text-xs">
            <tbody>
              {items.map(it => (
                <tr key={it.id} className="border-b border-stone-50 last:border-0">
                  <td className="py-1 text-stone-700 font-medium">{it.name}</td>
                  <td className="py-1 text-stone-400 text-2xs">{it.unit}</td>
                  <td className="py-1 font-mono text-stone-500 text-right">{it.weeklyServings}× <span className="text-stone-300">/ {days}d</span></td>
                  <td className="py-1 font-mono font-semibold text-terra-600 text-right w-16">${it.weeklyCost.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

    </div>
  );
}

function ProfileSlots({ saved, onLoad, onSave, onDelete }) {
  const [name, setName] = useState('');
  return (
    <div className="mb-3 pb-3 border-b border-stone-100">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-2xs uppercase tracking-wider text-stone-400 font-medium">Saved Profiles</span>
        <span className="text-2xs text-stone-300 font-mono">{saved.length}</span>
      </div>
      <div className="flex gap-1.5 flex-wrap mb-2">
        {saved.length === 0 && (
          <span className="text-xs text-stone-400 italic">No saved profiles yet — name and save the current one to switch quickly later.</span>
        )}
        {saved.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1 bg-stone-50 hover:bg-stone-100 rounded-lg pl-2 pr-1 py-1 text-xs border border-stone-200 transition">
            <button onClick={() => onLoad(p.id)} className="font-medium text-stone-700">{p.name}</button>
            <button
              onClick={() => onDelete(p.id)}
              className="text-stone-300 hover:text-red-500 text-xs px-1"
              aria-label={`Delete ${p.name}`}
              title="Delete profile"
            >×</button>
          </span>
        ))}
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); onSave(name); setName(''); }}
        className="flex gap-1.5"
      >
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Profile name (e.g. Krishna, Mom)"
          className="flex-1 px-3 py-1 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-terra-400"
        />
        <button
          type="submit"
          disabled={!name.trim()}
          className="px-3 py-1 rounded-lg text-xs font-semibold bg-terra-600 text-white hover:bg-terra-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >Save current</button>
      </form>
    </div>
  );
}

function FoodsTab({ city, effectiveCostIndex, excluded, setExcluded, toggleExclude, pins, togglePin, planIds }) {
  const [filter, setFilter]   = useState('');
  const [catFilter, setCat]   = useState('all');
  const [sort, setSort]       = useState({ col: 'pd', dir: 'desc' });

  const rows = useMemo(() => {
    const costMult = effectiveCostIndex / 100;
    const enriched = FOODS.map(f => {
      const price = (f.price[city.region] ?? f.price.us) * costMult;
      const pd = +(f.p / Math.max(0.01, price)).toFixed(1);
      return { ...f, _price: +price.toFixed(2), _pd: pd, _antiox: antioxScore(f), _dii: antiInflammScore(f) };
    });
    return enriched.filter(f => {
      if (catFilter !== 'all' && f.cat !== catFilter) return false;
      if (filter && !f.name.toLowerCase().includes(filter.toLowerCase())) return false;
      return true;
    });
  }, [city.region, effectiveCostIndex, filter, catFilter]);

  const getters = {
    name:  f => f.name.toLowerCase(),
    cat:   f => f.cat,
    p:     f => f.p,
    cal:   f => f.cal,
    price: f => f._price,
    pd:    f => f._pd,
    fib:   f => f.fib,
    micro: f => f.micro,
    antiox:f => f._antiox,
    dii:   f => f._dii,
  };
  const sorted = applySort(rows, sort, getters);

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-4 overflow-x-auto">
      <div className="flex justify-between items-center mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-lg font-bold">Food Database</h2>
          <p className="text-xs text-stone-400">Click any column header to sort · tap ✕ to exclude</p>
        </div>
        {excluded.size > 0 && (
          <button onClick={() => setExcluded(new Set())} className="pill pill-inactive text-xs">Reset ({excluded.size})</button>
        )}
      </div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter by name…"
          className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs focus:outline-none focus:border-terra-400 flex-1 min-w-[160px]"
        />
        <select
          value={catFilter}
          onChange={e => setCat(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none focus:border-terra-400"
        >
          <option value="all">All categories</option>
          {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-2xs text-stone-400 font-mono">{sorted.length} foods</span>
      </div>
      <div className="flex gap-2 flex-wrap mb-3">
        {Object.entries(CATEGORIES).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1 text-2xs text-stone-400">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: v.color }} />
            {v.label}
          </span>
        ))}
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b-2 border-stone-200">
            <th className="py-2 px-1 w-3" />
            <SortHeader id="name"  sort={sort} setSort={setSort}>Food</SortHeader>
            <th className="py-2 px-1 text-left text-2xs uppercase tracking-wider text-stone-400 font-medium">Unit</th>
            <SortHeader id="p"     sort={sort} setSort={setSort}>Prot</SortHeader>
            <SortHeader id="cal"   sort={sort} setSort={setSort}>Cal</SortHeader>
            <SortHeader id="price" sort={sort} setSort={setSort}>Cost ({city.region.toUpperCase()})</SortHeader>
            <SortHeader id="pd"    sort={sort} setSort={setSort}>P/$</SortHeader>
            <SortHeader id="fib"    sort={sort} setSort={setSort}>Fiber</SortHeader>
            <SortHeader id="micro"  sort={sort} setSort={setSort}>Micro</SortHeader>
            <SortHeader id="antiox" sort={sort} setSort={setSort}>Antiox</SortHeader>
            <SortHeader id="dii"    sort={sort} setSort={setSort}>Inflam</SortHeader>
            <th className="py-2 px-1" />
          </tr>
        </thead>
        <tbody>
          {sorted.map(f => {
            const isExcl = excluded.has(f.id);
            return (
              <tr key={f.id} className={`border-b border-stone-50 ${isExcl ? 'opacity-30' : ''}`}>
                <td className="py-1.5 px-1">
                  <span className="w-1.5 h-1.5 rounded-full inline-block" title={CATEGORIES[f.cat]?.label} style={{ background: CATEGORIES[f.cat]?.color }} />
                </td>
                <td className="py-1.5 px-1 font-medium text-stone-700">{f.name}</td>
                <td className="py-1.5 px-1 text-stone-400 text-2xs">{f.unit}</td>
                <td className="py-1.5 px-1 font-mono font-semibold text-sage-600">{f.p}g</td>
                <td className="py-1.5 px-1 font-mono text-stone-400">{f.cal}</td>
                <td className="py-1.5 px-1 font-mono text-terra-600">${f._price.toFixed(2)}</td>
                <td className="py-1.5 px-1 font-mono font-bold" style={{ color: f._pd > 30 ? '#3D6340' : f._pd > 18 ? '#B24F1C' : '#918779' }}>{f._pd}</td>
                <td className="py-1.5 px-1 text-stone-400">{f.fib}g</td>
                <td className="py-1.5 px-1"><MicroBarWithTip food={f} /></td>
                <td className="py-1.5 px-1 font-mono font-semibold" title="Antioxidant capacity (loosely indexed to ORAC, 0–10)" style={{ color: f._antiox >= 8 ? '#3D6340' : f._antiox >= 5 ? '#B24F1C' : '#918779' }}>
                  {f._antiox}
                </td>
                <td className="py-1.5 px-1 font-mono font-semibold" title="Dietary Inflammatory Index — negative = anti-inflammatory, positive = pro-inflammatory" style={{ color: f._dii < -3 ? '#3D6340' : f._dii > 2 ? '#B91C1C' : '#918779' }}>
                  {f._dii > 0 ? '+' : ''}{f._dii}
                </td>
                <td className="py-1.5 px-1 whitespace-nowrap">
                  {pins?.has(f.id) ? (
                    <span className="text-2xs font-mono text-purple-600">in plan</span>
                  ) : !planIds?.has(f.id) && !isExcl ? (
                    <button
                      onClick={() => togglePin?.(f.id)}
                      className="text-2xs text-sage-700 hover:text-sage-900 font-mono px-1.5 py-0.5 rounded hover:bg-sage-50 border border-sage-200"
                      title="Add this food to the plan. To keep it forced into every plan, use the 📌 pin button on the Meal Plan tab."
                    >+ Add to plan</button>
                  ) : planIds?.has(f.id) ? (
                    <span className="text-2xs font-mono text-stone-400">in plan</span>
                  ) : null}
                  <button onClick={() => toggleExclude(f.id)} className={`text-sm ml-2 ${isExcl ? 'text-sage-600' : 'text-red-400 hover:text-red-600'}`} title={isExcl ? 'Re-include' : 'Exclude this food from the plan'}>
                    {isExcl ? '+' : '×'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function suggestionsFor(key) {
  return ({
    zn:     'oysters, beef, pumpkin seeds, lentils.',
    vitD:   'salmon, sardines, fortified milk, egg yolks.',
    mg:     'pumpkin seeds, almonds, spinach, dark chocolate.',
    o3:     'salmon, sardines, walnuts, flax/chia seeds.',
    se:     'Brazil nuts, tuna, sardines, sunflower seeds.',
    b12:    'beef liver, sardines, eggs, dairy, fortified plant milk.',
    chol:   'eggs, shellfish, organ meats.',
    fe:     'beef liver, lentils, dark leafy greens (with vit C).',
    ca:     'sardines (with bones), dairy, fortified plant milk.',
    folate: 'lentils, asparagus, leafy greens, fortified grains.',
  })[key] || 'a wider variety of whole foods.';
}
