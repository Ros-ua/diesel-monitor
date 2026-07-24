// Генерує повний набір іконок сайту з фірмової краплі пального.
// Реальні файли (не data-URI) — щоб Google показував іконку у видачі.
// Запуск разово: node scripts/favicon.mjs
import sharp from 'sharp';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const BG = '#0a0e12', AC = '#00d2aa';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
<rect width="64" height="64" rx="13" fill="${BG}"/>
<rect x="1.5" y="1.5" width="61" height="61" rx="12" fill="none" stroke="${AC}" stroke-opacity="0.25" stroke-width="1.5"/>
<path d="M32 13 C32 13 18 30 18 40 a14 14 0 0 0 28 0 C46 30 32 13 32 13 Z" fill="${AC}"/>
</svg>`;

// favicon.svg (векторний — для сучасних браузерів)
await writeFile(path.join(PUB, 'favicon.svg'), svg);

const png = (size) => sharp(Buffer.from(svg)).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();

// PNG-набір
await writeFile(path.join(PUB, 'favicon-96x96.png'), await png(96));
await writeFile(path.join(PUB, 'apple-touch-icon.png'), await png(180));
await writeFile(path.join(PUB, 'icon-512.png'), await png(512));

// favicon.ico (multi-size 16/32/48, PNG всередині — Vista+)
const sizes = [16, 32, 48];
const imgs = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + sizes.length * 16;
const dir = Buffer.concat(sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(s >= 256 ? 0 : s, 0); e.writeUInt8(s >= 256 ? 0 : s, 1);
  e.writeUInt8(0, 2); e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(imgs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += imgs[i].length;
  return e;
}));
await writeFile(path.join(PUB, 'favicon.ico'), Buffer.concat([header, dir, ...imgs]));

// web-маніфест (для PWA-встановлення на телефон)
await writeFile(path.join(PUB, 'site.webmanifest'), JSON.stringify({
  name: 'Дизель Монітор UA', short_name: 'Дизель Монітор',
  description: 'Ціни на пальне в Україні', lang: 'uk',
  start_url: '/', display: 'standalone', background_color: BG, theme_color: BG,
  icons: [
    { src: '/favicon-96x96.png', sizes: '96x96', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
  ],
}, null, 2));

console.log('favicon: svg, ico (16/32/48), 96, 180, 512, webmanifest — готово');
