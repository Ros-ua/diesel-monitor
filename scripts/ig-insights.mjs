// Тижнева зведення по Instagram у Telegram власнику.
//
// Лайки й коментарі доступні з базовим правом (instagram_business_basic).
// Охоплення й перегляди потребують instagram_business_manage_insights — його
// Meta наразі не дає без App Review, тож беремо їх «якщо вийде» і мовчки
// пропускаємо, коли ні. Коли право зʼявиться — рядки додадуться самі.
//
// env: INSTAGRAM_TOKEN, TELEGRAM_BOT_TOKEN, TG_OWNER_CHAT

const API = 'https://graph.instagram.com/v23.0';
const igToken = process.env.INSTAGRAM_TOKEN;
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const owner = process.env.TG_OWNER_CHAT;
const DAYS = 7;

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function ig(pathname, params = {}) {
  const url = new URL(`${API}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', igToken);
  const res = await fetch(url).then(r => r.json());
  if (res.error) throw new Error(`${pathname}: ${res.error.message}`);
  return res;
}

// охоплення — лише якщо право видали; інакше повертаємо null без галасу
async function reach(mediaId) {
  try {
    const r = await ig(`${mediaId}/insights`, { metric: 'reach' });
    return r.data?.[0]?.values?.[0]?.value ?? r.data?.[0]?.total_value?.value ?? null;
  } catch {
    return null;
  }
}

async function main() {
  if (!igToken || !tgToken || !owner) {
    console.log('ig-insights: немає токенів — пропускаю');
    return;
  }

  const me = await ig('me', { fields: 'id,username,followers_count,media_count' });
  const media = await ig('me/media', {
    fields: 'id,caption,permalink,timestamp,like_count,comments_count,media_type',
    limit: 25,
  });

  const since = Date.now() - DAYS * 86_400_000;
  const recent = (media.data ?? []).filter(m => new Date(m.timestamp).getTime() >= since);

  if (!recent.length) {
    console.log('ig-insights: постів за тиждень немає — пропускаю');
    return;
  }

  const withReach = [];
  for (const m of recent) withReach.push({ ...m, reach: await reach(m.id) });

  const totalLikes = withReach.reduce((s, m) => s + (m.like_count ?? 0), 0);
  const totalComments = withReach.reduce((s, m) => s + (m.comments_count ?? 0), 0);
  const best = [...withReach].sort(
    (a, b) => (b.like_count ?? 0) + (b.comments_count ?? 0) - ((a.like_count ?? 0) + (a.comments_count ?? 0))
  )[0];

  const line = m => {
    const t = (m.caption ?? '').split('\n')[0].replace(/^[^\p{L}\d]+/u, '').slice(0, 46);
    const d = new Date(m.timestamp);
    const day = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    const r = m.reach !== null ? ` · 👁 ${m.reach}` : '';
    return `${day} ❤️ ${m.like_count ?? 0} · 💬 ${m.comments_count ?? 0}${r}\n<i>${esc(t)}…</i>`;
  };

  const text =
    `📈 <b>Instagram за тиждень</b>\n\n` +
    `Підписників: <b>${me.followers_count ?? '—'}</b> · публікацій усього: ${me.media_count ?? '—'}\n` +
    `За 7 днів: постів ${recent.length}, лайків ${totalLikes}, коментарів ${totalComments}\n\n` +
    withReach.slice(0, 7).map(line).join('\n\n') +
    (best ? `\n\n🏆 Найкращий: <a href="${best.permalink}">відкрити</a>` : '') +
    (withReach.every(m => m.reach === null)
      ? `\n\n<i>Охоплення поки недоступне — Meta дає його лише після App Review.</i>`
      : '');

  const res = await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: owner,
      text,
      parse_mode: 'HTML',
      link_preview_options: { is_disabled: true },
    }),
  }).then(r => r.json());
  if (!res.ok) throw new Error(`Telegram: ${JSON.stringify(res)}`);

  console.log(`ig-insights: зведення надіслано (${recent.length} постів за тиждень)`);
}

main().catch(e => {
  console.error('ig-insights ЗБІЙ:', e.message);
  process.exit(1);
});
