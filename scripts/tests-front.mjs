// Проби фронтенду: чисті функції src/lib (дати осей, «Вчора», «добове»).
// Запуск: node scripts/tests-front.mjs (Node ≥ 22.18 читає .ts сам, без збирача).
//
// ⚠️ Часовий пояс — Київ, і ставимо його ДО першого Date: баг F1 живе лише на
// схід від Гринвіча, а в поясі UTC проба зеленіла б і на старому коді.
process.env.TZ = 'Europe/Kyiv';
import { readFileSync } from 'node:fs';

const { isoFromMs, previousDayLabel } = await import('../src/lib/format.ts');
const { extremeMoves, lastTwoNetworkDays, changeBetween } = await import('../src/lib/stats.ts');

let провалів = 0;
function проба(назва, вийшло, чекали) {
  const ok = JSON.stringify(вийшло) === JSON.stringify(чекали);
  if (!ok) провалів++;
  console.log(`  ${ok ? '✅' : '❌'} ${назва.padEnd(58)} -> ${JSON.stringify(вийшло)}`);
}

console.log('F1: ДАТИ НА ОСЯХ');
// ECharts ставить 'YYYY-MM-DD' і мітки осі на МІСЦЕВУ північ (замір 26.09.2026).
проба('пояс проби — Київ (UTC+3 влітку)', new Date(2026, 8, 1).getTimezoneOffset(), -180);
проба('мітка 1 вересня — «1 вер», а не 31 серпня', isoFromMs(new Date(2026, 8, 1).getTime()), '2026-09-01');
проба('мітка 25 вересня', isoFromMs(new Date(2026, 8, 25).getTime()), '2026-09-25');
проба('мітка взимку (UTC+2)', isoFromMs(new Date(2026, 0, 1).getTime()), '2026-01-01');
// Компоненти (TSX) Node без збирача не імпортує — тому тут, як виняток із §4а,
// перевірка тексту: жодна вісь не рахує дату через UTC.
for (const ф of ['../src/components/PriceChart.tsx', '../src/pages/NetworkPage.tsx']) {
  const т = readFileSync(new URL(ф, import.meta.url), 'utf8');
  проба(`${ф.split('/').pop()}: вісь без toISOString`, т.includes('toISOString'), false);
  проба(`${ф.split('/').pop()}: вісь через isoFromMs`, т.includes('isoFromMs('), true);
}

console.log('');
console.log('F2: «ВЧОРА» — ПОПЕРЕДНІЙ ДЕНЬ ЗБОРУ');
const дні = [
  { date: '2026-09-24', networks: { A: { dp: 60 } } },
  { date: '2026-09-25', networks: { A: { dp: 61 } } },
  { date: '2026-09-28', networks: { A: { dp: 62.5 } } },   // понеділок
];
const пара = lastTwoNetworkDays(дні);
проба('понеділок: попередній день збору — п\'ятниця', пара, { from: '2026-09-25', to: '2026-09-28' });
проба('понеділок: зміна є, а не «—»',
  changeBetween([{ date: '2026-09-25', value: 61 }, { date: '2026-09-28', value: 62.5 }], пара.from, пара.to)?.abs, 1.5);
проба('понеділок: підпис колонки «з 25 вер»', previousDayLabel(пара.from, пара.to), 'з 25 вер');
проба('звичайний день: підпис «Вчора»', previousDayLabel('2026-09-24', '2026-09-25'), 'Вчора');
проба('мережі не було в попередній день — «—»',
  changeBetween([{ date: '2026-09-11', value: 50 }, { date: '2026-09-28', value: 62.5 }], пара.from, пара.to), null);
проба('день без мереж не рахується днем збору',
  lastTwoNetworkDays([...дні, { date: '2026-09-29', avg: { dp: 60 } }]), { from: '2026-09-25', to: '2026-09-28' });
{
  const т = readFileSync(new URL('../src/components/NetworksTable.tsx', import.meta.url), 'utf8');
  проба('таблиця: «Вчора» не через changeOver(…, 1)', /changeOver\(series,\s*1\)/.test(т), false);
}

console.log('');
console.log('F3: «ДОБОВЕ» — ЛИШЕ СУСІДНІ ДНІ');
// Справжній випадок: +9,53 грн «18 бер» було ростом за 12 днів (06.03 → 18.03).
const серія = [
  { date: '2026-03-05', value: 50 },
  { date: '2026-03-06', value: 50.2 },
  { date: '2026-03-18', value: 59.73 },
  { date: '2026-03-19', value: 60.23 },
  { date: '2026-03-20', value: 59.93 },
];
const рухи = extremeMoves(серія, null);
проба('ріст за 12 днів не «добовий»', рухи.rise?.date !== '2026-03-18', true);
проба('добовий ріст — +0,50 19 бер', [рухи.rise?.date, Math.round(рухи.rise?.abs * 100) / 100], ['2026-03-19', 0.5]);
проба('добове падіння — −0,30 20 бер', [рухи.drop?.date, Math.round(рухи.drop?.abs * 100) / 100], ['2026-03-20', -0.3]);

console.log('');
if (провалів) { console.log(`❌ ПРОВАЛІВ: ${провалів}`); process.exit(1); }
console.log('✅ усі проби фронтенду пройшли');
