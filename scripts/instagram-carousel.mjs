// Карусель цін для Instagram: 5 слайдів замість однієї картинки.
//
// Навіщо: час перегляду — головний сигнал для алгоритму, а гортання слайдів
// тримає людину в пості вдесятеро довше за одну картинку. Плюс кожен слайд
// відповідає на своє питання, тож пост стає корисним, а не просто гарним.
//
//   node scripts/instagram-carousel.mjs --cards  → public/cards/car-<дата>-N.jpg + ig-carousel.json
//   node scripts/instagram-carousel.mjs          → публікація (після коміту картинок)
//
// env: INSTAGRAM_TOKEN. Стан — public/data/ig-carousel.json.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AURORA_DEFS, AURORA_RECTS } from './lib/aurora.mjs';
import { pickHashtags, standoutRegion } from './lib/hashtags.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CARDS_DIR = path.join(ROOT, 'public', 'cards');
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards';
const API = 'https://graph.instagram.com/v23.0';

const W = 1080, H = 1080;
const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f';
const MUT = '#6d8f86', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';

const token = process.env.INSTAGRAM_TOKEN;
const fmt = v => v.toFixed(2).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FUELS = [
  ['Дизель', 'dp'],
  ['А-95+', 'a95p'],
  ['А-95', 'a95'],
  ['А-92', 'a92'],
  ['Автогаз', 'gas'],
];

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

// спільна «рамка» слайда: фон, аврора, шапка, номер слайда
function frame(inner, { date, no, total, kicker = '' }) {
  const [y, m, d] = date.split('-');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${AURORA_DEFS}
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
  ${AURORA_RECTS}
  <circle cx="78" cy="92" r="9" fill="${AC}"/>
  <text x="100" y="102" font-family="'Courier New',monospace" font-size="30" letter-spacing="6" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>
  <text x="1010" y="102" font-family="'Courier New',monospace" font-size="28" fill="${MUT}" text-anchor="end">${d}.${m}.${y}</text>
  ${kicker ? `<text x="70" y="1012" font-family="'Courier New',monospace" font-size="26" fill="${MUT}">${esc(kicker)}</text>` : ''}
  <text x="1010" y="1012" font-family="'Courier New',monospace" font-size="26" fill="${MUT}" text-anchor="end">${no}/${total} · diesel-monitor.pp.ua</text>
  ${inner}
</svg>`;
}

// ── Слайд 1: обкладинка з головною цифрою ──
function slideCover(latest, ctx) {
  const dp = latest.avg?.dp;
  const ch = latest.avgChange?.dp;
  const up = ch !== undefined && ch > 0.005;
  const down = ch !== undefined && ch < -0.005;
  const col = up ? RED : down ? AC : MUT;
  const chTxt = ch === undefined ? '' : up ? `▲ +${fmt(ch)} за добу` : down ? `▼ −${fmt(Math.abs(ch))} за добу` : '→ без змін';

  return frame(
    `<text x="70" y="260" font-family="'Courier New',monospace" font-size="56" font-weight="bold" fill="${TXT}">Ціни на пальне</text>
     <text x="70" y="330" font-family="'Courier New',monospace" font-size="56" font-weight="bold" fill="${TXT}">в Україні</text>
     <text x="70" y="560" font-family="'Courier New',monospace" font-size="180" font-weight="bold" fill="${AC}">${fmt(dp)}</text>
     <text x="70" y="630" font-family="'Courier New',monospace" font-size="40" fill="${MUT}">грн/л — середня по країні, дизель</text>
     <text x="70" y="730" font-family="'Courier New',monospace" font-size="44" font-weight="bold" fill="${col}">${chTxt}</text>
     <rect x="70" y="800" width="600" height="90" rx="16" fill="${BG}" stroke="${AC}" stroke-width="2"/>
     <text x="110" y="858" font-family="'Courier New',monospace" font-size="34" fill="${AC}">Гортай далі →</text>`,
    ctx
  );
}

// ── Слайд 2: усі види пального ──
function slideFuels(latest, ctx) {
  const rows = FUELS.filter(([, k]) => latest.avg?.[k] !== undefined);
  const inner = rows
    .map(([name, k], i) => {
      const top = 300 + i * 132;
      const ch = latest.avgChange?.[k];
      const up = ch !== undefined && ch > 0.005;
      const down = ch !== undefined && ch < -0.005;
      const col = up ? RED : down ? AC : MUT;
      const chTxt = ch === undefined ? '' : up ? `▲ +${fmt(ch)}` : down ? `▼ −${fmt(Math.abs(ch))}` : '→';
      return `
      <text x="70" y="${top}" font-family="'Courier New',monospace" font-size="42" fill="${TXT}">${esc(name)}</text>
      <text x="760" y="${top + 6}" font-family="'Courier New',monospace" font-size="58" font-weight="bold" fill="${AC}" text-anchor="end">${fmt(latest.avg[k])}</text>
      <text x="1010" y="${top}" font-family="'Courier New',monospace" font-size="32" font-weight="bold" fill="${col}" text-anchor="end">${chTxt}</text>
      ${i < rows.length - 1 ? `<line x1="70" y1="${top + 42}" x2="1010" y2="${top + 42}" stroke="${LINE}" stroke-width="1"/>` : ''}`;
    })
    .join('');
  return frame(
    `<text x="70" y="210" font-family="'Courier New',monospace" font-size="50" font-weight="bold" fill="${TXT}">Усі види пального</text>${inner}`,
    ctx
  );
}

// ── Слайд 3: де найдешевше (мережі) ──
function slideCheapest(latest, ctx) {
  const rows = Object.entries(latest.networks ?? {})
    .filter(([, p]) => p.dp !== undefined)
    .sort((a, b) => a[1].dp - b[1].dp)
    .slice(0, 6);
  if (!rows.length) return null;

  const inner = rows
    .map(([name, p], i) => {
      const top = 310 + i * 108;
      const win = i === 0;
      return `
      <text x="70" y="${top}" font-family="'Courier New',monospace" font-size="${win ? 44 : 38}" fill="${win ? AC : TXT}">${i + 1}. ${esc(name.slice(0, 20))}</text>
      <text x="1010" y="${top}" font-family="'Courier New',monospace" font-size="${win ? 50 : 42}" font-weight="bold" fill="${win ? AC : TXT}" text-anchor="end">${fmt(p.dp)}</text>
      ${i < rows.length - 1 ? `<line x1="70" y1="${top + 32}" x2="1010" y2="${top + 32}" stroke="${LINE}" stroke-width="1"/>` : ''}`;
    })
    .join('');

  return frame(
    `<text x="70" y="200" font-family="'Courier New',monospace" font-size="50" font-weight="bold" fill="${TXT}">Де дизель дешевший</text>
     <text x="70" y="252" font-family="'Courier New',monospace" font-size="30" fill="${MUT}">мережі АЗС, грн/л</text>${inner}`,
    { ...ctx, kicker: 'ціни довідкові — уточнюй на АЗС' }
  );
}

// ── Слайд 4: області (найдешевші й найдорожчі) ──
function slideRegions(latest, ctx) {
  const list = Object.entries(latest.regionAvg ?? {})
    .filter(([, p]) => p.dp !== undefined)
    .sort((a, b) => a[1].dp - b[1].dp);
  if (list.length < 6) return null;

  const cheap = list.slice(0, 3);
  const dear = list.slice(-3).reverse();
  const block = (items, y0, title, col) =>
    `<text x="70" y="${y0}" font-family="'Courier New',monospace" font-size="30" fill="${col}">${title}</text>` +
    items
      .map(
        ([name, p], i) =>
          `<text x="70" y="${y0 + 66 + i * 74}" font-family="'Courier New',monospace" font-size="38" fill="${TXT}">${esc(name)}</text>
           <text x="1010" y="${y0 + 66 + i * 74}" font-family="'Courier New',monospace" font-size="42" font-weight="bold" fill="${col}" text-anchor="end">${fmt(p.dp)}</text>`
      )
      .join('');

  return frame(
    `<text x="70" y="200" font-family="'Courier New',monospace" font-size="50" font-weight="bold" fill="${TXT}">Дизель по областях</text>
     ${block(cheap, 300, 'НАЙДЕШЕВШЕ', AC)}
     ${block(dear, 620, 'НАЙДОРОЖЧЕ', RED)}`,
    ctx
  );
}

// ── Слайд 5: динаміка + заклик ──
function slideTrend(latest, history, ctx) {
  const days = (history.days ?? []).filter(d => d.avg?.dp !== undefined);
  const pts = days.slice(-30);
  if (pts.length < 4) return null;

  const vals = pts.map(p => p.avg.dp);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
  const x0 = 70, x1 = 1010, y0 = 330, y1 = 620;
  const line = pts
    .map((p, i) => `${(x0 + ((x1 - x0) * i) / (pts.length - 1)).toFixed(1)},${(y1 - ((p.avg.dp - mn) / rng) * (y1 - y0)).toFixed(1)}`)
    .join(' ');

  const first = vals[0], last = vals.at(-1);
  const diff = last - first;
  const pct = (diff / first) * 100;
  const up = diff > 0;
  const spanDays = Math.round((new Date(pts.at(-1).date) - new Date(pts[0].date)) / 86_400_000);

  return frame(
    `<text x="70" y="200" font-family="'Courier New',monospace" font-size="50" font-weight="bold" fill="${TXT}">Як змінювалась ціна</text>
     <text x="70" y="252" font-family="'Courier New',monospace" font-size="30" fill="${MUT}">дизель, останні ${spanDays} днів</text>
     <polyline points="${line}" fill="none" stroke="${AC}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
     <text x="70" y="720" font-family="'Courier New',monospace" font-size="44" font-weight="bold" fill="${up ? RED : AC}">${up ? '▲ +' : '▼ −'}${fmt(Math.abs(diff))} грн (${up ? '+' : '−'}${Math.abs(pct).toFixed(1)}%)</text>
     <text x="70" y="800" font-family="'Courier New',monospace" font-size="34" fill="${MUT}">Ціни по всіх мережах і областях,</text>
     <text x="70" y="848" font-family="'Courier New',monospace" font-size="34" fill="${MUT}">графіки й прогноз — на сайті</text>
     <rect x="70" y="890" width="640" height="80" rx="16" fill="${BG}" stroke="${AC}" stroke-width="2"/>
     <text x="110" y="943" font-family="'Courier New',monospace" font-size="32" fill="${AC}">Посилання в шапці профілю</text>`,
    ctx
  );
}

function caption(latest) {
  const f = v => fmt(v);
  const rows = FUELS.filter(([, k]) => latest.avg?.[k] !== undefined)
    .map(([name, k]) => {
      const ch = latest.avgChange?.[k];
      const mark = ch === undefined || Math.abs(ch) < 0.005 ? '' : ch > 0 ? ' 🔺' : ' 🟢';
      return `${name}: ${f(latest.avg[k])} грн/л${mark}`;
    })
    .join('\n');

  const [y, m, d] = latest.date.split('-');
  const cheap = Object.entries(latest.networks ?? {})
    .filter(([, p]) => p.dp !== undefined)
    .sort((a, b) => a[1].dp - b[1].dp)[0];

  // область-сюжет дає вузький хештег: у ньому менша конкуренція, ніж у #пальне
  const region = standoutRegion(latest.regionAvg, 'dp');
  const regionLine =
    region && latest.regionAvg?.[region]?.dp !== undefined
      ? `Найдешевший дизель по областях: ${region} — ${f(latest.regionAvg[region].dp)} грн/л\n\n`
      : '';

  return (
    `⛽ Ціни на пальне в Україні · ${d}.${m}.${y}\n\n` +
    `${rows}\n\n` +
    (cheap ? `Найдешевша мережа: ${cheap[0]} — ${f(cheap[1].dp)} грн/л\n` : '') +
    regionLine +
    `Гортай карусель: усі види пального, де дешевше, ціни по областях і динаміка за місяць.\n\n` +
    `Повні дані по 36 мережах і 23 областях — diesel-monitor.pp.ua (посилання в шапці профілю)\n\n` +
    pickHashtags({ fuel: 'dp', region, change: latest.avgChange?.dp })
  );
}

// ── збірка слайдів ──
async function buildCards() {
  const latest = await readJson('latest.json');
  if (!latest?.avg?.dp) return console.log('carousel: немає даних цін — пропускаю');

  const state = await readJson('ig-carousel.json', {});
  if (state.lastDate === latest.date && process.env.IG_FORCE !== '1') {
    console.log(`carousel: за ${latest.date} вже постили — пропускаю`);
    await writeFile(path.join(DATA_DIR, 'ig-carousel-pick.json'), JSON.stringify({ skip: true }));
    return;
  }

  const history = await readJson('history.json', { days: [] });
  const date = latest.date;

  // порядок слайдів: гачок → деталі → користь → контекст
  const builders = [
    (ctx) => slideCover(latest, ctx),
    (ctx) => slideFuels(latest, ctx),
    (ctx) => slideCheapest(latest, ctx),
    (ctx) => slideRegions(latest, ctx),
    (ctx) => slideTrend(latest, history, ctx),
  ];

  // спершу рахуємо, скільки слайдів реально вийде (деякі можуть не зібратись)
  const probe = builders.map((b, i) => b({ date, no: i + 1, total: builders.length })).filter(Boolean);
  const total = probe.length;

  const sharp = (await import('sharp')).default;
  await mkdir(CARDS_DIR, { recursive: true });

  const files = [];
  let no = 0;
  for (const b of builders) {
    const svg = b({ date, no: no + 1, total });
    if (!svg) continue;
    no++;
    const file = `car-${date}-${no}.jpg`;
    const jpg = await sharp(Buffer.from(b({ date, no, total }))).jpeg({ quality: 92 }).toBuffer();
    await writeFile(path.join(CARDS_DIR, file), jpg);
    files.push(file);
  }

  await writeFile(
    path.join(DATA_DIR, 'ig-carousel-pick.json'),
    JSON.stringify({ date, files, caption: caption(latest) })
  );

  // тримаємо тільки два останні комплекти — картинок багато
  const old = (await readdir(CARDS_DIR))
    .filter(f => f.startsWith('car-') && !f.startsWith(`car-${date}-`))
    .sort();
  const keepPrefix = [...new Set(old.map(f => f.slice(0, 14)))].slice(-1);
  for (const f of old) if (!keepPrefix.some(p => f.startsWith(p))) await unlink(path.join(CARDS_DIR, f));

  console.log(`carousel: ${files.length} слайдів за ${date}`);
}

// ── публікація ──
async function publish() {
  if (!token) return console.log('carousel: INSTAGRAM_TOKEN не заданий — пропускаю');

  const pick = await readJson('ig-carousel-pick.json');
  if (!pick?.files?.length || pick.skip) return console.log('carousel: немає що постити');

  const state = await readJson('ig-carousel.json', {});
  if (state.lastDate === pick.date && process.env.IG_FORCE !== '1')
    return console.log(`carousel: за ${pick.date} вже постили`);

  const { waitReady } = await import('./instagram-news.mjs');
  const me = await fetch(`${API}/me?fields=id&access_token=${token}`).then(r => r.json());
  if (!me.id) throw new Error(`me: ${JSON.stringify(me)}`);

  // 1) контейнер на кожен слайд (is_carousel_item), 2) контейнер каруселі, 3) публікація
  const children = [];
  for (const file of pick.files) {
    const r = await fetch(`${API}/${me.id}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: `${RAW}/${file}`, is_carousel_item: true, access_token: token }),
    }).then(r => r.json());
    if (!r.id) throw new Error(`слайд ${file}: ${JSON.stringify(r)}`);
    await waitReady(r.id, token);
    children.push(r.id);
  }

  const carousel = await fetch(`${API}/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: children.join(','),
      caption: pick.caption,
      access_token: token,
    }),
  }).then(r => r.json());
  if (!carousel.id) throw new Error(`карусель: ${JSON.stringify(carousel)}`);
  await waitReady(carousel.id, token);

  const pub = await fetch(`${API}/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: carousel.id, access_token: token }),
  }).then(r => r.json());

  // Instagram інколи ВІДДАЄ помилку, але пост усе одно створює
  // («Application request limit reached» 22.08 — обидві каруселі вийшли).
  // Якщо повірити відповіді на слово й не записати стан, наступний запуск
  // опублікує те саме вдруге. Тому при помилці перевіряємо фактом: чи не
  // з'явився щойно новий пост в акаунті.
  let mediaId = pub.id;
  if (!mediaId) {
    console.log(`carousel: publish відповів помилкою — перевіряю, чи пост усе-таки вийшов`);
    await new Promise(r => setTimeout(r, 5000));
    const recent = await fetch(
      `${API}/${me.id}/media?fields=id,timestamp,media_type&limit=3&access_token=${token}`
    ).then(r => r.json()).catch(() => null);
    const fresh = (recent?.data ?? []).find(
      m => m.media_type === 'CAROUSEL_ALBUM' && Date.now() - new Date(m.timestamp).getTime() < 5 * 60_000
    );
    if (fresh) {
      mediaId = fresh.id;
      console.log(`carousel: пост усе-таки опубліковано (media ${mediaId}) — помилка була хибною`);
    } else {
      throw new Error(`publish: ${JSON.stringify(pub)}`);
    }
  }

  await writeFile(
    path.join(DATA_DIR, 'ig-carousel.json'),
    JSON.stringify({ lastDate: pick.date, mediaId, slides: pick.files.length, postedAt: new Date().toISOString() })
  );
  console.log(`carousel: опубліковано ${pick.files.length} слайдів за ${pick.date} (media ${mediaId})`);
}

if (process.argv[1]?.endsWith('instagram-carousel.mjs')) {
  (process.argv[2] === '--cards' ? buildCards() : publish()).catch(e => {
    console.error('carousel ЗБІЙ:', e.message);
    process.exit(1);
  });
}
