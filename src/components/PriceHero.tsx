// PriceHero — головна картка середньої ціни вибраного пального (велике число як у Speedtest)
import { useEffect, useMemo, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { FUEL_HERO } from '../types';
import { arrow, changeColor, fmtPct, fmtPrice, fmtSigned } from '../lib/format';
import { avgSeries, changeOver } from '../lib/stats';

/** Лічильник: плавний "наїзд" числа від 0.97×значення до значення */
function useCountUp(target: number | undefined): number | undefined {
  const [display, setDisplay] = useState<number | undefined>(
    target !== undefined ? target * 0.97 : undefined
  );

  useEffect(() => {
    if (target === undefined) {
      setDisplay(undefined);
      return;
    }
    const controls = animate(target * 0.97, target, {
      duration: 0.6,
      ease: 'easeOut',
      onUpdate: v => setDisplay(v),
    });
    return () => controls.stop();
  }, [target]);

  return display;
}

/** Пункт ряду періодів: міні-підпис + значення зміни (null/undefined → «—») */
function PeriodStat({
  label,
  abs,
  pct,
}: {
  label: string;
  abs: number | undefined;
  pct?: number;
}) {
  return (
    <div>
      <div className="lbl mb-0.5">{label}</div>
      {abs !== undefined ? (
        <div className={`text-[13px] font-bold leading-tight ${changeColor(abs)}`}>
          {arrow(abs)} {fmtSigned(abs)}
          {pct !== undefined && (
            <span className="font-normal opacity-80"> ({fmtPct(pct)})</span>
          )}
        </div>
      ) : (
        <div className="text-[13px] text-muted leading-tight">—</div>
      )}
    </div>
  );
}

export default function PriceHero() {
  const { latest, history } = useAppData();
  const { fuel } = useFuel();

  const price = latest.avg?.[fuel];
  const todayChange = latest.avgChange?.[fuel];
  const shown = useCountUp(price);

  const periods = useMemo(() => {
    const series = avgSeries(history.days, fuel);
    return {
      week: changeOver(series, 7),
      month: changeOver(series, 30),
      year: changeOver(series, 365),
    };
  }, [history.days, fuel]);

  return (
    <motion.div
      className="card relative overflow-hidden p-4 md:p-5 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="scanlines absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="relative">
        <div className="lbl mb-2">Середня ціна {FUEL_HERO[fuel]} по Україні</div>

        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[56px] md:text-[72px] font-bold text-accent leading-none tabular-nums">
            {shown !== undefined ? fmtPrice(shown) : '—'}
          </span>
          <span className="text-muted text-sm md:text-base">грн/л</span>
        </div>

        {/* Ряд періодів під ціною: сьогодні / тиждень / місяць / рік */}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <PeriodStat label="Сьогодні" abs={todayChange} />
          <PeriodStat label="За тиждень" abs={periods.week?.abs} pct={periods.week?.pct} />
          <PeriodStat label="За місяць" abs={periods.month?.abs} pct={periods.month?.pct} />
          <PeriodStat label="За рік" abs={periods.year?.abs} pct={periods.year?.pct} />
        </div>

        {(latest.usd !== undefined || latest.eur !== undefined || latest.brent !== undefined) && (
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
            {latest.usd !== undefined && <span>USD/UAH {fmtPrice(latest.usd)}</span>}
            {latest.eur !== undefined && <span>EUR/UAH {fmtPrice(latest.eur)}</span>}
            {latest.brent !== undefined && <span>Brent {fmtPrice(latest.brent)} $/бар</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}
