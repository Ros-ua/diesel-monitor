// Картка «Прогноз тренду»: напрям, довіра, три горизонти + дисклеймер
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { forecast, type Confidence, type Direction, type HorizonForecast } from '../lib/forecast';
import { avgSeries } from '../lib/stats';
import { fmtPrice } from '../lib/format';
import { FUEL_SHORT } from '../types';

const DIRECTION_VIEW: Record<Direction, { text: string; cls: string }> = {
  up: { text: '↗ ЗРОСТАННЯ', cls: 'text-danger' },
  down: { text: '↘ ЗНИЖЕННЯ', cls: 'text-accent' },
  flat: { text: '→ СТАБІЛЬНО', cls: 'text-muted' },
};

const CONFIDENCE_CLS: Record<Confidence, string> = {
  висока: 'border-accent/40 text-accent',
  середня: 'border-warn/40 text-warn',
  низька: 'border-muted/40 text-muted',
};

function HorizonRow({ label, h }: { label: string; h: HorizonForecast }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-line/50 last:border-b-0">
      <span className="lbl">{label}</span>
      <span className="text-right">
        <span className="font-bold">{fmtPrice(h.value)}</span>
        <span className="text-muted text-[10px]"> грн/л </span>
        <span className="text-[10px] text-muted">
          ({fmtPrice(h.low)}–{fmtPrice(h.high)})
        </span>
      </span>
    </div>
  );
}

export default function ForecastPanel() {
  const { history } = useAppData();
  const { fuel } = useFuel();
  const fc = useMemo(() => forecast(avgSeries(history.days, fuel)), [history, fuel]);

  return (
    <motion.div
      className="card p-3 flex flex-col"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="lbl mb-2">Прогноз тренду — {FUEL_SHORT[fuel]}</div>

      {!fc && (
        <div className="text-xs text-muted flex-1">Замало історичних даних для прогнозу</div>
      )}

      {fc && (
        <>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-lg font-bold leading-none ${DIRECTION_VIEW[fc.direction].cls}`}>
              {DIRECTION_VIEW[fc.direction].text}
            </span>
            <span
              className={`border rounded px-1.5 py-0.5 text-[9px] tracking-[0.1em] ${CONFIDENCE_CLS[fc.confidence]}`}
            >
              довіра: {fc.confidence}
            </span>
          </div>

          <div className="flex-1">
            <HorizonRow label="Завтра" h={fc.tomorrow} />
            <HorizonRow label="За тиждень" h={fc.week} />
            <HorizonRow label="За місяць" h={fc.month} />
          </div>
        </>
      )}

      <div className="text-[9px] text-muted/70 border-t border-line/50 pt-1.5 mt-2 leading-relaxed">
        Оцінка тренду за історичними даними. Не є гарантією майбутніх цін і не є фінансовою
        порадою.
      </div>
    </motion.div>
  );
}
