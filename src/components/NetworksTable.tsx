// Порівняльна таблиця мереж АЗС (дизель): пошук, фільтр області й ціни, сортування
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { changeOver, networkSeries } from '../lib/stats';
import { changeColor, fmtPrice, fmtSigned } from '../lib/format';
import type { NetworkPrices } from '../types';

type SortKey = 'name' | 'price' | 'd1' | 'd7' | 'd30' | 'vs';
type SortDir = 'asc' | 'desc';

interface Row {
  name: string;
  price: number;
  d1: number | null;
  d7: number | null;
  d30: number | null;
  vs: number | null;
  regionCount?: number;
}

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'name', label: 'Мережа', align: 'left' },
  { key: 'price', label: 'Ціна ДП', align: 'right' },
  { key: 'd1', label: 'Вчора', align: 'right' },
  { key: 'd7', label: 'Тиждень', align: 'right' },
  { key: 'd30', label: 'Місяць', align: 'right' },
  { key: 'vs', label: 'vs середня', align: 'right' },
];

const INPUT_CLS =
  'bg-transparent border border-line rounded px-2 py-1 text-xs focus:border-accent outline-none';

/** Парсинг числа з поля вводу (кома або крапка) */
function parseNum(s: string): number | null {
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function NetworksTable() {
  const { latest, history } = useAppData();

  const [query, setQuery] = useState('');
  const [region, setRegion] = useState(''); // '' = вся Україна
  const [minStr, setMinStr] = useState('');
  const [maxStr, setMaxStr] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const regionNames = useMemo(
    () => Object.keys(latest.regions ?? {}).sort((a, b) => a.localeCompare(b, 'uk')),
    [latest.regions]
  );

  // Підказка: запит схожий на назву області → лінк на сторінку області
  const regionMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return regionNames.filter(r => r.toLowerCase().includes(q)).slice(0, 3);
  }, [query, regionNames]);

  // Усі рядки для поточного джерела (область або вся Україна), без фільтрів
  const allRows = useMemo<Row[]>(() => {
    const source: Record<string, NetworkPrices> = region
      ? (latest.regions?.[region] ?? {})
      : (latest.networks ?? {});
    const avgDp = latest.avg?.dp;
    const rows: Row[] = [];
    for (const [name, prices] of Object.entries(source)) {
      const dp = prices.dp;
      if (dp === undefined) continue; // мережі без ціни ДП не показуємо
      const series = networkSeries(history.days, name, 'dp');
      rows.push({
        name,
        price: dp,
        d1: changeOver(series, 1)?.abs ?? null,
        d7: changeOver(series, 7)?.abs ?? null,
        d30: changeOver(series, 30)?.abs ?? null,
        vs: avgDp !== undefined ? dp - avgDp : null,
        regionCount: region ? undefined : prices.regionCount,
      });
    }
    return rows;
  }, [latest, history, region]);

  // Пошук + фільтр ціни + сортування
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = parseNum(minStr);
    const max = parseNum(maxStr);
    const out = allRows.filter(
      r =>
        (!q || r.name.toLowerCase().includes(q)) &&
        (min === null || r.price >= min) &&
        (max === null || r.price <= max)
    );
    out.sort((a, b) => {
      if (sortKey === 'name') {
        const c = a.name.localeCompare(b.name, 'uk');
        return sortDir === 'asc' ? c : -c;
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // порожні значення завжди внизу
      if (bv === null) return -1;
      const c = av - bv;
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  }, [allRows, query, minStr, maxStr, sortKey, sortDir]);

  // Найдешевша / найдорожча серед показаних (тільки якщо є з чого обирати)
  const { cheapest, dearest } = useMemo(() => {
    if (rows.length < 2) return { cheapest: null as string | null, dearest: null as string | null };
    let lo = rows[0];
    let hi = rows[0];
    for (const r of rows) {
      if (r.price < lo.price) lo = r;
      if (r.price > hi.price) hi = r;
    }
    if (lo.name === hi.name) return { cheapest: null, dearest: null };
    return { cheapest: lo.name, dearest: hi.name };
  }, [rows]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <motion.div
      className="card p-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Хедер: підпис + пошук + фільтри */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <div className="lbl mr-auto">Мережі АЗС — Дизель</div>

        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Пошук мережі або області…"
          aria-label="Пошук мережі або області"
          className={`${INPUT_CLS} w-48`}
        />

        <select
          value={region}
          onChange={e => setRegion(e.target.value)}
          aria-label="Область"
          className={INPUT_CLS}
          style={{ colorScheme: 'dark' }}
        >
          <option value="">Вся Україна</option>
          {regionNames.map(r => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1">
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            value={minStr}
            onChange={e => setMinStr(e.target.value)}
            placeholder="від"
            aria-label="Ціна ДП від, грн"
            className={`${INPUT_CLS} w-16`}
          />
          <span className="text-muted text-[10px]">–</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            value={maxStr}
            onChange={e => setMaxStr(e.target.value)}
            placeholder="до"
            aria-label="Ціна ДП до, грн"
            className={`${INPUT_CLS} w-16`}
          />
          <span className="lbl">грн</span>
        </div>
      </div>

      {/* Підказка: запит збігається з областю */}
      {regionMatches.length > 0 && (
        <div className="text-[10px] text-muted mb-2">
          Схоже, ви шукаєте область:{' '}
          {regionMatches.map((r, i) => (
            <span key={r}>
              {i > 0 && ', '}
              <Link
                to={`/region/${encodeURIComponent(r)}`}
                className="text-accent hover:underline"
              >
                {r}
              </Link>
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-xs border-collapse">
          <thead>
            <tr className="border-b border-line">
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className={`lbl font-normal cursor-pointer select-none whitespace-nowrap py-1.5 px-2 hover:text-accent ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span className="ml-0.5 text-accent">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map(row => (
                <motion.tr
                  key={row.name}
                  layout="position"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`border-b border-line/50 hover:bg-accent/5 ${
                    row.name === cheapest ? 'bg-accent/5' : ''
                  }`}
                >
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <Link
                      to={`/network/${encodeURIComponent(row.name)}`}
                      className="text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                    {row.regionCount !== undefined && (
                      <span className="text-muted text-[9px] ml-1">({row.regionCount} обл.)</span>
                    )}
                    {row.name === cheapest && (
                      <span className="text-[8px] border border-accent text-accent rounded px-1 ml-1.5 align-middle">
                        НАЙДЕШЕВША
                      </span>
                    )}
                    {row.name === dearest && (
                      <span className="text-[8px] border border-danger text-danger rounded px-1 ml-1.5 align-middle">
                        НАЙДОРОЖЧА
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 px-2 text-right font-bold">{fmtPrice(row.price)}</td>
                  <td className={`py-1.5 px-2 text-right ${changeColor(row.d1)}`}>
                    {fmtSigned(row.d1)}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${changeColor(row.d7)}`}>
                    {fmtSigned(row.d7)}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${changeColor(row.d30)}`}>
                    {fmtSigned(row.d30)}
                  </td>
                  <td className={`py-1.5 px-2 text-right ${changeColor(row.vs)}`}>
                    {fmtSigned(row.vs)}
                  </td>
                </motion.tr>
              ))}
            </AnimatePresence>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-3 px-2 text-center text-muted text-[11px]">
                  {allRows.length === 0
                    ? 'Немає даних про мережі'
                    : 'Нічого не знайдено за заданими фільтрами'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
