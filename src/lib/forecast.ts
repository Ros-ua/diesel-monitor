// Простий трендовий прогноз на основі лінійної регресії з ваговим акцентом
// на свіжі дані. Це ОЦІНКА за історичними даними, не гарантія.

import { clipRange, toTime, volatility, type SeriesPoint } from './stats';

export type Direction = 'up' | 'down' | 'flat';
export type Confidence = 'низька' | 'середня' | 'висока';

export interface HorizonForecast {
  value: number;
  low: number;
  high: number;
}

export interface Forecast {
  direction: Direction;
  confidence: Confidence;
  slopePerDay: number; // грн/день
  tomorrow: HorizonForecast;
  week: HorizonForecast;
  month: HorizonForecast;
}

/** Зважена лінійна регресія: свіжі точки важать більше */
function weightedRegression(points: SeriesPoint[]): { slope: number; intercept: number; r2: number } | null {
  if (points.length < 3) return null;
  const t0 = toTime(points[0].date);
  const xs = points.map(p => (toTime(p.date) - t0) / 86_400_000);
  const ys = points.map(p => p.value);
  const xMax = xs[xs.length - 1] || 1;
  // вага від 0.3 (старі) до 1.0 (нові)
  const ws = xs.map(x => 0.3 + 0.7 * (x / xMax));

  const W = ws.reduce((a, b) => a + b, 0);
  const mx = xs.reduce((s, x, i) => s + x * ws[i], 0) / W;
  const my = ys.reduce((s, y, i) => s + y * ws[i], 0) / W;
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    num += ws[i] * (xs[i] - mx) * (ys[i] - my);
    den += ws[i] * (xs[i] - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = my - slope * mx;

  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < xs.length; i++) {
    ssRes += ws[i] * (ys[i] - (intercept + slope * xs[i])) ** 2;
    ssTot += ws[i] * (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
  return { slope, intercept, r2 };
}

/**
 * Прогноз за серією середніх цін. Використовує останні ~90 днів історії.
 * Повертає null, якщо даних замало (< 4 точок).
 */
export function forecast(series: SeriesPoint[]): Forecast | null {
  const recent = clipRange(series, 90);
  const reg = weightedRegression(recent.length >= 4 ? recent : series);
  if (!reg) return null;

  const last = series[series.length - 1];
  const vol = volatility(series, 90) ?? 1; // % між точками
  const sigmaAbs = (vol / 100) * last.value;

  const horizon = (days: number): HorizonForecast => {
    const value = last.value + reg.slope * days;
    // невизначеність росте з горизонтом
    const spread = Math.max(0.15, sigmaAbs * Math.sqrt(days) * 0.9);
    return {
      value: Math.round(value * 100) / 100,
      low: Math.round((value - spread) * 100) / 100,
      high: Math.round((value + spread) * 100) / 100,
    };
  };

  // напрям: нахил має бути помітним на тижневому горизонті
  const weekMove = reg.slope * 7;
  const direction: Direction =
    Math.abs(weekMove) < Math.max(0.1, sigmaAbs * 0.5) ? 'flat' : weekMove > 0 ? 'up' : 'down';

  const confidence: Confidence =
    recent.length >= 8 && reg.r2 > 0.6 ? 'висока' : recent.length >= 5 && reg.r2 > 0.3 ? 'середня' : 'низька';

  return {
    direction,
    confidence,
    slopePerDay: reg.slope,
    tomorrow: horizon(1),
    week: horizon(7),
    month: horizon(30),
  };
}
