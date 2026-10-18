/**
 * Проби композиції ролика цін (scripts/price-video.mjs).
 *
 * ⚠️ НАВІЩО. Ролик бачать люди в Telegram/Instagram, а перевірити його оком
 * у кожному запуску нікому. Тому сторожимо обіцянки композиції: на останньому
 * кадрі — РІВНО ті числа, що в latest.json; дата найдешевшої мережі — день карти
 * мереж; назви з даних не ламають HTML; тривалість одна для таймлайна і кореня.
 * Сам рендер (Chrome + ffmpeg) тут не запускаємо — це робить workflow.
 *
 * ЗАПУСК:  node scripts/tests-video.mjs
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeVideoHtml, cheapestNetwork, DURATION } from './price-video.mjs';

// Стенд останнього кадру: справжній GSAP, скрипт композиції і HTML DOM з linkedom.
// Селектори мають ту саму семантику, що в браузері. Крутимо таймлайн у кінець
// і читаємо, ЩО анімація записала в ціни. Знахідка Sol 17.10: проба вихідного HTML
// зеленіла, коли onUpdate писав «0,00».
// ⚠️ gsap шукаємо від кореня репозиторію (у копії підсадок node_modules лежить
// окремо — DM_NODE_MODULES), а не від цього файлу.
// GSAP запамʼятовує document ОДИН раз, при першому пробудженні, — тож даємо йому
// посередника, а документ поточного HTML підставляємо на кожен виклик.
let поточний = null;
const посередник = {
  querySelectorAll: s => поточний?.querySelectorAll(s) ?? [],
  querySelector: s => поточний?.querySelector(s) ?? null,
};
globalThis.window ??= { document: посередник };
// Ядро без CSSPlugin скаржиться на opacity/x — це стиль, його тут не міряємо.
// GSAP бере console.warn у мить завантаження, тож фільтр ставимо ДО імпорту.
const warn = console.warn;
console.warn = (...a) => { if (!a.join(' ').includes('Missing plugin')) warn(...a); };
const корінь = process.env.DM_NODE_MODULES ?? path.join(import.meta.dirname, '..', 'node_modules');
const { parseHTML } = await import(pathToFileURL(path.join(корінь, 'linkedom', 'esm', 'index.js')).href);
// Ядро без CSSPlugin: стиль у Node перевіряти нема чим, а таймлайн, onUpdate і
// перемотка — ті самі, що в повному gsap.min.js у браузері.
const { gsap } = await import(pathToFileURL(path.join(корінь, 'gsap', 'gsap-core.js')).href);

function останнійКадр(html, момент = DURATION) {
  const скрипт = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
  const { document, window } = parseHTML(html);
  const prices = [...document.querySelectorAll('.row .num')];
  const names = [...document.querySelectorAll('.row .name')];
  gsap.config({ nullTargetWarn: false });
  поточний = document;
  let timeline;
  let executionError;
  try {
    new Function('gsap', 'document', 'window', скрипт)(gsap, document, window);
    timeline = window.__timelines?.main;
    timeline.seek(момент, false);
  } catch (error) {
    executionError = `${error.name}: ${error.message}`;
  } finally {
    timeline ??= window.__timelines?.main;
    timeline?.kill();
    поточний = null;
  }
  return { тексти: prices.map(n => n.textContent), names: names.map(n => n.textContent),
    тривалість: timeline?.duration(), executionError };
}

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

const LATEST = {
  date: '2026-09-24',
  networksDate: '2026-09-15',
  avg: { dp: 99.59, a95p: 93.55, a95: 89.69, a92: 86.2, gas: 48.24 },
  avgChange: { dp: 0.52, a95p: -0.06, a95: 0, a92: 0.19 },
  networks: {
    'ОККО': { dp: 100.9 },
    'ДНІПРОНАФТА': { dp: 97.32 },
    'A&B <Захід>': { dp: 97.4 },
  },
};
const SPARK = [{ value: 98 }, { value: 99 }, { value: 99.59 }];
const html = makeVideoHtml(LATEST, SPARK);

// ── числа останнього кадру ──
// Докручування закінчується на data-to, а в тексті до старту стоїть те саме число.
const цілі = [...html.matchAll(/<b class="num" data-to="([^"]+)">([^<]+)<\/b>/g)].map(m => [Number(m[1]), m[2]]);
проба('ролик: ціни — рівно з latest.json і в тому ж порядку',
  цілі.map(([v]) => v), [99.59, 93.55, 89.69, 86.2, 48.24]);
проба('ролик: видимий текст ціни — та сама ціна з комою',
  цілі.map(([, t]) => t), ['99,59', '93,55', '89,69', '86,20', '48,24']);
{
  const кінець = останнійКадр(html);
  проба('ролик: скрипт композиції виконується без помилок', кінець.executionError, undefined);
  проба('ролик: на останньому кадрі анімація пише рівно ціни з latest.json',
    кінець.тексти, ['99,59', '93,55', '89,69', '86,20', '48,24']);
  проба('ролик: анімація зберігає назви пального',
    кінець.names, ['Дизель', 'А-95+', 'А-95', 'А-92', 'Автогаз']);
  проба('ролик: таймлайн триває рівно стільки, скільки композиція', кінець.тривалість, DURATION);
  // Стенд не сліпий: посеред докручування число ще НЕ остаточне.
  for (let i = 0; i < цілі.length; i++) {
    const middle = останнійКадр(html, 1.2 + i * 0.35 + 0.45);
    проба(`ролик: рядок ${i + 1} анімується без помилок`, middle.executionError, undefined);
    істина(`ролик: рядок ${i + 1} справді докручується`, middle.тексти[i] !== цілі[i][1]);
  }
}

// ── зміни за добу: знак і колір ──
істина('ролик: зростання — червоне ▲ з плюсом', html.includes('color:#ff5f5f">▲ +0,52'));
істина('ролик: падіння — зелене ▼ з мінусом', html.includes('color:#00d2aa">▼ −0,06'));
істина('ролик: нуль — сіра стрілка без знака', html.includes('color:#6d8f86">→ 0,00'));
істина('ролик: нема зміни — порожньо, не undefined', !html.includes('undefined') && !html.includes('NaN'));

// ── дати ──
істина('ролик: шапка — дата середніх цін', html.includes('<span class="d">24.09.2026</span>'));
const найдешевша = cheapestNetwork(LATEST);
проба('ролик: найдешевша мережа — справді найдешевша', найдешевша?.name, 'ДНІПРОНАФТА');
проба('ролик: найдешевша мережа — на дні карти мереж', найдешевша?.day, '2026-09-15');
істина('ролик: підпис найдешевшої з датою карти мереж',
  html.includes('Найдешевший дизель 15.09.2026: <b>ДНІПРОНАФТА</b> — 97,32 грн/л'));
проба('ролик: без мереж — підпису немає', cheapestNetwork({ ...LATEST, networks: {} }), null);

// ── назви з даних не ламають розмітку ──
const злий = makeVideoHtml({ ...LATEST, networks: { 'A&B <Захід>': { dp: 90 } } }, SPARK);
істина('ролик: назва мережі екранована', злий.includes('A&amp;B &lt;Захід&gt;') && !злий.includes('<Захід>'));

// ── тривалість ──
проба('ролик: корінь композиції — тієї ж тривалості', html.match(/data-duration="(\d+)"/)?.[1], String(DURATION));
істина('ролик: таймлайн дотягнуто до кінця композиції', html.includes(`duration: ${DURATION} - 6.4 }, 6.4)`));
істина('ролик: таймлайн зареєстровано під id кореня',
  html.includes('data-composition-id="main"') && html.includes('window.__timelines.main = tl'));

// ── лінія дизеля ──
істина('ролик: лінія є, коли точок ≥ 2', html.includes('<polyline id="line"'));
істина('ролик: однієї точки мало — лінії немає', !makeVideoHtml(LATEST, [{ value: 1 }]).includes('<polyline'));

console.log(`\nВІДЕО: ${проб - провалів} з ${проб} проб пройдено`);
if (провалів) process.exit(1);
