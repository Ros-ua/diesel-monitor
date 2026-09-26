/**
 * Повернення зсуву колонки в history.json за 11–21.09.2026.
 *
 * ⚠️ БІДА. Сім днів (11, 14, 15, 16, 17, 18, 21.09) ціни мереж лягли в історію
 * зсунутими на колонку: у збереженому a95 — справжній a95p, у a92 — справжній
 * a95, у dp — справжній a92, у gas — справжній dp; справжній газ втрачено.
 * Замір медіан 16.09: a95 90,945 ≈ середня a95p 91,16; a92 85,9 ≈ a95 87,25;
 * dp 82,0 ≈ a92 82,51; gas 97,7 ≈ dp 97,92 при середній газу 43,91.
 * Слово Роса 26.09: «Вернуть сдвиг (Recommended)» — газ за ці дні порожній.
 *
 * Правимо лише день з ОЗНАКОЮ зсуву: медіана газу мереж більша за середню газу
 * в 1,5 раза І медіана a95 мереж у межах 5% від середньої a95p. Виправлений
 * день ознаки вже не має — повторне застосування нічого не міняє.
 */
const медіана = ряд => {
  const v = ряд.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (!v.length) return null;
  const с = Math.floor(v.length / 2);
  return v.length % 2 ? v[с] : (v[с - 1] + v[с]) / 2;
};

// ⚠️ Лише сім відомих днів і лише день із повною картою: одноразовий ремонт не
// мусить торкатись будь-чого іншого (Astra: чесний 10.09 з однією дорогою
// мережею теж «виглядав» зсунутим).
export const ДНІ_ЗСУВУ = new Set(['2026-09-11', '2026-09-14', '2026-09-15', '2026-09-16',
  '2026-09-17', '2026-09-18', '2026-09-21']);
const МІНІМУМ_МЕРЕЖ = 10;

export function зсунутийДень(day) {
  if (!ДНІ_ЗСУВУ.has(day?.date)) return false;
  if (Object.keys(day?.networks ?? {}).length < МІНІМУМ_МЕРЕЖ) return false;
  const мережі = Object.values(day?.networks ?? {});
  const avg = day?.avg ?? {};
  if (!мережі.length || !avg.gas || !avg.a95p) return false;
  const газ = медіана(мережі.map(n => n?.gas));
  const а95 = медіана(мережі.map(n => n?.a95));
  if (газ === null || а95 === null) return false;
  return газ > avg.gas * 1.5 && Math.abs(а95 / avg.a95p - 1) < 0.05;
}

export function повернутиЗсув(day) {
  if (!зсунутийДень(day)) return day;
  const networks = {};
  for (const [назва, n] of Object.entries(day.networks)) {
    // ⚠️ Зсуваємо лише РЯДОК із власною ознакою: a95p немає, а «газ» — ціна
    // дизеля. Чесний рядок у зсунутому дні лишається як був (знахідка Astra).
    if (n?.a95p !== undefined || !(n?.gas > day.avg.gas * 1.5)) { networks[назва] = n; continue; }
    const правильні = {};
    if (n.a95 !== undefined) правильні.a95p = n.a95;
    if (n.a92 !== undefined) правильні.a95 = n.a92;
    if (n.dp !== undefined) правильні.a92 = n.dp;
    if (n.gas !== undefined) правильні.dp = n.gas;
    // решту полів мережі (не ціни) лишаємо як були
    for (const [к, в] of Object.entries(n))
      if (!['a95p', 'a95', 'a92', 'dp', 'gas'].includes(к)) правильні[к] = в;
    networks[назва] = правильні;
  }
  return { ...day, networks };
}
