// Парсери сторінок index.minfin.com.ua (ціни на пальне).
// Сторінка віддається у windows-1251, але окремі рядки (назви областей)
// всередині — UTF-8, тому після декодування їх треба "ремонтувати".

const dec1251 = new TextDecoder('windows-1251');

// Зворотна мапа: символ → байт windows-1251 (будується один раз)
const charToByte = (() => {
  const map = new Map();
  const buf = new Uint8Array(1);
  for (let b = 0; b < 256; b++) {
    buf[0] = b;
    map.set(dec1251.decode(buf), b);
  }
  return map;
})();

/** Ремонт мохибейка: рядок, який був UTF-8, але декодований як windows-1251 */
export function fixMojibake(s) {
  const bytes = [];
  for (const ch of s) {
    const b = charToByte.get(ch);
    if (b === undefined) return s; // не 1251-символ — рядок і так нормальний
    bytes.push(b);
  }
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes));
    // якщо після ремонту стало "більш кирилично" — беремо ремонт
    const cyr = str => (str.match(/[а-яіїєґА-ЯІЇЄҐ]/g) || []).length;
    return cyr(utf8) >= cyr(s) ? utf8 : s;
  } catch {
    return s; // не був UTF-8 — залишаємо як є
  }
}

function cleanText(s) {
  return fixMojibake(
    s.replace(/<[^>]+>/g, '')
     .replace(/&nbsp;|&#160;/g, ' ')
     .replace(/&shy;/g, '')
     .replace(/&amp;/g, '&')
     .replace(/\s+/g, ' ')
     .trim()
  );
}

function num(s) {
  const v = parseFloat(String(s).replace(',', '.').replace(/[^\d.]/g, ''));
  return Number.isFinite(v) ? v : null;
}

export async function fetchPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const bytes = await res.arrayBuffer();
  // Кодування різне: жива сторінка — windows-1251, архівні снапшоти — utf-8.
  // Визначаємо за <meta charset> у перших кілобайтах (ASCII в обох кодуваннях).
  const head = new TextDecoder('ascii').decode(bytes.slice(0, 4096));
  const m = head.match(/charset=["']?([\w-]+)/i);
  const enc = (m ? m[1] : 'windows-1251').toLowerCase();
  return enc.includes('utf') ? new TextDecoder('utf-8').decode(bytes) : dec1251.decode(bytes);
}

// Колонки таблиці detail: Оператор | А95+ | А95 | А92 | ДП | Газ
const FUEL_COLS = ['a95p', 'a95', 'a92', 'dp', 'gas'];

/**
 * Парсер таблиці «назва | А95+ | А95 | А92 | ДП | Газ».
 * З 29.07.2026 Мінфін розділив стару сторінку /detail/ на дві з такою ж
 * структурою: /tm/ (мережі АЗС) і /reg/ (області). Порожні клітинки в них
 * трапляються часто — мережа може не продавати якийсь вид пального.
 */
function parsePriceTable(html, label) {
  const out = {};

  for (const tabM of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    for (const rowM of tabM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...rowM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => c[1]);
      if (cells.length < 3) continue;

      const name = cleanText(cells[0]);
      // шапка й службові рядки
      if (!name || /Оператор|Область|Вид палива|Ціна/i.test(name)) continue;
      if (!/[а-яіїєґА-ЯІЇЄҐa-zA-Z]/.test(name)) continue;

      // Вирівнюємо З КІНЦЯ: у /tm/ між назвою і цінами є ще клітинка з лого,
      // у /reg/ її немає. Останні 5 клітинок — завжди А95+, А95, А92, ДП, Газ.
      const priceCells = cells.slice(-FUEL_COLS.length);
      if (priceCells.length < FUEL_COLS.length) continue;

      const prices = {};
      priceCells.forEach((c, i) => {
        const v = num(cleanText(c)); // порожня клітинка → null, вид пального відсутній
        if (v !== null && v > 5 && v < 500) prices[FUEL_COLS[i]] = v;
      });
      if (Object.keys(prices).length) out[name] = prices;
    }
  }

  if (!Object.keys(out).length) throw new Error(`${label}: таблицю не знайдено`);
  return out;
}

/** /ua/markets/fuel/tm/ → { <мережа>: {a95p,a95,a92,dp,gas} } */
export function parseNetworks(html) {
  return parsePriceTable(html, 'tm');
}

/** /ua/markets/fuel/reg/ → { <область>: {a95p,a95,a92,dp,gas} } */
export function parseRegionAverages(html) {
  const raw = parsePriceTable(html, 'reg');
  // назви приходять як «Вінницька», «Дніпро­петровська» (з мʼяким переносом) —
  // приводимо до вигляду, який уже використовується на сайті
  const out = {};
  for (const [name, prices] of Object.entries(raw)) {
    out[name.replace(/\s*обл\.?$/i, '').trim()] = prices;
  }
  return out;
}

/**
 * Парсить detail-сторінку: повертає { regions: { <область>: { <мережа>: {a95p,a95,a92,dp,gas} } } }
 * Не покладаємось на клас таблиці (він змінювався: 'zebra', 'line'…) — обходимо всі таблиці,
 * всередині сегменти областей розділені рядками з colspan-заголовком «… обл.».
 */
export function parseDetail(html) {
  const regions = {};
  let current = null;

  for (const tabM of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let m;
    while ((m = rowRe.exec(tabM[1])) !== null) {
      const row = m[1];
      const colspan = row.match(/<t[dh][^>]*colspan[^>]*>([\s\S]*?)<\/t[dh]>/);
      if (colspan) {
        const name = cleanText(colspan[1]);
        // заголовок області (пропускаємо службові типу "Оператор" і порожні)
        if (name && !/Оператор|А\s*9|ДП|Газ|Ціни|информ|інформ/i.test(name) && /[а-яіїєґА-ЯІЇЄҐ]/.test(name)) {
          current = name.replace(/\s*обл\.?$/i, '').trim();
          regions[current] ??= {};
        }
        continue;
      }
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1]);
      if (cells.length < 6 || !current) continue;
      const network = cleanText(cells[0]);
      if (!network || /Оператор/i.test(network)) continue;
      // cells: [назва, лого, а95+, а95, а92, дп, газ] або без лого — вирівнюємо з кінця
      const priceCells = cells.slice(-5);
      const prices = {};
      priceCells.forEach((c, i) => {
        const v = num(cleanText(c));
        if (v !== null && v > 5 && v < 500) prices[FUEL_COLS[i]] = v;
      });
      if (Object.keys(prices).length) regions[current][network] = prices;
    }
  }

  // прибираємо порожні області
  for (const [name, nets] of Object.entries(regions)) {
    if (!Object.keys(nets).length) delete regions[name];
  }
  if (!Object.keys(regions).length) throw new Error('detail: таблицю не знайдено');
  return { regions };
}

// Назви пального на сторінці середніх цін → наші ключі
const AVG_NAMES = [
  [/95\s*прем/i, 'a95p'],
  [/95/, 'a95'],
  [/92/, 'a92'],
  [/[Дд]изель|ДП/, 'dp'],
  [/[Гг]аз/, 'gas'],
];

/**
 * Парсить сторінку середніх цін: { avg: {dp,...}, change: {dp,...}, date: 'DD.MM.YYYY'|null }
 * Розмітка різниться між роками (колонка з лого, ціна в <big>, знак зміни у CSS-класі),
 * тож шукаємо в кожному рядку першу «схожу на ціну» комірку.
 */
/**
 * Дата сторінки — тільки правдоподібна і тільки з явної позначки.
 *
 * ⚠️ 12.09.2026. Раніше тут стояв один регексп, де альтернатива «на» була БЕЗ
 * межі слова — і збігалася всередині «ціна», «зміна», «сторона». На сторінці
 * «Архів цін НА 28.07.2026 … Оновлення: 12.09.2026» бралася перша, тобто
 * архівна. Наслідок гірший за втрату свіжості: сьогоднішні ціни лягали під
 * 28.07, **історичний день затирався**, а точки за сьогодні не лишалося зовсім.
 * Меж не було жодних: 31.12.2099 і 01.01.1999 приймалися мовчки.
 *
 * Тепер: спершу шукаємо явні «оновлення»/«станом на», потім голе «на» як слово,
 * і в будь-якому разі вимагаємо правдоподібності — не з майбутнього і не
 * старше тижня. Незрозуміле — null: хай збір чесно візьме сьогоднішнє число.
 */
export function знайтиДату(html, сьогодні = new Date()) {
  const шаблони = [
    /(?:оновлення|станом\s+на)\s*[:;]?\s*(?:&nbsp;|\s)*(\d{2}\.\d{2}\.\d{4})/i,
    /(?:^|[\s>(,;:])на\s*[:;]?\s*(?:&nbsp;|\s)*(\d{2}\.\d{2}\.\d{4})/i,
  ];
  for (const re of шаблони) {
    const m = html.match(re);
    if (!m) continue;
    const [d, mo, y] = m[1].split('.').map(Number);
    const коли = new Date(Date.UTC(y, mo - 1, d));
    if (Number.isNaN(коли.getTime())) continue;
    const діб = (Date.UTC(сьогодні.getUTCFullYear(), сьогодні.getUTCMonth(),
                          сьогодні.getUTCDate()) - коли.getTime()) / 86400000;
    // ⚠️ Допуск на добу вперед: сторінка живе за київським часом, а тут UTC.
    // Перша ж проба це й спіймала: о 06-й ранку в Києві в UTC ще вчора,
    // і сьогоднішня дата відкидалася як «з майбутнього».
    if (діб < -1 || діб > 7) continue;   // з майбутнього або старша за тиждень
    return m[1];
  }
  return null;
}

export function parseAverages(html) {
  const avg = {};
  const change = {};
  const dateM = { 1: знайтиДату(html) };
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const rawCells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => c[1]);
    if (rawCells.length < 2) continue;
    const cells = rawCells.map(cleanText);
    const key = AVG_NAMES.find(([re]) => re.test(cells[0]))?.[1];
    if (!key || key in avg) continue;
    // перша комірка, що виглядає як ціна грн/л
    let priceIdx = -1;
    for (let i = 1; i < cells.length; i++) {
      const v = num(cells[i]);
      if (v !== null && v >= 5 && v <= 500 && !cells[i].includes('%')) {
        priceIdx = i;
        break;
      }
    }
    if (priceIdx < 0) continue;
    avg[key] = num(cells[priceIdx]);
    // наступна числова комірка без '%' — денна зміна; знак — з тексту або CSS-класу
    for (let i = priceIdx + 1; i < cells.length; i++) {
      if (cells[i].includes('%')) continue;
      const ch = num(cells[i]);
      if (ch === null) continue;
      if (Math.abs(ch) < 30) {
        const negative = /[-−]/.test(cells[i]) || /d-negative/.test(rawCells[i]);
        change[key] = negative ? -ch : ch;
      }
      break;
    }
  }
  if (!('dp' in avg)) throw new Error('averages: ціну ДП не знайдено');
  return { avg, change, date: dateM ? dateM[1] : null };
}

/** Медіана */
export function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

/**
 * Національні ціни мереж = медіана по областях, де мережа присутня.
 * Повертає { <мережа>: { прайси..., regionCount } }
 */
export function nationalNetworks(regions) {
  const byNetwork = {};
  for (const nets of Object.values(regions)) {
    for (const [name, prices] of Object.entries(nets)) {
      byNetwork[name] ??= {};
      for (const [fuel, v] of Object.entries(prices)) {
        (byNetwork[name][fuel] ??= []).push(v);
      }
    }
  }
  const out = {};
  for (const [name, fuels] of Object.entries(byNetwork)) {
    const entry = { regionCount: Math.max(...Object.values(fuels).map(a => a.length)) };
    for (const [fuel, vals] of Object.entries(fuels)) {
      entry[fuel] = Math.round(median(vals) * 100) / 100;
    }
    out[name] = entry;
  }
  return out;
}
