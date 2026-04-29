'use client';

import { useState, useMemo, useCallback } from 'react';
import { FOODS, CATEGORIES, REGIONS } from '../data/foods';
import { CITIES, CITY_MAP } from '../data/cities';
import { MACRO_PRESETS, ACTIVITY_LEVELS, MAX_SERVINGS, STORE_TIERS } from '../lib/constants';
import { calcTDEE, calcTargets } from '../lib/tdee';
import { useOptimizer } from '../lib/useOptimizer';
import { usePersistentState, setSerialize, setDeserialize, mapSerialize, mapDeserialize } from '../lib/usePersistentState';

import UsMap from '../components/UsMap';
import MealPlanTable from '../components/MealPlanTable';
import MicronutrientPanel from '../components/MicronutrientPanel';

// ─── small display components ────────────────────────────────────────────────

function Stat({ label, value, sub, warn, accent }) {
  const color = warn ? 'text-red-600' : accent ? 'text-terra-600' : 'text-stone-900';
  return (
    <div className="bg-white rounded-xl p-3 border border-stone-200 flex-1 min-w-[90px]">
      <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium mb-1">{label}</div>
      <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-2xs text-stone-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function MicroBar({ value, max = 10 }) {
  const count = Math.round(Math.min(value / max, 1) * 10);
  return (
    <div className="flex gap-px">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="w-0.5 h-3 rounded-sm" style={{ background: i < count ? '#3D6340' : '#E8E4DD' }} />
      ))}
    </div>
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

  // plan controls (excluded + locks persisted; tab + profile-visibility ephemeral)
  const [excluded, setExcluded] = usePersistentState('ne.excluded', new Set(), {
    serialize: setSerialize, deserialize: setDeserialize,
  });
  const [locks, setLocks]       = usePersistentState('ne.locks', new Map(), {
    serialize: mapSerialize, deserialize: mapDeserialize,
  });
  const [tab, setTab]           = useState('plan');
  const [showProfile, setShowProfile] = useState(true);

  const city    = CITIES[CITY_MAP[cityId]] || CITIES[0];
  const preset  = MACRO_PRESETS[presetId];
  const storeTier = STORE_TIERS.find(s => s.id === storeTierId) || STORE_TIERS[3];
  const effectiveCostIndex = Math.round(city.costIndex * storeTier.mult);
  const totalHeightIn = heightFt * 12 + heightIn;
  const tdee    = calcTDEE(gender, weightLbs, totalHeightIn, age, activity);
  const targets = calcTargets(tdee, preset, weightLbs, gender);

  const availableFoods = useMemo(
    () => FOODS.filter(f => !excluded.has(f.id)),
    [excluded],
  );

  // run the solver (debounced, off idle)
  const { result, pending } = useOptimizer({
    foods: availableFoods,
    targets,
    region: city.region,
    costIndex: effectiveCostIndex,
    gender,
    locks,
  });

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

  const clearAll = useCallback(() => {
    setExcluded(new Set());
    setLocks(new Map());
  }, []);

  const tabs = [
    { id: 'plan',     label: 'Meal Plan' },
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
          <button
            onClick={() => setShowProfile(p => !p)}
            className="text-xs text-stone-400 hover:text-stone-600 transition"
          >
            {showProfile ? 'Hide Profile ▲' : 'Edit Profile ▼'}
          </button>
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
            <Stat label="TDEE" value={tdee} sub="maintenance kcal" />
            <Stat label="Target Cals" value={targets.calories} sub={`${preset.calAdj > 0 ? '+' : ''}${preset.calAdj}% ${preset.calAdj > 0 ? 'surplus' : preset.calAdj < 0 ? 'deficit' : 'maint'}`} accent />
            <Stat label="Protein" value={`${targets.protein}g`} sub="1g/lb BW" />
            <Stat label="Fiber" value={`${targets.fiber}g`} sub="14g/1000kcal" />
          </div>
        </section>
      )}

      {/* macro strategy */}
      <section className="mb-4">
        <div className="text-2xs uppercase tracking-wider text-stone-400 font-medium mb-2">Caloric Strategy</div>
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
              warn={result.totals.protein < targets.protein * 0.9} />
            <Stat label="Calories" value={result.totals.calories} sub={`target ${targets.calories}`} />
            <Stat label="Fiber" value={`${result.totals.fiber}g`} sub={`target ${targets.fiber}g`} />
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <Stat label="Sat Fat" value={`${result.totals.satFat}g`} sub={`max ${targets.maxSatFat}g`}
              warn={result.totals.satFat > targets.maxSatFat} />
            <Stat label="Cholesterol" value={`${result.totals.chol}mg`} sub="max 300mg"
              warn={result.totals.chol > 300} />
            <Stat label="Added Sugar" value={`${result.totals.sugar}g`} sub="minimized" />
            <Stat label="Prot/Dollar" value={`${(result.totals.protein / Math.max(0.01, result.totals.cost)).toFixed(1)}g`} sub="efficiency" />
          </div>

          <MealPlanTable
            plan={result.plan}
            totals={result.totals}
            targets={targets}
            locks={locks}
            onLock={lockQty}
            onUnlock={unlockQty}
            onExclude={toggleExclude}
          />

          {(excluded.size > 0 || locks.size > 0) && (
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

      {/* ═══════ MICRONUTRIENT TAB ═══════ */}
      {tab === 'micro' && (
        <MicronutrientPanel nutrientScores={result.nutrientScores} relaxed={result.relaxed} />
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
            {getHormoneGoals(gender).map((goal, i) => {
              const hits = result.plan.filter(f => {
                const tags = gender === 'male' ? f.hormoneM : f.hormoneF;
                return (tags || []).some(t => t.toLowerCase().includes(goal.key.toLowerCase()));
              });
              return (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-stone-100 last:border-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${hits.length >= 2 ? 'bg-sage-400' : hits.length === 1 ? 'bg-terra-400' : 'bg-red-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-stone-800">{goal.nutrient}</div>
                    <div className="text-xs text-stone-400 leading-snug">{goal.why}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-xs font-bold font-mono ${hits.length >= 2 ? 'text-sage-600' : hits.length === 1 ? 'text-terra-600' : 'text-red-500'}`}>
                      {hits.length} source{hits.length !== 1 ? 's' : ''}
                    </div>
                    {hits.length > 0 && (
                      <div className="text-2xs text-stone-400 max-w-[120px] text-right truncate">
                        {hits.slice(0, 2).map(f => f.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
        <div className="bg-white rounded-2xl border border-stone-200 p-4 overflow-x-auto">
          <div className="flex justify-between items-center mb-3">
            <div>
              <h2 className="font-display text-lg font-bold">Food Database</h2>
              <p className="text-xs text-stone-400">Sorted by protein per dollar · tap ✕ to exclude</p>
            </div>
            {excluded.size > 0 && (
              <button onClick={() => setExcluded(new Set())} className="pill pill-inactive text-xs">Reset ({excluded.size})</button>
            )}
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
                {['', 'Food', 'Unit', 'Prot', 'Cal', `Cost (${city.region.toUpperCase()})`, 'P/$', 'Fiber', 'Micro', ''].map((h, i) => (
                  <th key={i} className="py-2 px-1 text-left text-2xs uppercase tracking-wider text-stone-400 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...FOODS].sort((a, b) => {
                const pa = a.p / (a.price[city.region] || a.price.us);
                const pb = b.p / (b.price[city.region] || b.price.us);
                return pb - pa;
              }).map(f => {
                const isExcl = excluded.has(f.id);
                const price = (f.price[city.region] || f.price.us) * (city.costIndex / 100);
                const pd = +(f.p / price).toFixed(1);
                return (
                  <tr key={f.id} className={`border-b border-stone-50 ${isExcl ? 'opacity-30' : ''}`}>
                    <td className="py-1.5 px-1">
                      <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: CATEGORIES[f.cat]?.color }} />
                    </td>
                    <td className="py-1.5 px-1 font-medium text-stone-700">{f.name}</td>
                    <td className="py-1.5 px-1 text-stone-400 text-2xs">{f.unit}</td>
                    <td className="py-1.5 px-1 font-mono font-semibold text-sage-600">{f.p}g</td>
                    <td className="py-1.5 px-1 font-mono text-stone-400">{f.cal}</td>
                    <td className="py-1.5 px-1 font-mono text-terra-600">${price.toFixed(2)}</td>
                    <td className="py-1.5 px-1 font-mono font-bold" style={{ color: pd > 30 ? '#3D6340' : pd > 18 ? '#B24F1C' : '#918779' }}>{pd}</td>
                    <td className="py-1.5 px-1 text-stone-400">{f.fib}g</td>
                    <td className="py-1.5 px-1"><MicroBar value={f.micro} /></td>
                    <td className="py-1.5 px-1">
                      <button onClick={() => toggleExclude(f.id)} className={`text-xs ${isExcl ? 'text-sage-600' : 'text-red-400 hover:text-red-600'}`}>
                        {isExcl ? '+' : '✕'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

function getHormoneGoals(gender) {
  if (gender === 'male') return [
    { nutrient: 'Zinc', key: 'zn', why: 'Directly supports testosterone synthesis in Leydig cells' },
    { nutrient: 'Vitamin D', key: 'vitD', why: 'Correlates with T levels; RCT showed +25% T with supplementation' },
    { nutrient: 'Magnesium', key: 'mg', why: 'Increases free testosterone by reducing SHBG binding' },
    { nutrient: 'Omega-3', key: 'o3', why: 'Reduces inflammatory cytokines that suppress T production' },
    { nutrient: 'Selenium', key: 'se', why: 'Essential for sperm production and thyroid conversion (T4→T3)' },
    { nutrient: 'B12', key: 'b12', why: 'Supports energy metabolism and red blood cell production' },
    { nutrient: 'DIM (cruciferous)', key: 'DIM', why: 'Promotes healthy estrogen metabolism via 2-OH pathway' },
    { nutrient: 'Cholesterol (dietary)', key: 'chol', why: 'Precursor for pregnenolone→testosterone pathway' },
  ];
  return [
    { nutrient: 'Iron', key: 'fe', why: 'Replaces menstrual losses; deficiency disrupts thyroid and ovulation' },
    { nutrient: 'Magnesium', key: 'mg', why: 'Supports progesterone production and reduces cortisol' },
    { nutrient: 'Omega-3', key: 'o3', why: 'Anti-inflammatory prostaglandin balance, reduces dysmenorrhea' },
    { nutrient: 'B12', key: 'b12', why: 'Supports ovulation regularity and energy metabolism' },
    { nutrient: 'Vitamin D', key: 'vitD', why: 'Linked to fertility, PCOS management, and mood regulation' },
    { nutrient: 'Calcium', key: 'ca', why: 'Alleviates PMS symptoms; supports bone density' },
    { nutrient: 'Folate', key: 'folate', why: 'Essential for reproductive health and DNA methylation' },
    { nutrient: 'DIM (cruciferous)', key: 'DIM', why: 'Supports healthy estrogen detoxification pathways' },
  ];
}
