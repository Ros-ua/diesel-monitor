// Пости «червоних» новин у Telegram-канал (запускається з news.yml кожні 2 години).
// Постить лише важливі новини з тиском на ціну вгору (impact=up): сам текст новини
// (заголовок + короткий зміст із RSS), джерело і посилання на сайт.
// Стан — public/data/tg-news-posted.json (список URL, комітиться разом з новинами).
//   env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const SITE = 'https://diesel-monitor.pp.ua';
const MAX_PER_RUN = 2; // не спамимо: максимум 2 новини за запуск
const FRESH_HOURS = 12; // лише свіжі новини
const POSTED_CAP = 300;

const token = process.env.TELEGRAM_BOT_TOKEN;
const channel = process.env.TELEGRAM_CHANNEL;

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

async function main() {
  if (!token || !channel) {
    console.log('tg-news: TELEGRAM_BOT_TOKEN або TELEGRAM_CHANNEL не задані — пропускаю');
    return;
  }

  const news = await readJson('news.json');
  const state = await readJson('tg-news-posted.json', { urls: [] });
  const posted = new Set(state.urls);
  const freshAfter = Date.now() - FRESH_HOURS * 3_600_000;

  const candidates = (news?.items ?? [])
    .filter(
      n =>
        n.impact === 'up' &&
        n.url &&
        !posted.has(n.url) &&
        n.publishedAt &&
        new Date(n.publishedAt).getTime() >= freshAfter
    )
    // старіші перші — у каналі буде хронологічний порядок
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .slice(0, MAX_PER_RUN);

  if (!candidates.length) {
    console.log('tg-news: свіжих червоних новин немає');
    return;
  }

  for (const n of candidates) {
    // короткий зміст: без обірваного хвоста посередині слова
    let summary = (n.summary || '').trim();
    if (summary.length > 280) summary = summary.slice(0, 280).replace(/\s+\S*$/, '') + '…';
    // не дублюємо заголовок, якщо зміст із нього починається
    if (summary && n.title && summary.startsWith(n.title.slice(0, 40))) summary = '';

    const text =
      `🔴 <b>${esc(n.title)}</b>` +
      (summary ? `\n\n${esc(summary)}` : '') +
      `\n\n<i>${esc(n.source)}</i>` +
      `\n⛽ <a href="${SITE}">diesel-monitor.pp.ua</a>`;

    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: channel,
        text,
        parse_mode: 'HTML',
        link_preview_options: { is_disabled: true },
      }),
    }).then(r => r.json());

    if (!res.ok) throw new Error(`Telegram API: ${JSON.stringify(res)}`);
    posted.add(n.url);
    console.log(`tg-news: опубліковано «${n.title.slice(0, 60)}»`);
    await new Promise(r => setTimeout(r, 1500));
  }

  await writeFile(
    path.join(DATA_DIR, 'tg-news-posted.json'),
    JSON.stringify({ urls: [...posted].slice(-POSTED_CAP), updated: new Date().toISOString() })
  );
}

main().catch(e => {
  console.error('tg-news ЗБІЙ:', e.message);
  process.exit(1);
});
