// Одноразовий бекфіл реальної історії:
//  • середні ціни на пальне — зі снапшотів Wayback Machine сторінок minfin
//  • ціни мереж по областях — зі снапшотів detail-сторінки (де є)
//  • курс USD/UAH — API НБУ
//  • Brent — Yahoo Finance (BZ=F, денні закриття за 3 роки)
// Запуск: node scripts/backfill.mjs

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage, parseDetail, parseAverages, nationalNetworks } from './lib/minfin.mjs';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round2 = v => Math.round(v * 100) / 100;

const AVG_PAGES = ['index.minfin.com.ua/ua/markets/fuel/', 'index.minfin.com.ua/markets/fuel/'];
const DETAIL_PAGES = [
  'index.minfin.com.ua/ua/markets/fuel/detail/',
  'index.minfin.com.ua/markets/fuel/detail/',
];

async function cdx(url) {
  const q = `http://web.archive.org/cdx/search/cdx?url=${url}&from=20240101&to=20261231&output=json&fl=timestamp&filter=statuscode:200&collapse=timestamp:8`;
  const res = await fetch(q);
  if (!res.ok) throw new Error(`CDX HTTP ${res.status}`);
  const rows = await res.json();
  return rows.slice(1).map(r => r[0]);
}

async function snapshot(ts, url) {
  // id_ — оригінальна сторінка без обгортки Wayback
  return fetchPage(`http://web.archive.org/web/${ts}id_/https://${url}`);
}

const tsToDate = ts => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const days = new Map(); // date → entry

  // вже зібране — не перекачуємо (робить повторні запуски швидкими)
  let prev = { days: [] };
  try {
    prev = JSON.parse(await readFile(path.join(DATA_DIR, 'history.json'), 'utf-8'));
  } catch {}
  const prevByDate = new Map(prev.days.map(d => [d.date, d]));

  // ── 1. Середні ціни зі снапшотів ──
  for (const page of AVG_PAGES) {
    const stamps = await cdx(page).catch(e => {
      log(`CDX ${page}: ${e.message}`);
      return [];
    });
    log(`${page}: ${stamps.length} снапшотів`);
    for (const ts of stamps) {
      const date = tsToDate(ts);
      if (prevByDate.get(date)?.avg) continue;
      if (days.has(date) && days.get(date).avg) continue;
      try {
        const html = await snapshot(ts, page);
        const { avg } = parseAverages(html);
        days.set(date, { ...(days.get(date) || {}), date, source: 'wayback', avg });
        log(`  ${date}: ДП=${avg.dp}`);
      } catch (e) {
        log(`  ${date}: пропуск (${e.message})`);
      }
      await sleep(800);
    }
  }

  // ── 2. Ціни мереж зі снапшотів detail ──
  for (const page of DETAIL_PAGES) {
    const stamps = await cdx(page).catch(() => []);
    log(`${page}: ${stamps.length} снапшотів`);
    for (const ts of stamps) {
      const date = tsToDate(ts);
      if (prevByDate.get(date)?.networks) continue;
      if (days.get(date)?.networks) continue;
      try {
        const html = await snapshot(ts, page);
        const { regions } = parseDetail(html);
        const networks = nationalNetworks(regions);
        if (!Object.keys(networks).length) throw new Error('порожньо');
        days.set(date, { ...(days.get(date) || { date, source: 'wayback' }), networks });
        log(`  ${date}: ${Object.keys(networks).length} мереж`);
      } catch (e) {
        log(`  ${date}: пропуск (${e.message})`);
      }
      await sleep(800);
    }
  }

  // ── 3. Brent: повна денна серія за 3 роки ──
  let brentByDate = new Map();
  try {
    const j = await fetch(
      'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=3y&interval=1d',
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    ).then(r => r.json());
    const res = j.chart.result[0];
    const closes = res.indicators.quote[0].close;
    res.timestamp.forEach((t, i) => {
      if (closes[i] != null)
        brentByDate.set(new Date(t * 1000).toISOString().slice(0, 10), round2(closes[i]));
    });
    log(`Brent: ${brentByDate.size} днів`);
  } catch (e) {
    log(`Brent: помилка (${e.message})`);
  }

  // ── 4. USD/UAH: період одним запитом, фолбек — по датах ──
  let usdByDate = new Map();
  try {
    const j = await fetch(
      'https://bank.gov.ua/NBU_Exchange/exchange_site?start=20240101&end=20261231&valcode=usd&sort=exchangedate&order=asc&json'
    ).then(r => r.json());
    for (const row of j) {
      const [d, m, y] = row.exchangedate.split('.');
      usdByDate.set(`${y}-${m}-${d}`, round2(row.rate ?? row.rate_per_unit));
    }
    log(`USD (період): ${usdByDate.size} днів`);
  } catch (e) {
    log(`USD період не спрацював (${e.message}), тягну по датах…`);
    for (const date of days.keys()) {
      try {
        const j = await fetch(
          `https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&date=${date.replaceAll('-', '')}&json`
        ).then(r => r.json());
        if (j?.[0]?.rate) usdByDate.set(date, round2(j[0].rate));
      } catch {}
      await sleep(300);
    }
    log(`USD (по датах): ${usdByDate.size}`);
  }

  // ── 5. Збірка history.json + factors.json ──
  for (const [date, entry] of days) {
    if (brentByDate.has(date)) entry.brent = brentByDate.get(date);
    if (usdByDate.has(date)) entry.usd = usdByDate.get(date);
  }

  let history = { days: [] };
  try {
    history = JSON.parse(await readFile(path.join(DATA_DIR, 'history.json'), 'utf-8'));
  } catch {}
  const existing = new Map(history.days.map(d => [d.date, d]));
  for (const [date, entry] of days) {
    // живі дані (minfin) мають пріоритет над архівними
    if (existing.get(date)?.source === 'minfin') continue;
    existing.set(date, { ...(existing.get(date) || {}), ...entry });
  }
  history.days = [...existing.values()].sort((a, b) => a.date.localeCompare(b.date));
  history.updated = new Date().toISOString();
  await writeFile(path.join(DATA_DIR, 'history.json'), JSON.stringify(history));
  log(`history.json: ${history.days.length} днів (${history.days[0]?.date} … ${history.days.at(-1)?.date})`);

  // Повні денні серії факторів для графіків
  const factorDates = [...new Set([...brentByDate.keys(), ...usdByDate.keys()])].sort();
  const factors = {
    updated: new Date().toISOString(),
    days: factorDates.map(d => ({
      date: d,
      ...(brentByDate.has(d) && { brent: brentByDate.get(d) }),
      ...(usdByDate.has(d) && { usd: usdByDate.get(d) }),
    })),
  };
  await writeFile(path.join(DATA_DIR, 'factors.json'), JSON.stringify(factors));
  log(`factors.json: ${factors.days.length} днів`);
}

main().catch(e => {
  console.error('ЗБІЙ:', e);
  process.exit(1);
});
