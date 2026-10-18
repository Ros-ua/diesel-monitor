/**
 * Проби GEO-розмітки: JSON-LD на сторінках і файл llms.txt.
 *
 * ⚠️ НАВІЩО. Ця розмітка — це те, що про наші ціни прочитає МАШИНА: Google,
 * ChatGPT, Perplexity. Помилка тут не видно оком: сторінка виглядає як завжди,
 * а машині ми повідомляємо неправду — не ту ціну, не ту дату, битий JSON.
 * Саме тому кожна проба нижче сторожить ОДНУ обіцянку, яку розмітка дає.
 *
 * Найнебезпечніше з усього — дата. Якщо в `temporalCoverage` потрапить день
 * збірки замість дня спостереження, ми машинно засвідчимо, що вчорашня ціна
 * чинна сьогодні. Людина на сторінці побачить «оновлено 15.09» і зрозуміє;
 * машина прочитає «дані за 20.09» і процитує як сьогоднішні.
 *
 * ЗАПУСК:  node scripts/tests-geo.mjs
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  renderJsonLd,
  isoDay,
  breadcrumbLd,
  priceVariables,
  pricePageLd,
  siteLd,
  makeLlms,
  makeLlmsFull,
  makeSitemap,
  dataDownload,
} from './prerender.mjs';

let провалів = 0;
let проб = 0;

function проба(назва, вийшло, чекали) {
  проб++;
  const а = JSON.stringify(вийшло);
  const б = JSON.stringify(чекали);
  if (а === б) return;
  провалів++;
  console.log(`❌ ${назва}\n    чекали: ${б}\n    вийшло: ${а}`);
}

function істина(назва, умова) {
  проб++;
  if (умова) return;
  провалів++;
  console.log(`❌ ${назва}`);
}

// Проба на ПАДІННЯ. Без неї «захист є» і «захисту немає» виглядають однаково:
// і там, і там код просто відпрацьовує.
// Третій аргумент — РІД помилки. Він не прикраса: дві різні перевірки всередині
// однієї функції розрізняються тільки ним, і без нього проба сторожить «щось
// впало», а не ту перевірку, заради якої написана.
function падіння(назва, дія, клас) {
  проб++;
  try {
    дія();
  } catch (e) {
    if (!клас || e instanceof клас) return;
    провалів++;
    console.log(`❌ ${назва} — впало, але ${e?.constructor?.name} замість ${клас.name}`);
    return;
  }
  провалів++;
  console.log(`❌ ${назва} — мало впасти, але не впало`);
}

// Витягти JSON назад зі сторінки — рівно так, як це зробить розбирач машини.
function розібрати(html) {
  const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('немає блоку JSON-LD');
  return JSON.parse(m[1]);
}

const ЦІНИ = { dp: 98.68, a95p: 92.64, a95: 88.99, a92: 84.26, gas: 44.09 };
const ДЕНЬ = '2026-09-15';
const S0 = 'https://diesel-monitor.pp.ua';

// ─── renderJsonLd ────────────────────────────────────────────────────────────

проба('без розмітки — порожньо', renderJsonLd(undefined), '');
проба('null — порожньо', renderJsonLd(null), '');
проба('порожній масив — порожньо', renderJsonLd([]), '');

падіння('битий JSON рядком зупиняє збірку', () => renderJsonLd('{не json'));
падіння('число замість об’єкта', () => renderJsonLd(42));
падіння('масив масивів', () => renderJsonLd([[1, 2]]));
падіння('null усередині масиву', () => renderJsonLd([{ a: 1 }, null]));

// ⚠️ Головна дірка такої вставки: дані, що містять </script>, закривають тег
// і решта JSON виливається на сторінку як HTML. Перевіряємо саме це.
{
  const html = renderJsonLd({ '@type': 'Thing', name: 'ОККО</script><img src=x>' });
  істина('</script> у даних не закриває тег', html.split('</script>').length === 2);
  істина('кутові дужки з даних екрановані', !html.includes('<img'));
  // ⚠️ try НАВМИСНЕ. Без нього підсадка «прибрати екранування» рве JSON на
  // обрізаному </script>, набір падає цілком — і прогін зараховує підсадку як
  // спійману «бо все впало». Це слабке доказування (CLAUDE.md §4а): так само
  // впаде набір від чужої безневинної правки. Так червоніє САМЕ ця проба.
  // ⚠️ Кожен символ екранується ОКРЕМОЮ пробою. Спільна проба «</script> не
  // закриває тег» сторожить лише ПАРУ «< разом з >»: прибери екранування самої
  // лише «<» — і вона лишиться зеленою, бо без «>» тег однаково не закриється.
  // Спіймано мутаційним прогоном 20.09.2026 (CLAUDE.md §4а).
  const тіло = html.slice(html.indexOf('>') + 1, html.lastIndexOf('</script>'));
  істина('у тілі розмітки немає жодної < з даних', !тіло.includes('<'));
  істина('у тілі розмітки немає жодної > з даних', !тіло.includes('>'));
  істина('у тілі розмітки немає голого & з даних',
    !renderJsonLd({ name: 'Shell&Co' }).includes('Shell&Co'));

  проба('після розбору текст цілий',
    (() => {
      try {
        return розібрати(html)[0].name;
      } catch {
        return 'битий JSON';
      }
    })(), 'ОККО</script><img src=x>');
}

проба('один об’єкт стає масивом з одного', розібрати(renderJsonLd({ a: 1 })).length, 1);
проба('масив лишається масивом', розібрати(renderJsonLd([{ a: 1 }, { b: 2 }])).length, 2);

// ─── isoDay ──────────────────────────────────────────────────────────────────

проба('правильна дата вертається як є', isoDay('2026-09-15'), '2026-09-15');
// ⚠️ РІД помилки тут — не педантизм, а єдиний спосіб розрізнити ДВІ перевірки.
// Формат кидає TypeError, звірка з календарем — RangeError. Без цієї різниці
// підсадка «приймати дату в будь-якому вигляді» лишалася невидимою: '15.09.2026'
// однаково не переживе звірки з календарем, проба зеленіла і не сторожила нічого
// (спіймано мутаційним прогоном 20.09.2026, CLAUDE.md §4а).
падіння('дата з часом', () => isoDay('2026-09-15T00:00:00Z'), TypeError);
падіння('український формат дати', () => isoDay('15.09.2026'), TypeError);
падіння('не рядок', () => isoDay(20260915), TypeError);
падіння('undefined', () => isoDay(undefined), TypeError);
// 30 лютого проходить формат, але такого дня немає — Date.parse його «виправить».
падіння('неіснуючий день 30 лютого', () => isoDay('2026-02-30'), RangeError);
падіння('тринадцятий місяць', () => isoDay('2026-13-01'), RangeError);

// ─── breadcrumbLd ────────────────────────────────────────────────────────────

{
  const b = breadcrumbLd('https://diesel-monitor.pp.ua/region/lvivska/', [
    ['Львівська область', 'https://diesel-monitor.pp.ua/region/lvivska/'],
  ]);
  проба('крихти починаються з головної', b.itemListElement[0].name, 'Дизель Монітор UA');
  проба('позиції нумеруються з одиниці', b.itemListElement.map(i => i.position), [1, 2]);
  проба('тип списку', b['@type'], 'BreadcrumbList');
}

// ─── priceVariables ──────────────────────────────────────────────────────────

проба('усі п’ять видів пального', priceVariables(ЦІНИ).length, 5);
проба('один вид за ключем', priceVariables(ЦІНИ, 'dp').length, 1);
проба('ціна в розмітці — та сама', priceVariables(ЦІНИ, 'dp')[0].value, 98.68);
проба('одиниця виміру', priceVariables(ЦІНИ, 'dp')[0].unitText, 'грн/л');
проба('відсутню ціну пропускаємо', priceVariables({ dp: 98.68 }).length, 1);
// ⚠️ Обгортаємо в try НАВМИСНЕ. Без неї підсадка «не відсіювати null» валила
// набір цілком, і прогін зараховував її як спійману «бо все впало» — це слабке
// доказування (CLAUDE.md §4а): падіння прийде і від чужої безневинної правки.
// Так червоніє САМЕ ця проба.
проба('null пропускаємо, а не пишемо нулем',
  (() => {
    try {
      return priceVariables({ dp: 98.68, a95: null }).length;
    } catch {
      return 'впало';
    }
  })(), 1);

// ⚠️ Нуль і мінус — це не «дешево», це збій збору. Вони НЕ мають потрапити
// в розмітку: машина процитує «дизель 0 грн/л» без жодного сумніву.
падіння('нульова ціна зупиняє збірку', () => priceVariables({ dp: 0 }));
падіння('відʼємна ціна зупиняє збірку', () => priceVariables({ dp: -5 }));
падіння('ціна рядком', () => priceVariables({ dp: '98.68' }));
падіння('NaN замість ціни', () => priceVariables({ dp: NaN }));
падіння('невідомий вид пального', () => priceVariables(ЦІНИ, 'kerosene'));
падіння('замість цін масив', () => priceVariables([98.68]));

// ─── pricePageLd ─────────────────────────────────────────────────────────────

{
  const [крихти, dataset] = pricePageLd({
    kind: 'region', name: 'Львівська', prices: ЦІНИ, day: ДЕНЬ,
  });
  проба('перший вузол — крихти', крихти['@type'], 'BreadcrumbList');
  проба('другий вузол — Dataset', dataset['@type'], 'Dataset');

  // ⚠️ Дата спостереження, а не дата збірки. Якщо сюди колись потрапить
  // new Date(), ця проба почервоніє.
  проба('дата даних — день спостереження', dataset.temporalCoverage, ДЕНЬ);
  // ⚠️ Тут стояла ще проба «дата не сьогоднішня за побудовою» з `||`:
  // `tc !== сьогодні || ДЕНЬ === сьогодні`. Вона СЛІПНЕ рівно в той день, коли
  // ДЕНЬ збігається з датою прогону, — тобто одного дня на рік мовчки пропускає
  // підміну дати. Знайшли її дві моделі рою незалежно (20.09.2026); зверху
  // стоїть точна проба, а справжній рубіж сторожить падіння нижче.

  проба('адреса сторінки області', dataset.url, 'https://diesel-monitor.pp.ua/region/lvivska/');
  проба('мова', dataset.inLanguage, 'uk');
  проба('область — це місце, а не організація', dataset.spatialCoverage.name, 'Львівська область, Україна');
  істина('в області немає about про організацію', dataset.about === undefined);
  істина('джерело цін названо', dataset.creditText.includes('Мінфін'));
  проба('ціни всередині', dataset.variableMeasured.length, 5);
}

{
  const [, dataset] = pricePageLd({ kind: 'network', name: 'ОККО', prices: ЦІНИ, day: ДЕНЬ });
  проба('адреса сторінки мережі', dataset.url, 'https://diesel-monitor.pp.ua/network/okko/');
  проба('мережа названа організацією', dataset.about.name, 'ОККО');
  // ⚠️ Без списку областей МОВЧИМО. «Україна» тут була б вигадкою: 19 мереж
  // із 36 у даних живуть рівно в одній області (померено 20.09.2026).
  істина('без списку областей охоплення не вигадується', dataset.spatialCoverage === undefined);
}

{
  const [, dataset] = pricePageLd({
    kind: 'network', name: 'Кворум', prices: ЦІНИ, day: ДЕНЬ, areas: ['Київська'],
  });
  проба('мережа в одній області — одне місце, і саме воно',
    dataset.spatialCoverage, { '@type': 'Place', name: 'Київська область, Україна' });
  істина('локальна мережа НЕ оголошена всеукраїнською',
    JSON.stringify(dataset.spatialCoverage) !== JSON.stringify({ '@type': 'Place', name: 'Україна' }));
}

{
  const [, dataset] = pricePageLd({
    kind: 'network', name: 'ОККО', prices: ЦІНИ, day: ДЕНЬ, areas: ['Київська', 'Львівська'],
  });
  проба('мережа у двох областях — два місця', dataset.spatialCoverage.length, 2);
  проба('назви областей у охопленні',
    dataset.spatialCoverage.map(p => p.name), ['Київська область, Україна', 'Львівська область, Україна']);
}

падіння('areas рядком, а не списком',
  () => pricePageLd({ kind: 'network', name: 'ОККО', prices: ЦІНИ, day: ДЕНЬ, areas: 'Київська' }), TypeError);
падіння('порожня назва області в areas',
  () => pricePageLd({ kind: 'network', name: 'ОККО', prices: ЦІНИ, day: ДЕНЬ, areas: [''] }), TypeError);

{
  const [крихти, dataset] = pricePageLd({
    kind: 'region', name: 'Львівська', prices: ЦІНИ, day: ДЕНЬ, fuelKey: 'dp',
  });
  проба('адреса сторінки пальне×область', dataset.url,
    'https://diesel-monitor.pp.ua/region/lvivska/dyzel/');
  проба('у розмітці лише обране пальне', dataset.variableMeasured.length, 1);
  проба('крихт троє: головна, область, пальне', крихти.itemListElement.length, 3);
  проба('остання крихта — пальне', крихти.itemListElement[2].name, 'Дизель');
}

падіння('порожні ціни не дають порожнього Dataset',
  () => pricePageLd({ kind: 'region', name: 'Львівська', prices: {}, day: ДЕНЬ }));
падіння('невідомий тип сторінки',
  () => pricePageLd({ kind: 'city', name: 'Львів', prices: ЦІНИ, day: ДЕНЬ }));
падіння('дата збірки замість дати даних',
  () => pricePageLd({ kind: 'region', name: 'Львівська', prices: ЦІНИ, day: new Date() }));

// ─── creator (Search Console, 23.09.2026) ────────────────────────────────────
// ⚠️ Search Console попросив поле creator в обох Dataset. Творець — сам сайт:
// це наша збірка, а першоджерело цін назване в creditText.

{
  const [, dataset] = pricePageLd({ kind: 'region', name: 'Львівська', prices: ЦІНИ, day: ДЕНЬ });
  проба('область: творець — організація', dataset.creator?.['@type'], 'Organization');
  проба('область: творець — наш домен', dataset.creator?.url, 'https://diesel-monitor.pp.ua/');
  // ⚠️ Ідентичність — СПРАВЖНЯ: звіряємо з тим @id, що віддає siteLd, а не з
  // константою. Розійдуться — у графа знову дві організації.
  const орг = siteLd({ day: ДЕНЬ, date: '15.09.2026', avg: ЦІНИ, regionCount: 1, networkCount: 1 })
    .find(n => n['@type'] === 'Organization');
  проба('область: творець — той самий вузол, що й на головній',
    dataset.creator?.['@id'], орг?.['@id']);
  проба('область: видавець — той самий вузол, що й на головній',
    dataset.publisher?.['@id'], орг?.['@id']);
}

{
  // ⚠️ Мережа — ПРЕДМЕТ набору (вона в about), а не його творець. Підміна
  // творця на мережу сказала б машині, що ці ціни опублікувала ОККО.
  const [, dataset] = pricePageLd({ kind: 'network', name: 'ОККО', prices: ЦІНИ, day: ДЕНЬ });
  проба('мережа: творець — наш домен', dataset.creator?.url, 'https://diesel-monitor.pp.ua/');
  проба('мережа: творець — сайт, а не мережа', dataset.creator?.name, 'Дизель Монітор UA');
  const орг = siteLd({ day: ДЕНЬ, date: '15.09.2026', avg: ЦІНИ, regionCount: 1, networkCount: 1 })
    .find(n => n['@type'] === 'Organization');
  проба('мережа: видавець — той самий вузол, що й на головній',
    dataset.publisher?.['@id'], орг?.['@id']);
}

{
  const вузли = siteLd({ day: ДЕНЬ, date: '15.09.2026', avg: ЦІНИ, regionCount: 25, networkCount: 36 });
  const dataset = вузли.find(n => n['@type'] === 'Dataset');
  const орг = вузли.find(n => n['@type'] === 'Organization');

  проба('сайт: творець — посилання на нашу організацію',
    dataset.creator?.['@id'], 'https://diesel-monitor.pp.ua/#organization');
  // ⚠️ Посилання не мусить ВИСІТИ: звіряємо творця з вузлом, що справді
  // лежить у тому ж масиві, а не кожен із константою. Інакше узгоджена заміна
  // обох (@id організації і посилання) пройде, а поламане посилання — ні.
  істина('сайт: посилання творця веде на вузол у тому ж масиві',
    орг !== undefined && орг['@id'] === dataset.creator?.['@id']);
  // Решта полів при винесенні з main() не мусила зрушити.
  проба('сайт: дата даних — день спостереження', dataset.temporalCoverage, ДЕНЬ);
  проба('сайт: ціни всередині', dataset.variableMeasured.length, 5);
  істина('сайт: числа областей і мереж в описі',
    dataset.description.includes('25 областей') && dataset.description.includes('36 мереж'));
}

// ─── makeLlms ────────────────────────────────────────────────────────────────

const S = 'https://diesel-monitor.pp.ua';
const URLS = [
  `${S}/`,
  `${S}/region/lvivska/`,
  `${S}/region/lvivska/dyzel/`,
  `${S}/network/okko/`,
  `${S}/cheapest/dyzel/`,
];
const ВХІД = {
  day: ДЕНЬ,
  urls: URLS,
  regionEntries: ['Львівська', 'Київська'],
  netEntries: ['ОККО'],
  cheapEntries: [{ slug: 'dyzel', h1: 'Де найдешевший дизель в Україні' }],
  avg: ЦІНИ,
};

{
  const txt = makeLlms(ВХІД);
  істина('файл починається з заголовка', txt.startsWith('# Дизель Монітор UA'));
  істина('є однорядковий опис через >', /\n> .+\n/.test(txt));
  істина('дата даних у файлі', txt.includes(ДЕНЬ));
  істина('середня ціна дизеля у фактах', txt.includes('98,68'));

  // ⚠️ Головне, що сторожить ця проба: ми НЕ рекламуємо сторінку, якої
  // генератор не створив. Київська область є у списку областей, але її
  // сторінки немає серед urls — значить, у llms.txt її бути не повинно.
  істина('створена сторінка згадана', txt.includes(`${S}/region/lvivska/`));
  істина('нестворена сторінка НЕ згадана', !txt.includes(`${S}/region/kyivska/`));
  істина('нестворена матриця НЕ згадана', !txt.includes(`${S}/network/okko/gaz/`));

  // Усі посилання — абсолютні: відносні у llms.txt читати нема кому.
  const посилання = [...txt.matchAll(/\]\((.*?)\)/g)].map(m => m[1]);
  істина('посилання є взагалі', посилання.length >= 4);
  істина('усі посилання абсолютні', посилання.every(u => u.startsWith('https://')));
  істина('усі посилання зі списку створених', посилання.every(u => URLS.includes(u)));

  // Дрібні матриці — в Optional, щоб головне не потонуло.
  істина('матриця пальне×область у розділі Optional',
    txt.indexOf('## Optional') < txt.indexOf(`${S}/region/lvivska/dyzel/`));
}

// ⚠️ Назва з дужкою чи зірочкою не має ламати рядок посилання.
{
  const txt = makeLlms({ ...ВХІД, netEntries: ['АЗС (Захід)'], urls: [...URLS, `${S}/network/azs-zakhid/`] });
  const рядок = txt.split('\n').find(l => l.includes('azs-zakhid'));
  істина('назва мережі з дужками екранована', рядок.includes('\\(') && рядок.includes('\\)'));
  істина('адреса такої мережі ціла', рядок.includes(`](${S}/network/azs-zakhid/)`));
}

падіння('llms.txt не будується на даті збірки', () => makeLlms({ ...ВХІД, day: new Date() }));
падіння('llms.txt не будується на українській даті', () => makeLlms({ ...ВХІД, day: '15.09.2026' }));

// ─── Dataset: dateModified і distribution (17.10.2026) ──────────────────────
{
  const [, область] = pricePageLd({ kind: 'region', name: 'Львівська', prices: ЦІНИ, day: ДЕНЬ });
  проба('область: dateModified — день спостереження', область.dateModified, ДЕНЬ);
  проба('область: distribution — latest.json', область.distribution?.contentUrl, 'https://diesel-monitor.pp.ua/data/latest.json');
  const [, мережа] = pricePageLd({ kind: 'network', name: 'ОККО', prices: ЦІНИ, day: '2026-09-10' });
  проба('мережа: dateModified — день карти мереж', мережа.dateModified, '2026-09-10');
  const сайт = siteLd({ day: ДЕНЬ, date: '15.09.2026', avg: ЦІНИ, regionCount: 1, networkCount: 1 })
    .find(n => n['@type'] === 'Dataset');
  проба('сайт: dateModified — день спостереження', сайт.dateModified, ДЕНЬ);
  проба('сайт: distribution — той самий файл', сайт.distribution, dataDownload());
}

// ─── makeSitemap ─────────────────────────────────────────────────────────────
{
  const xml = makeSitemap([
    { url: `${S0}/`, day: ДЕНЬ },
    { url: `${S0}/network/okko/`, day: '2026-09-10' },
    { url: `${S0}/privacy/` },
  ]);
  істина('sitemap: lastmod — день даних сторінки', xml.includes(`<loc>${S0}/network/okko/</loc><lastmod>2026-09-10</lastmod>`));
  істина('sitemap: без дня — без lastmod', xml.includes(`<loc>${S0}/privacy/</loc><changefreq>`));
  проба('sitemap: усі адреси на місці', (xml.match(/<loc>/g) ?? []).length, 3);
  істина('sitemap: головна з найвищим пріоритетом', xml.includes(`<loc>${S0}/</loc><lastmod>${ДЕНЬ}</lastmod><changefreq>daily</changefreq><priority>1.0</priority>`));
  падіння('sitemap: не бере українську дату', () => makeSitemap([{ url: `${S0}/`, day: '15.09.2026' }]), TypeError);
  падіння('sitemap: не бере чужу адресу', () => makeSitemap([{ url: 'https://example.com/' }]), TypeError);
  падіння('sitemap: не пише адресу двічі', () => makeSitemap([{ url: `${S0}/` }, { url: `${S0}/` }]), Error);
}

// ─── makeLlmsFull ────────────────────────────────────────────────────────────
{
  const txt = makeLlmsFull({
    day: ДЕНЬ, netDay: '2026-09-10', avg: ЦІНИ,
    regionAvg: { 'Львівська': { dp: 99.1 } },
    networks: { 'АЗС (Захід)': { dp: 97.5, gas: 44 } },
  });
  істина('llms-full: заголовок', txt.startsWith('# Дизель Монітор UA — повні дані'));
  істина('llms-full: середні з датою спостереження', txt.includes('## Середні ціни по Україні (15.09.2026)'));
  істина('llms-full (одиниця): мережі — своєю датою', txt.includes('## Ціни мереж АЗС (10.09.2026;'));
  істина('llms-full: назва з дужками екранована', txt.includes('| АЗС \\(Захід\\) | 97,50 |'));
  істина('llms-full: ціна області', txt.includes('| Львівська | 99,10 | — |'));
  падіння('llms-full: не будується на даті збірки', () => makeLlmsFull({ day: new Date(), netDay: ДЕНЬ, avg: ЦІНИ }), TypeError);
  падіння('llms-full: не будується без дня карти мереж', () => makeLlmsFull({ day: ДЕНЬ, avg: ЦІНИ }), TypeError);
}

// ─── одна дата на сторінках мереж (наскрізно) ───────────────────────────────
// ⚠️ Видима дата і дата розмітки на сторінках мереж мусять бути ОДНІЄЮ — днем
// карти мереж (networksDate). Перевіряємо ПОВЕДІНКУ: рендеримо справжні сторінки
// у своїй тимчасовій теці (копія prerender.mjs бере корінь від свого місця), а не
// шукаємо рядок у коді. Карта мереж тут навмисно застаріла: 15.09 проти 24.09.
{
  const рендер = ({ networksDate, breakdownDate, regions }) => {
    const тека = fs.mkdtempSync(path.join(os.tmpdir(), 'geo-net-date-'));
    try {
      const копія = path.join(тека, 'scripts', 'prerender.mjs');
      fs.mkdirSync(path.dirname(копія), { recursive: true });
      fs.mkdirSync(path.join(тека, 'public', 'data'), { recursive: true });
      fs.mkdirSync(path.join(тека, 'dist'), { recursive: true });
      fs.copyFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'prerender.mjs'), копія);
      fs.writeFileSync(path.join(тека, 'public', 'data', 'latest.json'), JSON.stringify({
        date: '2026-09-24',
        networksDate,
        ...(breakdownDate && { breakdownDate }),
        avg: { dp: 60, a95: 55, a92: 52, gas: 30 },
        avgChange: {},
        // Сторінку «мережа × паливо» пререндер будує лише коли мереж із цим
        // пальним щонайменше 5 — інакше немає з чим порівнювати.
        networks: {
          'ОККО': { dp: 61, a95: 56, gas: 31 }, 'WOG': { dp: 62, a95: 57, gas: 32 },
          'SOCAR': { dp: 63, a95: 58, gas: 33 }, 'UPG': { dp: 60, a95: 55, gas: 30 },
          'БРСМ-Нафта': { dp: 59, a95: 54, gas: 29 },
        },
        regionAvg: { 'Львівська': { dp: 59 } },
        regions,
      }));
      fs.writeFileSync(path.join(тека, 'dist', 'index.html'),
        '<!doctype html><html><head></head><body><div id="root"></div></body></html>');
      execFileSync(process.execPath, [копія], { stdio: 'pipe' });
      const читати = (...ч) => fs.readFileSync(path.join(тека, 'dist', ...ч, 'index.html'), 'utf-8');
      const файл = ім => fs.readFileSync(path.join(тека, 'dist', ім), 'utf-8');
      return { мережа: читати('network', 'okko'), дизель: читати('network', 'okko', 'dyzel'), wog: читати('network', 'wog'),
               область: читати('region', 'lvivska'), найдешевше: читати('cheapest', 'dyzel'),
               головна: файл('index.html'), sitemap: файл('sitemap.xml'), повний: файл('llms-full.txt') };
    } finally {
      fs.rmSync(тека, { recursive: true, force: true });
    }
  };

  try {
    const { мережа, дизель, область } = рендер({ networksDate: '2026-09-15', regions: {} });
    істина('мережа: «оновлено» — дата карти мереж', мережа.includes('оновлено 15.09.2026'));
    істина('мережа: ніде немає загальної дати', !мережа.includes('24.09.2026'));
    // ⚠️ «станом на 15.09» тут окремо НЕ перевіряємо: та сама фраза стоїть і в
    // мета-описі, тож проба лишилась би зеленою, коли дату поверне лише текст.
    істина('мережа×паливо: ніде немає загальної дати', !дизель.includes('24.09.2026'));
    істина('мережа×паливо: дата карти мереж на місці', дизель.includes('15.09.2026'));
    // ⚠️ Знахідка Astra: видимий текст сторінки «мережа × паливо» перевірявся, а її
    // власна розмітка — ні. Підсадка «розмітці дату середніх цін» ловилась лише
    // падінням набору від чужої проби.
    const ldПаливо = [...дизель.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap(m => JSON.parse(m[1]));
    проба('мережа×паливо: у розмітці — дата карти мереж',
      ldПаливо.find(n => n['@type'] === 'Dataset')?.temporalCoverage, '2026-09-15');
    const ld = [...мережа.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
      .flatMap(m => JSON.parse(m[1]));
    проба('мережа: у розмітці — дата карти мереж',
      ld.find(n => n['@type'] === 'Dataset')?.temporalCoverage, '2026-09-15');
    // Контроль, що правка не розлилась: область лишається на даті середніх цін.
    істина('область: лишається на даті середніх цін', область.includes('оновлено 24.09.2026'));

    // ⚠️ Третя дата — таблиця «ДИЗЕЛЬ ПО ОБЛАСТЯХ» (матриця /detail/). Два випадки
    // навмисно: підпис Є при розбіжності і його НЕМАЄ при збігу — інакше підсадка
    // «підписувати завжди» пройшла б непоміченою.
    const таблиця = { 'Львівська': { 'ОККО': { dp: 58 } } };
    const розбіжність = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-10', regions: таблиця }).мережа;
    істина('мережа: таблиця областей підписана своєю датою, коли вона інша',
      розбіжність.includes('ДИЗЕЛЬ ПО ОБЛАСТЯХ · станом на 10.09.2026'));
    const збіг = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-15', regions: таблиця }).мережа;
    істина('мережа: без розбіжності таблиця областей без підпису',
      збіг.includes('ДИЗЕЛЬ ПО ОБЛАСТЯХ') && !збіг.includes('ДИЗЕЛЬ ПО ОБЛАСТЯХ · станом на'));
    // ⚠️ Знахідка Astra: ще два випадки, які перші дві проби не розрізняли.
    // Таблиця СВІЖІША за карту мереж — це звичайний день, коли /detail/ відповів,
    // а /tm/ обвалився: breakdownDate = latest.date, networksDate старіша.
    const свіжіша = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-24', regions: таблиця }).мережа;
    істина('мережа: таблиця, свіжіша за карту мереж, підписана своєю датою',
      свіжіша.includes('ДИЗЕЛЬ ПО ОБЛАСТЯХ · станом на 24.09.2026'));
    // Дати матриці немає (старі файли) — беремо дату середніх цін, як і сам collect
    // бере prev.date, коли prev.breakdownDate немає.
    const безДати = рендер({ networksDate: '2026-09-15', regions: таблиця }).мережа;
    істина('мережа: без дати матриці таблиця підписана датою середніх цін',
      безДати.includes('ДИЗЕЛЬ ПО ОБЛАСТЯХ · станом на 24.09.2026'));

    // ── GEO 17.10.2026: sitemap, «де найдешевше», перше речення, llms-full ──
    // Той самий стенд: карта мереж 15.09, середні 24.09, день збірки — сьогодні.
    const { найдешевше, головна, sitemap, повний, wog } = рендер({ networksDate: '2026-09-15', regions: {} });
    const lastmod = адреса => sitemap.match(new RegExp(`<loc>${адреса}</loc><lastmod>([^<]+)</lastmod>`))?.[1];
    проба('sitemap: lastmod сторінки мережі — день карти мереж',
      lastmod('https://diesel-monitor.pp.ua/network/okko/'), '2026-09-15');
    проба('sitemap: lastmod сторінки мережа×паливо — день карти мереж',
      lastmod('https://diesel-monitor.pp.ua/network/okko/dyzel/'), '2026-09-15');
    проба('sitemap: lastmod області — день середніх цін',
      lastmod('https://diesel-monitor.pp.ua/region/lvivska/'), '2026-09-24');
    // ⚠️ На «де найдешевше» є і середня (24.09) — сторінка змінюється з нею теж,
    // тож lastmod — найпізніший із днів її даних (знахідка Sol 17.10).
    проба('sitemap: lastmod «де найдешевше» — найпізніший день його даних',
      lastmod('https://diesel-monitor.pp.ua/cheapest/dyzel/'), '2026-09-24');
    проба('sitemap: lastmod головної — найпізніший день її даних',
      lastmod('https://diesel-monitor.pp.ua/'), '2026-09-24');
    {
      // Матриця /detail/ свіжіша за карту мереж — сторінка мережі з її таблицею змінилась.
      const зТаблицею = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-20',
        regions: { 'Львівська': { 'ОККО': { dp: 58 } } } }).sitemap;
      проба('sitemap: lastmod мережі — і дата таблиці областей',
        зТаблицею.match(/<loc>https:\/\/diesel-monitor\.pp\.ua\/network\/okko\/<\/loc><lastmod>([^<]+)</)?.[1], '2026-09-20');
    }
    {
      const olderCoverage = { 'Львівська': { 'ОККО': { dp: 58 } } };
      const newerCoverage = { ...olderCoverage, 'Київська': { 'ОККО': { dp: 59 } } };
      const older = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-16', regions: olderCoverage });
      const newer = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-20', regions: newerCoverage });
      const coverage = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .flatMap(m => JSON.parse(m[1])).find(n => n['@type'] === 'Dataset')?.spatialCoverage;
      істина('мережа×паливо: оновлена матриця справді змінює охоплення',
        JSON.stringify(coverage(older.дизель)) !== JSON.stringify(coverage(newer.дизель)));
      проба('sitemap: lastmod мережа×паливо бачить дату охоплення',
        newer.sitemap.match(/<loc>https:\/\/diesel-monitor\.pp\.ua\/network\/okko\/dyzel\/<\/loc><lastmod>([^<]+)</)?.[1], '2026-09-20');
      const legacy = рендер({ networksDate: '2026-09-15', regions: olderCoverage });
      проба('sitemap: без дати матриці охоплення має дату середніх',
        legacy.sitemap.match(/<loc>https:\/\/diesel-monitor\.pp\.ua\/network\/okko\/dyzel\/<\/loc><lastmod>([^<]+)</)?.[1], '2026-09-24');
      const gasOnly = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-20',
        regions: { 'Львівська': { 'ОККО': { gas: 29 } } } });
      проба('sitemap: lastmod мережі бачить охоплення без таблиці дизеля',
        gasOnly.sitemap.match(/<loc>https:\/\/diesel-monitor\.pp\.ua\/network\/okko\/<\/loc><lastmod>([^<]+)</)?.[1], '2026-09-20');
      const dataset = html => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .flatMap(m => JSON.parse(m[1])).find(n => n['@type'] === 'Dataset');
      проба('мережа: dateModified враховує охоплення', dataset(newer.мережа).dateModified, '2026-09-20');
      проба('мережа×паливо: dateModified враховує охоплення', dataset(newer.дизель).dateModified, '2026-09-20');
      проба('мережа×паливо: temporalCoverage лишається днем цін', dataset(newer.дизель).temporalCoverage, '2026-09-15');
      const removed = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-24',
        regions: { 'Львівська': { 'WOG': { dp: 61 } } } });
      істина('мережа×паливо: після видалення матриці охоплення зникає', dataset(removed.дизель).spatialCoverage === undefined);
      for (const suffix of ['okko/', 'okko/dyzel/']) {
        проба(`sitemap: видалення охоплення оновлює ${suffix}`,
          removed.sitemap.match(new RegExp(`<loc>https://diesel-monitor\\.pp\\.ua/network/${suffix}</loc><lastmod>([^<]+)</`))?.[1], '2026-09-24');
      }
      const emptyMatrix = рендер({ networksDate: '2026-09-15', breakdownDate: '2026-09-25', regions: {} });
      проба('sitemap: датована порожня матриця також є новим спостереженням',
        emptyMatrix.sitemap.match(/<loc>https:\/\/diesel-monitor\.pp\.ua\/network\/okko\/dyzel\/<\/loc><lastmod>([^<]+)</)?.[1], '2026-09-25');
    }
    const деньЗбірки = new Date().toISOString().slice(0, 10);
    істина('sitemap: ніде немає дня збірки', !sitemap.includes(`<lastmod>${деньЗбірки}</lastmod>`));
    істина('sitemap: статичні сторінки без lastmod',
      sitemap.includes('<loc>https://diesel-monitor.pp.ua/privacy/</loc><changefreq>'));

    // «Де найдешевше» — рейтинг МЕРЕЖ: дата скрізь карти мереж.
    істина('найдешевше: відповідь датована картою мереж',
      найдешевше.includes('Станом на <b>15.09.2026</b> найдешевший дизель'));
    істина('найдешевше: «оновлено» — дата карти мереж', найдешевше.includes('оновлено 15.09.2026 · рейтинг'));
    істина('найдешевше: заголовок — дата карти мереж', найдешевше.includes('<title>Де найдешевший дизель в Україні — 15.09.2026'));
    // Середня іншого дня: підписана своєю датою, а мережі з нею не порівнюються.
    істина('найдешевше: середня підписана своєю датою', найдешевше.includes('Середня по Україні станом на 24.09.2026: 60,00 грн/л'));
    істина('найдешевше: без порівняння мереж із середньою іншого дня',
      !/<td>[−+]\d/.test(найдешевше) && найдешевше.includes('<td>—</td>'));

    // Головна: «Дизель — від …» береться з мереж — підпис їхньої дати, коли вона інша.
    істина('головна: мінімум мереж підписаний датою карти мереж',
      головна.includes('Дизель — від 59,00 грн/л (ціни мереж станом на 15.09.2026)'));

    // Перше речення сторінки мережі — відповідь із числом і місцем.
    істина('мережа: перше речення — ціна дизеля і місце серед мереж',
      мережа.includes('Дизель у мережі <b>ОККО</b> станом на 15.09.2026 коштує <b>61,00</b> грн/л — це <b>3 місце з 5</b>'));
    // ⚠️ ОККО у стенді рівно посередині (3 з 5) — з обох боків рейтингу те саме
    // місце, і перевернуте сортування проба вище не бачить (підсадка 17.10 це
    // показала). WOG — 4-те від дешевшої, 2-ге від дорожчої.
    істина('мережа: місце рахується від найдешевшої',
      wog.includes('це <b>4 місце з 5</b> серед мереж АЗС України за ціною дизеля'));
    // ⚠️ Середня — іншого дня (24.09), тож порівнювати з нею не можна.
    істина('мережа: без порівняння з середньою іншого дня', !мережа.includes('за середню по країні'));
    const одинДень = рендер({ networksDate: '2026-09-24', regions: {} });
    істина('мережа: порівняння з середньою, коли день той самий',
      одинДень.мережа.includes('на 1,00 грн дорожче за середню по країні'));
    істина('головна: без розбіжності дат — без підпису мереж',
      одинДень.головна.includes('Дизель — від 59,00 грн/л.'));
    істина('найдешевше: того самого дня — порівняння з середньою є',
      одинДень.найдешевше.includes('<td>−1,00</td>') && одинДень.найдешевше.includes('Середня по Україні: 60,00 грн/л'));

    // llms-full: кожна таблиця — своєю датою.
    істина('llms-full: області підписані днем середніх цін', повний.includes('## Середні ціни по областях (24.09.2026)'));
    істина('llms-full: мережі підписані днем карти мереж', повний.includes('## Ціни мереж АЗС (15.09.2026;'));
    істина('llms-full: ціна мережі в таблиці', /\| ОККО \| 61,00 \| — \| 56,00 \| — \| 31,00 \|/.test(повний));

    // Джерело — посиланням на ту саму сторінку, яку читає збирач.
    істина('сторінки: джерело цін — посилання на Мінфін',
      мережа.includes('<a href="https://index.minfin.com.ua/ua/markets/fuel/" rel="noopener">Мінфін</a>'));
  } catch (e) {
    істина('наскрізний рендер сторінок мереж не впав: ' + e.message.split('\n')[0], false);
  }
}

// ─── підсумок ────────────────────────────────────────────────────────────────

console.log(`\nGEO: ${проб - провалів} з ${проб} проб пройдено`);
if (провалів) process.exit(1);
