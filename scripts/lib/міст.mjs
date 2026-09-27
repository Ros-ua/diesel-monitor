/**
 * Стан мосту Instagram ↔ Telegram — БЕЗ ніків людей.
 *
 * ⚠️ Стан лежить у гілці ig-bridge-state, а репозиторій ПУБЛІЧНИЙ: ніки
 * коментаторів (`who`) ставали публічними й були блокером App Review. Слово
 * Роса 26.09: «Не хранить + стереть старые (Recommended)». Для відповіді в
 * Instagram досить id коментаря / співрозмовника; нік людина бачить у самому
 * повідомленні в Telegram (приватний чат власника).
 */
export const записКоментаря = c => ({ kind: 'comment', id: c.id });
export const записДиректу = m => ({ kind: 'dm', id: m.from?.id });

/** Прибирає `who` з усіх записів карти; решту стану (що вже бачили, зсув Telegram) лишає як є. */
export function безНіків(state) {
  const map = {};
  for (const [k, v] of Object.entries(state?.map ?? {})) {
    const { who, ...решта } = v ?? {};
    map[k] = решта;
  }
  return { ...state, map };
}
