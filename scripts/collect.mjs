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

// --news-only: легкий режим для частого запуску — лише RSS-новини, без цін
const newsOnly = process.argv.includes('--news-only');

async function main() {
  await mkdir(DATA_DIR, { recursive: true });
  const today = kyivToday();
  log(`Збір за ${today}${newsOnly ? ' (лише новини)' : ''}`);

  const [detailHtml, avgHtml, nbu, nbuEur, brentJson, news] = await Promise.all([
    newsOnly ? null : retry('minfin-detail', () => fetchPage(DETAIL_URL)),
    newsOnly ? null : retry('minfin-avg', () => fetchPage(AVG_URL)),
    newsOnly ? null : retry('nbu', () => fetch(NBU_URL).then(r => r.json())),
    newsOnly ? null : retry('nbu-eur', () => fetch(NBU_EUR_URL).then(r => r.json())),
    newsOnly
      ? null
      : retry('brent', () =>
          fetch(BRENT_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } }).then(r => r.json())
        ),
    retry('news', () => collectNews()),
  ]);

  // Розбивка по мережах і областях — необовʼязкова. Мінфін 29.07.2026 прибрав
  // сторінку /detail/ (віддає порожню оболонку без таблиць), і якщо через це
  // валити весь збір, ми втратимо ще й середні ціни, які досі доступні.
  let detail = null;
  if (detailHtml) {
    try {
      detail = parseDetail(detailHtml);
    } catch (e) {
      log(`УВАГА: розбивку по мережах не розібрано (${e.message}) — беремо лише середні`);
    }
  }
  const averages = avgHtml ? parseAverages(avgHtml) : null;
  const usd = round2(nbu?.[0]?.rate ?? null);
  const eur = round2(nbuEur?.[0]?.rate ?? null);
  const brentCloses = brentJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter(v => v != null);
  const brent = round2(brentCloses?.length ? brentCloses[brentCloses.length - 1] : null);

  if (!newsOnly && !averages && !detail)
    throw new Error('Жодне джерело цін недоступне — історію не оновлено');

  const networks = detail ? nationalNetworks(detail.regions) : null;

  // Дата даних — зі сторінки мінфіну (вона оновлюється ~опівдні за Києвом;
  // вранці сторінка ще показує вчорашні ціни, і їх треба писати під вчорашньою датою)
  const pageDate = averages?.date ? averages.date.split('.').reverse().join('-') : today;
  if (pageDate !== today) log(`Увага: мінфін ще показує дані за ${pageDate}`);

  // ── history.json: одна точка на день ──
  if (!newsOnly) {
    const history = await readJson('history.json', { days: [] });
    const entry = {
      date: pageDate,
      source: 'minfin',
      ...(averages && { avg: averages.avg }),
      ...(networks && { networks }),
      ...(usd !== null && { usd }),
      ...(brent !== null && { brent }),
    };
    const idx = history.days.findIndex(d => d.date === pageDate);
    if (idx >= 0) history.days[idx] = { ...history.days[idx], ...entry };
    else history.days.push(entry);
    history.days.sort((a, b) => a.date.localeCompare(b.date));
    history.updated = new Date().toISOString();
    await writeFile(path.join(DATA_DIR, 'history.json'), JSON.stringify(history));
    log(`history.json: ${history.days.length} днів`);
  }

  // ── latest.json: повний поточний зріз ──
  if (detail || averages) {
    // Якщо розбивки цього разу немає — лишаємо попередню разом із датою, коли
    // її востаннє бачили. Інакше 200+ SEO-сторінок і карта мереж просто зникнуть
    // із сайту, а це гірше за трохи застарілі цифри з чесною позначкою.
    const prev = await readJson('latest.json', null);
    const keepNetworks = networks ?? prev?.networks;
    const keepRegions = detail?.regions ?? prev?.regions;
    const breakdownDate = detail ? pageDate : prev?.breakdownDate ?? prev?.date;

    const latest = {
      date: pageDate,
      collectedAt: new Date().toISOString(),
      ...(averages && { avg: averages.avg, avgChange: averages.change }),
      ...(keepNetworks && { networks: keepNetworks }),
      ...(keepRegions && { regions: keepRegions }),
      // дата розбивки може відставати від дати середніх цін — показуємо чесно
      ...(breakdownDate && { breakdownDate }),
      ...(usd !== null && { usd }),
      ...(eur !== null && { eur }),
      ...(brent !== null && { brent }),
    };
    await writeFile(path.join(DATA_DIR, 'latest.json'), JSON.stringify(latest));
    log(
      `latest.json: ${keepNetworks ? Object.keys(keepNetworks).length : 0} мереж, ` +
        `${keepRegions ? Object.keys(keepRegions).length : 0} областей` +
        (detail ? '' : ` (розбивка за ${breakdownDate} — джерело недоступне)`)
    );
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

  // ── news.json: архів накопичується — свіжі зливаються зі збереженими ──
  if (news?.items?.length) {
    const NEWS_CAP = 150;
    const oldNews = await readJson('news.json', { items: [] });
    const byUrl = new Map();
    // свіжа версія новини має пріоритет над збереженою (могла оновитись класифікація)
    for (const item of [...news.items, ...oldNews.items]) {
      if (item?.url && !byUrl.has(item.url)) byUrl.set(item.url, item);
    }
    const merged = [...byUrl.values()]
      .sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''))
      .slice(0, NEWS_CAP);
    await writeFile(
      path.join(DATA_DIR, 'news.json'),
      JSON.stringify({ updated: new Date().toISOString(), items: merged })
    );
    log(`news.json: +${news.items.length} свіжих, в архіві ${merged.length}${news.errors.length ? `, помилки: ${news.errors.join('; ')}` : ''}`);
  }

  // ── журнал запусків (лише повний збір) ──
  if (!newsOnly) {
    const runlog = await readJson('collect-log.json', { runs: [] });
    runlog.runs.push({
      at: new Date().toISOString(),
      ok: { detail: !!detail, averages: !!averages, usd: usd !== null, brent: brent !== null, news: !!news?.items?.length },
    });
    runlog.runs = runlog.runs.slice(-100);
    await writeFile(path.join(DATA_DIR, 'collect-log.json'), JSON.stringify(runlog));
  }

  log('Готово');
}

main().catch(e => {
  console.error('ЗБІЙ:', e);
  process.exit(1);
});
