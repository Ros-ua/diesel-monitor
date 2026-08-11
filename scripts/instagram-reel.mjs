// Публікація Reels в Instagram: media_type=REELS + video_url.
//
// Відео Instagram качає САМ за посиланням, тому файл спершу має лежати в
// репозиторії (workflow комітить його перед цим кроком).
// Обробка відео триває довше за картинку — чекаємо FINISHED до 5 хвилин.
//
// env: INSTAGRAM_TOKEN. Стан — public/data/ig-reel.json.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickHashtags } from './lib/hashtags.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const RAW = 'https://raw.githubusercontent.com/Ros-ua/diesel-monitor/main/public/reels';
const API = 'https://graph.instagram.com/v23.0';

const token = process.env.INSTAGRAM_TOKEN;
const fmt = v => v.toFixed(2).replace('.', ',');

const FUEL_NAMES = { dp: 'дизель', a95: 'бензин А-95', a95p: 'бензин А-95+', a92: 'бензин А-92', gas: 'автогаз' };

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, 'utf-8'));
  } catch {
    return fallback;
  }
}

// відео обробляється довше за фото — до 5 хвилин
async function waitReady(id, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const st = await fetch(`${API}/${id}?fields=status_code,status&access_token=${token}`).then(r => r.json());
    if (st.status_code === 'FINISHED') return;
    if (st.status_code === 'ERROR') throw new Error(`контейнер: ${st.status ?? 'ERROR'}`);
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('відео не обробилось за 5 хвилин');
}

function caption(meta, music) {
  const name = FUEL_NAMES[meta.fuel] ?? meta.fuelName ?? 'пальне';
  const up = meta.diff > 0;
  const period = meta.months >= 12 ? `${Math.round(meta.months / 12)} р.` : `${meta.months} міс.`;

  return (
    `⛽ Скільки коштував ${name} за останні ${period}\n\n` +
    `${fmt(meta.first)} → ${fmt(meta.last)} грн/л\n` +
    `${up ? '🔺' : '🟢'} ${up ? '+' : '−'}${fmt(Math.abs(meta.diff))} грн (${up ? '+' : '−'}${Math.abs(meta.pct)}%)\n\n` +
    `Ціни по всіх мережах АЗС і областях, графіки й прогноз —\n` +
    `diesel-monitor.pp.ua (посилання в шапці профілю)\n\n` +
    (music?.title ? `Музика: ${music.title} — ${music.creator} (CC0)\n\n` : '') +
    pickHashtags({ fuel: meta.fuel, change: meta.diff })
  );
}

async function main() {
  if (!token) return console.log('reel: INSTAGRAM_TOKEN не заданий — пропускаю');

  const meta = await readJson(path.join(ROOT, 'frames', 'meta.json'));
  if (!meta?.file) return console.log('reel: немає frames/meta.json — нема що публікувати');

  const music = await readJson(path.join(ROOT, 'frames', 'music.json'));

  const state = await readJson(path.join(DATA_DIR, 'ig-reel.json'), {});
  if (state.lastFile === meta.file && process.env.IG_FORCE !== '1')
    return console.log(`reel: ${meta.file} вже публікували`);

  const me = await fetch(`${API}/me?fields=id,username&access_token=${token}`).then(r => r.json());
  if (!me.id) throw new Error(`me: ${JSON.stringify(me)}`);

  const videoUrl = `${RAW}/${meta.file}`;
  const create = await fetch(`${API}/${me.id}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption(meta, music),
      share_to_feed: true,
      access_token: token,
    }),
  }).then(r => r.json());
  if (!create.id) throw new Error(`media: ${JSON.stringify(create)}`);
  console.log(`reel: контейнер ${create.id}, чекаю обробку відео…`);

  await waitReady(create.id);

  const pub = await fetch(`${API}/${me.id}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: create.id, access_token: token }),
  }).then(r => r.json());
  if (!pub.id) throw new Error(`publish: ${JSON.stringify(pub)}`);

  await writeFile(
    path.join(DATA_DIR, 'ig-reel.json'),
    JSON.stringify({
      lastFile: meta.file,
      lastDataDate: meta.to, // за якими даними знято — щоб не повторити той самий ролик
      lastFuel: meta.fuel,
      mediaId: pub.id,
      postedAt: new Date().toISOString(),
    })
  );
  console.log(`reel: опубліковано ${meta.file} (media ${pub.id})`);
}

main().catch(e => {
  console.error('reel ЗБІЙ:', e.message);
  process.exit(1);
});
