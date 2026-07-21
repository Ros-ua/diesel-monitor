// DriversPanel — «Чому змінюється ціна»: автоматичний список чинників тиску на ціну пального
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { drivers, type Driver } from '../lib/drivers';

/** Сила чинника: заповнені/порожні крапки, напр. ●●○ */
function StrengthDots({ strength, dir }: { strength: Driver['strength']; dir: Driver['dir'] }) {
  const color = dir === 'up' ? 'text-danger' : 'text-accent';
  return (
    <span
      className="text-[9px] tracking-[0.2em] whitespace-nowrap shrink-0"
      aria-label={`сила ${strength} з 3`}
      title={`сила чинника: ${strength} з 3`}
    >
      <span className={color}>{'●'.repeat(strength)}</span>
      <span className="text-muted/40">{'○'.repeat(3 - strength)}</span>
    </span>
  );
}

function DriverRow({ driver, index }: { driver: Driver; index: number }) {
  const [open, setOpen] = useState(false);
  const dirColor = driver.dir === 'up' ? 'text-danger' : 'text-accent';
  return (
    <motion.div
      className="border-b border-line/50 py-2 last:border-b-0 cursor-pointer select-none"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.05 + index * 0.05 }}
      onClick={() => setOpen(o => !o)}
      role="button"
      aria-expanded={open}
      title={open ? 'Згорнути пояснення' : 'Як це впливає на ціну?'}
    >
      <div className="flex items-center gap-2">
        <span className={`text-[14px] leading-none shrink-0 ${dirColor}`} aria-hidden="true">
          {driver.dir === 'up' ? '↑' : '↓'}
        </span>
        <span className="text-xs text-[#e0ede9] flex-1 min-w-0 leading-tight">{driver.label}</span>
        <StrengthDots strength={driver.strength} dir={driver.dir} />
        <span
          className={`text-[9px] shrink-0 transition-transform duration-200 ${open ? 'rotate-180 text-accent' : 'text-muted/60'}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </div>
      <div className="text-[10px] text-muted mt-0.5 pl-[22px] leading-snug">{driver.detail}</div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="text-[10px] text-[#e0ede9]/70 mt-1.5 pl-[22px] pr-1 leading-relaxed border-l border-accent/30 ml-[3px]">
              {driver.explain}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function DriversPanel() {
  const { history, factors, news } = useAppData();
  const { fuel } = useFuel();

  const list = useMemo(() => drivers(history, factors, news, fuel), [history, factors, news, fuel]);

  return (
    <motion.div
      className="card p-3 h-full flex flex-col"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <div className="lbl mb-2">Чому змінюється ціна</div>

      <div className="flex-1">
        {list.length === 0 ? (
          <div className="text-muted text-xs py-4">
            Суттєвих рухів чинників за тиждень не зафіксовано
          </div>
        ) : (
          list.map((d, i) => <DriverRow key={d.label} driver={d} index={i} />)
        )}
      </div>

      <div className="text-[9px] text-muted/60 mt-2 pt-2">
        Автоматичний аналіз чинників · Brent, курс НБУ, динаміка цін, новини · клік по чиннику —
        пояснення
      </div>
    </motion.div>
  );
}
