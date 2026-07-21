// Автоматичне пояснення «чому змінюється ціна»: рахуємо рухи факторів
// (Brent, курс USD, середня ціна, розкид мереж) та сигнали з новин.

import type { Factors, History, News } from '../types';
import { avgSeries, changeOver, type SeriesPoint } from './stats';

export interface Driver {
  label: string;
  dir: 'up' | 'down';
  strength: 1 | 2 | 3;
  detail: string;
}

const fmt = (v: number, d = 1) => v.toFixed(d).replace('.', ',');

function factorSeries(factors: Factors | null, key: 'brent' | 'usd'): SeriesPoint[] {
  return (factors?.days ?? [])
    .filter(d => d[key] !== undefined)
    .map(d => ({ date: d.date, value: d[key]! }));
}

function strengthFromPct(pct: number, s1: number, s2: number): 1 | 2 | 3 {
  const a = Math.abs(pct);
  return a >= s2 ? 3 : a >= s1 ? 2 : 1;
}

/** Список чинників за останні ~7 днів, найсильніші перші */
export function drivers(history: History, factors: Factors | null, news: News | null): Driver[] {
  const out: Driver[] = [];

  // Brent за 7 днів
  const brent = changeOver(factorSeries(factors, 'brent'), 7);
  if (brent && Math.abs(brent.pct) >= 1) {
    const last = brentLast(factors);
    out.push({
      label: `Brent ${brent.pct > 0 ? 'дорожчає' : 'дешевшає'}`,
      dir: brent.pct > 0 ? 'up' : 'down',
      strength: strengthFromPct(brent.pct, 3, 6),
      detail: `${fmt(brent.pct)}% за 7 днів${last !== null ? `, зараз $${fmt(last, 1)}/бар` : ''}`,
    });
  }

  // Курс USD/UAH за 7 днів
  const usd = changeOver(factorSeries(factors, 'usd'), 7);
  if (usd && Math.abs(usd.pct) >= 0.3) {
    out.push({
      label: usd.pct > 0 ? 'Гривня слабшає' : 'Гривня міцнішає',
      dir: usd.pct > 0 ? 'up' : 'down',
      strength: strengthFromPct(usd.pct, 1, 2.5),
      detail: `USD ${fmt(usd.pct)}% за 7 днів (${fmt(usdLast(factors) ?? 0, 2)} грн)`,
    });
  }

  // Рух середньої ціни ДП за 7 і 30 днів
  const dp = avgSeries(history.days, 'dp');
  const dp7 = changeOver(dp, 7);
  if (dp7 && Math.abs(dp7.abs) >= 0.2) {
    out.push({
      label: `Середня ціна ДП ${dp7.abs > 0 ? 'росте' : 'знижується'}`,
      dir: dp7.abs > 0 ? 'up' : 'down',
      strength: strengthFromPct(dp7.pct, 1, 3),
      detail: `${dp7.abs > 0 ? '+' : '−'}${fmt(Math.abs(dp7.abs), 2)} грн/л з ${dp7.fromDate.slice(8, 10)}.${dp7.fromDate.slice(5, 7)}`,
    });
  }

  // Сигнали з новин за останні 7 днів
  if (news?.items?.length) {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = news.items.filter(n => n.publishedAt && new Date(n.publishedAt).getTime() >= weekAgo);
    const ups = recent.filter(n => n.impact === 'up').length;
    const downs = recent.filter(n => n.impact === 'down').length;
    if (ups >= 2 && ups > downs) {
      out.push({
        label: 'Новини: чинники подорожчання',
        dir: 'up',
        strength: ups >= 4 ? 2 : 1,
        detail: `${ups} новин(и) з тиском на ціну вгору за тиждень`,
      });
    } else if (downs >= 2 && downs > ups) {
      out.push({
        label: 'Новини: чинники здешевлення',
        dir: 'down',
        strength: downs >= 4 ? 2 : 1,
        detail: `${downs} новин(и) з тиском на ціну вниз за тиждень`,
      });
    }
  }

  return out.sort((a, b) => b.strength - a.strength);
}

function brentLast(factors: Factors | null): number | null {
  const s = factorSeries(factors, 'brent');
  return s.length ? s[s.length - 1].value : null;
}

function usdLast(factors: Factors | null): number | null {
  const s = factorSeries(factors, 'usd');
  return s.length ? s[s.length - 1].value : null;
}
