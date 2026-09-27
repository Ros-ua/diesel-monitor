// Чи свіжа карта мереж у latest.json.
//
// ⚠️ latest.networks може бути старшою за latest.date: коли /tm/ не відповів,
// збирач лишає попередню карту з позначкою networksDate. Instagram писав по ній
// «Де сьогодні найдешевший…» — тижнева карта йшла людям як сьогоднішня
// (знахідка Astra 27.09, S4). Слово Роса: «Не выдавать за сегодняшние».

/** true — карта мереж зібрана в день даних (networksDate немає або дорівнює date). */
export function networksAreFresh(latest) {
  if (!latest?.networksDate) return true;
  return latest.networksDate === latest.date;
}

/** 'YYYY-MM-DD' → 'DD.MM' для підпису. */
export const shortDate = iso => (iso ? iso.split('-').reverse().slice(0, 2).join('.') : '');
