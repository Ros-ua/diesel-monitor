// Статистика над історією цін (чисті функції, без побічних ефектів)

import type { FuelKey, History, HistoryDay, Latest } from '../types';

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

const dayMs = 86_400_000;
export const toTime = (date: string): number => new Date(date + 'T00:00:00Z').getTime();

/** Серія середніх цін по Україні для виду пального */
export function avgSeries(days: HistoryDay[], fuel: FuelKey): SeriesPoint[] {
  return days
    .filter(d => d.avg?.[fuel] !== undefined)
    .map(d => ({ date: d.date, value: d.avg![fuel]! }));
}

/** Серія цін конкретної мережі */
export function networkSeries(days: HistoryDay[], network: string, fuel: FuelKey): SeriesPoint[] {
  return days
    .filter(d => d.networks?.[network]?.[fuel] !== undefined)
    .map(d => ({ date: d.date, value: d.networks![network][fuel]! }));
}

/** Обрізати серію до останніх N днів (null → уся серія) */
export function clipRange(series: SeriesPoint[], days: number | null): SeriesPoint[] {
  if (days === null || !series.length) return series;
  const cutoff = toTime(series[series.length - 1].date) - days * dayMs;
  return series.filter(p => toTime(p.date) >= cutoff);
}

/**
 * Зміна за останні N днів: остання точка проти точки, найближчої до дати
 * «N днів тому». Історія розріджена, тому діє допуск: якщо найближча точка
 * занадто далеко від цільової дати — повертаємо null (чесне «—»),
 * а не порівняння з даними піврічної давнини.
 */
export function changeOver(
  series: SeriesPoint[],
  days: number,
  tolerance?: number
): { abs: number; pct: number; fromDate: string } | null {
  if (series.length < 2) return null;
  const tol = tolerance ?? Math.min(45, Math.max(1.5, days * 0.4));
  const last = series[series.length - 1];
  const target = toTime(last.date) - days * dayMs;
  let base: SeriesPoint | null = null;
  let bestDist = Infinity;
  for (let i = series.length - 2; i >= 0; i--) {
    const dist = Math.abs(toTime(series[i].date) - target);
    if (dist < bestDist) {
      bestDist = dist;
      base = series[i];
    }
    if (toTime(series[i].date) < target) break; // далі точки лише старіші
  }
  if (!base || base.date === last.date || bestDist > tol * dayMs) return null;
  const abs = last.value - base.value;
  return { abs, pct: (abs / base.value) * 100, fromDate: base.date };
}

/**
 * Два останні дні збору, коли були ціни мереж: { from: попередній, to: останній }.
 *
 * ⚠️ «Вчора» в таблиці мереж — це ПОПЕРЕДНІЙ ДЕНЬ ЗБОРУ, а не календарне
 * вчора: Мінфін не публікує у вихідні. Раніше колонку рахував changeOver(…, 1)
 * з допуском 1,5 дня, і щопонеділка (п'ятниця — за 3 дні) вся колонка була «—».
 */
export function lastTwoNetworkDays(days: HistoryDay[], upTo?: string): { from: string; to: string } | null {
  // upTo — дата карти мереж, чию ціну показує таблиця (latest.networksDate). Без межі
  // історія, новіша за latest, давала ціну з одного знімка, а «Вчора» — з іншого
  // (третя вичитка Astra 27.09: 100 і «Вчора +10» до ціни 110, якої на сайті немає).
  const з = days.filter(d => d.networks && Object.keys(d.networks).length && (!upTo || d.date <= upTo));
  return з.length < 2 ? null : { from: з[з.length - 2].date, to: з[з.length - 1].date };
}

/** Зміна між двома КОНКРЕТНИМИ днями серії; нема будь-якої з точок — null */
/**
 * «Вчора» від ПОКАЗАНОЇ ціни: показана ціна мінус ціна мережі в попередній день збору.
 *
 * ⚠️ Історію за день може перезаписати повторний збір (A: 110), а latest за той
 * самий день лишитися з A: 100 — тоді різниця двох точок історії давала
 * «100 і Вчора +15» (короткий захід Astra 27.09). Від показаної ціни — «+5».
 */
export function changeFromShown(series: SeriesPoint[], from: string, shown: number): number | null {
  const base = series.find(p => p.date === from);
  return base ? shown - base.value : null;
}

export function changeBetween(series: SeriesPoint[], from: string, to: string): { abs: number; pct: number } | null {
  const a = series.find(p => p.date === from);
  const b = series.find(p => p.date === to);
  if (!a || !b) return null;
  const abs = b.value - a.value;
  return { abs, pct: (abs / a.value) * 100 };
}

/**
 * Найбільші ДОБОВІ рухи у вікні N днів: лише між точками за сусідні календарні дні.
 *
 * ⚠️ Раніше бралися будь-які сусідні точки серії, а історія розріджена:
 * «Макс. добове зростання +9,53 грн 18 бер» насправді було зростанням за 12 днів
 * (06.03 → 18.03). Рух через вихідні чи пропуск добовим не є.
 */
export function extremeMoves(
  series: SeriesPoint[],
  windowDays: number | null = null
): { rise: { date: string; abs: number } | null; drop: { date: string; abs: number } | null } {
  const s = clipRange(series, windowDays);
  let rise: { date: string; abs: number } | null = null;
  let drop: { date: string; abs: number } | null = null;
  for (let i = 1; i < s.length; i++) {
    if (toTime(s[i].date) - toTime(s[i - 1].date) !== dayMs) continue;
    const abs = s[i].value - s[i - 1].value;
    if (abs > 0 && (!rise || abs > rise.abs)) rise = { date: s[i].date, abs };
    if (abs < 0 && (!drop || abs < drop.abs)) drop = { date: s[i].date, abs };
  }
  return { rise, drop };
}

export function mean(vals: number[]): number | null {
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function median(vals: number[]): number | null {
  if (!vals.length) return null;
  const a = [...vals].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function stddev(vals: number[]): number | null {
  if (vals.length < 2) return null;
  const m = mean(vals)!;
  return Math.sqrt(vals.reduce((s, v) => s + (v - m) ** 2, 0) / (vals.length - 1));
}

/** Волатильність: стандартне відхилення відносних змін між точками, % */
export function volatility(series: SeriesPoint[], windowDays: number): number | null {
  const s = clipRange(series, windowDays);
  const changes: number[] = [];
  for (let i = 1; i < s.length; i++) {
    changes.push(((s[i].value - s[i - 1].value) / s[i - 1].value) * 100);
  }
  return stddev(changes);
}

/** Середнє значення серії у вікні N днів */
export function averageOver(series: SeriesPoint[], windowDays: number | null): number | null {
  return mean(clipRange(series, windowDays).map(p => p.value));
}

export interface NetworkStat {
  name: string;
  price: number;
}

export interface Analytics {
  avg: number | null;
  median: number | null;
  cheapest: NetworkStat | null;
  dearest: NetworkStat | null;
  maxRise: { date: string; abs: number } | null;
  maxDrop: { date: string; abs: number } | null;
  volatility30: number | null;
  monthlyAvg: number | null;
  yearlyAvg: number | null;
}

/** Повний аналітичний зріз для виду пального (типово — ДП) */
export function analytics(latest: Latest, history: History, fuel: FuelKey = 'dp'): Analytics {
  const prices = Object.values(latest.networks ?? {})
    .map(n => n[fuel])
    .filter((v): v is number => v !== undefined);
  const entries = Object.entries(latest.networks ?? {}).filter(([, n]) => n[fuel] !== undefined);
  const cheapest = entries.length
    ? entries.reduce((a, b) => (a[1][fuel]! <= b[1][fuel]! ? a : b))
    : null;
  const dearest = entries.length
    ? entries.reduce((a, b) => (a[1][fuel]! >= b[1][fuel]! ? a : b))
    : null;

  const series = avgSeries(history.days, fuel);
  const moves = extremeMoves(series, 365);

  return {
    avg: latest.avg?.[fuel] ?? mean(prices),
    median: median(prices),
    cheapest: cheapest ? { name: cheapest[0], price: cheapest[1][fuel]! } : null,
    dearest: dearest ? { name: dearest[0], price: dearest[1][fuel]! } : null,
    maxRise: moves.rise,
    maxDrop: moves.drop,
    volatility30: volatility(series, 30),
    monthlyAvg: averageOver(series, 30),
    yearlyAvg: averageOver(series, 365),
  };
}
