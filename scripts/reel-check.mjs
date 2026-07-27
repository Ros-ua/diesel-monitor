// Вирішує, чи знімати сьогодні Reels — і про яке пальне.
//
// Reels має виходити ТОДІ, КОЛИ Є ПРО ЩО ГОВОРИТИ. У спокійний тиждень ціна
// рухається на копійки, і графік перетворюється на пряму лінію — такий ролик
// не додивляються, а Instagram за недодивлені Reels ріже охоплення наступним.
//
// Умови (усі мають виконатись):
//   1. дані свіжі — ще не знімали ролик на цій даті
//   2. рух ціни за ~тиждень ≥ MIN_MOVE_PCT
//   3. від попереднього ролика минуло ≥ MIN_GAP_DAYS (не приїдаємось)
//
// Пише рішення у GITHUB_OUTPUT: run=true|false, fuel=<ключ>, days=<скільки точок>
//
//   node scripts/reel-check.mjs

import { readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const MIN_MOVE_PCT = 1.0;  // менший рух — не інфопривід
const MIN_GAP_DAYS = 3;    // максимум ~2 ролики на тиждень
const WEEK_DAYS = 8;       // вікно «тиждень» з запасом: історія розріджена
const GRAPH_POINTS = 30;   // рух показуємо в контексті місяця, а не 5 днів

const FUELS = ['dp', 'a95p', 'a95', 'a92', 'gas'];
const NAMES = { dp: 'дизель', a95p: 'А-95+', a95: 'А-95', a92: 'А-92', gas: 'автогаз' };

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, file), 'utf-8'));
  } catch {
    return fallback;
  }
}

async function decide(out) {
  const hist = await readJson('history.json', { days: [] });
  const state = await readJson('ig-reel.json', {});
  const days = (hist.days ?? []).filter(d => d.avg);
  if (days.length < 10) return out(false, 'замало історії');

  const last = days.at(-1);

  // 1. свіжість: на цих даних ролика ще не було
  if (state.lastDataDate === last.date) {
    return out(false, `на даних за ${last.date} ролик уже виходив`);
  }

  // 2. пауза після попереднього ролика
  if (state.postedAt) {
    const gap = (Date.now() - new Date(state.postedAt).getTime()) / 86_400_000;
    if (gap < MIN_GAP_DAYS) {
      return out(false, `попередній ролик ${gap.toFixed(1)} дн тому (треба ${MIN_GAP_DAYS})`);
    }
  }

  // 3. рух ціни за тиждень — шукаємо найдинамічніше пальне
  const target = new Date(last.date).getTime() - WEEK_DAYS * 86_400_000;
  let base = null, best = Infinity;
  for (let i = days.length - 2; i >= 0; i--) {
    const dist = Math.abs(new Date(days[i].date).getTime() - target);
    if (dist < best) { best = dist; base = days[i]; }
    if (new Date(days[i].date).getTime() < target) break;
  }
  if (!base || best > 20 * 86_400_000) return out(false, 'немає з чим порівняти тиждень тому');

  const moves = FUELS
    .filter(k => last.avg[k] !== undefined && base.avg?.[k] !== undefined)
    .map(k => ({ k, pct: ((last.avg[k] - base.avg[k]) / base.avg[k]) * 100 }))
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

  if (!moves.length) return out(false, 'немає даних для порівняння');

  const top = moves[0];
  const moved = Math.abs(top.pct);
  console.log(
    `рух за ~${WEEK_DAYS} дн: ` +
      moves.map(m => `${NAMES[m.k]} ${m.pct > 0 ? '+' : ''}${m.pct.toFixed(1)}%`).join(', ')
  );

  if (moved < MIN_MOVE_PCT) {
    return out(false, `найбільший рух ${moved.toFixed(1)}% — менше за поріг ${MIN_MOVE_PCT}%`);
  }

  return out(true, `${NAMES[top.k]} ${top.pct > 0 ? '+' : ''}${top.pct.toFixed(1)}% за тиждень`, top.k);
}

async function main() {
  const out = async (run, why, fuel = 'dp') => {
    console.log(run ? `✅ знімаємо Reels: ${why}` : `⏸ пропускаємо: ${why}`);
    if (process.env.GITHUB_OUTPUT) {
      await appendFile(
        process.env.GITHUB_OUTPUT,
        `run=${run}\nfuel=${fuel}\ndays=${GRAPH_POINTS}\nreason=${why}\n`
      );
    }
  };
  await decide(out);
}

main().catch(e => {
  console.error('reel-check ЗБІЙ:', e.message);
  process.exit(1);
});
