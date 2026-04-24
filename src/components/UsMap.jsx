'use client';

import { useEffect, useMemo, useState } from 'react';
import { geoPath, geoAlbersUsa } from 'd3-geo';
import { feature } from 'topojson-client';

/**
 * UsMap — real choropleth-ready USA map.
 *
 * - Uses d3-geo's Albers USA projection which automatically insets Alaska
 *   and Hawaii (solving the honolulu-next-to-los-angeles problem).
 * - Loads us-atlas@3 state boundaries from jsdelivr CDN on mount. ~120KB
 *   gzipped, cached globally. No build-time asset needed.
 * - Projects city lat/lng through the same projection, so dots land in the
 *   right state.
 *
 * Fallback: while TopoJSON loads, renders a skeleton with just the city
 * dots positioned via the projection — already much better than the old
 * hand-rolled projection.
 */

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

function useUsTopology() {
  const [topo, setTopo] = useState(null);
  const [err, setErr]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(TOPO_URL)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(json => { if (!cancelled) setTopo(json); })
      .catch(e => { if (!cancelled) setErr(e.message); });
    return () => { cancelled = true; };
  }, []);

  return { topo, err };
}

function colorForIndex(costIndex) {
  // 85 = deep green, 100 = olive, 130 = deep red
  const t = Math.max(0, Math.min(1, (costIndex - 85) / 45));
  const h = 120 - t * 120;     // green → red
  const s = 55 - t * 5;
  const l = 40 - t * 6;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

export default function UsMap({ cities, selectedId, onSelect }) {
  const { topo, err } = useUsTopology();

  // Projection — the us-atlas states-10m is NOT pre-projected, so we need
  // to apply geoAlbersUsa ourselves. That projection handles AK+HI insets.
  const projection = useMemo(() => {
    return geoAlbersUsa()
      .scale(1000)
      .translate([487.5, 305]);  // centered for 975×610 viewBox
  }, []);

  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const statesGeom = useMemo(() => {
    if (!topo) return null;
    return feature(topo, topo.objects.states).features;
  }, [topo]);

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 975 610" className="w-full h-auto">
        {/* States */}
        {statesGeom && (
          <g>
            {statesGeom.map((f, i) => (
              <path
                key={f.id || i}
                d={pathGen(f) || ''}
                fill="#FBF7EE"
                stroke="#D9D3C7"
                strokeWidth={0.5}
                strokeLinejoin="round"
              />
            ))}
          </g>
        )}

        {/* Cities */}
        <g>
          {cities.map(c => {
            const proj = projection([c.lng, c.lat]);
            if (!proj) return null;   // city fell outside AlbersUsa extent
            const [x, y] = proj;
            const sel = c.id === selectedId;
            const r = sel ? 7 : 5;
            return (
              <g
                key={c.id}
                className="cursor-pointer"
                onClick={() => onSelect?.(c.id)}
              >
                {sel && <circle cx={x} cy={y} r={r + 10} fill="#E8854E" opacity={0.15} />}
                <circle
                  cx={x} cy={y} r={r}
                  fill={colorForIndex(c.costIndex)}
                  stroke={sel ? '#4A453D' : 'white'}
                  strokeWidth={sel ? 2 : 1}
                />
                <text
                  x={x} y={y - r - 4}
                  textAnchor="middle"
                  fontSize={sel ? 11 : 9}
                  fontWeight={sel ? 700 : 500}
                  fill={sel ? '#1A1815' : '#6B6358'}
                  style={{ fontFamily: 'Satoshi, sans-serif', pointerEvents: 'none' }}
                >
                  {c.name}
                </text>
              </g>
            );
          })}
        </g>

        {/* Legend */}
        <g transform="translate(700, 560)">
          <text x={0} y={-4} fontSize={8} fill="#918779" fontFamily="Satoshi, sans-serif">
            GROCERY COST INDEX
          </text>
          <defs>
            <linearGradient id="legGrad">
              <stop offset="0%" stopColor="hsl(120,55%,40%)" />
              <stop offset="100%" stopColor="hsl(0,50%,34%)" />
            </linearGradient>
          </defs>
          <rect x={0} y={0} width={120} height={6} rx={3} fill="url(#legGrad)" />
          <text x={0}   y={18} fontSize={8} fill="#918779">Cheap</text>
          <text x={120} y={18} fontSize={8} fill="#918779" textAnchor="end">Expensive</text>
        </g>
      </svg>

      {err && (
        <div className="absolute inset-x-0 bottom-2 text-center text-2xs text-amber-600">
          Map outlines failed to load ({err}) — cities still tappable.
        </div>
      )}
    </div>
  );
}
