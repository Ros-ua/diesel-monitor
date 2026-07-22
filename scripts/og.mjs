// Разова генерація OG-картинки (1200×630) для шерингу в соцмережах.
// Запуск: node scripts/og.mjs  (потрібен devDep sharp; PNG комітиться в public/)

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="630" fill="#0a0e12"/>
  ${Array.from({ length: 22 }, (_, i) => `<rect x="0" y="${i * 28}" width="1200" height="1" fill="rgba(0,210,170,0.05)"/>`).join('')}
  <rect x="60" y="60" width="1080" height="510" rx="10" fill="#111820" stroke="rgba(0,210,170,0.25)" stroke-width="2"/>
  <circle cx="110" cy="130" r="9" fill="#00d2aa"/>
  <text x="140" y="142" font-family="Courier New, monospace" font-size="40" letter-spacing="8" fill="#00d2aa">ДИЗЕЛЬ МОНІТОР <tspan fill="#5a7a72">UA</tspan></text>
  <text x="110" y="230" font-family="Courier New, monospace" font-size="58" font-weight="bold" fill="#e0ede9">Ціни на пальне</text>
  <text x="110" y="300" font-family="Courier New, monospace" font-size="58" font-weight="bold" fill="#e0ede9">в Україні</text>
  <text x="110" y="370" font-family="Courier New, monospace" font-size="26" fill="#5a7a72">дизель · бензин · автогаз — 36 мереж АЗС, 23 області</text>
  <polyline points="110,480 260,470 400,475 540,440 680,430 820,455 960,420 1090,400" fill="none" stroke="#00d2aa" stroke-width="4"/>
  <circle cx="1090" cy="400" r="7" fill="#00d2aa"/>
  <text x="110" y="540" font-family="Courier New, monospace" font-size="30" fill="#00d2aa">diesel-monitor.pp.ua</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(path.join(ROOT, 'public', 'og.png'));
await writeFile(path.join(ROOT, 'scratch-og.svg'), svg);
console.log('public/og.png готово');
