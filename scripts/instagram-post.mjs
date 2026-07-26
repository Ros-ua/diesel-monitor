// Автопост картки цін в Instagram (@diesel.monitor.ua).
// Instagram API with Instagram Login — graph.instagram.com, публікація в 2 кроки:
//   1) створити media-контейнер з image_url  2) media_publish
//
// Instagram САМ завантажує картинку за URL, тому файл спершу має бути в мережі.
// Тому скрипт має два режими (workflow викликає їх по черзі):
//   node scripts/instagram-post.mjs --card    → генерує public/cards/YYYY-MM-DD.jpg
//   node scripts/instagram-post.mjs           → публікує (після коміту картки)
//
// Env: INSTAGRAM_TOKEN — довгограючий токен (GitHub Secrets).
// Стан — public/data/ig-post.json, щоб за один день не постити двічі.

import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const CARDS_DIR = path.join(ROOT, 'public', 'cards');
// raw.githubusercontent віддає файл одразу після пушу — не чекаємо деплою Pages
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/cards';
const API = 'https://graph.instagram.com/v23.0';

const token = process.env.INSTAGRAM_TOKEN;
const fmt = v => v.toFixed(2).replace('.', ',');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

async function loadLatest() {
  const latest = await readJson('latest.json');
  if (!latest?.avg?.dp) throw new Error('немає даних цін');
  return latest;
}

// ── режим --card: згенерувати JPEG (Instagram не приймає PNG за image_url) ──
async function buildCard() {
  const latest = await loadLatest();
  const hist = await readJson('history.json', { days: [] });
  const spark = (hist.days ?? [])
    .filter(x => x.avg?.dp !== undefined)
    .slice(-30)
    .map(x => ({ value: x.avg.dp }));

  const [{ makeCardSvg }, sharpMod] = await Promise.all([
    import('./price-card.mjs'),
    import('sharp'),
  ]);
  const sharp = sharpMod.default;
  const jpg = await sharp(Buffer.from(makeCardSvg(latest, spark)))
    .jpeg({ quality: 92 })
    .toBuffer();

  await mkdir(CARDS_DIR, { recursive: true });
  await writeFile(path.join(CARDS_DIR, `${latest.date}.jpg`), jpg);
  console.log(`ig: картка public/cards/${latest.date}.jpg готова`);

  // тримаємо лише останні 14 карток — репозиторій не має розпухати
  const old = (await readdir(CARDS_DIR)).filter(f => f.endsWith('.jpg')).sort().slice(0, -14);
  for (const f of old) await unlink(path.join(CARDS_DIR, f));
  if (old.length) console.log(`ig: прибрано старих карток: ${old.length}`);
}

// ── підпис поста ──
function caption(latest) {
  const [y, m, d] = latest.date.split('-');
  const rows = [
    ['Дизель', 'dp'],
    ['А-95+', 'a95p'],
    ['А-95', 'a95'],
    ['А-92', 'a92'],
    ['Автогаз', 'gas'],
  ]
    .filter(([, k]) => latest.avg[k] !== undefined)
    .map(([name, k]) => {
      const ch = latest.avgChange?.[k];
      const arr = ch === undefined || Math.abs(ch) < 0.005 ? '➖' : ch > 0 ? '🔺' : '🟢';
      return `${name}: ${fmt(latest.avg[k])} грн/л ${arr}`;
    })
    .join('\n');

  // максимум 5 хештегів — Instagram з грудня 2025 ріже охоплення за спам-теги
  return (
    `⛽ Середні ціни на пальне в Україні · ${d}.${m}.${y}\n\n` +
    `${rows}\n\n` +
    `Ціни по областях, мережах АЗС, графіки й прогноз — на сайті:\n` +
    `diesel-monitor.pp.ua (посилання в шапці профілю)\n\n` +
    `#цінинапальне #дизель #бензин #АЗС #Україна`
  );
}

// ── режим публікації ──
async function publish() {
  if (!token) {
    console.log('ig: INSTAGRAM_TOKEN не заданий — пропускаю');
    return;
  }
  const latest = await loadLatest();

  const state = await readJson('ig-post.json', {});
  if (state.lastDate === latest.date && process.env.IG_FORCE !== '1') {
    console.log(`ig: за ${latest.date} вже постили — пропускаю`);
    return;
  }

  // id акаунта беремо з токена, щоб не тримати зайвий секрет
  const me = await fetch(`${API}/me?fields=id,username&access_token=${token}`).then(r => r.json());
  if (!me.id) throw new Error(`me: ${JSON.stringify(me)}`);

  const imageUrl = `${RAW}/${latest.date}.jpg`;
  const create = await fetch(`${API}/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_url: imageUrl, caption: caption(latest), access_token: token }),
  }).then(r => r.json());
  if (!create.id) throw new Error(`media: ${JSON.stringify(create)}`);

  // репетиція: контейнер створено (отже картинка доступна, підпис і права ок),
  // але публікації немає — контейнер сам згасне за 24 години
  if (process.env.IG_DRY === '1') {
    console.log(`ig: РЕПЕТИЦІЯ — контейнер ${create.id} створено, не публікую`);
    console.log(`ig: картинка ${imageUrl}`);
    return;
  }

  const pub = await fetch(`${API}/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }).then(r => r.json());
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);

  await writeFile(
    path.join(DATA_DIR, 'ig-post.json'),
    JSON.stringify({ lastDate: latest.date, mediaId: pub.id, postedAt: new Date().toISOString() })
  );
  console.log(`ig: опубліковано за ${latest.date} у @${me.username} (media ${pub.id})`);
}

const mode = process.argv[2];
(mode === '--card' ? buildCard() : publish()).catch(e => {
  console.error('ig ЗБІЙ:', e.message);
  process.exit(1);
});
