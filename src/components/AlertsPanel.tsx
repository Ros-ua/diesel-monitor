// Картка «Сповіщення»: правила у localStorage, перевірка при відкритті сайту
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAppData } from '../context/DataContext';
import { FUEL_LABELS, FUEL_ORDER, type AlertRule, type FuelKey } from '../types';
import {
  addAlert,
  checkAlerts,
  describeAlert,
  loadAlerts,
  removeAlert,
  type NewAlertRule,
} from '../lib/alerts';

type RuleKind = AlertRule['kind'];

const KIND_LABELS: Record<RuleKind, string> = {
  below: 'Нижче за (грн/л)',
  above: 'Вище за (грн/л)',
  'network-change': 'Зміна ціни мережі',
  'avg-move': 'Рух середньої, %',
};

const KIND_ORDER: RuleKind[] = ['below', 'above', 'network-change', 'avg-move'];

const inputCls =
  'bg-bg border border-line rounded px-1.5 py-1 text-xs text-[#e0ede9] outline-none focus:border-accent w-full min-w-0';

const hasNotifications = typeof Notification !== 'undefined';

export default function AlertsPanel() {
  const { latest, history } = useAppData();

  const [rules, setRules] = useState<AlertRule[]>(() => loadAlerts());
  const [kind, setKind] = useState<RuleKind>('below');
  const [fuel, setFuel] = useState<FuelKey>('dp');
  const [value, setValue] = useState('');
  const [network, setNetwork] = useState('');
  const [notifPerm, setNotifPerm] = useState<NotificationPermission | null>(
    hasNotifications ? Notification.permission : null
  );

  const networks = useMemo(() => Object.keys(latest.networks ?? {}).sort(), [latest]);

  // Перевірка правил при монтуванні та при зміні даних/правил
  const hits = useMemo(() => checkAlerts(rules, { latest, history }), [rules, latest, history]);

  // Браузерні сповіщення (за наданим дозволом), без повторів за сесію
  const notified = useRef(new Set<string>());
  useEffect(() => {
    if (!hasNotifications || notifPerm !== 'granted') return;
    for (const hit of hits) {
      const key = `${hit.rule.id}|${hit.message}`;
      if (notified.current.has(key)) continue;
      notified.current.add(key);
      try {
        new Notification('Дизель Монітор UA', { body: hit.message });
      } catch {
        /* браузер може заборонити конструктор — пропускаємо */
      }
    }
  }, [hits, notifPerm]);

  const askPermission = () => {
    if (!hasNotifications) return;
    void Notification.requestPermission().then(p => setNotifPerm(p));
  };

  const numValue = Number(value.replace(',', '.'));
  const selectedNetwork = network || networks[0] || '';
  const canAdd =
    kind === 'network-change'
      ? selectedNetwork !== ''
      : value.trim() !== '' && Number.isFinite(numValue) && numValue > 0;

  const handleAdd = () => {
    if (!canAdd) return;
    let rule: NewAlertRule;
    switch (kind) {
      case 'below':
        rule = { kind: 'below', fuel, value: numValue };
        break;
      case 'above':
        rule = { kind: 'above', fuel, value: numValue };
        break;
      case 'network-change':
        rule = { kind: 'network-change', network: selectedNetwork };
        break;
      case 'avg-move':
        rule = { kind: 'avg-move', percent: numValue };
        break;
    }
    setRules(addAlert(rule));
    setValue('');
  };

  return (
    <motion.div
      className="card p-3 flex flex-col gap-2"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="lbl">Сповіщення</div>

      {hits.length > 0 && (
        <div className="bg-warn/10 border border-warn/40 rounded p-2 text-warn text-xs flex flex-col gap-1">
          {hits.map(h => (
            <div key={`${h.rule.id}|${h.message}`}>⚠ {h.message}</div>
          ))}
        </div>
      )}

      {rules.length === 0 ? (
        <div className="text-xs text-muted">Правил поки немає — додайте перше нижче.</div>
      ) : (
        <ul className="flex flex-col m-0 p-0 list-none">
          {rules.map(r => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 py-1 border-b border-line/50 text-xs"
            >
              <span>{describeAlert(r)}</span>
              <button
                type="button"
                className="btn btn-danger shrink-0"
                style={{ padding: '1px 6px', fontSize: 10, lineHeight: '14px' }}
                onClick={() => setRules(removeAlert(r.id))}
                aria-label="Видалити правило"
                title="Видалити правило"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line/50 pt-2">
        <div className="lbl">Нове правило</div>

        <select
          className={inputCls}
          value={kind}
          onChange={e => setKind(e.target.value as RuleKind)}
          aria-label="Тип правила"
        >
          {KIND_ORDER.map(k => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>

        {(kind === 'below' || kind === 'above') && (
          <div className="flex gap-1.5">
            <select
              className={inputCls}
              value={fuel}
              onChange={e => setFuel(e.target.value as FuelKey)}
              aria-label="Вид пального"
            >
              {FUEL_ORDER.map(f => (
                <option key={f} value={f}>
                  {FUEL_LABELS[f]}
                </option>
              ))}
            </select>
            <input
              className={inputCls}
              type="number"
              step="0.1"
              min="0"
              placeholder="грн/л"
              value={value}
              onChange={e => setValue(e.target.value)}
              aria-label="Порогова ціна"
            />
          </div>
        )}

        {kind === 'network-change' &&
          (networks.length > 0 ? (
            <select
              className={inputCls}
              value={selectedNetwork}
              onChange={e => setNetwork(e.target.value)}
              aria-label="Мережа АЗС"
            >
              {networks.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-xs text-muted">Немає даних мереж</div>
          ))}

        {kind === 'avg-move' && (
          <input
            className={inputCls}
            type="number"
            step="0.1"
            min="0"
            placeholder="% за день"
            value={value}
            onChange={e => setValue(e.target.value)}
            aria-label="Поріг руху, відсотків"
          />
        )}

        <button type="button" className="btn" onClick={handleAdd} disabled={!canAdd}>
          + Додати
        </button>

        {hasNotifications && notifPerm === 'default' && (
          <button type="button" className="btn btn-ghost" onClick={askPermission}>
            Дозволити сповіщення браузера
          </button>
        )}
      </div>

      <div className="text-[9px] text-muted/70 border-t border-line/50 pt-1.5 mt-auto">
        Перевірка — під час відкриття сайту
      </div>
    </motion.div>
  );
}
