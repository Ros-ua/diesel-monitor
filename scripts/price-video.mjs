// Короткий вертикальний ролик із цінами дня — та сама картка, що й price-card.mjs,
// але в русі: рядки пального виїжджають по черзі, ціни «докручуються», лінія
// дизеля малюється. Збирає КОМПОЗИЦІЮ HyperFrames (HTML + GSAP); саме відео
// рендерить CLI: `npx hyperframes render <тека> -o ролик.mp4`.
//
// Чому HTML, а не кадри sharp, як у Reels: HyperFrames сам крутить headless Chrome
// кадр за кадром і віддає ffmpeg — анімацію пишемо звичайним CSS/GSAP, а не
// малюємо 300 PNG. Числа в ролику — рівно ті, що в latest.json, без округлень.
//
// export makeVideoHtml(latest, spark, { gsapSrc }) -> string
// CLI:   node scripts/price-video.mjs <тека-композиції>
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const BG = '#0a0e12', SURF = '#111820', AC = '#00d2aa', RED = '#ff5f5f', MUT = '#6d8f86', TXT = '#e0ede9', LINE = 'rgba(0,210,170,0.15)';
const FUELS = [['Дизель', 'dp'], ['А-95+', 'a95p'], ['А-95', 'a95'], ['А-92', 'a92'], ['Автогаз', 'gas']];
export const DURATION = 9;

const fmt = v => v.toFixed(2).replace('.', ',');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const uaDate = iso => iso.split('-').reverse().join('.');

// Найдешевша мережа за дизелем — підпис у фіналі ролика. Дата — день КАРТИ
// МЕРЕЖ (networksDate), а не день середніх: при обвалі /tm/ карта вчорашня.
export function cheapestNetwork(latest, key = 'dp') {
  const list = Object.entries(latest.networks ?? {})
    .filter(([, p]) => Number.isFinite(p?.[key]))
    .sort((a, b) => a[1][key] - b[1][key]);
  if (!list.length) return null;
  return { name: list[0][0], price: list[0][1][key], day: latest.networksDate ?? latest.date };
}

export function makeVideoHtml(latest, spark = [], { gsapSrc = 'gsap.min.js' } = {}) {
  const rows = FUELS.filter(([, k]) => Number.isFinite(latest.avg?.[k])).map(([name, k], i) => {
    const price = latest.avg[k];
    const ch = latest.avgChange?.[k];
    const up = Number.isFinite(ch) && Math.abs(ch) >= 0.005 && ch > 0;
    const down = Number.isFinite(ch) && Math.abs(ch) >= 0.005 && ch < 0;
    const col = up ? RED : down ? AC : MUT;
    const arr = up ? '▲' : down ? '▼' : '→';
    const chTxt = !Number.isFinite(ch) ? '' : Math.abs(ch) < 0.005 ? '0,00' : (up ? '+' : '−') + fmt(Math.abs(ch));
    return `<div class="row" id="row${i}"><span class="name">${esc(name)}</span>` +
      `<span class="price"><b class="num" data-to="${price}">${fmt(price)}</b><small>грн/л</small></span>` +
      `<span class="ch" style="color:${col}">${arr} ${chTxt}</span></div>`;
  });

  let sparkSvg = '';
  if (spark.length >= 2) {
    const vals = spark.map(p => p.value);
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = (mx - mn) || 1;
    const pts = vals.map((v, i) => `${(940 * i / (vals.length - 1)).toFixed(1)},${(200 - (v - mn) / rng * 180).toFixed(1)}`).join(' ');
    sparkSvg = `<div id="spark"><div class="lbl">Дизель, ${spark.length} днів</div>` +
      `<svg width="940" height="210" viewBox="0 0 940 210"><polyline id="line" points="${pts}" fill="none" stroke="${AC}" stroke-width="5" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg></div>`;
  }

  const cheap = cheapestNetwork(latest);
  const cheapTxt = cheap
    ? `Найдешевший дизель ${uaDate(cheap.day)}: <b>${esc(cheap.name)}</b> — ${fmt(cheap.price)} грн/л`
    : '';

  return `<!doctype html>
<html lang="uk" data-resolution="portrait">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=1080, height=1920">
<script src="${esc(gsapSrc)}"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1920px;overflow:hidden;background:${BG}}
#root{width:1080px;height:1920px;position:relative;font-family:'Courier New',monospace;color:${TXT};
  background:radial-gradient(80% 60% at 15% -12%,rgba(0,210,170,.16),transparent 55%),
    radial-gradient(75% 60% at 92% 112%,rgba(0,170,255,.13),transparent 58%),
    radial-gradient(55% 40% at 75% 25%,rgba(170,136,255,.09),transparent 60%),${BG}}
#panel{position:absolute;left:40px;top:40px;right:40px;bottom:40px;border-radius:32px;background:rgba(17,24,32,.82);border:2px solid ${LINE}}
#head{position:absolute;left:90px;right:90px;top:110px;display:flex;justify-content:space-between;align-items:center;font-size:34px;letter-spacing:6px;color:${AC}}
#head .dot{display:inline-block;width:20px;height:20px;border-radius:50%;background:${AC};margin-right:18px;vertical-align:middle}
#head .d{color:${MUT};letter-spacing:0;font-size:34px}
#title{position:absolute;left:90px;top:260px;font-size:84px;font-weight:bold;line-height:1.12}
#rows{position:absolute;left:90px;right:90px;top:560px}
.row{display:flex;align-items:baseline;justify-content:space-between;height:150px;border-bottom:2px solid ${LINE}}
.row:last-child{border-bottom:none}
.name{font-size:48px;width:280px}
.price{flex:1;text-align:right;padding-right:30px}
.price b{font-size:78px;color:${AC}}
.price small{font-size:26px;color:${MUT};margin-left:10px}
.ch{font-size:40px;width:220px;text-align:right}
#spark{position:absolute;left:70px;right:70px;top:1360px}
#spark .lbl{font-size:28px;color:${MUT};margin:0 0 14px 20px}
#cheap{position:absolute;left:90px;right:90px;top:1650px;font-size:34px;line-height:1.4;color:${TXT}}
#cheap b{color:${AC}}
#url{position:absolute;left:90px;right:90px;bottom:100px;font-size:40px;color:${AC};text-align:right}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${DURATION}" data-width="1080" data-height="1920">
  <div id="panel"></div>
  <div id="head"><span><span class="dot"></span>ДИЗЕЛЬ МОНІТОР <span style="color:${MUT}">UA</span></span><span class="d">${uaDate(latest.date)}</span></div>
  <div id="title">Ціни на пальне<br>в Україні</div>
  <div id="rows">${rows.join('')}</div>
  ${sparkSvg}
  <div id="cheap">${cheapTxt}</div>
  <div id="url">diesel-monitor.pp.ua</div>
</div>
<script>
  const tl = gsap.timeline({ paused: true });
  tl.from('#panel', { opacity: 0, scale: 0.96, duration: 0.6, ease: 'power2.out' }, 0)
    .from('#head', { opacity: 0, y: -30, duration: 0.5 }, 0.3)
    .from('#title', { opacity: 0, x: -60, duration: 0.7, ease: 'power3.out' }, 0.5);
  document.querySelectorAll('.row').forEach((row, i) => {
    const at = 1.2 + i * 0.35;
    tl.from(row, { opacity: 0, x: 80, duration: 0.5, ease: 'power2.out' }, at);
    // Ціна «докручується» до справжнього числа і зупиняється РІВНО на ньому:
    // останній кадр показує те саме, що й картка.
    const num = row.querySelector('.num');
    const to = Number(num.dataset.to);
    const o = { v: to * 0.9 };
    tl.to(o, { v: to, duration: 0.9, ease: 'power2.out',
      onUpdate: () => { num.textContent = o.v.toFixed(2).replace('.', ','); } }, at);
  });
  if (document.querySelector('#line')) {
    tl.from('#spark', { opacity: 0, duration: 0.4 }, 3.2)
      .to('#line', { strokeDashoffset: 0, duration: 1.6, ease: 'power1.inOut' }, 3.3);
  }
  tl.from('#cheap', { opacity: 0, y: 30, duration: 0.6 }, 5.2)
    .from('#url', { opacity: 0, duration: 0.6 }, 5.8)
    .to({}, { duration: ${DURATION} - 6.4 }, 6.4);
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  tl.seek(0);
</script>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2];
  if (!out) {
    console.error('використання: node scripts/price-video.mjs <тека-композиції>');
    process.exit(2);
  }
  const latest = JSON.parse(await readFile(path.join(DATA_DIR, 'latest.json'), 'utf-8'));
  let spark = [];
  try {
    const hist = JSON.parse(await readFile(path.join(DATA_DIR, 'history.json'), 'utf-8'));
    spark = hist.days.filter(d => Number.isFinite(d.avg?.dp)).slice(-30).map(d => ({ value: d.avg.dp }));
  } catch {}
  await mkdir(out, { recursive: true });
  // GSAP кладемо поруч із композицією з node_modules: без CDN рендер не залежить
  // від мережі і завжди бере версію з lock-файлу.
  const require = createRequire(import.meta.url);
  await copyFile(require.resolve('gsap/dist/gsap.min.js'), path.join(out, 'gsap.min.js'));
  await writeFile(path.join(out, 'index.html'), makeVideoHtml(latest, spark));
  console.log(`price-video: композиція ${out} (${uaDate(latest.date)}, ${spark.length} точок)`);
}
