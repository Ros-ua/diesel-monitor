/**
 * Чи є привід передеплоювати сайт? Друкує «так» або «ні» і виходить із кодом
 * 0 (є привід) або 1 (немає).
 *
 * ⚠️ Порівнюємо робочу теку з ОСТАННІМ КОМІТОМ, без летючих полів: позначки
 * часу міняються в кожному прогоні, і саме через них деплой ішов практично
 * щоразу. Подробиці — у lib/значуще.mjs.
 *
 * ЗАПУСК:  node scripts/змінилось.mjs
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ЛЕТЮЧІ, НЕ_ПРИВІД, значущеЗмінилось } from './lib/значуще.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'public', 'data');

function зКоміту(відносний) {
  try {
    return execFileSync('git', ['show', `HEAD:${відносний}`],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;                               // файла в коміті ще не було
  }
}

const причини = [];
for (const імя of readdirSync(DATA).filter(f => f.endsWith('.json')).sort()) {
  if (НЕ_ПРИВІД.includes(імя)) continue;
  const повний = path.join(DATA, імя);
  const новий = existsSync(повний) ? readFileSync(повний, 'utf8') : null;
  const старий = зКоміту(`public/data/${імя}`);
  if (значущеЗмінилось(старий, новий, ЛЕТЮЧІ[імя] ?? [])) причини.push(імя);
}

if (причини.length) {
  console.log('так: ' + причини.join(', '));
  process.exit(0);
}
console.log('ні: змінились лише позначки часу');
process.exit(1);
