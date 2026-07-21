// Огляд областей: медіанна ціна ДП по мережах кожної області
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion, type Variants } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { median } from '../lib/stats';
import { fmtPrice } from '../lib/format';

interface RegionStat {
  name: string;
  med: number;
  count: number;
}

/** «1 мережа», «3 мережі», «7 мереж» */
function networksWord(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'мережа';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'мережі';
  return 'мереж';
}

const container: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, staggerChildren: 0.015 },
  },
};

const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function RegionsPanel() {
  const { latest } = useAppData();

  const stats = useMemo<RegionStat[]>(() => {
    const out: RegionStat[] = [];
    for (const [name, networks] of Object.entries(latest.regions ?? {})) {
      const prices = Object.values(networks)
        .map(p => p.dp)
        .filter((v): v is number => v !== undefined);
      const med = median(prices);
      if (med !== null) out.push({ name, med, count: prices.length });
    }
    return out.sort((a, b) => a.med - b.med);
  }, [latest.regions]);

  if (!stats.length) return null;

  const colorFor = (i: number): string =>
    i < 3 ? 'text-accent' : i >= stats.length - 3 ? 'text-danger' : 'text-[#e0ede9]';

  return (
    <motion.section
      className="card p-3"
      variants={container}
      initial="hidden"
      animate="show"
    >
      <div className="lbl mb-2">Ціни по областях — дизель (медіана)</div>
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-1.5">
        {stats.map((r, i) => (
          <motion.div key={r.name} variants={item}>
            <Link
              to={'/region/' + encodeURIComponent(r.name)}
              className="block border border-transparent rounded px-2 py-1.5 no-underline hover:border-accent hover:bg-accent/5 transition-colors"
            >
              <div className="text-[10px] text-muted truncate">{r.name}</div>
              <div className={`text-[15px] font-bold leading-tight ${colorFor(i)}`}>
                {fmtPrice(r.med)}
              </div>
              <div className="text-[8px] text-muted/60">
                {r.count} {networksWord(r.count)}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
