// Міст Instagram ↔ Telegram.
//
// Кожен запуск робить дві речі:
//   1) забирає з Instagram нові коментарі й повідомлення → шле власнику в Telegram
//   2) забирає з Telegram відповіді (реплаї на ці сповіщення) → шле назад в Instagram
//
// Стан (що вже переслано, який tg-меседж якому коментарю відповідає) лежить
// у гілці ig-bridge-state, файл state.json — щоб не смітити в історії main.
//
// env: INSTAGRAM_TOKEN, TELEGRAM_BOT_TOKEN, TG_OWNER_CHAT (chat_id власника)

import { readFile, writeFile } from 'node:fs/promises';

const IG = 'https://graph.instagram.com/v23.0';
const igToken = process.env.INSTAGRAM_TOKEN;
const tgToken = process.env.TELEGRAM_BOT_TOKEN;
const owner = process.env.TG_OWNER_CHAT;
const STATE_FILE = 'state.json';

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function igGet(pathname, params = {}) {
  const url = new URL(`${IG}/${pathname}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('access_token', igToken);
  const res = await fetch(url).then(r => r.json());
  if (res.error) throw new Error(`IG ${pathname}: ${res.error.message}`);
  return res;
}

async function igPost(pathname, body) {
  const res = await fetch(`${IG}/${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: igToken }),
  }).then(r => r.json());
  if (res.error) throw new Error(`IG ${pathname}: ${res.error.message}`);
  return res;
}

async function tg(method, body) {
  const res = await fetch(`https://api.telegram.org/bot${tgToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json());
  if (!res.ok) throw new Error(`TG ${method}: ${JSON.stringify(res.description ?? res)}`);
  return res.result;
}

async function loadState() {
  try {
    return JSON.parse(await readFile(STATE_FILE, 'utf-8'));
  } catch {
    return { seenComments: [], seenMessages: [], map: {}, tgOffset: 0 };
  }
}

// ── 1. Instagram → Telegram ─────────────────────────────────────────────

async function pullComments(state) {
  const media = await igGet('me/media', { fields: 'id,caption,permalink,comments_count', limit: 15 });
  const seen = new Set(state.seenComments);
  let sent = 0;

  for (const m of media.data ?? []) {
    if (!m.comments_count) continue;
    let comments;
    try {
      comments = await igGet(`${m.id}/comments`, { fields: 'id,text,username,timestamp,replies' });
    } catch (e) {
      console.log(`коментарі ${m.id}: ${e.message}`);
      continue;
    }

    for (const c of comments.data ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);

      // власні відповіді не пересилаємо самі собі
      if (c.username === state.selfUsername) continue;

      const title = (m.caption ?? '').split('\n')[0].slice(0, 60);
      const msg = await tg('sendMessage', {
        chat_id: owner,
        parse_mode: 'HTML',
        text:
          `💬 <b>Коментар в Instagram</b>\n` +
          `від @${esc(c.username ?? '?')}\n\n` +
          `${esc(c.text ?? '')}\n\n` +
          `<i>під постом: ${esc(title)}</i>\n` +
          `<a href="${m.permalink}">відкрити в Instagram</a>\n\n` +
          `↩️ Відповідай реплаєм на це повідомлення`,
      });
      state.map[msg.message_id] = { kind: 'comment', id: c.id, who: c.username };
      sent++;
    }
  }

  state.seenComments = [...seen].slice(-500);
  return sent;
}

async function pullMessages(state) {
  let convs;
  try {
    convs = await igGet('me/conversations', { fields: 'id,participants', limit: 20 });
  } catch (e) {
    console.log(`діалоги: ${e.message}`);
    return 0;
  }

  const seen = new Set(state.seenMessages);
  let sent = 0;

  for (const conv of convs.data ?? []) {
    let thread;
    try {
      thread = await igGet(`${conv.id}`, { fields: 'messages{id,from,message,created_time}' });
    } catch (e) {
      console.log(`гілка ${conv.id}: ${e.message}`);
      continue;
    }

    for (const m of thread.messages?.data ?? []) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      if (m.from?.id === state.selfId) continue; // наші власні відповіді
      if (!m.message) continue;

      const msg = await tg('sendMessage', {
        chat_id: owner,
        parse_mode: 'HTML',
        text:
          `📩 <b>Особисте в Instagram</b>\n` +
          `від @${esc(m.from?.username ?? m.from?.id ?? '?')}\n\n` +
          `${esc(m.message)}\n\n` +
          `↩️ Відповідай реплаєм на це повідомлення`,
      });
      state.map[msg.message_id] = { kind: 'dm', id: m.from?.id, who: m.from?.username };
      sent++;
    }
  }

  state.seenMessages = [...seen].slice(-500);
  return sent;
}

// ── 2. Telegram → Instagram ─────────────────────────────────────────────

async function pushReplies(state) {
  const updates = await fetch(
    `https://api.telegram.org/bot${tgToken}/getUpdates?offset=${state.tgOffset}&timeout=0&allowed_updates=["message"]`
  ).then(r => r.json());

  if (!updates.ok) {
    console.log(`getUpdates: ${updates.description}`);
    return 0;
  }

  let sent = 0;
  for (const u of updates.result ?? []) {
    state.tgOffset = u.update_id + 1;
    const m = u.message;
    if (!m?.reply_to_message || !m.text) continue;
    if (String(m.chat?.id) !== String(owner)) continue;

    const target = state.map[m.reply_to_message.message_id];
    if (!target) continue;

    try {
      if (target.kind === 'comment') {
        await igPost(`${target.id}/replies`, { message: m.text });
      } else {
        await igPost('me/messages', {
          recipient: { id: target.id },
          message: { text: m.text },
        });
      }
      await tg('sendMessage', {
        chat_id: owner,
        reply_to_message_id: m.message_id,
        text: `✅ Відповідь надіслано @${target.who ?? ''} в Instagram`,
      });
      sent++;
    } catch (e) {
      await tg('sendMessage', {
        chat_id: owner,
        reply_to_message_id: m.message_id,
        text: `⚠️ Не вдалося відповісти: ${e.message}`,
      });
    }
  }
  return sent;
}

// ── запуск ──
async function main() {
  if (!igToken || !tgToken || !owner) {
    console.log('ig-bridge: немає INSTAGRAM_TOKEN / TELEGRAM_BOT_TOKEN / TG_OWNER_CHAT — пропускаю');
    return;
  }

  const state = await loadState();

  const me = await igGet('me', { fields: 'id,username' });
  state.selfId = me.id;
  state.selfUsername = me.username;

  const [c, d, r] = [await pullComments(state), await pullMessages(state), await pushReplies(state)];

  // карту тримаємо компактною — останні 200 звʼязок
  const keys = Object.keys(state.map);
  if (keys.length > 200) {
    state.map = Object.fromEntries(keys.slice(-200).map(k => [k, state.map[k]]));
  }

  await writeFile(STATE_FILE, JSON.stringify(state));
  console.log(`ig-bridge: коментарів ${c}, повідомлень ${d}, відповідей надіслано ${r}`);
}

main().catch(e => {
  console.error('ig-bridge ЗБІЙ:', e.message);
  process.exit(1);
});
