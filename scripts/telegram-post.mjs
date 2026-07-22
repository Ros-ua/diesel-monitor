// Автопост цін у Telegram-канал після щоденного збору.
// Запускається з GitHub Actions (collect.yml). Потрібні env:
//   TELEGRAM_BOT_TOKEN — токен бота (GitHub Secrets)
//   TELEGRAM_CHANNEL   — @username каналу (GitHub Variables)
// Стан останнього поста — public/data/tg-post.json (комітиться разом з даними),
// тому за один день пост виходить лише раз, навіть якщо збір запускався двічі.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const SITE = 'https://diesel-monitor.pp.ua';

const token = process.env.TELEGRAM_BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL;

const fmt = v => v.toFixed(2).replace('.', ',');
const sign = v =>
  v === undefined || Math.abs(v) < 0.005 ? '➖' : v > 0 ? `🔺 +${fmt(v)}` : `🟢 −${fmt(Math.abs(v))}`;

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function main() {
  if (!token || !channel) {
    console.log('tg: TELEGRAM_BOT_TOKEN або TELEGRAM_CHANNEL не задані — пропускаю');
    return;
  }

  const latest = await readJson('latest.json');
  if (!latest?.avg?.dp) {
    console.log('tg: немає даних цін — пропускаю');
    return;
  }

  const state = await readJson('tg-post.json', {});
  if (state.lastDate === latest.date) {
    console.log(`tg: за ${latest.date} вже постили — пропускаю`);
    return;
  }

  const [y, m, d] = latest.date.split('-');
  const rows = [
    ['Дизель', 'dp'],
    ['А-95+', 'a95p'],
    ['А-95', 'a95'],
    ['А-92', 'a92'],
    ['Автогаз', 'gas'],
  ]
    .filter(([, k]) => latest.avg[k] !== undefined)
    .map(([name, k]) => `${name}: <b>${fmt(latest.avg[k])}</b> грн/л  ${sign(latest.avgChange?.[k])}`)
    .join('\n');

  // Найсвіжіша важлива новина дня (не нейтральна)
  const news = await readJson('news.json');
  const top = (news?.items ?? []).find(n => n.impact !== 'neutral');
  const newsBlock = top
    ? `\n\n${top.impact === 'up' ? '🔴' : '🟢'} ${esc(top.title)}`
    : '';

  const text =
    `⛽ <b>Ціни на пальне в Україні · ${d}.${m}.${y}</b>\n\n` +
    `${rows}${newsBlock}\n\n` +
    `📊 Графіки, мережі АЗС, області, прогноз:\n${SITE}`;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: channel,
      text,
      parse_mode: 'HTML',
      link_preview_options: { url: SITE, prefer_small_media: true },
    }),
  }).then(r => r.json());

  if (!res.ok) throw new Error(`Telegram API: ${JSON.stringify(res)}`);

  await writeFile(
    path.join(DATA_DIR, 'tg-post.json'),
    JSON.stringify({ lastDate: latest.date, postedAt: new Date().toISOString() })
  );

  // новину з цінового поста вносимо у список запощених,
  // щоб telegram-news.mjs не продублював її окремим постом
  if (top?.url) {
    const postedState = (await readJson('tg-news-posted.json', { urls: [] })) ?? { urls: [] };
    if (!postedState.urls.includes(top.url)) {
      postedState.urls.push(top.url);
      await writeFile(
        path.join(DATA_DIR, 'tg-news-posted.json'),
        JSON.stringify({ urls: postedState.urls.slice(-300), updated: new Date().toISOString() })
      );
    }
  }
  console.log(`tg: опубліковано пост за ${latest.date} у ${channel}`);
}

main().catch(e => {
  console.error('tg ЗБІЙ:', e.message);
  process.exit(1);
});
