// Чи свіжа карта мереж у latest.json.
//
// ⚠️ latest.networks може бути старшою за latest.date: коли /tm/ не відповів,
// збирач лишає попередню карту з позначкою networksDate. Instagram писав по ній
// «Де сьогодні найдешевший…» — тижнева карта йшла людям як сьогоднішня
// (знахідка Astra 27.09, S4). Слово Роса: «Не выдавать за сегодняшние».
//
// ⚠️ Ревізія S4 30.09: «свіжа» — ще не «сьогоднішня». У вихідні Мінфін цін не
// публікує, і в неділю latest.json лишається п'ятничним — дата карти дорівнює
// даті даних, але «сьогодні» в неділю — неправда. Те саме, коли крон запізнився
// за північ за Києвом. Слово «сьогодні» — лише за networksAreToday.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * true — карта мереж зібрана в день даних. networksDate немає (знімки до
 * 25.09.2026) — свіжа, як і було; будь-яке інше значення, крім ISO-дати, що
 * дорівнює date, — НЕ свіжа (порожній рядок, «2026-9-29», число).
 */
export function networksAreFresh(latest) {
  const nd = latest?.networksDate;
  if (nd === undefined || nd === null) return true;
  return typeof nd === 'string' && ISO_DAY.test(nd) && nd === latest.date;
}

/** Календарна дата за Києвом, 'YYYY-MM-DD'. */
export function kyivDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

/** true — і дані, і карта мереж саме за сьогодні за Києвом: лише тоді «сьогодні». */
export function networksAreToday(latest, now = new Date()) {
  return networksAreFresh(latest) && latest?.date === kyivDate(now);
}

/** 'YYYY-MM-DD' → 'DD.MM' для підпису; не ISO-дата — порожній рядок. */
export const shortDate = iso =>
  typeof iso === 'string' && ISO_DAY.test(iso) ? iso.split('-').reverse().slice(0, 2).join('.') : '';
