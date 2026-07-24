// Пости новин у Telegram-канал (запускається з news.yml кожні 2 години).
// Канал = «дзеркало ринку»: постить новини В ТОЙ БІК, куди йде тренд цін на дизель.
//   тренд угору  → 🔴 новини подорожчання (impact=up)
//   тренд униз   → 🟢 новини здешевлення (impact=down)
//   бічний тренд → обидві сторони
// (На САЙТІ показуються всі новини — фільтр за трендом лише для каналу.)
// Стан — public/data/tg-news-posted.json (список URL, комітиться разом з новинами).
//   env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const SITE = 'https://diesel-monitor.pp.ua';
// Ліміти можна перекрити env-змінними (для разового бекфілу архіву)
const MAX_PER_RUN = Number(process.env.TG_NEWS_MAX) || 1; // 1 новина за запуск (не спамимо)
const FRESH_HOURS = Number(process.env.TG_NEWS_FRESH_HOURS) || 12; // лише свіжі
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

// Напрям тренду середньої ціни дизеля за ~14 днів.
// Повертає які impact-и постити в канал: ['up'] / ['down'] / ['up','down'].
const TREND_DAYS = 14;
const TREND_PCT = 1; // поріг «бічного» тренду, %

function allowedImpacts(history) {
  const days = (history?.days ?? []).filter(d => d.avg?.dp !== undefined);
  if (days.length < 2) return { allowed: ['up', 'down'], dir: 'flat', pct: null };
  const last = days[days.length - 1];
  const targetTime = new Date(last.date).getTime() - TREND_DAYS * 86_400_000;
  // найближча точка до дати «14 днів тому» (історія розріджена)
  let base = null,
    best = Infinity;
  for (let i = days.length - 2; i >= 0; i--) {
    const dist = Math.abs(new Date(days[i].date).getTime() - targetTime);
    if (dist < best) {
      best = dist;
      base = days[i];
    }
    if (new Date(days[i].date).getTime() < targetTime) break;
  }
  // база має бути не далі 25 днів від цілі, інакше тренд ненадійний → бічний
  if (!base || best > 25 * 86_400_000) return { allowed: ['up', 'down'], dir: 'flat', pct: null };
  const pct = ((last.avg.dp - base.avg.dp) / base.avg.dp) * 100;
  if (pct >= TREND_PCT) return { allowed: ['up'], dir: 'up', pct };
  if (pct <= -TREND_PCT) return { allowed: ['down'], dir: 'down', pct };
  return { allowed: ['up', 'down'], dir: 'flat', pct };
}

async function main() {
  if (!token || !channel) {
    console.log('tg-news: TELEGRAM_BOT_TOKEN або TELEGRAM_CHANNEL не задані — пропускаю');
    return;
  }

  const news = await readJson('news.json');
  const history = await readJson('history.json', { days: [] });
  const state = await readJson('tg-news-posted.json', { urls: [] });
  const posted = new Set(state.urls);
  const freshAfter = Date.now() - FRESH_HOURS * 3_600_000;

  // напрям каналу за трендом цін на дизель
  const { allowed, dir, pct } = allowedImpacts(history);
  console.log(
    `tg-news: тренд дизеля ${dir}${pct !== null ? ` (${pct > 0 ? '+' : ''}${pct.toFixed(1)}% за ~${TREND_DAYS}д)` : ''} → постимо: ${allowed.join(', ')}`
  );

  const candidates = (news?.items ?? [])
    .filter(
      n =>
        allowed.includes(n.impact) &&
        n.url &&
        !posted.has(n.url) &&
        n.publishedAt &&
        new Date(n.publishedAt).getTime() >= freshAfter
    )
    // старіші перші — у каналі буде хронологічний порядок
    .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
    .slice(0, MAX_PER_RUN);

  if (!candidates.length) {
    console.log('tg-news: свіжих новин у напрямі тренду немає');
    return;
  }

  for (const n of candidates) {
    // короткий зміст: без обірваного хвоста посередині слова
    let summary = (n.summary || '').trim();
    if (summary.length > 280) summary = summary.slice(0, 280).replace(/\s+\S*$/, '') + '…';
    // не дублюємо заголовок, якщо зміст із нього починається
    if (summary && n.title && summary.startsWith(n.title.slice(0, 40))) summary = '';

    // 🔴 подорожчання / 🟢 здешевлення — за impact самої новини
    const icon = n.impact === 'down' ? '🟢' : '🔴';
    const text =
      `${icon} <b>${esc(n.title)}</b>` +
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
    await new Promise(r => setTimeout(r, 3100));
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
