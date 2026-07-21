// PriceHero — головна картка поточної середньої ціни ДП (велике число як у Speedtest)
import { useEffect, useMemo, useState } from 'react';
import { animate, motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
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

interface PeriodChange {
  abs: number;
  pct: number;
}

function MiniStat({ label, change }: { label: string; change: PeriodChange | null }) {
  return (
    <div className="text-right">
      <div className="lbl mb-0.5">{label}</div>
      {change ? (
        <div className={`text-[13px] font-bold leading-tight ${changeColor(change.abs)}`}>
          {arrow(change.abs)} {fmtSigned(change.abs)} грн{' '}
          <span className="font-normal opacity-80">({fmtPct(change.pct)})</span>
        </div>
      ) : (
        <div className="text-[13px] text-muted leading-tight">—</div>
      )}
    </div>
  );
}

export default function PriceHero() {
  const { latest, history } = useAppData();

  const price = latest.avg?.dp;
  const todayChange = latest.avgChange?.dp;
  const shown = useCountUp(price);

  const periods = useMemo(() => {
    const series = avgSeries(history.days, 'dp');
    return {
      week: changeOver(series, 7),
      month: changeOver(series, 30),
      year: changeOver(series, 365),
    };
  }, [history.days]);

  return (
    <motion.div
      className="card relative overflow-hidden p-4 md:p-5 h-full"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="scanlines absolute inset-0 pointer-events-none" aria-hidden="true" />

      <div className="relative flex items-stretch gap-5">
        {/* Ліва частина: підпис + величезне число + зміна за сьогодні */}
        <div className="flex-1 min-w-0">
          <div className="lbl mb-2">Середня ціна ДП по Україні</div>

          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[56px] md:text-[72px] font-bold text-accent leading-none tabular-nums">
              {shown !== undefined ? fmtPrice(shown) : '—'}
            </span>
            <span className="text-muted text-sm md:text-base">грн/л</span>
          </div>

          <div className={`mt-2 text-[13px] font-bold ${changeColor(todayChange)}`}>
            {todayChange !== undefined ? (
              <>
                {arrow(todayChange)} {fmtSigned(todayChange)} грн сьогодні
              </>
            ) : (
              <span className="font-normal">→ без змін сьогодні</span>
            )}
          </div>

          {(latest.usd !== undefined || latest.brent !== undefined) && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
              {latest.usd !== undefined && <span>USD/UAH {fmtPrice(latest.usd)}</span>}
              {latest.brent !== undefined && <span>Brent {fmtPrice(latest.brent)} $/бар</span>}
            </div>
          )}
        </div>

        {/* Права частина (md+): зміни за періоди */}
        <div className="hidden md:flex flex-col justify-center gap-3 border-l border-line pl-5 shrink-0">
          <MiniStat label="За тиждень" change={periods.week} />
          <MiniStat label="За місяць" change={periods.month} />
          <MiniStat label="За рік" change={periods.year} />
        </div>
      </div>
    </motion.div>
  );
}
