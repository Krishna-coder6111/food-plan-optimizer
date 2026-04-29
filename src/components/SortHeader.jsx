'use client';

/**
 * SortHeader — clickable <th> that toggles sort state.
 *
 * Usage in a <thead>:
 *   <SortHeader id="cost" sort={sort} setSort={setSort}>Cost</SortHeader>
 *
 * `sort` is `{ col, dir }`; clicking the same column flips dir,
 * clicking a new column starts at descending (since most numeric
 * columns are more interesting from highest-first).
 */
export function SortHeader({ id, sort, setSort, align = 'left', className = '', children }) {
  const isActive = sort.col === id;
  const arrow = !isActive ? '↕' : sort.dir === 'asc' ? '↑' : '↓';
  return (
    <th
      onClick={() => {
        if (isActive) setSort({ col: id, dir: sort.dir === 'asc' ? 'desc' : 'asc' });
        else          setSort({ col: id, dir: 'desc' });
      }}
      className={`py-2 px-1 text-2xs uppercase tracking-wider font-medium cursor-pointer select-none whitespace-nowrap text-${align} ${
        isActive ? 'text-stone-900' : 'text-stone-400 hover:text-stone-600'
      } ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className={`text-[9px] ${isActive ? 'text-terra-600' : 'text-stone-300'}`}>{arrow}</span>
      </span>
    </th>
  );
}

/**
 * Helper to apply a sort spec to an array of records using a getter map.
 * `getters[col]` returns the comparable value for a row.
 */
export function applySort(rows, sort, getters) {
  const get = getters[sort.col];
  if (!get) return rows;
  const sorted = [...rows].sort((a, b) => {
    const av = get(a), bv = get(b);
    if (av === bv) return 0;
    if (typeof av === 'string') return av.localeCompare(bv);
    return av - bv;
  });
  return sort.dir === 'desc' ? sorted.reverse() : sorted;
}
