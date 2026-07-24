// Генерує PNG-картку з цінами дня у стилі сайта — для ценового поста в Telegram.
// export makeCard(latest, history?) -> Buffer(png). Standalone: node scripts/price-card.mjs
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f', MUT = '#5a7a72', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';
const fmt = v => v.toFixed(2).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FUELS = [['Дизель', 'dp'], ['А-95+', 'a95p'], ['А-95', 'a95'], ['А-92', 'a92'], ['Автогаз', 'gas']];

export function makeCardSvg(latest, spark = []) {
  const [y, m, d] = latest.date.split('-');
  const W = 1080, H = 1080;
  // рядки пального
  const rowY0 = 340, rowH = 118;
  const rows = FUELS.filter(([, k]) => latest.avg?.[k] !== undefined).map(([name, k], i) => {
    const y0 = rowY0 + i * rowH;
    const price = latest.avg[k];
    const ch = latest.avgChange?.[k];
    const up = ch !== undefined && Math.abs(ch) >= 0.005 && ch > 0;
    const down = ch !== undefined && Math.abs(ch) >= 0.005 && ch < 0;
    const col = up ? RED : down ? AC : MUT;
    const arr = up ? '▲' : down ? '▼' : '→';
    const chTxt = ch === undefined ? '' : Math.abs(ch) < 0.005 ? '0,00' : (up ? '+' : '−') + fmt(Math.abs(ch));
    return `
      <text x="70" y="${y0 + 46}" font-family="'Courier New',monospace" font-size="40" fill="${TXT}">${esc(name)}</text>
      <text x="720" y="${y0 + 52}" font-family="'Courier New',monospace" font-size="60" font-weight="bold" fill="${AC}" text-anchor="end">${fmt(price)}</text>
      <text x="740" y="${y0 + 30}" font-family="'Courier New',monospace" font-size="22" fill="${MUT}">грн/л</text>
      <text x="1010" y="${y0 + 50}" font-family="'Courier New',monospace" font-size="34" fill="${col}" text-anchor="end">${arr} ${chTxt}</text>
      ${i < FUELS.length - 1 ? `<line x1="70" y1="${y0 + rowH - 18}" x2="1010" y2="${y0 + rowH - 18}" stroke="${LINE}" stroke-width="1"/>` : ''}`;
  }).join('');

  // спарклайн дизеля внизу
  let sparkSvg = '';
  if (spark.length >= 2) {
    const vals = spark.map(p => p.value);
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
    const x0 = 70, x1 = 1010, yb = 1000, yt = 950;
    const pts = vals.map((v, i) => `${(x0 + (x1 - x0) * i / (vals.length - 1)).toFixed(0)},${(yb - (v - mn) / rng * (yb - yt)).toFixed(0)}`).join(' ');
    sparkSvg = `<polyline points="${pts}" fill="none" stroke="${AC}" stroke-width="3" opacity="0.7"/>`;
  }

  const usd = latest.usd !== undefined ? `USD ${fmt(latest.usd)}` : '';
  const eur = latest.eur !== undefined ? `EUR ${fmt(latest.eur)}` : '';
  const brent = latest.brent !== undefined ? `Brent $${fmt(latest.brent)}` : '';
  const factors = [usd, eur, brent].filter(Boolean).join('   ·   ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}"/>
    <rect x="24" y="24" width="${W - 48}" height="${H - 48}" rx="24" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
    <circle cx="78" cy="92" r="9" fill="${AC}"/>
    <text x="100" y="102" font-family="'Courier New',monospace" font-size="32" letter-spacing="6" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>
    <text x="1010" y="102" font-family="'Courier New',monospace" font-size="30" fill="${MUT}" text-anchor="end">${d}.${m}.${y}</text>
    <text x="70" y="215" font-family="'Courier New',monospace" font-size="54" font-weight="bold" fill="${TXT}">Ціни на пальне</text>
    <text x="70" y="278" font-family="'Courier New',monospace" font-size="54" font-weight="bold" fill="${TXT}">в Україні</text>
    ${rows}
    ${sparkSvg}
    <text x="70" y="1042" font-family="'Courier New',monospace" font-size="26" fill="${MUT}">${esc(factors)}</text>
    <text x="1010" y="1042" font-family="'Courier New',monospace" font-size="30" fill="${AC}" text-anchor="end">diesel-monitor.pp.ua</text>
  </svg>`;
}

export async function makeCard(latest, spark = []) {
  return sharp(Buffer.from(makeCardSvg(latest, spark))).png().toBuffer();
}

// standalone-превʼю
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('price-card.mjs')) {
  const latest = JSON.parse(await readFile(path.join(DATA_DIR, 'latest.json'), 'utf-8'));
  let spark = [];
  try {
    const hist = JSON.parse(await readFile(path.join(DATA_DIR, 'history.json'), 'utf-8'));
    spark = hist.days.filter(d => d.avg?.dp !== undefined).slice(-30).map(d => ({ value: d.avg.dp }));
  } catch {}
  await writeFile(path.join(DATA_DIR, '..', '..', 'scratch-card.png'), await makeCard(latest, spark));
  console.log('scratch-card.png готово');
}
