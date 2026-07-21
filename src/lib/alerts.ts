// Правила сповіщень: CRUD у localStorage + перевірка спрацювань проти даних
import type { AlertRule, FuelKey, History, Latest } from '../types';
import { avgSeries, changeOver, networkSeries } from './stats';
import { fmtPct, fmtPrice, fmtSigned } from './format';

const STORAGE_KEY = 'dm-alerts';

/** Короткі назви пального для повідомлень */
const FUEL_SHORT: Record<FuelKey, string> = {
  dp: 'ДП',
  a95p: 'А-95 преміум',
  a95: 'А-95',
  a92: 'А-92',
  gas: 'Автогаз',
};

/** Правило без id — те, що приходить із форми додавання */
export type NewAlertRule =
  | { kind: 'below'; fuel: FuelKey; value: number }
  | { kind: 'above'; fuel: FuelKey; value: number }
  | { kind: 'network-change'; network: string }
  | { kind: 'avg-move'; percent: number };

export interface AlertHit {
  rule: AlertRule;
  message: string;
}

export function loadAlerts(): AlertRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AlertRule[]) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(rules: AlertRule[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  } catch {
    /* localStorage недоступний (приватний режим) — мовчки пропускаємо */
  }
}

/** Додати правило (id генерується) і повернути оновлений список */
export function addAlert(rule: NewAlertRule): AlertRule[] {
  const withId = { ...rule, id: crypto.randomUUID() } as AlertRule;
  const next = [...loadAlerts(), withId];
  saveAlerts(next);
  return next;
}

/** Видалити правило за id і повернути оновлений список */
export function removeAlert(id: string): AlertRule[] {
  const next = loadAlerts().filter(r => r.id !== id);
  saveAlerts(next);
  return next;
}

/** Людський опис правила українською (для списку в панелі) */
export function describeAlert(rule: AlertRule): string {
  switch (rule.kind) {
    case 'below':
      return `${FUEL_SHORT[rule.fuel]} нижче ${fmtPrice(rule.value)} грн/л`;
    case 'above':
      return `${FUEL_SHORT[rule.fuel]} вище ${fmtPrice(rule.value)} грн/л`;
    case 'network-change':
      return `Зміна ціни ДП у мережі ${rule.network}`;
    case 'avg-move':
      return `Рух середньої ДП за день ≥ ${fmtPrice(rule.percent, 1)}%`;
  }
}

/** Перевірити всі правила проти актуальних даних */
export function checkAlerts(
  rules: AlertRule[],
  data: { latest: Latest; history: History }
): AlertHit[] {
  const { latest, history } = data;
  const hits: AlertHit[] = [];

  for (const rule of rules) {
    switch (rule.kind) {
      case 'below': {
        const current = latest.avg?.[rule.fuel];
        if (current !== undefined && current < rule.value) {
          hits.push({
            rule,
            message: `${FUEL_SHORT[rule.fuel]} нижче ${fmtPrice(rule.value)} грн: зараз ${fmtPrice(current)}`,
          });
        }
        break;
      }
      case 'above': {
        const current = latest.avg?.[rule.fuel];
        if (current !== undefined && current > rule.value) {
          hits.push({
            rule,
            message: `${FUEL_SHORT[rule.fuel]} вище ${fmtPrice(rule.value)} грн: зараз ${fmtPrice(current)}`,
          });
        }
        break;
      }
      case 'network-change': {
        const series = networkSeries(history.days, rule.network, 'dp');
        if (series.length >= 2) {
          const last = series[series.length - 1];
          const prev = series[series.length - 2];
          const diff = last.value - prev.value;
          if (diff !== 0 && last.date === latest.date) {
            hits.push({
              rule,
              message: `${rule.network}: ціна ДП змінилася на ${fmtSigned(diff)} грн — зараз ${fmtPrice(last.value)}`,
            });
          }
        }
        break;
      }
      case 'avg-move': {
        const chg = changeOver(avgSeries(history.days, 'dp'), 1);
        if (chg && Math.abs(chg.pct) >= rule.percent) {
          hits.push({
            rule,
            message: `Середня ціна ДП змінилася на ${fmtPct(chg.pct)} за день`,
          });
        }
        break;
      }
    }
  }
  return hits;
}
