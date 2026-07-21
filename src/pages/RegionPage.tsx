// Сторінка області: мін/макс/середня ДП, таблиця мереж області
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import type { FuelKey } from '../types';
import { median, mean } from '../lib/stats';
import { changeColor, fmtPrice, fmtSigned } from '../lib/format';

const COLS: { key: FuelKey; label: string }[] = [
  { key: 'dp', label: 'ДП' },
  { key: 'a95', label: 'А-95' },
  { key: 'a92', label: 'А-92' },
  { key: 'gas', label: 'Газ' },
];

function StatCard({ label, value, sub, valueClass = 'text-accent', delay = 0 }: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="card p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <div className="lbl mb-1">{label}</div>
      <div className={`text-[20px] font-bold leading-none ${valueClass}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted mt-1">{sub}</div>}
    </motion.div>
  );
}

export default function RegionPage() {
  const { id } = useParams<{ id: string }>();
  const name = id ? decodeURIComponent(id) : '';
  const { latest } = useAppData();
  const [sortAsc, setSortAsc] = useState(true);

  const nets = latest.regions?.[name];

  const rows = useMemo(() => {
    const list = Object.entries(nets ?? {})
      .map(([network, prices]) => ({ network, ...prices }))
      .filter(r => r.dp !== undefined);
    return list.sort((a, b) => (sortAsc ? a.dp! - b.dp! : b.dp! - a.dp!));
  }, [nets, sortAsc]);

  if (!nets) {
    return (
      <div className="card p-5 text-xs text-muted mt-2">
        Дані по цій області відсутні.{' '}
        <Link to="/" className="text-accent hover:underline">На головну</Link>
      </div>
    );
  }

  const dpPrices = rows.map(r => r.dp!);
  const minRow = rows.length ? rows.reduce((a, b) => (a.dp! <= b.dp! ? a : b)) : null;
  const maxRow = rows.length ? rows.reduce((a, b) => (a.dp! >= b.dp! ? a : b)) : null;
  const regionMedian = median(dpPrices);
  const regionMean = mean(dpPrices);
  const isCity = name.startsWith('м.');

  return (
    <div className="flex flex-col gap-2.5">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Link to="/" className="text-muted hover:text-accent text-xs no-underline">
          ← На головну
        </Link>
        <h2 className="text-xl text-accent font-bold uppercase tracking-wider mt-1.5">
          {isCity ? name : `${name} область`}
        </h2>
        <div className="text-[10px] text-muted mt-0.5">
          дизельне пальне · {rows.length} мереж із ДП
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <StatCard
          label="Мінімальна ціна ДП"
          value={minRow ? `${fmtPrice(minRow.dp)} грн` : '—'}
          sub={minRow?.network}
          valueClass="text-accent"
          delay={0}
        />
        <StatCard
          label="Максимальна ціна ДП"
          value={maxRow ? `${fmtPrice(maxRow.dp)} грн` : '—'}
          sub={maxRow?.network}
          valueClass="text-danger"
          delay={0.05}
        />
        <StatCard
          label="Медіана по області"
          value={regionMedian !== null ? `${fmtPrice(regionMedian)} грн` : '—'}
          valueClass="text-accent2"
          delay={0.1}
        />
        <StatCard
          label="Середня по області"
          value={regionMean !== null ? `${fmtPrice(regionMean)} грн` : '—'}
          valueClass="text-purple"
          delay={0.15}
        />
      </div>

      <motion.div
        className="card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="lbl mb-2">Мережі АЗС — {isCity ? name : `${name} обл.`}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 520 }}>
            <thead>
              <tr className="border-b border-line">
                <th className="lbl text-left py-1.5 px-2 font-normal">Мережа</th>
                <th
                  className="lbl text-right py-1.5 px-2 font-normal cursor-pointer select-none hover:text-accent"
                  onClick={() => setSortAsc(a => !a)}
                  title="Сортувати за ціною ДП"
                >
                  ДП, грн/л {sortAsc ? '▲' : '▼'}
                </th>
                <th className="lbl text-right py-1.5 px-2 font-normal">А-95</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">А-92</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">Газ</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">vs медіана</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const diff = regionMedian !== null ? r.dp! - regionMedian : null;
                const cheapest = minRow !== null && r.network === minRow.network && rows.length > 1;
                return (
                  <tr
                    key={r.network}
                    className={`border-b border-line/50 hover:bg-accent/5 ${cheapest ? 'bg-accent/5' : ''}`}
                  >
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <Link
                        to={`/network/${encodeURIComponent(r.network)}`}
                        className="text-accent hover:underline"
                      >
                        {r.network}
                      </Link>
                      {cheapest && (
                        <span className="ml-1.5 text-[8px] border border-accent text-accent rounded px-1 align-middle">
                          НАЙДЕШЕВША
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right font-bold">{fmtPrice(r.dp)}</td>
                    {COLS.slice(1).map(c => (
                      <td key={c.key} className="py-1.5 px-2 text-right text-muted">
                        {fmtPrice(r[c.key])}
                      </td>
                    ))}
                    <td className={`py-1.5 px-2 text-right ${changeColor(diff)}`}>
                      {diff !== null ? fmtSigned(diff) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[9px] text-muted mt-2">
          Історичні графіки по областях накопичуються з часом
        </div>
      </motion.div>
    </div>
  );
}
