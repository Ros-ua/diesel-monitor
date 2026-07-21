// AnalyticsPanel — «Аналітика»: сітка міні-статів по вибраному пальному (середня, медіана, екстремуми, волатильність)
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { fmtDateShort, fmtPct, fmtPrice, fmtSigned } from '../lib/format';
import { analytics } from '../lib/stats';
import { FUEL_SHORT } from '../types';

interface StatProps {
  label: string;
  value: string;
  color: string; // tailwind-клас кольору значення
  unit?: string;
  sub?: string;
  subColor?: string;
  title?: string;
}

function Stat({ label, value, color, unit, sub, subColor = 'text-muted', title }: StatProps) {
  return (
    <div title={title}>
      <div className="lbl mb-0.5">{label}</div>
      <div className={`text-[15px] font-bold leading-tight tabular-nums ${color}`}>
        {value}
        {unit && value !== '—' && (
          <span className="text-[9px] font-normal text-muted ml-1">{unit}</span>
        )}
      </div>
      {sub && <div className={`text-[10px] leading-tight truncate ${subColor}`}>{sub}</div>}
    </div>
  );
}

export default function AnalyticsPanel() {
  const { latest, history } = useAppData();
  const { fuel } = useFuel();

  const a = useMemo(() => analytics(latest, history, fuel), [latest, history, fuel]);

  return (
    <motion.div
      className="card p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <div className="lbl">Аналітика</div>
        <div className="text-[8px] text-muted whitespace-nowrap">{FUEL_SHORT[fuel]}</div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <Stat label="Середня" value={fmtPrice(a.avg)} unit="грн/л" color="text-accent" />
        <Stat label="Медіана мереж" value={fmtPrice(a.median)} unit="грн/л" color="text-accent2" />

        <Stat
          label="Найдешевша мережа"
          value={a.cheapest ? fmtPrice(a.cheapest.price) : '—'}
          unit="грн/л"
          color="text-accent"
          sub={a.cheapest?.name}
          subColor="text-accent/80"
        />
        <Stat
          label="Найдорожча"
          value={a.dearest ? fmtPrice(a.dearest.price) : '—'}
          unit="грн/л"
          color="text-danger"
          sub={a.dearest?.name}
          subColor="text-danger/80"
        />

        <Stat
          label="Макс. добове зростання"
          value={a.maxRise ? fmtSigned(a.maxRise.abs) : '—'}
          unit="грн"
          color="text-danger"
          sub={a.maxRise ? fmtDateShort(a.maxRise.date) : undefined}
        />
        <Stat
          label="Макс. добове падіння"
          value={a.maxDrop ? fmtSigned(a.maxDrop.abs) : '—'}
          unit="грн"
          color="text-accent"
          sub={a.maxDrop ? fmtDateShort(a.maxDrop.date) : undefined}
        />

        <Stat
          label="Волатильність 30д"
          value={a.volatility30 !== null ? fmtPct(a.volatility30).replace('+', '') : '—'}
          color="text-warn"
          title="стандартне відхилення денних змін"
        />
        <Stat label="Середня за місяць" value={fmtPrice(a.monthlyAvg)} unit="грн/л" color="text-purple" />

        <Stat label="Середня за рік" value={fmtPrice(a.yearlyAvg)} unit="грн/л" color="text-purple" />
      </div>
    </motion.div>
  );
}
