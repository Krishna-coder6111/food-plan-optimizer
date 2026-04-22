'use client';

import { useState, useMemo, useCallback } from 'react';
import { FOODS, CATEGORIES, REGIONS } from '../data/foods';
import { CITIES, CITY_MAP } from '../data/cities';
import { MACRO_PRESETS, ACTIVITY_LEVELS, MAX_SERVINGS } from '../lib/constants';
import { calcTDEE, calcTargets } from '../lib/tdee';
import { optimizeDiet } from '../lib/optimizer';

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────

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

function MicroBar({ value, max = 100 }) {
  const pct = Math.min(value / max, 1);
  const count = Math.round(pct * 10);
  return (
    <div className="micro-bar">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="micro-bar-fill" style={{ background: i < count ? '#3D6340' : '#E8E4DD' }} />
      ))}
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────────────────────

export default function Home() {
  // Profile state
  const [gender, setGender] = useState('male');
  const [age, setAge] = useState(24);
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(10);
  const [weightLbs, setWeightLbs] = useState(170);
  const [activity, setActivity] = useState('moderate');
  const [cityId, setCityId] = useState('boston');
  const [presetId, setPresetId] = useState('maingain');
  const [excluded, setExcluded] = useState(new Set());
  const [tab, setTab] = useState('plan');
  const [showProfile, setShowProfile] = useState(true);

  const city = CITIES[CITY_MAP[cityId]] || CITIES[0];
  const preset = MACRO_PRESETS[presetId];
  const totalHeightIn = heightFt * 12 + heightIn;
  const tdee = calcTDEE(gender, weightLbs, totalHeightIn, age, activity);
  const targets = calcTargets(tdee, preset, weightLbs, gender);

  const availableFoods = useMemo(
    () => FOODS.filter(f => !excluded.has(f.id)),
    [excluded]
  );

  const result = useMemo(
    () => optimizeDiet(availableFoods, targets, city.region, city.costIndex, gender),
    [availableFoods, targets, city.region, city.costIndex, gender]
  );

  const toggleExclude = useCallback((id) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const tabs = [
    { id: 'plan', label: 'Meal Plan' },
    { id: 'map', label: 'City Map' },
    { id: 'hormones', label: gender === 'male' ? 'T Support' : 'Hormones' },
    { id: 'foods', label: 'All Foods' },
  ];

  return (
    <div className="max-w-[960px] mx-auto px-4 py-6">
      {/* ─── HEADER ─── */}
      <header className="mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <div className="flex items-baseline gap-2">
            <span className="text-2xs font-mono font-bold tracking-[0.2em] text-terra-600 uppercase">Nutrient Engine</span>
            <span className="text-2xs text-stone-300">v3</span>
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

      {/* ─── PROFILE PANEL ─── */}
      {showProfile && (
        <section className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 shadow-sm">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {/* Gender */}
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
            {/* Age */}
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Age</label>
              <input type="number" value={age} onChange={e => setAge(+e.target.value)} min={14} max={80}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
            </div>
            {/* Height */}
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Height</label>
              <div className="flex gap-1">
                <input type="number" value={heightFt} onChange={e => setHeightFt(+e.target.value)} min={4} max={7}
                  className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
                <input type="number" value={heightIn} onChange={e => setHeightIn(+e.target.value)} min={0} max={11}
                  className="w-full px-2 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
              </div>
            </div>
            {/* Weight */}
            <div>
              <label className="text-2xs uppercase tracking-wider text-stone-400 font-medium block mb-1">Weight (lbs)</label>
              <input type="number" value={weightLbs} onChange={e => setWeightLbs(+e.target.value)} min={80} max={350}
                className="w-full px-3 py-1.5 rounded-lg border border-stone-200 text-sm font-mono focus:outline-none focus:border-terra-400" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
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
          </div>
          <div className="flex gap-2 flex-wrap">
            <Stat label="TDEE" value={tdee} sub="maintenance kcal" />
            <Stat label="Target Cals" value={targets.calories} sub={`${preset.calAdj > 0 ? '+' : ''}${preset.calAdj}% ${preset.calAdj > 0 ? 'surplus' : preset.calAdj < 0 ? 'deficit' : 'maint'}`} accent />
            <Stat label="Protein" value={`${targets.protein}g`} sub="1g/lb BW" />
            <Stat label="Fiber" value={`${targets.fiber}g`} sub="14g/1000kcal" />
          </div>
        </section>
      )}

      {/* ─── MACRO STRATEGY ─── */}
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

      {/* ─── TAB NAV ─── */}
      <nav className="flex gap-1 bg-stone-100 rounded-xl p-1 mb-4">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition ${
              tab === t.id ? 'bg-white shadow-sm text-stone-900' : 'text-stone-400 hover:text-stone-600'
            }`}>
            {t.label}
          </button>
        ))}
      </nav>

      {/* ═══════ MEAL PLAN TAB ═══════ */}
      {tab === 'plan' && result && (
        <div>
          {!result.feasible && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-xs text-red-700">
              ⚠ The optimizer couldn&apos;t find a perfect solution with current constraints. Some nutrient targets may not be met. Try removing fewer food exclusions or adjusting your macro strategy.
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
            <Stat label="Prot/Dollar" value={`${(result.totals.protein / result.totals.cost).toFixed(1)}g`} sub="efficiency" />
          </div>

          {/* Food table */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4 overflow-x-auto shadow-sm">
            <div className="flex justify-between items-center mb-3">
              <h2 className="font-display text-lg font-bold">Daily Meal Plan</h2>
              <span className="text-2xs text-stone-400">tap ✕ to exclude &amp; recalculate</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-stone-200">
                  {['', 'Food', 'Qty', 'Protein', 'Cal', 'Cost', 'Fiber', 'Micro', ''].map((h, i) => (
                    <th key={i} className="py-2 px-1 text-left text-2xs uppercase tracking-wider text-stone-400 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.plan.map(f => (
                  <tr key={f.id} className="food-row border-b border-stone-100">
                    <td className="py-2 px-1">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: CATEGORIES[f.cat]?.color || '#999' }} />
                    </td>
                    <td className="py-2 px-1 font-medium text-stone-800">{f.name}</td>
                    <td className="py-2 px-1 text-stone-500">{f.servings}× <span className="text-xs">{f.unit}</span></td>
                    <td className="py-2 px-1 font-mono font-bold text-sage-600">{(f.p * f.servings).toFixed(0)}g</td>
                    <td className="py-2 px-1 font-mono text-stone-500">{(f.cal * f.servings).toFixed(0)}</td>
                    <td className="py-2 px-1 font-mono font-semibold text-terra-600">${f.totalCost.toFixed(2)}</td>
                    <td className="py-2 px-1 text-stone-500">{(f.fib * f.servings).toFixed(0)}g</td>
                    <td className="py-2 px-1"><MicroBar value={f.micro} /></td>
                    <td className="py-2 px-1">
                      <button onClick={() => toggleExclude(f.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-stone-300">
                  <td colSpan={2} className="py-2 px-1 font-display font-bold">TOTAL</td>
                  <td className="py-2 px-1" />
                  <td className="py-2 px-1 font-mono font-bold text-sage-600">{result.totals.protein}g</td>
                  <td className="py-2 px-1 font-mono font-bold">{result.totals.calories}</td>
                  <td className="py-2 px-1 font-mono font-bold text-terra-600">${result.totals.cost}</td>
                  <td className="py-2 px-1 font-bold">{result.totals.fiber}g</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Excluded foods */}
          {excluded.size > 0 && (
            <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
              <div className="text-sm font-semibold mb-2">
                Excluded Foods <span className="text-stone-400 font-normal text-xs">— tap to re-add</span>
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[...excluded].map(id => {
                  const f = FOODS.find(x => x.id === id);
                  return f ? (
                    <button key={id} onClick={() => toggleExclude(id)}
                      className="pill pill-inactive flex items-center gap-1">
                      <span className="text-sage-600 text-xs">+</span> {f.name}
                    </button>
                  ) : null;
                })}
                <button onClick={() => setExcluded(new Set())} className="pill pill-inactive text-red-400">Clear All</button>
              </div>
            </div>
          )}

          {/* Local food tips */}
          <div className="bg-white rounded-2xl border border-stone-200 p-4">
            <h3 className="font-display text-base font-bold mb-3 flex items-center gap-2">
              <span>📍</span> Local Food — {city.name}, {city.state}
            </h3>
            <div className="border-l-3 border-sage-400 pl-3 mb-3" style={{ borderLeftWidth: 3, borderLeftColor: '#6B9A6B' }}>
              <div className="text-2xs uppercase tracking-wider text-sage-600 font-semibold mb-1">Available Locally</div>
              <div className="text-sm text-stone-700 leading-relaxed">{city.local}</div>
              <div className="text-xs text-stone-400 mt-1">Peak season: {city.season}</div>
            </div>
            <div className="border-l-3 border-terra-400 pl-3" style={{ borderLeftWidth: 3, borderLeftColor: '#E8854E' }}>
              <div className="text-2xs uppercase tracking-wider text-terra-600 font-semibold mb-1">Cost-Saving Strategy</div>
              <div className="text-sm text-stone-700 leading-relaxed">{city.strategy}</div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ CITY MAP TAB ═══════ */}
      {tab === 'map' && (
        <div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
            <h2 className="font-display text-lg font-bold mb-1">US Grocery Cost Map</h2>
            <p className="text-xs text-stone-400 mb-3">Tap a city to see adjusted costs and local strategies</p>

            {/* City dots visualization */}
            <svg viewBox="0 0 820 500" className="w-full max-h-[380px]">
              <defs>
                <linearGradient id="lg">
                  <stop offset="0%" stopColor="#3D6340" />
                  <stop offset="100%" stopColor="#B24F1C" />
                </linearGradient>
              </defs>
              {CITIES.map(c => {
                const proj = projectCity(c.lat, c.lng);
                const sel = c.id === cityId;
                const t = (c.costIndex - 85) / 50;
                const r = 5 + t * 6;
                return (
                  <g key={c.id} onClick={() => setCityId(c.id)} className="cursor-pointer">
                    {sel && <circle cx={proj[0]} cy={proj[1]} r={r + 12} fill="#E8854E" opacity={0.12} />}
                    <circle cx={proj[0]} cy={proj[1]} r={sel ? r + 2 : r}
                      fill={`hsl(${150 - t * 150}, ${50 + t * 15}%, ${45 - t * 8}%)`}
                      stroke={sel ? '#4A453D' : 'rgba(255,255,255,0.4)'}
                      strokeWidth={sel ? 2 : 0.8} />
                    <text x={proj[0]} y={proj[1] - r - 5} textAnchor="middle"
                      fill={sel ? '#1A1815' : '#918779'}
                      fontSize={sel ? 11 : 9} fontWeight={sel ? 700 : 400}
                      fontFamily="Satoshi, sans-serif">
                      {c.name}
                    </text>
                  </g>
                );
              })}
              <g transform="translate(640,440)">
                <text fill="#918779" fontSize="7" fontFamily="Satoshi, sans-serif">GROCERY COST INDEX</text>
                <rect x="0" y="5" width="80" height="5" rx="3" fill="url(#lg)" />
                <text x="0" y="18" fill="#B8AFA0" fontSize="6">Low</text>
                <text x="68" y="18" fill="#B8AFA0" fontSize="6">High</text>
              </g>
            </svg>
          </div>

          <div className="flex gap-2 flex-wrap mb-4">
            <Stat label={city.name} value={city.costIndex} sub="cost index (100=avg)" warn={city.costIndex > 115} accent={city.costIndex < 100} />
            <Stat label="Monthly Grocery" value={`$${city.monthlyGrocery}`} sub="avg household" accent />
            <Stat label="Your Plan" value={`$${(result.totals.cost * 30).toFixed(0)}`} sub="/month optimized" />
          </div>

          {/* City ranking */}
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
                    <div className="h-full rounded-full transition-all" style={{ width: `${barW}%`, background: `hsl(${150 - t * 150}, 50%, 45%)` }} />
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
      {tab === 'hormones' && result && (
        <div>
          <div className="bg-white rounded-2xl border border-stone-200 p-4 mb-4">
            <h2 className="font-display text-lg font-bold mb-3">
              {gender === 'male' ? '⚡ Testosterone Optimization' : '🌸 Hormonal Balance'}
            </h2>
            {getHormoneGoals(gender).map((goal, i) => {
              const hits = result.plan.filter(f => {
                const tags = gender === 'male' ? f.hormoneM : f.hormoneF;
                return tags.some(t => t.toLowerCase().includes(goal.key.toLowerCase()));
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
                ? 'Zinc (oysters, pumpkin seeds, liver) is the #1 mineral for T synthesis. Vitamin D acts as a hormone itself — deficiency correlates with low T. Magnesium increases free testosterone by reducing SHBG. Omega-3s lower inflammatory cytokines that suppress production. Cruciferous vegetables (broccoli, cabbage, kale) contain DIM which metabolizes excess estrogen. Dietary fat is necessary — cholesterol is the precursor molecule for all steroid hormones, so don\'t over-restrict fat intake.'
                : 'Iron replaces menstrual losses and prevents hormonal disruption from anemia. Omega-3s support prostaglandin balance and reduce cycle-related inflammation. Magnesium supports progesterone production and calms the nervous system. B12 and folate are essential for ovulatory health. DIM from cruciferous vegetables supports healthy estrogen detoxification. Calcium and vitamin D together reduce PMS severity.'
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
                const pd = (f.p / price).toFixed(1);
                return (
                  <tr key={f.id} className={`food-row border-b border-stone-50 ${isExcl ? 'opacity-30' : ''}`}>
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

      {/* ─── FOOTER ─── */}
      <footer className="mt-8 py-4 border-t border-stone-200 text-center">
        <p className="text-2xs text-stone-300 leading-relaxed">
          Nutrition data from USDA FoodData Central. Pricing from BLS Average Retail Prices (Feb 2026), adjusted by regional CPI.
          <br />Hormone optimization based on peer-reviewed research. Not medical advice — consult a registered dietitian.
        </p>
      </footer>
    </div>
  );
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function projectCity(lat, lng) {
  if (lat > 50) return [115 + (lng + 170) * 2.2, 375 - (lat - 55) * 8];
  if (lat < 25) return [220 + (lng + 160) * 3, 420];
  return [80 + (lng + 130) * 12.5, 50 + (52 - lat) * 22];
}

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
