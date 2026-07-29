// Сторінка області: ціни на все пальне, місце області в рейтингу країни,
// різниця від середньої та найближчі сусіди за ціною.
//
// Раніше тут була таблиця мереж усередині області, але Мінфін прибрав таку
// розбивку 29.07.2026 (сторінка /detail/). Тепер джерело — середні по областях
// (/reg/), і сторінка відповідає на те саме питання читача — «у мене дорожче
// чи дешевше, ніж у людей» — тільки чесно, на наявних даних.
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { FUEL_LABELS, FUEL_SHORT, type FuelKey } from '../types';
import { changeColor, fmtPrice, fmtSigned } from '../lib/format';

const COLS: FuelKey[] = ['dp', 'a95p', 'a95', 'a92', 'gas'];

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
  const { fuel } = useFuel();

  const regionAvg = latest.regionAvg;
  const prices = regionAvg?.[name];

  // рейтинг усіх областей за вибраним пальним: дешевша → перша
  const ranking = useMemo(() => {
    if (!regionAvg) return [];
    return Object.entries(regionAvg)
      .flatMap(([region, p]) => {
        const v = p[fuel];
        return v === undefined ? [] : [{ region, price: v }];
      })
      .sort((a, b) => a.price - b.price);
  }, [regionAvg, fuel]);

  const pos = ranking.findIndex(r => r.region === name) + 1;
  const price = prices?.[fuel];
  const countryAvg = latest.avg?.[fuel];
  const vsCountry = price !== undefined && countryAvg !== undefined ? price - countryAvg : null;
  const isCity = name.startsWith('м.');

  if (!prices) {
    return (
      <div className="card p-5 text-xs text-muted mt-2">
        Дані по цій області відсутні.{' '}
        <Link to="/" className="text-accent hover:underline">На головну</Link>
      </div>
    );
  }

  const cheapest = ranking[0];
  const dearest = ranking[ranking.length - 1];

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
          {FUEL_LABELS[fuel]} · середні ціни по області
        </div>
      </motion.div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <StatCard
          label={`${FUEL_SHORT[fuel]} в області`}
          value={price !== undefined ? `${fmtPrice(price)} грн` : '—'}
          valueClass="text-accent"
          delay={0}
        />
        <StatCard
          label="Місце в Україні"
          value={pos > 0 ? `${pos} з ${ranking.length}` : '—'}
          sub={pos > 0 ? (pos <= ranking.length / 2 ? 'дешевша половина' : 'дорожча половина') : undefined}
          valueClass={pos > 0 && pos <= ranking.length / 2 ? 'text-accent' : 'text-danger'}
          delay={0.05}
        />
        <StatCard
          label="vs середня по країні"
          value={vsCountry !== null ? `${fmtSigned(vsCountry)} грн` : '—'}
          valueClass={changeColor(vsCountry)}
          delay={0.1}
        />
        <StatCard
          label="Найдешевша область"
          value={cheapest ? `${fmtPrice(cheapest.price)} грн` : '—'}
          sub={cheapest?.region}
          valueClass="text-accent2"
          delay={0.15}
        />
      </div>

      {/* Ціни на решту пального в цій області */}
      <motion.div
        className="card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="lbl mb-2">Усе пальне — {isCity ? name : `${name} обл.`}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl text-left py-1.5 px-2 font-normal">Пальне</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">Ціна, грн/л</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">vs Україна</th>
              </tr>
            </thead>
            <tbody>
              {COLS.filter(k => prices[k] !== undefined).map(k => {
                const cAvg = latest.avg?.[k];
                const d = cAvg !== undefined ? prices[k]! - cAvg : null;
                return (
                  <tr key={k} className="border-b border-line/50 hover:bg-accent/5">
                    <td className="py-1.5 px-2">{FUEL_LABELS[k]}</td>
                    <td className="py-1.5 px-2 text-right font-bold text-accent">
                      {fmtPrice(prices[k])}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${changeColor(d)}`}>
                      {d !== null ? fmtSigned(d) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Рейтинг областей — замінює зниклу таблицю мереж */}
      <motion.div
        className="card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.15 }}
      >
        <div className="lbl mb-2">
          Рейтинг областей — {FUEL_SHORT[fuel]} (від дешевших)
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-line">
                <th className="lbl text-left py-1.5 px-2 font-normal w-8">#</th>
                <th className="lbl text-left py-1.5 px-2 font-normal">Область</th>
                <th className="lbl text-right py-1.5 px-2 font-normal">
                  {FUEL_SHORT[fuel]}, грн/л
                </th>
                <th className="lbl text-right py-1.5 px-2 font-normal">vs ця область</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r, i) => {
                const me = r.region === name;
                const d = price !== undefined ? r.price - price : null;
                return (
                  <tr
                    key={r.region}
                    className={`border-b border-line/50 hover:bg-accent/5 ${me ? 'bg-accent/10' : ''}`}
                  >
                    <td className="py-1.5 px-2 text-muted">{i + 1}</td>
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      {me ? (
                        <span className="text-accent font-bold">{r.region}</span>
                      ) : (
                        <Link
                          to={`/region/${encodeURIComponent(r.region)}`}
                          className="hover:text-accent"
                        >
                          {r.region}
                        </Link>
                      )}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${me ? 'font-bold text-accent' : ''}`}>
                      {fmtPrice(r.price)}
                    </td>
                    <td className={`py-1.5 px-2 text-right ${changeColor(d)}`}>
                      {me ? '—' : d !== null ? fmtSigned(d) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[9px] text-muted mt-2">
          Найдорожче: {dearest?.region} — {fmtPrice(dearest?.price)} грн/л.
          Ціни по мережах АЗС — на головній сторінці.
        </div>
      </motion.div>
    </div>
  );
}
