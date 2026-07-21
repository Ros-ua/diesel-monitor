// Щоденний збирач: тягне поточні ціни (minfin), курс USD (НБУ), Brent (Yahoo),
// новини (RSS) і дописує історію у public/data/*.json.
// Запуск: node scripts/collect.mjs  (локально або з GitHub Actions за розкладом)

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPage, parseDetail, parseAverages, nationalNetworks } from './lib/minfin.mjs';
import { collectNews } from './lib/news.mjs';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const DETAIL_URL = 'https://index.minfin.com.ua/ua/markets/fuel/detail/';
const AVG_URL = 'https://index.minfin.com.ua/ua/markets/fuel/';
const NBU_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json';
const NBU_EUR_URL = 'https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=EUR&json';
const BRENT_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?range=5d&interval=1d';

const log = (...a) => console.log(new Date().toISOString(), ...a);

async function retry(name, fn, tries = 3) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      log(`ПОМИЛКА [${name}] спроба ${i}/${tries}: ${e.message}`);
      if (i === tries) return null;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

function kyivToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

const round2 = v => (v === null || v === undefined ? null : Math.round(v * 100) / 100);

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const today = kyivToday();
  log(`Збір за ${today}`);

  const [detailHtml, avgHtml, nbu, nbuEur, brentJson, news] = await Promise.all([
    retry('minfin-detail', () => fetchPage(DETAIL_URL)),
    retry('minfin-avg', () => fetchPage(AVG_URL)),
    retry('nbu', () => fetch(NBU_URL).then(r => r.json())),
    retry('nbu-eur', () => fetch(NBU_EUR_URL).then(r => r.json())),
    retry('brent', () =>
      fetch(BRENT_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json())
    ),
    retry('news', () => collectNews()),
  ]);

  const detail = detailHtml ? parseDetail(detailHtml) : null;
  const averages = avgHtml ? parseAverages(avgHtml) : null;
  const usd = round2(nbu?.[0]?.rate ?? null);
  const eur = round2(nbuEur?.[0]?.rate ?? null);
  const brentCloses = brentJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(v => v != null);
  const brent = round2(brentCloses?.length ? brentCloses[brentCloses.length - 1] : null);

  if (!averages && !detail) throw new Error('Жодне джерело цін недоступне — історію не оновлено');

  const networks = detail ? nationalNetworks(detail.regions) : null;

  // ── history.json: одна точка на день ──
  const history = await readJson('history.json', { days: [] });
  const entry = {
    date: today,
    source: 'minfin',
    ...(averages && { avg: averages.avg }),
    ...(networks && { networks }),
    ...(usd !== null && { usd }),
    ...(brent !== null && { brent }),
  };
  const idx = history.days.findIndex(d => d.date === today);
  if (idx >= 0) history.days[idx] = { ...history.days[idx], ...entry };
  else history.days.push(entry);
  history.days.sort((a, b) => a.date.localeCompare(b.date));
  history.updated = new Date().toISOString();
  await writeFile(path.join(DATA_DIR, 'history.json'), JSON.stringify(history));
  log(`history.json: ${history.days.length} днів`);

  // ── latest.json: повний поточний зріз ──
  if (detail || averages) {
    const latest = {
      date: today,
      collectedAt: new Date().toISOString(),
      ...(averages && { avg: averages.avg, avgChange: averages.change }),
      ...(networks && { networks }),
      ...(detail && { regions: detail.regions }),
      ...(usd !== null && { usd }),
      ...(eur !== null && { eur }),
      ...(brent !== null && { brent }),
    };
    await writeFile(path.join(DATA_DIR, 'latest.json'), JSON.stringify(latest));
    log(`latest.json: ${networks ? Object.keys(networks).length : 0} мереж, ${detail ? Object.keys(detail.regions).length : 0} областей`);
  }

  // ── factors.json: дописуємо сьогоднішні Brent/USD, щоб панель чинників не відставала ──
  if (usd !== null || brent !== null) {
    const factors = await readJson('factors.json', { days: [] });
    const fidx = factors.days.findIndex(d => d.date === today);
    const fentry = {
      ...(fidx >= 0 ? factors.days[fidx] : { date: today }),
      ...(usd !== null && { usd }),
      ...(brent !== null && { brent }),
    };
    if (fidx >= 0) factors.days[fidx] = fentry;
    else factors.days.push(fentry);
    factors.days.sort((a, b) => a.date.localeCompare(b.date));
    factors.updated = new Date().toISOString();
    await writeFile(path.join(DATA_DIR, 'factors.json'), JSON.stringify(factors));
  }

  // ── news.json ──
  if (news?.items?.length) {
    await writeFile(
      path.join(DATA_DIR, 'news.json'),
      JSON.stringify({ updated: new Date().toISOString(), items: news.items })
    );
    log(`news.json: ${news.items.length} новин${news.errors.length ? `, помилки: ${news.errors.join('; ')}` : ''}`);
  }

  // ── журнал запусків ──
  const runlog = await readJson('collect-log.json', { runs: [] });
  runlog.runs.push({
    at: new Date().toISOString(),
    ok: { detail: !!detail, averages: !!averages, usd: usd !== null, brent: brent !== null, news: !!news?.items?.length },
  });
  runlog.runs = runlog.runs.slice(-100);
  await writeFile(path.join(DATA_DIR, 'collect-log.json'), JSON.stringify(runlog));

  log('Готово');
}

main().catch(e => {
  console.error('ЗБІЙ:', e);
  process.exit(1);
});
