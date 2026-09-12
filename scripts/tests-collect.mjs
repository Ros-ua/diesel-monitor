/**
 * Наскрізні проби збирача: запускаємо СПРАВЖНІЙ collect.mjs з ПІДМІНЕНОЮ мережею.
 *
 * ⚠️ НАВІЩО. Три захисти були написані, але не перевірені нічим:
 *   1. `тількиУспішні` — відповідь мережі приймається лише при r.ok, інакше тіло
 *      помилки піде як дані;
 *   2. прапорці журналу рахуються ПО РЕЗУЛЬТАТУ перевірки, а не по факту
 *      відповіді: раніше `usd:true` стояло й тоді, коли в latest.json лягав null;
 *   3. `tryParse` на середніх цінах — зміна верстки не має валити ВЕСЬ збір.
 * Перевірити їх пробами розбору неможливо: вони живуть у збирачі, а не в
 * парсері. Тому тут підмінюється globalThis.fetch — і сторінки Мінфіну, і НБУ,
 * і Yahoo ходять через нього, тож одного гачка вистачає на все.
 *
 * Працюємо на КОПІЇ у тимчасовій теці: бойові дані не чіпаємо, у справжню
 * мережу не ходимо.
 *
 * ЗАПУСК:  node scripts/tests-collect.mjs
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

const сьогодні = new Intl.DateTimeFormat('uk-UA', {
  timeZone: 'Europe/Kyiv', day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date());

// ── сторінки-заглушки: рівно стільки розмітки, скільки треба розбирачам ──
const МЕРЕЖІ = ['ОККО', 'WOG', 'Укрнафта', 'БРСМ', 'AMIC'];
const ОБЛАСТІ = ['Вінницька', 'Волинська', 'Київська', 'Львівська', 'Одеська'];
const шапкаЦін =
  '<tr><th>Назва</th><th>А-95+</th><th>А-95</th><th>А-92</th><th>ДП</th><th>Газ</th></tr>';
const рядокЦін = назва =>
  `<tr><td>${назва}</td><td>70,00</td><td>68,00</td><td>65,00</td><td>60,00</td><td>30,00</td></tr>`;

const СТОРІНКА_TM = '<meta charset="utf-8"><h2>Середні ціни за провідними операторами</h2>'
  + `<table>${шапкаЦін}${МЕРЕЖІ.map(рядокЦін).join('')}</table>`;
const СТОРІНКА_REG = '<meta charset="utf-8"><h1>Динаміка цін на бензин, дизпаливо, газ на АЗС України</h1>'
  + `<table>${шапкаЦін}${ОБЛАСТІ.map(рядокЦін).join('')}</table>`;
const СТОРІНКА_AVG = '<meta charset="utf-8"><h2>Середні ціни на пальне</h2><table>'
  + '<tr><th>Вид палива</th><th>Ціна</th><th>Зміна</th></tr>'
  + '<tr><td>ДП</td><td>60,00</td><td>-0,10</td></tr>'
  + '<tr><td>А-95</td><td>68,00</td><td>0,05</td></tr>'
  + `</table><p>Оновлення: ${сьогодні}</p>`;
const СТОРІНКА_ПУСТА = '<meta charset="utf-8"><p>тут більше немає таблиці</p>';
const RSS_ПУСТИЙ = '<?xml version="1.0"?><rss><channel></channel></rss>';

const НБУ_ДОБРЕ = JSON.stringify([{ rate: 41.23 }]);
const BRENT_ДОБРЕ = JSON.stringify({
  chart: { result: [{ indicators: { quote: [{ close: [80.5] }] } }] },
});

// ── сценарії ──
const СЦЕНАРІЇ = [
  {
    імя: 'усе справне',
    мережа: {},
    чекаємо: (з) => [
      ['код виходу 0', з.код, 0],
      ['мереж у знімку', Object.keys(з.latest?.networks ?? {}).length, 5],
      ['курс USD записано', з.latest?.usd, 41.23],
      ['прапорець usd', з.журнал?.ok?.usd, true],
      ['прапорець averages', з.журнал?.ok?.averages, true],
      ['прапорець networks', з.журнал?.ok?.networks, true],
    ],
  },
  {
    // ⚠️ Тіло відповіді тут СПРАВЖНЄ на вигляд — саме так і перевіряється r.ok.
    // Якби помилка віддавала сміття, JSON.parse впав би і без перевірки статусу,
    // і підсадка «прибрати r.ok» лишилася б непоміченою.
    імя: 'НБУ відповідає 500, але з правдоподібним тілом',
    мережа: { нбу: { ok: false, status: 500, тіло: НБУ_ДОБРЕ } },
    чекаємо: (з) => [
      ['збір усе одно вцілів', з.код, 0],
      ['курс НЕ записано', з.latest?.usd, undefined],
      ['прапорець usd чесний', з.журнал?.ok?.usd, false],
      ['ціни при цьому зібрані', Object.keys(з.latest?.networks ?? {}).length, 5],
    ],
  },
  {
    імя: 'НБУ віддає порожній курс',
    мережа: { нбу: { тіло: JSON.stringify([{ rate: '' }]) } },
    чекаємо: (з) => [
      ['порожній рядок не став нулем', з.latest?.usd, undefined],
      ['прапорець usd чесний і при порожньому курсі', з.журнал?.ok?.usd, false],
    ],
  },
  {
    // ⚠️ Саме цей випадок валив ВЕСЬ збір: жодного записаного файлу, навіть
    // журналу запуску, і сайт лишався з позавчорашньою ціною.
    імя: 'сторінка середніх цін перебудована',
    мережа: { avg: { тіло: СТОРІНКА_ПУСТА } },
    чекаємо: (з) => [
      ['збір вцілів', з.код, 0],
      ['журнал запуску записано', !!з.журнал, true],
      ['прапорець averages чесний', з.журнал?.ok?.averages, false],
      ['історію оновлено', !!з.історія, true],
    ],
  },
  {
    імя: 'усі джерела цін недоступні',
    мережа: {
      tm: { тіло: СТОРІНКА_ПУСТА }, reg: { тіло: СТОРІНКА_ПУСТА },
      detail: { тіло: СТОРІНКА_ПУСТА }, avg: { тіло: СТОРІНКА_ПУСТА },
    },
    чекаємо: (з) => [
      ['збір чесно впав', з.код, 1],
    ],
  },
];

// ── гачок мережі: пишемо у тимчасову теку ──
function гачок(мережа) {
  return `
const МЕРЕЖА = ${JSON.stringify(мережа)};
const СТОРІНКИ = ${JSON.stringify({
    tm: СТОРІНКА_TM, reg: СТОРІНКА_REG, detail: СТОРІНКА_ПУСТА, avg: СТОРІНКА_AVG,
  })};
const ТІЛА = ${JSON.stringify({ нбу: НБУ_ДОБРЕ, brent: BRENT_ДОБРЕ, rss: RSS_ПУСТИЙ })};

function якеДжерело(url) {
  if (url.includes('bank.gov.ua')) return url.includes('EUR') ? 'нбу_eur' : 'нбу';
  if (url.includes('yahoo')) return 'brent';
  if (url.includes('/tm/')) return 'tm';
  if (url.includes('/reg/')) return 'reg';
  if (url.includes('/detail/')) return 'detail';
  if (url.includes('minfin')) return 'avg';
  return 'rss';
}

globalThis.fetch = async (url) => {
  const ключ = якеДжерело(String(url));
  const свій = МЕРЕЖА[ключ] ?? (ключ === 'нбу_eur' ? МЕРЕЖА.нбу : undefined) ?? {};
  const типове = СТОРІНКИ[ключ] ?? (ключ === 'brent' ? ТІЛА.brent
    : ключ.startsWith('нбу') ? ТІЛА.нбу : ТІЛА.rss);
  const тіло = свій.тіло ?? типове;
  return {
    ok: свій.ok ?? true,
    status: свій.status ?? 200,
    async arrayBuffer() { return new TextEncoder().encode(тіло).buffer; },
    async json() { return JSON.parse(тіло); },
    async text() { return тіло; },
  };
};
`;
}

// ── прогін одного сценарію ──
function прогнати(сц) {
  const корінь = mkdtempSync(path.join(tmpdir(), 'diesel-collect-'));
  try {
    cpSync(SCRIPTS, path.join(корінь, 'scripts'), { recursive: true });
    mkdirSync(path.join(корінь, 'public/data'), { recursive: true });
    const гачокФайл = path.join(корінь, 'гачок.mjs');
    writeFileSync(гачокФайл, гачок(сц.мережа));

    let код = 0;
    try {
      execFileSync(process.execPath,
        ['--import', 'file:///' + гачокФайл.replace(/\\/g, '/'), 'scripts/collect.mjs'],
        { cwd: корінь, stdio: 'pipe', timeout: 120000 });
    } catch (e) {
      код = e.status ?? 1;
    }

    const читати = ім => {
      const f = path.join(корінь, 'public/data', ім);
      return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
    };
    const лог = читати('collect-log.json');
    return {
      код,
      latest: читати('latest.json'),
      історія: читати('history.json'),
      журнал: лог?.runs?.[лог.runs.length - 1] ?? null,
    };
  } finally {
    rmSync(корінь, { recursive: true, force: true });
  }
}

let провалів = 0;
for (const сц of СЦЕНАРІЇ) {
  console.log('');
  console.log('СЦЕНАРІЙ: ' + сц.імя);
  const з = прогнати(сц);
  for (const [назва, вийшло, чекали] of сц.чекаємо(з)) {
    const однаково = JSON.stringify(вийшло) === JSON.stringify(чекали);
    if (!однаково) провалів++;
    console.log(`  ${однаково ? '✅' : '❌'} ${назва.padEnd(34)} -> ${JSON.stringify(вийшло)}`);
    if (!однаково) console.log(`      чекали: ${JSON.stringify(чекали)}`);
  }
}

console.log('');
console.log(провалів ? `❌ ПРОВАЛІВ: ${провалів}` : '✅ усі наскрізні проби пройшли');
process.exit(провалів ? 1 : 0);
