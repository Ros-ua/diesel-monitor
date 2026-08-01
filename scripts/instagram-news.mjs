// Пост новини в Instagram: картка 1080x1080 у стилі сайта + підпис.
// Логіка добору така сама, як у telegram-news.mjs — беремо новини В БІК тренду цін
// (тренд угору → новини подорожчання), щоб стрічка не суперечила сама собі.
//
//   node scripts/instagram-news.mjs --card   → public/cards/news-<дата>.jpg + news-pick.json
//   node scripts/instagram-news.mjs          → публікація (після коміту картки)
//
// env: INSTAGRAM_TOKEN. Стан — public/data/ig-news-posted.json.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { AURORA_DEFS, AURORA_RECTS } from './lib/aurora.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CARDS_DIR = path.join(ROOT, 'public', 'cards');
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards';
const API = 'https://graph.instagram.com/v23.0';
const FRESH_HOURS = 24;
const POSTED_CAP = 300;

const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f';
const MUT = '#6d8f86', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';

const token = process.env.INSTAGRAM_TOKEN;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

// Instagram качає й обробляє картинку асинхронно: публікувати можна лише коли
// контейнер став FINISHED, інакше — «media is not ready for publishing».
export async function waitReady(id, tok, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const st = await fetch(
      `${API}/${id}?fields=status_code,status&access_token=${tok}`
    ).then(r => r.json());
    if (st.status_code === 'FINISHED') return;
    if (st.status_code === 'ERROR') throw new Error(`контейнер: ${st.status ?? 'ERROR'}`);
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error('контейнер не став готовим за 60 с');
}

// ── тренд цін: у який бік постимо новини (та сама логіка, що в Telegram) ──
const TREND_DAYS = 14;
const TREND_PCT = 1;

function allowedImpacts(history) {
  const days = (history?.days ?? []).filter(d => d.avg?.dp !== undefined);
  if (days.length < 2) return { allowed: ['up', 'down'], dir: 'flat' };
  const last = days[days.length - 1];
  const target = new Date(last.date).getTime() - TREND_DAYS * 86_400_000;
  let base = null, best = Infinity;
  for (let i = days.length - 2; i >= 0; i--) {
    const dist = Math.abs(new Date(days[i].date).getTime() - target);
    if (dist < best) { best = dist; base = days[i]; }
    if (new Date(days[i].date).getTime() < target) break;
  }
  if (!base || best > 25 * 86_400_000) return { allowed: ['up', 'down'], dir: 'flat' };
  const pct = ((last.avg.dp - base.avg.dp) / base.avg.dp) * 100;
  if (pct >= TREND_PCT) return { allowed: ['up'], dir: 'up', pct };
  if (pct <= -TREND_PCT) return { allowed: ['down'], dir: 'down', pct };
  return { allowed: ['up', 'down'], dir: 'flat', pct };
}

// Українські джерела мають пріоритет: свій ринок ближчий читачу, ніж танкери.
// (На САЙТІ показуємо всі новини — пріоритет лише для соцмереж.)
const UA_SOURCES = new Set(['Економічна правда', 'УНІАН', 'Укрінформ', 'РБК-Україна']);
const isUa = n => UA_SOURCES.has(n.source);

// Щоб не в кожному пості стояв дизель — чергуємо види пального. Показуємо те,
// що зараз найсильніше дорожчає, але не те саме, що минулого разу.
const FUEL_LABELS = { dp: 'Дизель', a95p: 'А-95+', a95: 'А-95', a92: 'А-92', gas: 'Автогаз' };

// Для картки «де найдешевше» потрібен вибір мереж, інакше вийде порожньо
// (А-92, наприклад, продає лише кілька мереж).
function netCount(latest, fuel) {
  return Object.values(latest?.networks ?? {})
    .filter(v => v?.[fuel] !== undefined && (v.regionCount ?? 0) >= 3).length;
}

function pickFuelForCheapest(latest, lastFuel) {
  const rich = Object.keys(FUEL_LABELS).filter(k => netCount(latest, k) >= 4);
  if (!rich.length) return null;
  return rich.find(k => k !== lastFuel) ?? rich[0];
}

function pickFuel(latest, lastFuel) {
  const keys = Object.keys(FUEL_LABELS).filter(k => latest?.avg?.[k] !== undefined);
  if (!keys.length) return null;
  const ch = k => latest.avgChange?.[k] ?? 0;
  // спершу те, що дорожчає найсильніше; якщо дешевшає все — найбільший рух
  const anyUp = keys.some(k => ch(k) > 0.005);
  const sorted = anyUp
    ? [...keys].sort((a, b) => ch(b) - ch(a))
    : [...keys].sort((a, b) => Math.abs(ch(b)) - Math.abs(ch(a)));
  return sorted.find(k => k !== lastFuel) ?? sorted[0];
}

// Воєнний контент в Instagram не постимо взагалі — модерація Meta до нього
// сувора, а молодий акаунт одного страйку може не пережити (перший наш акаунт
// забанили за добу). У Telegram такі новини лишаються — там цього обмеження немає.
const WAR = [
  /(удар|атак|обстріл|бомбард|ракет|дрон|безпілотник)\w*/i,
  /(вибух|загибл|поранен|жертв|окупант|фронт|наступ|бойов)\w*/i,
  /(війн|воєнн|військов)\w*/i,
];
const isWar = n => WAR.some(re => re.test(`${n.title ?? ''} ${n.summary ?? ''}`));

// Новини, де Україна подана як винуватець, у наш акаунт не йдуть: під нашим
// логотипом це читається як ми транслюємо звинувачення проти своїх.
const RISKY_UA = [
  // Україну в чомусь звинувачують
  /звинувач\w*[^.]{0,40}україн/i,
  /україн\w*[^.]{0,30}звинувач/i,
  /обвиня\w*[^.]{0,40}украин/i,
  /украин\w*[^.]{0,30}обвиня/i,
  // Україна подана як той, хто атакує (у будь-якому порядку слів)
  /україн\w*[^.]{0,40}(атак|удар|обстріл|бомб|потопи|підірва)/i,
  /(атак|удар|обстріл|напад)\w*[^.]{0,40}україн\w*[^.]{0,40}(судн|танкер|корабл|об.єкт)/i,
  /українськ\w*[^.]{0,30}(дрон|безпілотник|ракет)\w*[^.]{0,30}(атак|удар|вразил|поціл)/i,
  // заклики/вимоги до України припинити щось — той самий підтекст
  /(закликал|вимага|поперед)\w*[^.]{0,30}україн\w*[^.]{0,30}не\s/i,
];
const riskyForUa = n =>
  RISKY_UA.some(re => re.test(`${n.title ?? ''} ${n.summary ?? ''}`));

// ── перенос тексту по словах (у SVG немає авто-переносу) ──
// Courier New моноширинний: ширина символа ≈ 0.6 від кегля.
const CHAR_W = 0.6;
const TEXT_W = 940; // 70…1010

function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  let cut = false;
  for (const w of words) {
    if (!line) { line = w; continue; }
    if ((line + ' ' + w).length <= maxChars) line += ' ' + w;
    else {
      lines.push(line);
      line = w;
      if (lines.length === maxLines) { cut = true; break; }
    }
  }
  if (lines.length < maxLines && line) lines.push(line);
  if (cut) lines[maxLines - 1] = lines[maxLines - 1].replace(/\s+\S*$/, '') + '…';
  return lines;
}

// Підбирає найбільший кегль, за якого текст влазить у maxLines рядків.
function fit(text, sizes, maxLines) {
  for (const size of sizes) {
    const maxChars = Math.floor(TEXT_W / (size * CHAR_W));
    const lines = wrap(text, maxChars, maxLines);
    const fits = lines.every(l => l.length <= maxChars) && !lines.at(-1)?.endsWith('…');
    if (fits) return { size, lines };
  }
  const size = sizes.at(-1);
  return { size, lines: wrap(text, Math.floor(TEXT_W / (size * CHAR_W)), maxLines) };
}

function newsCardSvg(item, latest, fuel) {
  const W = 1080, H = 1080;
  const up = item.impact !== 'down';
  const col = up ? RED : AC;
  const badge = up ? 'ЦІНИ ВГОРУ' : 'ЦІНИ ВНИЗ';
  const arrow = up ? '▲' : '▼';

  const { size: titleSize, lines: title } = fit(item.title, [60, 54, 48, 44, 40], 5);
  const titleTop = 370;

  let summary = (item.summary || '').trim();
  if (summary && item.title && summary.startsWith(item.title.slice(0, 40))) summary = '';
  const sumSize = 30;
  const sum = summary ? wrap(summary, Math.floor(TEXT_W / (sumSize * CHAR_W)), 3) : [];
  const sumTop = titleTop + title.length * (titleSize + 12) + 36;

  // блок «що це означає для нас» — новина без наших цифр не має цінності
  const fmt = v => v.toFixed(2).replace('.', ',');
  const price = fuel ? latest?.avg?.[fuel] : undefined;
  const ch = fuel ? latest?.avgChange?.[fuel] : undefined;
  const factsBox = price === undefined ? '' : (() => {
    const chUp = ch !== undefined && ch > 0.005;
    const chDown = ch !== undefined && ch < -0.005;
    const chCol = chUp ? RED : chDown ? AC : MUT;
    const chTxt = ch === undefined ? ''
      : chUp ? `▲ +${fmt(ch)}` : chDown ? `▼ −${fmt(Math.abs(ch))}` : '→ 0,00';
    return `
  <rect x="70" y="790" width="940" height="120" rx="18" fill="${BG}" stroke="${LINE}" stroke-width="2"/>
  <text x="106" y="838" font-family="'Courier New',monospace" font-size="26" fill="${MUT}">${esc(FUEL_LABELS[fuel])} в Україні зараз</text>
  <text x="106" y="890" font-family="'Courier New',monospace" font-size="46" font-weight="bold" fill="${AC}">${fmt(price)} грн/л</text>
  <text x="974" y="884" font-family="'Courier New',monospace" font-size="38" font-weight="bold" fill="${chCol}" text-anchor="end">${chTxt}</text>`;
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${AURORA_DEFS}
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
  ${AURORA_RECTS}
  <circle cx="78" cy="92" r="9" fill="${AC}"/>
  <text x="100" y="102" font-family="'Courier New',monospace" font-size="32" letter-spacing="6" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>

  <rect x="70" y="190" width="${badge.length * 26 + 90}" height="76" rx="16" fill="${col}" opacity="0.14"/>
  <text x="100" y="242" font-family="'Courier New',monospace" font-size="38" font-weight="bold" fill="${col}">${arrow} ${badge}</text>

  ${title.map((l, i) => `<text x="70" y="${titleTop + i * (titleSize + 14)}" font-family="'Courier New',monospace" font-size="${titleSize}" font-weight="bold" fill="${TXT}">${esc(l)}</text>`).join('\n  ')}

  ${sum.map((l, i) => `<text x="70" y="${sumTop + i * (sumSize + 12)}" font-family="'Courier New',monospace" font-size="${sumSize}" fill="${MUT}">${esc(l)}</text>`).join('\n  ')}
  ${factsBox}

  <text x="70" y="1000" font-family="'Courier New',monospace" font-size="28" fill="${MUT}">${esc(item.source ?? '')}</text>
  <text x="1010" y="1000" font-family="'Courier New',monospace" font-size="28" fill="${AC}" text-anchor="end">diesel-monitor.pp.ua</text>
</svg>`;
}

// Коли свіжих безпечних новин немає (буває часто — потік буває воєнним),
// акаунт не мовчить: постимо корисний факт із наших даних — де сьогодні
// найдешевше. Це рівно те, що аудиторія й шукає.
function cheapestCardSvg(latest, fuel) {
  const W = 1080, H = 1080;
  const fmt = v => v.toFixed(2).replace('.', ',');
  const label = FUEL_LABELS[fuel] ?? 'Пальне';

  const rows = Object.entries(latest.networks ?? {})
    .filter(([, v]) => v?.[fuel] !== undefined && (v.regionCount ?? 0) >= 3)
    .map(([name, v]) => ({ name, price: v[fuel] }))
    .sort((a, b) => a.price - b.price)
    .slice(0, 5);

  const avg = latest.avg?.[fuel];
  const [y, m, d] = (latest.date ?? '').split('-');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${AURORA_DEFS}
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
  ${AURORA_RECTS}
  <circle cx="78" cy="92" r="9" fill="${AC}"/>
  <text x="100" y="102" font-family="'Courier New',monospace" font-size="32" letter-spacing="6" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>
  <text x="1010" y="102" font-family="'Courier New',monospace" font-size="28" fill="${MUT}" text-anchor="end">${d}.${m}.${y}</text>

  <text x="70" y="230" font-family="'Courier New',monospace" font-size="58" font-weight="bold" fill="${TXT}">Де сьогодні</text>
  <text x="70" y="300" font-family="'Courier New',monospace" font-size="58" font-weight="bold" fill="${TXT}">найдешевший</text>
  <text x="70" y="370" font-family="'Courier New',monospace" font-size="58" font-weight="bold" fill="${AC}">${esc(label)}</text>

  ${rows.map((r, i) => {
    const y0 = 470 + i * 96;
    const win = i === 0;
    return `
  <text x="70" y="${y0}" font-family="'Courier New',monospace" font-size="${win ? 44 : 38}" fill="${win ? AC : TXT}">${i + 1}. ${esc(r.name.slice(0, 18))}</text>
  <text x="1010" y="${y0}" font-family="'Courier New',monospace" font-size="${win ? 50 : 42}" font-weight="bold" fill="${win ? AC : TXT}" text-anchor="end">${fmt(r.price)}</text>
  ${i < rows.length - 1 ? `<line x1="70" y1="${y0 + 26}" x2="1010" y2="${y0 + 26}" stroke="${LINE}" stroke-width="1"/>` : ''}`;
  }).join('')}

  ${avg === undefined ? '' : `<text x="70" y="985" font-family="'Courier New',monospace" font-size="30" fill="${MUT}">Середня: ${fmt(avg)} грн/л</text>`}
  <text x="1010" y="985" font-family="'Courier New',monospace" font-size="28" fill="${AC}" text-anchor="end">diesel-monitor.pp.ua</text>
</svg>`;
}

// ── вибір новини + картка ──
async function buildCard() {
  const news = await readJson('news.json');
  const history = await readJson('history.json', { days: [] });
  const state = await readJson('ig-news-posted.json', { urls: [] });
  const posted = new Set(state.urls ?? []);
  const { allowed, dir } = allowedImpacts(history);
  const freshAfter = Date.now() - FRESH_HOURS * 3_600_000;

  const fresh = (news?.items ?? []).filter(
    n => allowed.includes(n.impact) && n.url && !posted.has(n.url) && n.title
      && n.publishedAt && new Date(n.publishedAt).getTime() >= freshAfter
  );
  const risky = fresh.filter(riskyForUa);
  const war = fresh.filter(n => !riskyForUa(n) && isWar(n));
  if (risky.length) console.log(`ig-news: відсіяно як ризиковані для UA: ${risky.length}`);
  if (war.length) console.log(`ig-news: відсіяно воєнних (модерація Instagram): ${war.length}`);

  const safe = fresh.filter(n => !riskyForUa(n) && !isWar(n));
  const byDate = (a, b) => b.publishedAt.localeCompare(a.publishedAt);
  // спершу українські джерела, світові — лише коли своїх немає
  const ukr = safe.filter(isUa).sort(byDate);
  const world = safe.filter(n => !isUa(n)).sort(byDate);
  const pick = ukr[0] ?? world[0];
  if (pick) console.log(`ig-news: обрано ${isUa(pick) ? 'українську' : 'світову'} новину (укр у черзі: ${ukr.length})`);

  const latest = await readJson('latest.json');
  const fuel = pickFuel(latest, state.lastFuel);

  // новин немає — постимо корисний факт із наших даних
  if (!pick) {
    console.log(`ig-news: безпечних новин у напрямі тренду (${dir}) немає — постимо «де найдешевше»`);
    const cheapFuel = pickFuelForCheapest(latest, state.lastFuel);
    if (!latest?.networks || !cheapFuel) {
      await writeFile(path.join(DATA_DIR, 'ig-news-pick.json'), JSON.stringify({ skip: true }));
      return;
    }
    const sharp0 = (await import('sharp')).default;
    const jpg0 = await sharp0(Buffer.from(cheapestCardSvg(latest, cheapFuel))).jpeg({ quality: 92 }).toBuffer();
    const today0 = new Date().toISOString().slice(0, 10);
    const file0 = `cheap-${today0}.jpg`;
    await mkdir(CARDS_DIR, { recursive: true });
    await writeFile(path.join(CARDS_DIR, file0), jpg0);
    await writeFile(
      path.join(DATA_DIR, 'ig-news-pick.json'),
      JSON.stringify({ kind: 'cheapest', fuel: cheapFuel, file: file0, url: `cheapest:${today0}:${cheapFuel}` })
    );
    console.log(`ig-news: картка «де найдешевший ${FUEL_LABELS[cheapFuel]}» (${netCount(latest, cheapFuel)} мереж)`);
    return;
  }
  const sharp = (await import('sharp')).default;
  const jpg = await sharp(Buffer.from(newsCardSvg(pick, latest, fuel))).jpeg({ quality: 92 }).toBuffer();

  const today = new Date().toISOString().slice(0, 10);
  const file = `news-${today}.jpg`;
  await mkdir(CARDS_DIR, { recursive: true });
  await writeFile(path.join(CARDS_DIR, file), jpg);
  await writeFile(path.join(DATA_DIR, 'ig-news-pick.json'), JSON.stringify({ ...pick, file, fuel }));
  console.log(`ig-news: пальне в блоці — ${FUEL_LABELS[fuel] ?? '—'} (минулого разу ${FUEL_LABELS[state.lastFuel] ?? '—'})`);

  const old = (await readdir(CARDS_DIR)).filter(f => f.startsWith('news-')).sort().slice(0, -7);
  for (const f of old) await unlink(path.join(CARDS_DIR, f));

  console.log(`ig-news: картка ${file} для «${pick.title.slice(0, 60)}»`);
}

// ── публікація ──
async function publish() {
  if (!token) return console.log('ig-news: INSTAGRAM_TOKEN не заданий — пропускаю');

  const pick = await readJson('ig-news-pick.json');
  if (!pick || pick.skip) return console.log('ig-news: немає що постити');

  const state = await readJson('ig-news-posted.json', { urls: [] });
  const posted = new Set(state.urls ?? []);
  if (posted.has(pick.url) && process.env.IG_FORCE !== '1')
    return console.log('ig-news: цю новину вже постили');

  const me = await fetch(`${API}/me?fields=id,username&access_token=${token}`).then(r => r.json());
  if (!me.id) throw new Error(`me: ${JSON.stringify(me)}`);

  const latest = await readJson('latest.json');
  const f = v => v.toFixed(2).replace('.', ',');

  const SITE_LINE = 'diesel-monitor.pp.ua (посилання в шапці профілю)';
  let caption;

  if (pick.kind === 'cheapest') {
    // картка «де найдешевше» — коли безпечних новин не знайшлося
    const label = FUEL_LABELS[pick.fuel] ?? 'Пальне';
    const top = Object.entries(latest?.networks ?? {})
      .filter(([, v]) => v?.[pick.fuel] !== undefined && (v.regionCount ?? 0) >= 3)
      .map(([name, v]) => ({ name, price: v[pick.fuel] }))
      .sort((a, b) => a.price - b.price)
      .slice(0, 3);
    const tag = label.toLowerCase().replace(/[^а-яїієґa-z0-9]/gi, '');
    caption =
      `⛽ Де сьогодні найдешевший ${label.toLowerCase()}\n\n` +
      top.map((r, i) => `${i + 1}. ${r.name} — ${f(r.price)} грн/л`).join('\n') +
      (latest?.avg?.[pick.fuel] !== undefined
        ? `\n\nСередня по Україні: ${f(latest.avg[pick.fuel])} грн/л`
        : '') +
      `\n\nЦіни по всіх мережах і областях — ${SITE_LINE}\n\n` +
      `#цінинапальне #пальне #АЗС #${tag} #Україна`;
  } else {
    const up = pick.impact !== 'down';

    // привʼязуємо новину до наших цифр: головним — те пальне, що на картці
    let facts = '';
    const fuel = pick.fuel && latest?.avg?.[pick.fuel] !== undefined ? pick.fuel : 'dp';
    if (latest?.avg?.[fuel] !== undefined) {
      const ch = latest.avgChange?.[fuel];
      const chTxt = ch === undefined || Math.abs(ch) < 0.005 ? ''
        : ch > 0 ? ` (за тиждень +${f(ch)})` : ` (за тиждень −${f(Math.abs(ch))})`;
      const others = Object.entries(FUEL_LABELS)
        .filter(([k]) => k !== fuel && latest.avg[k] !== undefined)
        .slice(0, 3)
        .map(([k, label]) => `${label} ${f(latest.avg[k])}`)
        .join(' · ');
      facts =
        `📊 Що зараз в Україні:\n` +
        `${FUEL_LABELS[fuel]} ${f(latest.avg[fuel])} грн/л${chTxt}\n` +
        (others ? `${others}\n` : '') +
        `\n`;
    }

    caption =
      `${up ? '🔺' : '🟢'} ${pick.title}\n\n` +
      (pick.summary ? `${pick.summary.slice(0, 300).replace(/\s+\S*$/, '')}…\n\n` : '') +
      facts +
      `Джерело: ${pick.source}\n\n` +
      `Ціни по всіх мережах АЗС і областях — ${SITE_LINE}\n\n` +
      `#цінинапальне #пальне #АЗС #дизель #Україна`;
  }

  const create = await fetch(`${API}/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: `${RAW}/${pick.file}`, caption, access_token: token }),
  }).then(r => r.json());
  if (!create.id) throw new Error(`media: ${JSON.stringify(create)}`);

  await waitReady(create.id, token);

  const pub = await fetch(`${API}/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }).then(r => r.json());
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);

  posted.add(pick.url);
  await writeFile(
    path.join(DATA_DIR, 'ig-news-posted.json'),
    JSON.stringify({
      urls: [...posted].slice(-POSTED_CAP),
      lastFuel: pick.fuel ?? state.lastFuel, // щоб наступного разу взяти інше пальне
      updated: new Date().toISOString(),
    })
  );
  console.log(`ig-news: опубліковано «${pick.title.slice(0, 60)}» (media ${pub.id})`);
}

// запускаємо лише при прямому виклику — instagram-post.mjs імпортує звідси waitReady
if (process.argv[1]?.endsWith('instagram-news.mjs')) {
  const mode = process.argv[2];
  (mode === '--card' ? buildCard() : publish()).catch(e => {
    console.error('ig-news ЗБІЙ:', e.message);
    process.exit(1);
  });
}
