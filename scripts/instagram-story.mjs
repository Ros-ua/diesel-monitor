// Щоденна сторіс із цінами: картка 1080x1920 + публікація (media_type=STORIES).
//
// Сторіс живе 24 години й не засмічує профіль — тому можна нагадувати про себе
// щодня, зокрема у вихідні, коли пост цін не виходить.
//
// Обмеження, яке не обійти: інтерактивні стікери (посилання, опитування,
// питання) через API недоступні жодному застосунку — тільки саме зображення.
// Тому адресу сайта пишемо прямо на картинці.
//
//   node scripts/instagram-story.mjs --card   → public/cards/story-<дата>.jpg
//   node scripts/instagram-story.mjs          → публікація
//
// env: INSTAGRAM_TOKEN

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AURORA_DEFS, AURORA_RECTS } from './lib/aurora.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CARDS_DIR = path.join(ROOT, 'public', 'cards');
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards';
const API = 'https://graph.instagram.com/v23.0';

const W = 1080, H = 1920;
const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f';
const MUT = '#6d8f86', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';

const token = process.env.INSTAGRAM_TOKEN;
const fmt = v => v.toFixed(2).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ROWS = [
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

function storySvg(latest, spark) {
  const [y, m, d] = latest.date.split('-');
  const rows = ROWS.filter(([, k]) => latest.avg?.[k] !== undefined);

  // спарклайн дизеля внизу — показує рух, а не лише цифру дня
  const sparkPath = (() => {
    if (spark.length < 4) return '';
    const vals = spark.map(p => p.value);
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
    const x0 = 90, x1 = W - 90, y0 = 1530, y1 = 1660;
    const pts = spark
      .map((p, i) => `${(x0 + ((x1 - x0) * i) / (spark.length - 1)).toFixed(1)},${(y1 - ((p.value - mn) / rng) * (y1 - y0)).toFixed(1)}`)
      .join(' ');
    return `<polyline points="${pts}" fill="none" stroke="${AC}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85"/>`;
  })();

  const rowsSvg = rows
    .map(([name, k], i) => {
      const top = 620 + i * 150;
      const ch = latest.avgChange?.[k];
      const up = ch !== undefined && ch > 0.005;
      const down = ch !== undefined && ch < -0.005;
      const col = up ? RED : down ? AC : MUT;
      const chTxt = ch === undefined ? '' : up ? `▲ +${fmt(ch)}` : down ? `▼ −${fmt(Math.abs(ch))}` : '→';
      return `
  <text x="90" y="${top}" font-family="'Courier New',monospace" font-size="46" fill="${TXT}">${esc(name)}</text>
  <text x="760" y="${top + 6}" font-family="'Courier New',monospace" font-size="62" font-weight="bold" fill="${AC}" text-anchor="end">${fmt(latest.avg[k])}</text>
  <text x="${W - 90}" y="${top}" font-family="'Courier New',monospace" font-size="34" font-weight="bold" fill="${col}" text-anchor="end">${chTxt}</text>
  ${i < rows.length - 1 ? `<line x1="90" y1="${top + 42}" x2="${W - 90}" y2="${top + 42}" stroke="${LINE}" stroke-width="2"/>` : ''}`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  ${AURORA_DEFS}
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="40" y="40" width="${W - 80}" height="${H - 80}" rx="32" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
  ${AURORA_RECTS}

  <circle cx="100" cy="150" r="12" fill="${AC}"/>
  <text x="130" y="163" font-family="'Courier New',monospace" font-size="40" letter-spacing="7" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>

  <text x="90" y="340" font-family="'Courier New',monospace" font-size="72" font-weight="bold" fill="${TXT}">Ціни на пальне</text>
  <text x="90" y="430" font-family="'Courier New',monospace" font-size="72" font-weight="bold" fill="${TXT}">в Україні</text>
  <text x="90" y="510" font-family="'Courier New',monospace" font-size="44" fill="${MUT}">${d}.${m}.${y} · середні по країні</text>

  ${rowsSvg}

  <text x="90" y="1490" font-family="'Courier New',monospace" font-size="32" fill="${MUT}">Дизель за 30 днів</text>
  ${sparkPath}

  <rect x="90" y="1720" width="${W - 180}" height="110" rx="24" fill="${BG}" stroke="${AC}" stroke-width="3"/>
  <text x="${W / 2}" y="1790" font-family="'Courier New',monospace" font-size="42" font-weight="bold" fill="${AC}" text-anchor="middle">diesel-monitor.pp.ua</text>
</svg>`;
}

async function buildCard() {
  const latest = await readJson('latest.json');
  if (!latest?.avg?.dp) return console.log('story: немає даних цін — пропускаю');

  // Сторіс тільки на СВІЖИХ цінах. Мінфін оновлює дані по буднях ~14:00, тож у
  // неділю й понеділок вранці в базі ще п'ятничні числа — показувати їх удруге
  // немає сенсу. Порівнюємо з датою даних, які вже виходили в сторіс.
  const state = await readJson('ig-story.json', {});
  if (state.lastDataDate === latest.date && process.env.IG_FORCE !== '1') {
    console.log(`story: ціни за ${latest.date} вже виходили — нових даних немає, пропускаю`);
    await writeFile(path.join(DATA_DIR, 'ig-story-pick.json'), JSON.stringify({ skip: true }));
    return;
  }

  const hist = await readJson('history.json', { days: [] });
  const spark = (hist.days ?? [])
    .filter(x => x.avg?.dp !== undefined)
    .slice(-30)
    .map(x => ({ value: x.avg.dp }));

  const sharp = (await import('sharp')).default;
  const jpg = await sharp(Buffer.from(storySvg(latest, spark))).jpeg({ quality: 90 }).toBuffer();

  const file = `story-${new Date().toISOString().slice(0, 10)}.jpg`;
  await mkdir(CARDS_DIR, { recursive: true });
  await writeFile(path.join(CARDS_DIR, file), jpg);
  await writeFile(path.join(DATA_DIR, 'ig-story-pick.json'), JSON.stringify({ file, date: latest.date }));

  const old = (await readdir(CARDS_DIR)).filter(f => f.startsWith('story-')).sort().slice(0, -5);
  for (const f of old) await unlink(path.join(CARDS_DIR, f));

  console.log(`story: картка ${file} (дані за ${latest.date})`);
}

async function publish() {
  if (!token) return console.log('story: INSTAGRAM_TOKEN не заданий — пропускаю');

  const pick = await readJson('ig-story-pick.json');
  if (!pick?.file || pick.skip) return console.log('story: немає нових цін — пропускаю');

  const state = await readJson('ig-story.json', {});
  const today = new Date().toISOString().slice(0, 10);
  // Обмеження саме на ДАТУ ДАНИХ, а не на календарний день: інакше ранкова
  // сторіс зі вчорашніми цінами займає слот, і коли вдень приходять свіжі —
  // нова вже не виходить.
  if (state.lastDataDate === pick.date && process.env.IG_FORCE !== '1')
    return console.log(`story: ціни за ${pick.date} вже виходили — пропускаю`);

  const me = await fetch(`${API}/me?fields=id&access_token=${token}`).then(r => r.json());
  if (!me.id) throw new Error(`me: ${JSON.stringify(me)}`);

  const create = await fetch(`${API}/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'STORIES',
      image_url: `${RAW}/${pick.file}`,
      access_token: token,
    }),
  }).then(r => r.json());
  if (!create.id) throw new Error(`media: ${JSON.stringify(create)}`);

  const { waitReady } = await import('./instagram-news.mjs');
  await waitReady(create.id, token);

  const pub = await fetch(`${API}/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }).then(r => r.json());
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);

  await writeFile(
    path.join(DATA_DIR, 'ig-story.json'),
    JSON.stringify({
      lastDay: today,
      lastDataDate: pick.date, // за якими саме цінами вийшла сторіс
      mediaId: pub.id,
      postedAt: new Date().toISOString(),
    })
  );
  console.log(`story: опубліковано (media ${pub.id})`);
}

if (process.argv[1]?.endsWith('instagram-story.mjs')) {
  (process.argv[2] === '--card' ? buildCard() : publish()).catch(e => {
    console.error('story ЗБІЙ:', e.message);
    process.exit(1);
  });
}
