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
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CARDS_DIR = path.join(ROOT, 'public', 'cards');
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards';
const API = 'https://graph.instagram.com/v23.0';
const FRESH_HOURS = 24;
const POSTED_CAP = 300;

const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f';
const MUT = '#5a7a72', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';

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

// Новини, де Україна подана як винуватець, у наш акаунт не йдуть: під нашим
// логотипом це читається як ми транслюємо звинувачення проти своїх.
const RISKY_UA = [
  /звинувач\w*[^.]{0,40}україн/i,
  /україн\w*[^.]{0,30}звинувач/i,
  /обвиня\w*[^.]{0,40}украин/i,
  /украин\w*[^.]{0,30}обвиня/i,
  /(атак|удар|напад)\w*[^.]{0,25}україн\w*[^.]{0,25}(судн|танкер|об.єкт)/i,
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

function newsCardSvg(item, latest) {
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
  const dp = latest?.avg?.dp;
  const ch = latest?.avgChange?.dp;
  const factsBox = dp === undefined ? '' : (() => {
    const chUp = ch !== undefined && ch > 0.005;
    const chDown = ch !== undefined && ch < -0.005;
    const chCol = chUp ? RED : chDown ? AC : MUT;
    const chTxt = ch === undefined ? ''
      : chUp ? `▲ +${fmt(ch)}` : chDown ? `▼ −${fmt(Math.abs(ch))}` : '→ 0,00';
    return `
  <rect x="70" y="790" width="940" height="120" rx="18" fill="${BG}" stroke="${LINE}" stroke-width="2"/>
  <text x="106" y="838" font-family="'Courier New',monospace" font-size="26" fill="${MUT}">Дизель в Україні зараз</text>
  <text x="106" y="890" font-family="'Courier New',monospace" font-size="46" font-weight="bold" fill="${AC}">${fmt(dp)} грн/л</text>
  <text x="974" y="884" font-family="'Courier New',monospace" font-size="38" font-weight="bold" fill="${chCol}" text-anchor="end">${chTxt}</text>`;
  })();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
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
  if (risky.length) console.log(`ig-news: відсіяно як ризиковані для UA: ${risky.length}`);

  const pick = fresh
    .filter(n => !riskyForUa(n))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];

  if (!pick) {
    console.log(`ig-news: свіжих новин у напрямі тренду (${dir}) немає — пропускаю`);
    await writeFile(path.join(DATA_DIR, 'ig-news-pick.json'), JSON.stringify({ skip: true }));
    return;
  }

  const latest = await readJson('latest.json');
  const sharp = (await import('sharp')).default;
  const jpg = await sharp(Buffer.from(newsCardSvg(pick, latest))).jpeg({ quality: 92 }).toBuffer();

  const today = new Date().toISOString().slice(0, 10);
  const file = `news-${today}.jpg`;
  await mkdir(CARDS_DIR, { recursive: true });
  await writeFile(path.join(CARDS_DIR, file), jpg);
  await writeFile(path.join(DATA_DIR, 'ig-news-pick.json'), JSON.stringify({ ...pick, file }));

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

  const up = pick.impact !== 'down';
  const latest = await readJson('latest.json');
  const f = v => v.toFixed(2).replace('.', ',');

  // головне: одразу привʼязуємо світову новину до наших цифр
  let facts = '';
  if (latest?.avg?.dp !== undefined) {
    const ch = latest.avgChange?.dp;
    const chTxt = ch === undefined || Math.abs(ch) < 0.005 ? ''
      : ch > 0 ? ` (за тиждень +${f(ch)})` : ` (за тиждень −${f(Math.abs(ch))})`;
    facts =
      `📊 Що зараз в Україні:\n` +
      `Дизель ${f(latest.avg.dp)} грн/л${chTxt}\n` +
      (latest.avg.a95 !== undefined ? `А-95 ${f(latest.avg.a95)} грн/л\n` : '') +
      `\n`;
  }

  const caption =
    `${up ? '🔺' : '🟢'} ${pick.title}\n\n` +
    (pick.summary ? `${pick.summary.slice(0, 300).replace(/\s+\S*$/, '')}…\n\n` : '') +
    facts +
    `Джерело: ${pick.source}\n\n` +
    `Ціни по всіх мережах АЗС і областях — diesel-monitor.pp.ua (посилання в шапці профілю)\n\n` +
    `#цінинапальне #пальне #АЗС #дизель #Україна`;

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
    JSON.stringify({ urls: [...posted].slice(-POSTED_CAP), updated: new Date().toISOString() })
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
