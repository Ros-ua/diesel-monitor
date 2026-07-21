// FuelTickers — тикер-стрічка перемикача пального (верх Dashboard):
// 5 карток по FUEL_ORDER, клік = вибір пального для всього дашборда
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { FUEL_LABELS, FUEL_ORDER, FUEL_SHORT, type FuelKey } from '../types';
import { avgSeries, changeOver, clipRange, toTime, type SeriesPoint } from '../lib/stats';
import { arrow, changeColor, fmtPct, fmtPrice, fmtSigned } from '../lib/format';

const SPARK_W = 60;
const SPARK_H = 20;
const SPARK_PAD = 2;

/** Координати polyline міні-спарклайна (x — за датою, історія розріджена) */
function sparkPoints(series: SeriesPoint[]): string | null {
  if (series.length < 2) return null;
  const t0 = toTime(series[0].date);
  const span = toTime(series[series.length - 1].date) - t0 || 1;
  const vals = series.map(p => p.value);
  const min = Math.min(...vals);
  const range = Math.max(...vals) - min;
  return series
    .map(p => {
      const x = SPARK_PAD + ((toTime(p.date) - t0) / span) * (SPARK_W - SPARK_PAD * 2);
      const y =
        range === 0
          ? SPARK_H / 2
          : SPARK_PAD + (1 - (p.value - min) / range) * (SPARK_H - SPARK_PAD * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Колір спарклайна за зміною ціни за 30 днів: вгору — danger, вниз — accent */
function sparkStroke(change30: { abs: number } | null): string {
  if (!change30 || Math.abs(change30.abs) < 0.005) return '#5a7a72';
  return change30.abs > 0 ? '#ff5f5f' : '#00d2aa';
}

interface Ticker {
  key: FuelKey;
  price: number | undefined;
  dayChange: number | undefined;
  week: { abs: number; pct: number } | null;
  spark: string | null;
  stroke: string;
}

export default function FuelTickers() {
  const { latest, history } = useAppData();
  const { fuel, setFuel } = useFuel();

  const tickers = useMemo<Ticker[]>(
    () =>
      FUEL_ORDER.map(key => {
        const series = avgSeries(history.days, key);
        const spark = sparkPoints(clipRange(series, 30));
        return {
          key,
          price: latest.avg?.[key],
          dayChange: latest.avgChange?.[key],
          week: changeOver(series, 7),
          spark,
          stroke: sparkStroke(changeOver(series, 30)),
        };
      }),
    [history.days, latest]
  );

  return (
    <motion.div
      className="flex gap-1.5 overflow-x-auto md:overflow-x-visible"
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {tickers.map(t => {
        const active = t.key === fuel;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => setFuel(t.key)}
            aria-pressed={active}
            aria-label={`Показати ціни: ${FUEL_LABELS[t.key]}`}
            className={`card p-2 cursor-pointer text-left min-w-[108px] shrink-0 md:min-w-0 md:flex-1 transition-colors ${
              active ? 'border-accent' : 'hover:border-accent/60'
            }`}
          >
            {/* Рядок 1: коротка назва + спарклайн 30 днів */}
            <div className="flex items-center justify-between gap-1">
              <span
                className={`text-[10px] font-bold tracking-wider ${
                  active ? 'text-accent' : 'text-muted'
                }`}
              >
                {FUEL_SHORT[t.key]}
              </span>
              {t.spark && (
                <svg
                  width={SPARK_W}
                  height={SPARK_H}
                  viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <polyline
                    points={t.spark}
                    fill="none"
                    stroke={t.stroke}
                    strokeWidth={1.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </div>

            {/* Рядок 2: поточна ціна */}
            <div
              className={`text-[15px] font-bold leading-tight tabular-nums ${
                active ? 'text-accent' : ''
              }`}
            >
              {fmtPrice(t.price)}
            </div>

            {/* Рядок 3: зміна за день */}
            <div className={`text-[10px] leading-tight ${changeColor(t.dayChange)}`}>
              {t.dayChange !== undefined
                ? `${arrow(t.dayChange)} ${fmtSigned(t.dayChange)}`
                : '—'}
            </div>

            {/* Рядок 4: зміна за тиждень */}
            <div className={`text-[9px] leading-tight opacity-85 ${changeColor(t.week?.abs)}`}>
              {t.week
                ? `тижд ${arrow(t.week.abs)} ${fmtSigned(t.week.abs)} (${fmtPct(t.week.pct)})`
                : 'тижд —'}
            </div>
          </button>
        );
      })}
    </motion.div>
  );
}
