/**
 * Одноразовий: повертає зсув колонки в public/data/history.json (див.
 * lib/зсув-історії.mjs). Запускається ОДИН раз на свіжому main перед пушем;
 * повторний запуск нічого не міняє. Друкує змінені дати.
 *
 * ЗАПУСК:  node scripts/виправити-зсув-історії.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { повернутиЗсув } from './lib/зсув-історії.mjs';

const файл = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'history.json');
const історія = JSON.parse(readFileSync(файл, 'utf8'));
const змінені = [];
історія.days = історія.days.map(d => {
  const н = повернутиЗсув(d);
  if (н !== d) змінені.push(d.date);
  return н;
});
if (змінені.length) {
  writeFileSync(файл, JSON.stringify(історія));
  console.log(`виправлено днів: ${змінені.length} — ${змінені.join(', ')}`);
} else {
  console.log('зсунутих днів не знайдено — файл не чіпав');
}
