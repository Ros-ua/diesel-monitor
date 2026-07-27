// Генерує послідовність PNG-кадрів 1080x1920 для Reels: анімований графік ціни дизеля.
// Далі ffmpeg збирає з них MP4 (див. .github/workflows/reels.yml).
//
//   node scripts/reel-frames.mjs [вид_пального] [днів]
//   → frames/f0001.png … + друкує JSON з метаданими для підпису
//
// Сценарій 12 с при 24 fps (288 кадрів):
//   0.0–1.5 c  гачок: питання великим шрифтом (перші секунди вирішують долю Reels)
//   1.5–9.0 c  графік малюється зліва направо, цифра ціни й дата тікають
//   9.0–12.0 c фінал: підсумок зміни + адреса сайту

import sharp from 'sharp';
import { readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const FRAMES_DIR = path.join(ROOT, 'frames');

const W = 1080, H = 1920, FPS = 24, SEC = 12;
const TOTAL = FPS * SEC;
const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f';
const MUT = '#5a7a72', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';

const FUEL_NAMES = { dp: 'дизель', a95: 'бензин А-95', a95p: 'бензин А-95+', a92: 'бензин А-92', gas: 'автогаз' };
const fmt = v => v.toFixed(2).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2); // плавний старт і фініш

const MONTHS = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
const humanDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${+d} ${MONTHS[+m - 1]} ${y}`;
};

// «за 2 роки» / «за 8 місяців» — рахуємо за РЕАЛЬНИМИ датами, бо історія розріджена
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};

function periodLabel(pts) {
  const days = (new Date(pts.at(-1).date) - new Date(pts[0].date)) / 86_400_000;
  const months = Math.round(days / 30.44);
  if (months >= 12) {
    const years = Math.round(months / 12);
    return years === 1 ? 'за рік' : `за ${years} ${plural(years, 'рік', 'роки', 'років')}`;
  }
  return `за ${months} ${plural(months, 'місяць', 'місяці', 'місяців')}`;
}

// ── дані ──
export // days — це КАЛЕНДАРНІ ДНІ, не кількість точок. Історія розріджена (Мінфін
// публікує не щодня), тож «останні 30 точок» легко розтягуються на пів року —
// і замість свіжого руху виходить графік за 8 місяців.
const MIN_POINTS = 6; // якщо у вікні замало точок — розширюємо, інакше нема що малювати

async function series(fuel, days) {
  const hist = JSON.parse(await readFile(path.join(DATA_DIR, 'history.json'), 'utf-8'));
  const pts = (hist.days ?? [])
    .filter(d => d.avg?.[fuel] !== undefined)
    .map(d => ({ date: d.date, value: d.avg[fuel] }));
  if (pts.length < 10) throw new Error(`замало даних для ${fuel}`);

  const lastTime = new Date(pts.at(-1).date).getTime();
  let window = days;
  for (let i = 0; i < 6; i++) {
    const cut = lastTime - window * 86_400_000;
    const slice = pts.filter(p => new Date(p.date).getTime() >= cut);
    if (slice.length >= MIN_POINTS) {
      const span = Math.round((lastTime - new Date(slice[0].date).getTime()) / 86_400_000);
      console.error(`графік: ${slice.length} точок за ${span} дн (просили ${days})`);
      return slice;
    }
    window *= 2; // у вікні замало даних — беремо ширше
  }
  return pts.slice(-MIN_POINTS * 2);
}

// ── кадр ──
export function frameSvg(pts, frame, fuel) {
  const t = frame / (TOTAL - 1);
  const hookEnd = 1.5 / SEC, drawEnd = 9 / SEC;

  // скільки точок графіка вже намальовано
  const drawT = t <= hookEnd ? 0 : t >= drawEnd ? 1 : ease((t - hookEnd) / (drawEnd - hookEnd));
  const shown = Math.max(2, Math.round(drawT * pts.length));
  const vis = pts.slice(0, shown);
  const cur = vis[vis.length - 1];

  const vals = pts.map(p => p.value);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
  const pad = rng * 0.15;
  const lo = mn - pad, hi = mx + pad, span = hi - lo;

  const gx0 = 90, gx1 = W - 90, gy0 = 880, gy1 = 1420;
  const px = i => gx0 + (gx1 - gx0) * (i / (pts.length - 1));
  const py = v => gy1 - ((v - lo) / span) * (gy1 - gy0);

  const line = vis.map((p, i) => `${px(i).toFixed(1)},${py(p.value).toFixed(1)}`).join(' ');
  const area = `${gx0},${gy1} ${line} ${px(vis.length - 1).toFixed(1)},${gy1}`;

  // гачок з'являється відразу, потім тане
  const hookOp = t < hookEnd ? 1 : Math.max(0, 1 - (t - hookEnd) * 8);
  // фінальний блок наростає
  const outT = t <= drawEnd ? 0 : Math.min(1, (t - drawEnd) / (1 - drawEnd) * 2.5);

  const first = pts[0].value, last = pts[pts.length - 1].value;
  const diff = last - first;
  const pct = (diff / first) * 100;
  const up = diff > 0;

  const fuelName = FUEL_NAMES[fuel] ?? fuel;
  const period = periodLabel(pts);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <circle cx="96" cy="120" r="11" fill="${AC}"/>
  <text x="124" y="132" font-family="'Courier New',monospace" font-size="38" letter-spacing="7" fill="${AC}">ДИЗЕЛЬ МОНІТОР <tspan fill="${MUT}">UA</tspan></text>

  <text x="90" y="290" font-family="'Courier New',monospace" font-size="62" font-weight="bold" fill="${TXT}">Скільки коштував</text>
  <text x="90" y="370" font-family="'Courier New',monospace" font-size="62" font-weight="bold" fill="${TXT}">${esc(fuelName)}</text>
  <text x="90" y="450" font-family="'Courier New',monospace" font-size="62" font-weight="bold" fill="${AC}">${esc(period)}</text>

  <g opacity="${hookOp.toFixed(3)}">
    <rect x="0" y="520" width="${W}" height="${H - 520}" fill="${BG}"/>
    <text x="90" y="900" font-family="'Courier New',monospace" font-size="110" font-weight="bold" fill="${TXT}">Спойлер:</text>
    <text x="90" y="1030" font-family="'Courier New',monospace" font-size="110" font-weight="bold" fill="${up ? RED : AC}">${up ? '+' : '−'}${fmt(Math.abs(pct))}%</text>
    <text x="90" y="1140" font-family="'Courier New',monospace" font-size="44" fill="${MUT}">дивись, як це було</text>
  </g>

  <text x="90" y="640" font-family="'Courier New',monospace" font-size="150" font-weight="bold" fill="${AC}">${fmt(cur.value)}</text>
  <text x="${90 + 150 * fmt(cur.value).length * 0.62}" y="640" font-family="'Courier New',monospace" font-size="46" fill="${MUT}">грн/л</text>
  <text x="90" y="712" font-family="'Courier New',monospace" font-size="42" fill="${MUT}">${esc(humanDate(cur.date))}</text>

  <line x1="${gx0}" y1="${gy1}" x2="${gx1}" y2="${gy1}" stroke="${LINE}" stroke-width="2"/>
  <polygon points="${area}" fill="${AC}" opacity="0.08"/>
  <polyline points="${line}" fill="none" stroke="${AC}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>
  <circle cx="${px(vis.length - 1).toFixed(1)}" cy="${py(cur.value).toFixed(1)}" r="16" fill="${AC}"/>
  <circle cx="${px(vis.length - 1).toFixed(1)}" cy="${py(cur.value).toFixed(1)}" r="30" fill="${AC}" opacity="0.25"/>

  <g opacity="${outT.toFixed(3)}">
    <rect x="60" y="1520" width="${W - 120}" height="230" rx="28" fill="${SURF}" stroke="${LINE}" stroke-width="2"/>
    <text x="110" y="1596" font-family="'Courier New',monospace" font-size="36" fill="${MUT}">Зміна ${esc(period)}</text>
    <text x="110" y="1690" font-family="'Courier New',monospace" font-size="64" font-weight="bold" fill="${up ? RED : AC}">${up ? '▲ +' : '▼ −'}${fmt(Math.abs(diff))} грн</text>
    <text x="${W - 110}" y="1690" font-family="'Courier New',monospace" font-size="64" font-weight="bold" fill="${up ? RED : AC}" text-anchor="end">${up ? '+' : '−'}${fmt(Math.abs(pct))}%</text>
  </g>

  <text x="${W / 2}" y="1850" font-family="'Courier New',monospace" font-size="44" fill="${AC}" text-anchor="middle">diesel-monitor.pp.ua</text>
</svg>`;
}

export const REEL = { W, H, FPS, SEC, TOTAL };

// ── збірка ──
if (process.argv[1]?.endsWith('reel-frames.mjs')) await main();

// Щоб ролики не були щотижня про дизель — чергуємо пальне по тижнях.
// Дизель випадає частіше (він для нас головний), решта — по колу.
const ROTATION = ['dp', 'a95', 'dp', 'a92', 'dp', 'gas', 'dp', 'a95p'];

async function main() {
const arg = process.argv[2];
const week = Math.floor(Date.now() / (7 * 86_400_000));
const fuel = arg && arg !== 'auto' ? arg : ROTATION[week % ROTATION.length];
const days = Number(process.argv[3] ?? 180);

const pts = await series(fuel, days);
await rm(FRAMES_DIR, { recursive: true, force: true });
await mkdir(FRAMES_DIR, { recursive: true });

for (let i = 0; i < TOTAL; i++) {
  const png = await sharp(Buffer.from(frameSvg(pts, i, fuel))).png({ compressionLevel: 1 }).toBuffer();
  await writeFile(path.join(FRAMES_DIR, `f${String(i + 1).padStart(4, '0')}.png`), png);
}

const first = pts[0].value, last = pts[pts.length - 1].value;
const spanDays = (new Date(pts.at(-1).date) - new Date(pts[0].date)) / 86_400_000;
const meta = {
  fuel,
  fuelName: FUEL_NAMES[fuel] ?? fuel,
  from: pts[0].date,
  to: pts[pts.length - 1].date,
  months: Math.round(spanDays / 30.44),
  first,
  last,
  diff: +(last - first).toFixed(2),
  pct: +(((last - first) / first) * 100).toFixed(1),
  frames: TOTAL,
  fps: FPS,
  file: `reel-${pts.at(-1).date}-${fuel}.mp4`, // ffmpeg збере саме під цим імʼям
};
await writeFile(path.join(ROOT, 'frames', 'meta.json'), JSON.stringify(meta, null, 2));
console.log(JSON.stringify(meta));
}
