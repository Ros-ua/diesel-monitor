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
/**
 * Схоже на ціну? Число з необов'язковою одиницею — і більше нічого.
 *
 * ⚠️ 12.09.2026, з другого заходу. Спершу шапку від даних відрізняла наявність
 * ЛІТЕРИ — і «70,95 грн» ламало це одразу: літери є, тож клітинка вважалася
 * підписом колонки, а рядок мережі «Газпром» — шапкою. Після цього ціни всіх
 * інших мереж розліталися по чужих видах пального. Питати треба не «чи є
 * літера», а «чи схоже це на ціну»: схоже — значить це дані.
 */
function цінаЛи(текст) {
  return /^[-–—+]?\s*\d{1,3}(?:[.,]\d{1,2})?\s*(?:грн|uah|₴)?\s*(?:\/\s*л)?\.?$/i
    .test(текст);
}

/** Клітинка з лого: картинка або текст, який не є ціною. */
function логоЛі(сира) {
  if (/<img\b/i.test(сира)) return true;
  const текст = cleanText(сира);
  return текст !== '' && !цінаЛи(текст);
}

/**
 * Підписи колонок → наші ключі. `null` означає «впізнали, але не беремо»:
 * преміальний різновид треба саме ВПІЗНАТИ, інакше «ДП+» займе місце
 * справжнього «ДП», і дизель або зникне, або підміниться дорожчим.
 *
 * Правила з двома переглядами вперед читаються як «І»: у підписі є і вид
 * пального, і ознака преміальності — у будь-якому порядку і з будь-якими
 * словами між ними. Саме цього бракувало першій спробі: «ДП+» вона впізнавала,
 * а «ДП Євро+» — ні, і дизель знову виходив 62 замість 60. «Газ Premium» вона
 * віддавала в А-95 преміум, бо ознака преміальності перевірялася без виду.
 */
const ЗАГОЛОВКИ_КОЛОНОК = [
  [/(?=[\s\S]*(?:дп|дизел))(?=[\s\S]*(?:\+|прем|premium))/i, null],
  [/(?=[\s\S]*газ)(?=[\s\S]*(?:\+|прем|premium))/i, null],
  [/(?=[\s\S]*92)(?=[\s\S]*(?:\+|прем|premium))/i, null],
  [/(?=[\s\S]*95)(?=[\s\S]*(?:\+|прем|premium))/i, 'a95p'],
  [/95/, 'a95'],
  [/92/, 'a92'],
  [/дизел|дп/i, 'dp'],
  [/газ/i, 'gas'],
];

/**
 * Карта колонок за ШАПКОЮ таблиці: { індекс клітинки -> вид пального }.
 *
 * ⚠️ Раніше ціни бралися як п'ять ОСТАННІХ клітинок рядка, без жодної
 * прив'язки до шапки. Зайва колонка (наприклад «ДП+») зсувала все: дизель
 * виходив 30,00 замість 60,00 — удвічі дешевше, і це проходило єдину перевірку
 * «від 5 до 500» без жодної тривоги. Мінфін уже перебудовував ці сторінки
 * 29.07.2026, тож випадок не вигаданий.
 *
 * Повертає { карта, заголовок } або null, якщо шапки немає чи вона незрозуміла.
 */
function картаКолонок(таблиця) {
  for (const rowM of таблиця.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const клітинки = [...rowM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)]
      .map(c => cleanText(c[1]));
    const карта = {};
    const види = new Set();
    клітинки.forEach((текст, i) => {
      if (!текст || цінаЛи(текст)) return;      // це ціна, а не підпис колонки
      const n = ЗАГОЛОВКИ_КОЛОНОК.findIndex(([re]) => re.test(текст));
      if (n < 0) return;
      // ⚠️ Рахуємо РІЗНІ види, а не збіги. Раніше рядок «Примітка | ДП | ДП |
      // ДП» давав три збіги і ставав шапкою — хоча вид там один.
      види.add(n);
      const вид = ЗАГОЛОВКИ_КОЛОНОК[n][1];
      if (!вид) return;                          // впізнали і не беремо
      if (Object.values(карта).includes(вид)) return;   // перша колонка перемагає
      карта[i] = вид;
    });
    if (види.size >= 3) return { карта, заголовок: rowM[0] };
  }
  return null;
}

function parsePriceTable(html, label) {
  const out = {};

  for (const tabM of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const шапка = картаКолонок(tabM[1]);
    for (const rowM of tabM[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      if (шапка && rowM[0] === шапка.заголовок) continue;   // сам рядок шапки
      const cells = [...rowM[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map(c => c[1]);
      if (cells.length < 3) continue;

      const name = cleanText(cells[0]);
      // шапка й службові рядки
      if (!name || /Оператор|Область|Вид палива|Ціна/i.test(name)) continue;
      if (!/[а-яіїєґА-ЯІЇЄҐa-zA-Z]/.test(name)) continue;

      const prices = {};
      if (шапка) {
        // Головний шлях: ціна береться з колонки, НАЗВАНОЇ в шапці.
        for (const [i, вид] of Object.entries(шапка.карта)) {
          const v = num(cleanText(cells[i] ?? '')); // порожня клітинка → null
          if (v !== null && v > 5 && v < 500) prices[вид] = v;
        }
      } else {
        // Запасний шлях, коли шапки немає. Вирівнюємо З КІНЦЯ: у /tm/ між
        // назвою і цінами є ще клітинка з лого, у /reg/ її немає.
        //
        // ⚠️ Але тільки коли клітинок РІВНО стільки, скільки чекаємо (назва,
        // можливо лого, і п'ять цін). Зайва колонка означає, що верстка
        // змінилася, і вгадувати не можна: саме так дизель виходив 30,00
        // замість 60,00. Краще чесно пропустити рядок, ніж опублікувати
        // половинну ціну.
        // ⚠️ Менше шести клітинок — це не «назва і п'ять цін»: зріз із кінця
        // захопив би саму назву, і з «БРСМ 24» народжувалася б ціна А-95+ 24.
        if (cells.length < FUEL_COLS.length + 1) continue;
        if (cells.length > FUEL_COLS.length + 2) continue;
        // ⚠️ Сім клітинок бувають ДВОХ різних форм: [назва, лого, 5 цін] — так
        // влаштована /tm/ — і [назва, 6 цін], тобто з зайвою колонкою. За
        // довжиною вони не відрізняються, і другий випадок знову дає зсув.
        // Тому вимагаємо, щоб друга клітинка БУЛА лого: картинка або текст,
        // який не є ціною. Порожня клітинка не доводить нічого — відмовляємось,
        // бо чесний пропуск дешевший за половинну ціну на дизель.
        if (cells.length === FUEL_COLS.length + 2 && !логоЛі(cells[1])) continue;
        const priceCells = cells.slice(-FUEL_COLS.length);
        if (priceCells.length < FUEL_COLS.length) continue;
        priceCells.forEach((c, i) => {
          const v = num(cleanText(c)); // порожня клітинка → null, вид відсутній
          if (v !== null && v > 5 && v < 500) prices[FUEL_COLS[i]] = v;
        });
      }
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
    const шапка = картаКолонок(tabM[1]);
    let m;
    while ((m = rowRe.exec(tabM[1])) !== null) {
      if (шапка && m[0] === шапка.заголовок) continue;   // сам рядок шапки
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
      // ⚠️ Те саме, що в parsePriceTable: колонка визначається ШАПКОЮ, а не
      // порядком з кінця. Зайва колонка тут так само зсувала дизель.
      const prices = {};
      if (шапка) {
        for (const [i, вид] of Object.entries(шапка.карта)) {
          const v = num(cleanText(cells[i] ?? ''));
          if (v !== null && v > 5 && v < 500) prices[вид] = v;
        }
      } else {
        // cells: [назва, лого, а95+, а95, а92, дп, газ] або без лого.
        // Те саме розрізнення, що і в parsePriceTable: сім клітинок — дві різні
        // форми, і друга клітинка мусить БУТИ лого, інакше це зайва колонка.
        if (cells.length > FUEL_COLS.length + 2) continue;
        if (cells.length === FUEL_COLS.length + 2 && !логоЛі(cells[1])) continue;
        const priceCells = cells.slice(-5);
        priceCells.forEach((c, i) => {
          const v = num(cleanText(c));
          if (v !== null && v > 5 && v < 500) prices[FUEL_COLS[i]] = v;
        });
      }
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

/**
 * Таблиця середніх цін — РІВНО ТА, до якої належить підпис
 * «Середні ціни на пальне по Україні [на DD.MM.YYYY]».
 *
 * ⚠️ 12.09.2026. Раніше ціни бралися з УСЬОГО документа: перший рядок на кожен
 * вид пального, хоч би де він лежав. Архівна таблиця, що стоїть вище по
 * сторінці, тихо перехоплювала головне число сайту — прогін збирача з
 * підставленою таблицею «Ціни рік тому» дав dp:40 замість dp:60, і журнал у
 * тому ж рядку рапортував успіх. Це число йде на сайт, у Telegram, в Instagram
 * і в опис для Google.
 *
 * Нуль підходящих таблиць або кілька — відмова джерела: parseAverages обгорнуто
 * в tryParse, тож збір уціліє на решті джерел і чесно про це скаже. Мовчки
 * опублікувати торішню ціну — дорожче.
 *
 * Підпис шукаємо в самій таблиці й у тексті БЕЗПОСЕРЕДНЬО перед нею (останні
 * 400 знаків до попередньої таблиці): заголовок сторінки стоїть далеко і
 * дістатися до нього не повинен.
 */
const ПІДПИС_СЕРЕДНІХ = /середн\S*\s+цін\S*\s+на\s+пальне/i;

function таблицяСередніх(html, датаСторінки) {
  const кандидати = [];
  let кінецьПопередньої = 0;
  for (const m of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const перед = html.slice(кінецьПопередньої, m.index).slice(-400);
    кінецьПопередньої = m.index + m[0].length;
    const підпис = cleanText(перед + ' ' + m[1].slice(0, 600));
    const де = підпис.search(ПІДПИС_СЕРЕДНІХ);
    if (де < 0) continue;
    // Дата в підписі мусить збігатися з датою сторінки — інакше це архів.
    // ⚠️ Беремо дату ОДРАЗУ ПІСЛЯ підпису, а не першу-ліпшу: перед таблицею
    // стоїть ще заголовок сторінки «Оновлення: DD.MM.YYYY», і саме він
    // підхоплювався — торішня таблиця через це проходила як сьогоднішня.
    // Спіймала проба, а не я.
    const дата = підпис.slice(де, де + 120).match(/(\d{2}\.\d{2}\.\d{4})/);
    if (дата && датаСторінки && дата[1] !== датаСторінки) continue;
    кандидати.push(m[1]);
  }
  if (кандидати.length !== 1) {
    throw new Error('averages: таблиць із підписом «середні ціни на пальне» — '
                    + кандидати.length + ', а треба рівно одна');
  }
  return кандидати[0];
}

export function parseAverages(html) {
  const avg = {};
  const change = {};
  const дата = знайтиДату(html);
  // ⚠️ Рядки беремо ТІЛЬКИ з обраної таблиці, а не з усього документа.
  const таблиця = таблицяСередніх(html, дата);
  const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(таблиця)) !== null) {
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
  return { avg, change, date: дата };
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
