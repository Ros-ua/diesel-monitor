/**
 * Підсадки: ламаємо по одному захисту і перевіряємо, що червоніє САМЕ та проба,
 * яка цей захист стереже.
 *
 * ⚠️ НАВІЩО. Зелена з першого разу проба підозріла: вона може не перевіряти
 * нічого. За добу 12.09.2026 підсадки СІМ разів показали, що проба зеленіє з
 * неправильної причини. Тому мало «стало червоно» — перевіряємо, що червоніє
 * потрібний рядок, а не будь-який.
 *
 * Працюємо на КОПІЇ у тимчасовій теці: бойові файли не чіпаємо.
 *
 * ЗАПУСК:  node scripts/tests-mutations.mjs
 */
import { readFileSync, writeFileSync, cpSync, rmSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));

const ПІДСАДКИ = [
  {
    імя: 'прибрати «перша таблиця перемагає»',
    файл: 'lib/minfin.mjs',
    було: 'if (Object.keys(prices).length && !(name in out)) out[name] = prices;',
    стало: 'if (Object.keys(prices).length) out[name] = prices;',
    стереже: 'архівна таблиця НИЖЧЕ',
  },
  {
    імя: 'прибрати заборону архівних таблиць',
    файл: 'lib/minfin.mjs',
    було: 'const свої = таблиці.filter(т => !ПІДПИС_ЧУЖОЇ.test(т.підпис));',
    стало: 'const свої = таблиці;',
    стереже: 'архівна таблиця ВИЩЕ',
  },
  {
    імя: 'прибрати перевагу названої таблиці',
    файл: 'lib/minfin.mjs',
    було: 'const кандидати = названі.length ? названі : свої;',
    стало: 'const кандидати = свої;',
    стереже: 'названа таблиця перемагає чужу',
  },
  {
    імя: 'зробити підпис ОБОВʼЯЗКОВИМ (жорсткий фільтр)',
    файл: 'lib/minfin.mjs',
    було: 'const кандидати = названі.length ? названі : свої;',
    стало: 'const кандидати = названі;',
    стереже: 'перейменований заголовок не валить збір',
  },
  {
    імя: 'повернути злипання тегів у підписі',
    файл: 'lib/minfin.mjs',
    було: "const словами = s => cleanText(String(s).replace(/<[^>]+>/g, ' '));",
    стало: 'const словами = s => cleanText(String(s));',
    стереже: 'підпис, розбитий тегами',
  },
];

function прогін(корінь) {
  try {
    const out = execFileSync(process.execPath, [path.join(корінь, 'tests-parser.mjs')],
      { encoding: 'utf8', stdio: 'pipe' });
    return { впало: false, текст: out };
  } catch (e) {
    return { впало: true, текст: String(e.stdout ?? '') + String(e.stderr ?? '') };
  }
}

function накопії(робота) {
  const корінь = mkdtempSync(path.join(tmpdir(), 'diesel-mut-'));
  try {
    cpSync(SCRIPTS, корінь, { recursive: true });
    return робота(корінь);
  } finally {
    rmSync(корінь, { recursive: true, force: true });
  }
}

// Спершу переконуємось, що на ЦІЛІЙ копії все зелене — інакше міряти нічим.
const базовий = накопії(прогін);
if (базовий.впало) {
  console.log('❌ на цілій копії проби вже червоні — міряти нічим');
  console.log(базовий.текст.slice(-800));
  process.exit(1);
}
console.log('ціла копія: усі проби зелені\n');

let спіймано = 0;
for (const п of ПІДСАДКИ) {
  const р = накопії(корінь => {
    const ціль = path.join(корінь, п.файл);
    const текст = readFileSync(ціль, 'utf8');
    const скільки = текст.split(п.було).length - 1;
    if (скільки !== 1) return { якір: скільки };
    writeFileSync(ціль, текст.replace(п.було, п.стало));
    return прогін(корінь);
  });

  if (р.якір !== undefined) {
    console.log(`⚠️  ${п.імя}: якір трапляється ${р.якір} разів — підсадку НЕ застосовано`);
    continue;
  }

  // Мало «стало червоно»: шукаємо рядок ПОТРІБНОЇ проби.
  const рядок = р.текст.split('\n').find(s => s.includes(п.стереже));
  const потрібнаЧервона = рядок ? рядок.includes('❌') : false;
  const впало = р.впало && !рядок;      // проба до друку не дійшла — теж спіймано
  const ок = потрібнаЧервона || впало;
  if (ок) спіймано++;
  const як = потрібнаЧервона ? 'проба почервоніла'
    : впало ? 'збір впав з помилкою'
      : 'НІХТО НЕ ПОМІТИВ';
  console.log(`${ок ? '✅' : '❌'} ${п.імя}\n     стереже: «${п.стереже}» — ${як}`);
}

console.log(`\nпідсадок спіймано: ${спіймано} з ${ПІДСАДКИ.length}`);
process.exit(спіймано === ПІДСАДКИ.length ? 0 : 1);
