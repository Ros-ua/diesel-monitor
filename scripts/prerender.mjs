// Пререндер статичних SEO-сторінок областей і мереж у dist/ (після vite build).
// Google не індексує hash-маршрути SPA, тому кожна область і мережа отримує
// справжню HTML-сторінку з цінами дня: /region/<slug>/ та /network/<slug>/.
// Також генерує повний sitemap.xml. Запускається у npm run build.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const SITE = 'https://diesel-monitor.pp.ua';

const FUELS = [
  ['dp', 'Дизель (ДП)'],
  ['a95p', 'А-95 преміум'],
  ['a95', 'А-95'],
  ['a92', 'А-92'],
  ['gas', 'Автогаз'],
];

// Для сторінок «паливо × область» і «паливо × мережа»: слаг у URL і форми слова
// у заголовках. Люди шукають «ціни на дизель Львівська область», а не «ціни dp».
const FUEL_SEO = {
  dp: { slug: 'dyzel', short: 'Дизель', acc: 'дизель', gen: 'дизеля', q: 'дизельне пальне' },
  a95p: { slug: 'a95-premium', short: 'А-95 преміум', acc: 'бензин А-95 преміум', gen: 'А-95 преміум', q: 'преміум-бензин' },
  a95: { slug: 'a95', short: 'А-95', acc: 'бензин А-95', gen: 'А-95', q: 'бензин А-95' },
  a92: { slug: 'a92', short: 'А-92', acc: 'бензин А-92', gen: 'А-92', q: 'бензин А-92' },
  gas: { slug: 'gaz', short: 'Автогаз', acc: 'автогаз', gen: 'автогазу', q: 'газ для авто' },
};

// Транслітерація КМУ-2010 для слагів
const TR = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh',
  з: 'z', и: 'y', і: 'i', ї: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '',
};

export function slugify(name) {
  return name
    .toLowerCase()
    .split('')
    .map(c => TR[c] ?? c)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Місцевий відмінок області: «Київська» → «у Київській області».
// Усі 23 назви — прикметники жіночого роду на -ська/-зька/-цька, тож правило одне.
const inRegion = name => name.replace(/а$/, 'ій');

const fmt = v => (v === undefined || v === null ? '—' : v.toFixed(2).replace('.', ','));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const uaDate = iso => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};

function page({ title, description, canonical, h1, sub, bodyHtml, spaLink, navHtml, ctaText = 'Інтерактивний дашборд →' }) {
  return `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Дизель Монітор UA">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="uk_UA">
<meta property="og:image" content="${SITE}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#0a0e12">
<style>
body{background:#0a0e12;color:#e0ede9;font-family:'Courier New',monospace;margin:0;padding:16px;line-height:1.5}
.wrap{max-width:860px;margin:0 auto}
a{color:#00d2aa}
h1{font-size:20px;color:#00d2aa;letter-spacing:.06em;text-transform:uppercase;margin:14px 0 2px}
.sub{font-size:11px;color:#5a7a72;margin-bottom:14px}
.card{background:#111820;border:1px solid rgba(0,210,170,.15);border-radius:6px;padding:14px;margin-bottom:12px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{font-size:9px;color:#5a7a72;letter-spacing:.12em;text-transform:uppercase;text-align:right;padding:6px 8px;border-bottom:1px solid rgba(0,210,170,.15)}
th:first-child,td:first-child{text-align:left}
td{padding:6px 8px;text-align:right;border-bottom:1px solid rgba(0,210,170,.07)}
.cta{display:inline-block;border:1px solid #00d2aa;color:#00d2aa;border-radius:4px;padding:8px 14px;font-size:12px;text-decoration:none;text-transform:uppercase;letter-spacing:.08em;margin:6px 0}
.nav{font-size:11px;color:#5a7a72;line-height:2}
.nav a{color:rgba(0,210,170,.75);text-decoration:none;margin-right:10px;white-space:nowrap}
.foot{font-size:10px;color:#5a7a72;margin-top:16px}
.top{font-size:11px;color:#5a7a72}
</style>
<script data-goatcounter="https://diesel-monitor.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
</head>
<body><div class="wrap">
<div class="top"><a href="${SITE}/">← Дизель Монітор UA — головна</a></div>
<h1>${esc(h1)}</h1>
<div class="sub">${esc(sub)}</div>
${bodyHtml}
<a class="cta" href="${spaLink}">${ctaText}</a>
<div class="card nav">${navHtml}</div>
<div class="foot">Джерело цін: Мінфін (Консалтингова група А-95). Ціни довідкові; актуальні — на АЗС.<br>
© Дизель Монітор UA · <a href="${SITE}/">${SITE.replace('https://', '')}</a></div>
</div></body></html>`;
}

async function main() {
  const latest = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'latest.json'), 'utf-8'));
  const date = uaDate(latest.date);
  // regionAvg — свіжі середні по областях (/reg/). regions — стара матриця
  // «область × мережа», Мінфін прибрав її 29.07.2026 і більше не оновлює.
  const regionAvg = latest.regionAvg ?? {};
  const regions = latest.regions ?? {};
  const networks = latest.networks ?? {};
  const avg = latest.avg ?? {};
  const urls = [`${SITE}/`];

  // ── Сторінки областей ──
  const regionEntries = Object.keys(regionAvg).length
    ? Object.keys(regionAvg).sort((a, b) => a.localeCompare(b, 'uk'))
    : Object.keys(regions).sort((a, b) => a.localeCompare(b, 'uk'));
  const regionNav =
    '<b style="font-size:9px;letter-spacing:.12em;color:#5a7a72">ІНШІ ОБЛАСТІ</b><br>' +
    regionEntries.map(r => `<a href="${SITE}/region/${slugify(r)}/">${esc(r)}</a>`).join(' ');

  // Рейтинг областей за кожним видом пального: дешевша → номер 1.
  // Це замінює зниклу таблицю мереж і відповідає на головне питання читача:
  // «у мене дорожче чи дешевше, ніж у людей?»
  const rank = {};
  for (const [k] of FUELS) {
    const list = Object.entries(regionAvg)
      .filter(([, p]) => p[k] !== undefined)
      .sort((a, b) => a[1][k] - b[1][k])
      .map(([name]) => name);
    rank[k] = list;
  }

  for (const region of regionEntries) {
    const slug = slugify(region);
    const prices = regionAvg[region];
    if (!prices) continue;

    const rows = FUELS.filter(([k]) => prices[k] !== undefined).map(([k, label]) => {
      const pos = rank[k].indexOf(region) + 1;
      const total = rank[k].length;
      const diff = avg[k] !== undefined ? prices[k] - avg[k] : null;
      return { k, label, price: prices[k], pos, total, diff };
    });
    if (!rows.length) continue;

    const table =
      '<table><tr><th>Пальне</th><th>Ціна, грн/л</th><th>Місце</th><th>vs Україна</th></tr>' +
      rows
        .map(
          r =>
            `<tr><td>${r.label}</td><td><b>${fmt(r.price)}</b></td>` +
            `<td>${r.pos} з ${r.total}</td>` +
            `<td>${r.diff === null ? '—' : (r.diff > 0 ? '+' : '') + fmt(r.diff)}</td></tr>`
        )
        .join('') +
      '</table>';

    const dp = rows.find(r => r.k === 'dp');
    const cheaper = dp ? dp.pos <= Math.ceil(dp.total / 2) : null;

    // сусіди по рейтингу дизеля — дають природну перелінковку
    const near = dp
      ? rank.dp
          .slice(Math.max(0, dp.pos - 3), dp.pos + 2)
          .filter(r => r !== region)
          .map(r => `<a href="${SITE}/region/${slugify(r)}/">${esc(r)} ${fmt(regionAvg[r]?.dp)}</a>`)
          .join(' · ')
      : '';

    const intro = dp
      ? `<p>Дизель у ${inRegion(region)} області ${date} коштує <b>${fmt(dp.price)}</b> грн/л — це ` +
        `<b>${dp.pos} місце з ${dp.total}</b> серед областей України, ` +
        `${cheaper ? 'дешевше' : 'дорожче'} за середину списку. ` +
        (dp.diff !== null
          ? `Відносно середньої по країні — ${dp.diff > 0 ? 'на ' + fmt(dp.diff) + ' грн дорожче' : 'на ' + fmt(Math.abs(dp.diff)) + ' грн дешевше'}.`
          : '') +
        `</p>`
      : '';

    const html = page({
      title: `Ціни на пальне — ${region} область: дизель, бензин, автогаз (${date})`,
      description:
        `${region} область, ${date}: ${dp ? `дизель ${fmt(dp.price)} грн/л (${dp.pos} місце з ${dp.total} по Україні)` : 'ціни на пальне'}` +
        `${prices.a95 !== undefined ? `, А-95 ${fmt(prices.a95)}` : ''}` +
        `${prices.gas !== undefined ? `, автогаз ${fmt(prices.gas)}` : ''}. Оновлюється щодня.`,
      canonical: `${SITE}/region/${slug}/`,
      h1: `Ціни на пальне — ${region} область`,
      sub: `оновлено ${date} · середні по області · грн/л`,
      bodyHtml:
        `<div class="card">${intro}${table}</div>` +
        (near
          ? `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">СУСІДИ В РЕЙТИНГУ ДИЗЕЛЯ</div>${near}</div>`
          : ''),
      spaLink: `${SITE}/#/region/${encodeURIComponent(region)}`,
      navHtml: regionNav,
    });

    const dir = path.join(DIST, 'region', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
    urls.push(`${SITE}/region/${slug}/`);
  }

  // ── Сторінки мереж ──
  const netEntries = Object.keys(networks).sort((a, b) => a.localeCompare(b, 'uk'));
  const netNav =
    '<b style="font-size:9px;letter-spacing:.12em;color:#5a7a72">ІНШІ МЕРЕЖІ</b><br>' +
    netEntries.map(n => `<a href="${SITE}/network/${slugify(n)}/">${esc(n)}</a>`).join(' ');

  for (const [network, prices] of Object.entries(networks)) {
    const slug = slugify(network);

    const natTable =
      '<table><tr><th>Пальне</th><th>Ціна, грн/л</th></tr>' +
      FUELS.filter(([k]) => prices[k] !== undefined)
        .map(([k, n]) => `<tr><td>${n}</td><td><b>${fmt(prices[k])}</b></td></tr>`)
        .join('') +
      '</table>';

    const regRows = Object.entries(regions)
      .map(([region, nets]) => [region, nets[network]?.dp])
      .filter(([, v]) => v !== undefined)
      .sort((a, b) => a[1] - b[1]);
    const regTable = regRows.length
      ? '<table><tr><th>Область</th><th>Дизель, грн/л</th></tr>' +
        regRows
          .map(
            ([region, v]) =>
              `<tr><td><a href="${SITE}/region/${slugify(region)}/">${esc(region)}</a></td><td>${fmt(v)}</td></tr>`
          )
          .join('') +
        '</table>'
      : '';

    const html = page({
      title: `${network} — ціни на пальне сьогодні: дизель, бензин, автогаз (${date})`,
      description: `Ціни ${network} на ${date}: дизель ${fmt(prices.dp)} грн/л${prices.a95 !== undefined ? `, А-95 ${fmt(prices.a95)}` : ''}${prices.gas !== undefined ? `, автогаз ${fmt(prices.gas)}` : ''}. Медіана по областях присутності, оновлюється щодня.`,
      canonical: `${SITE}/network/${slug}/`,
      h1: `${network} — ціни на пальне`,
      sub: `оновлено ${date} · національна ціна = медіана по областях`,
      bodyHtml:
        `<div class="card">${natTable}</div>` +
        (regTable ? `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">ДИЗЕЛЬ ПО ОБЛАСТЯХ</div>${regTable}</div>` : ''),
      spaLink: `${SITE}/#/network/${encodeURIComponent(network)}`,
      navHtml: netNav,
    });

    const dir = path.join(DIST, 'network', slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
    urls.push(`${SITE}/network/${slug}/`);
  }

  // ── Матриця «паливо × область» ──
  // Головні конкуренти в пошуку (AUTO.RIA, Мінфін) виграють не даними — дані в
  // них ті самі, що й у нас, — а кількістю посадкових сторінок під довгі запити
  // на кшталт «ціни на дизель Полтавська область». Робимо перемноження з тих
  // самих JSON, що вже зібрані.
  let matrixCount = 0;

  for (const region of regionEntries) {
    const rslug = slugify(region);
    const rPrices = regionAvg[region];
    if (!rPrices) continue;

    for (const [fk, f] of Object.entries(FUEL_SEO)) {
      if (rPrices[fk] === undefined) continue;
      const list = rank[fk] ?? [];
      if (list.length < 5) continue;

      const pos = list.indexOf(region) + 1;
      const price = rPrices[fk];
      const cheapest = list[0];
      const dearest = list[list.length - 1];
      const diff = avg[fk] !== undefined ? price - avg[fk] : null;

      // показуємо весь рейтинг областей — це і є заміна зниклій таблиці мереж
      const table =
        `<table><tr><th>#</th><th>Область</th><th>${f.short}, грн/л</th></tr>` +
        list
          .map((r, i) => {
            const me = r === region;
            const v = fmt(regionAvg[r][fk]);
            return (
              `<tr><td>${i + 1}</td>` +
              `<td>${me ? `<b>${esc(r)}</b>` : `<a href="${SITE}/region/${slugify(r)}/${f.slug}/">${esc(r)}</a>`}</td>` +
              `<td>${me ? `<b>${v}</b>` : v}</td></tr>`
            );
          })
          .join('') +
        '</table>';

      const otherFuels = Object.entries(FUEL_SEO)
        .filter(([k]) => k !== fk && rPrices[k] !== undefined)
        .map(([, o]) => `<a href="${SITE}/region/${rslug}/${o.slug}/">${o.short}</a>`)
        .join(' ');

      const html = page({
        title: `Ціни на ${f.acc} — ${region} область, ${date}`,
        description:
          `${f.short} у ${inRegion(region)} області ${date}: ${fmt(price)} грн/л — ${pos} місце з ${list.length} по Україні.` +
          (diff !== null
            ? ` Це на ${fmt(Math.abs(diff))} грн ${diff > 0 ? 'дорожче' : 'дешевше'} за середню по країні.`
            : '') +
          ' Рейтинг усіх областей, оновлення щодня.',
        canonical: `${SITE}/region/${rslug}/${f.slug}/`,
        h1: `${f.short} — ${region} область`,
        sub: `${date} · ${fmt(price)} грн/л · ${pos} місце з ${list.length}`,
        bodyHtml:
          `<div class="card">` +
          `<p>Станом на ${date} ${f.acc} у ${inRegion(region)} області коштує <b>${fmt(price)}</b> грн/л. ` +
          `Це <b>${pos} місце з ${list.length}</b> серед областей України` +
          (diff !== null
            ? `, на ${fmt(Math.abs(diff))} грн ${diff > 0 ? 'дорожче' : 'дешевше'} за середню по країні`
            : '') +
          `. Найдешевше — ${esc(cheapest)} (${fmt(regionAvg[cheapest][fk])}), найдорожче — ${esc(dearest)} (${fmt(regionAvg[dearest][fk])}).</p>` +
          `${table}</div>` +
          (otherFuels
            ? `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">ІНШЕ ПАЛЬНЕ В ОБЛАСТІ</div>${otherFuels}</div>`
            : ''),
        spaLink: `${SITE}/#/region/${encodeURIComponent(region)}`,
        navHtml: regionNav,
      });

      const dir = path.join(DIST, 'region', rslug, f.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), html);
      urls.push(`${SITE}/region/${rslug}/${f.slug}/`);
      matrixCount++;
    }
  }

  // ── Матриця «паливо × мережа» ──
  for (const [network, prices] of Object.entries(networks)) {
    const nslug = slugify(network);

    for (const [fk, f] of Object.entries(FUEL_SEO)) {
      if (prices[fk] === undefined) continue;

      // Порівняння з іншими мережами — замість зниклої розбивки по областях.
      // Питання читача те саме: «а де дешевше?», просто відповідь тепер по мережах.
      const netRows = Object.entries(networks)
        .filter(([, p]) => p[fk] !== undefined)
        .sort((a, b) => a[1][fk] - b[1][fk]);
      if (netRows.length < 5) continue;

      const pos = netRows.findIndex(([n]) => n === network) + 1;
      const vals = netRows.map(([, p]) => p[fk]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const cheapest = netRows[0][0];

      const table =
        `<table><tr><th>#</th><th>Мережа АЗС</th><th>${f.short}, грн/л</th></tr>` +
        netRows
          .map(([n, p], i) => {
            const me = n === network;
            const v = fmt(p[fk]);
            return (
              `<tr><td>${i + 1}</td>` +
              `<td>${me ? `<b>${esc(n)}</b>` : `<a href="${SITE}/network/${slugify(n)}/${f.slug}/">${esc(n)}</a>`}</td>` +
              `<td>${me ? `<b>${v}</b>` : v}</td></tr>`
            );
          })
          .join('') +
        '</table>';

      const otherFuels = Object.entries(FUEL_SEO)
        .filter(([k]) => k !== fk && prices[k] !== undefined)
        .map(([, o]) => `<a href="${SITE}/network/${nslug}/${o.slug}/">${o.short}</a>`)
        .join(' ');

      const html = page({
        title: `${network} ${f.short} — ціна сьогодні, ${date}`,
        description: `${network}: ${f.acc} ${fmt(prices[fk])} грн/л станом на ${date} — ${pos} місце з ${netRows.length} мереж. Найдешевше ${cheapest} (${fmt(min)}). Оновлення щодня.`,
        canonical: `${SITE}/network/${nslug}/${f.slug}/`,
        h1: `${network} — ${f.short}`,
        sub: `${date} · ${fmt(prices[fk])} грн/л · ${pos} місце з ${netRows.length}`,
        bodyHtml:
          `<div class="card">` +
          `<p>Ціна на ${f.acc} у мережі <b>${esc(network)}</b> станом на ${date} — <b>${fmt(prices[fk])}</b> грн/л. ` +
          `Це <b>${pos} місце з ${netRows.length}</b> серед мереж АЗС України: найдешевше в ${esc(cheapest)} (${fmt(min)} грн/л), найдорожче — ${fmt(max)} грн/л.</p>` +
          `${table}</div>` +
          (otherFuels ? `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">ІНШЕ ПАЛЬНЕ ЦІЄЇ МЕРЕЖІ</div>${otherFuels}</div>` : ''),
        spaLink: `${SITE}/#/network/${encodeURIComponent(network)}`,
        navHtml: netNav,
      });

      const dir = path.join(DIST, 'network', nslug, f.slug);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, 'index.html'), html);
      urls.push(`${SITE}/network/${nslug}/${f.slug}/`);
      matrixCount++;
    }
  }

  console.log(`матриця: ${matrixCount} сторінок «паливо × область» і «паливо × мережа»`);

  // ── SEO-контент головної: вставляємо в #root справжній HTML (H1, ціни, лінки).
  // React при монтуванні його замінить, але Googlebot і користувач бачать одразу —
  // головна перестає бути порожнім div для пошуковика. ──
  const dpMin = Math.min(
    ...Object.values(networks)
      .map(n => n.dp)
      .filter(v => v !== undefined)
  );
  const avgRows = FUELS.filter(([k]) => avg[k] !== undefined)
    .map(([k, n]) => `<tr><td>${n}</td><td><b>${fmt(avg[k])}</b> грн/л</td></tr>`)
    .join('');
  const regionLinks = regionEntries
    .map(r => `<a href="${SITE}/region/${slugify(r)}/">${esc(r)}</a>`)
    .join(' · ');
  const netLinks = netEntries
    .map(n => `<a href="${SITE}/network/${slugify(n)}/">${esc(n)}</a>`)
    .join(' · ');

  const seoHome =
    `<div style="max-width:860px;margin:0 auto;padding:16px;font-family:'Courier New',monospace;color:#e0ede9">` +
    `<h1 style="font-size:20px;color:#00d2aa;text-transform:uppercase;letter-spacing:.05em">Ціни на пальне в Україні сьогодні — дизель, бензин, автогаз</h1>` +
    `<p style="font-size:13px;color:#5a7a72">Середні ціни на АЗС України станом на ${date}${Number.isFinite(dpMin) ? `. Дизель — від ${fmt(dpMin)} грн/л` : ''}. Оновлюється щодня: дизель (ДП), А-95 преміум, А-95, А-92, автогаз. Порівняння ${Object.keys(networks).length} мереж АЗС по ${Object.keys(regions).length} областях, історія, аналітика, прогноз і новини ринку.</p>` +
    `<table style="font-size:14px;border-collapse:collapse">${avgRows}</table>` +
    `<h2 style="font-size:14px;color:#00d2aa;margin-top:16px">Де найдешевше заправитись</h2>` +
    `<p style="font-size:12px;line-height:1.9">` +
    `<a href="${SITE}/cheapest/dyzel/">Де найдешевший дизель</a> · ` +
    `<a href="${SITE}/cheapest/benzyn-a95/">найдешевший бензин А-95</a> · ` +
    `<a href="${SITE}/cheapest/benzyn-a92/">А-92</a> · ` +
    `<a href="${SITE}/cheapest/avtogaz/">автогаз</a> · ` +
    `<a href="${SITE}/ev/">зарядки для електромобілів</a>` +
    `</p>` +
    `<h2 style="font-size:14px;color:#00d2aa;margin-top:16px">Ціни на пальне по областях України</h2>` +
    `<p style="font-size:12px;line-height:1.9">${regionLinks}</p>` +
    `<h2 style="font-size:14px;color:#00d2aa;margin-top:12px">Ціни по мережах АЗС</h2>` +
    `<p style="font-size:12px;line-height:1.9">${netLinks}</p>` +
    `</div>`;

  const idxPath = path.join(DIST, 'index.html');
  let idx = await readFile(idxPath, 'utf-8');
  idx = idx.replace('<div id="root"></div>', `<div id="root">${seoHome}</div>`);
  await writeFile(idxPath, idx);

  // ── Сторінки «де найдешевше» під запити «де найдешевший бензин/дизель» ──
  // Головна цінність сайту: ми знаємо точну відповідь. Окрема сторінка на кожен вид пального.
  const CHEAP = [
    { key: 'dp', slug: 'dyzel', h1: 'Де найдешевший дизель в Україні', q: 'дизель', full: 'дизельне паливо' },
    { key: 'a95', slug: 'benzyn-a95', h1: 'Де найдешевший бензин А-95 в Україні', q: 'бензин А-95', full: 'бензин А-95' },
    { key: 'a92', slug: 'benzyn-a92', h1: 'Де найдешевший бензин А-92 в Україні', q: 'бензин А-92', full: 'бензин А-92' },
    { key: 'gas', slug: 'avtogaz', h1: 'Де найдешевший автогаз в Україні', q: 'автогаз', full: 'автогаз (LPG)' },
  ];
  const cheapNav =
    '<b style="font-size:9px;letter-spacing:.12em;color:#5a7a72">ДЕ НАЙДЕШЕВШЕ</b><br>' +
    CHEAP.map(c => `<a href="${SITE}/cheapest/${c.slug}/">${esc(c.q)}</a>`).join(' · ');

  for (const c of CHEAP) {
    // рейтинг мереж від найдешевшої
    const netRank = Object.entries(networks)
      .filter(([, p]) => p[c.key] !== undefined)
      .sort((a, b) => a[1][c.key] - b[1][c.key]);
    if (netRank.length < 3) continue;

    const cheapestNet = netRank[0];
    const dearestNet = netRank[netRank.length - 1];
    const diff = dearestNet[1][c.key] - cheapestNet[1][c.key];
    const avgP = latest.avg?.[c.key];

    // рейтинг областей за медіаною
    const regRank = Object.entries(regions)
      .map(([r, nets]) => {
        const vals = Object.values(nets).map(p => p[c.key]).filter(v => v !== undefined).sort((x, y) => x - y);
        if (!vals.length) return null;
        const mid = Math.floor(vals.length / 2);
        return [r, vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2];
      })
      .filter(Boolean)
      .sort((a, b) => a[1] - b[1]);

    const netTable =
      '<table><tr><th>#</th><th>Мережа АЗС</th><th>Ціна, грн/л</th><th>vs середня</th></tr>' +
      netRank
        .slice(0, 15)
        .map(([n, p], i) => {
          const d = avgP ? p[c.key] - avgP : null;
          const dTxt = d === null ? '—' : `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}`;
          return `<tr><td>${i + 1}</td><td><a href="${SITE}/network/${slugify(n)}/">${esc(n)}</a></td><td><b>${fmt(p[c.key])}</b></td><td>${dTxt}</td></tr>`;
        })
        .join('') +
      '</table>';

    const regTable =
      '<table><tr><th>#</th><th>Область</th><th>Медіанна ціна, грн/л</th></tr>' +
      regRank
        .slice(0, 10)
        .map(([r, v], i) => `<tr><td>${i + 1}</td><td><a href="${SITE}/region/${slugify(r)}/">${esc(r)}</a></td><td><b>${fmt(v)}</b></td></tr>`)
        .join('') +
      '</table>';

    const answer =
      `<div class="card"><p style="font-size:14px;color:#e0ede9;margin:0 0 8px">` +
      `Станом на <b>${date}</b> найдешевший ${esc(c.q)} — у мережі <b style="color:#00d2aa">${esc(cheapestNet[0])}</b>: ` +
      `<b style="color:#00d2aa;font-size:18px">${fmt(cheapestNet[1][c.key])} грн/л</b>.` +
      `</p><p style="font-size:12px;color:#5a7a72;margin:0">` +
      `Найдорожче — ${esc(dearestNet[0])} (${fmt(dearestNet[1][c.key])} грн/л). Різниця між найдешевшою та найдорожчою мережею: <b>${fmt(diff)} грн/л</b>` +
      (avgP ? `. Середня по Україні: ${fmt(avgP)} грн/л` : '') +
      `. На повному баку (60 л) різниця мереж — близько ${Math.round(diff * 60)} грн.` +
      `</p></div>` +
      (regRank.length
        ? `<div class="card"><p style="font-size:13px;color:#c5d6d0;margin:0">Найдешевша область: <b style="color:#00d2aa">${esc(regRank[0][0])}</b> (медіана ${fmt(regRank[0][1])} грн/л), найдорожча — ${esc(regRank[regRank.length - 1][0])} (${fmt(regRank[regRank.length - 1][1])} грн/л).</p></div>`
        : '');

    const html = page({
      title: `Де найдешевший ${c.q} в Україні — ${date}: рейтинг АЗС`,
      description: `Найдешевший ${c.q} на ${date} — ${esc(cheapestNet[0])} ${fmt(cheapestNet[1][c.key])} грн/л. Рейтинг ${netRank.length} мереж АЗС і областей від найдешевших до найдорожчих, оновлюється щодня.`,
      canonical: `${SITE}/cheapest/${c.slug}/`,
      h1: c.h1,
      sub: `оновлено ${date} · рейтинг ${netRank.length} мереж АЗС · грн/л`,
      bodyHtml:
        answer +
        `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">РЕЙТИНГ МЕРЕЖ — ВІД НАЙДЕШЕВШОЇ</div>${netTable}</div>` +
        (regRank.length ? `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">НАЙДЕШЕВШІ ОБЛАСТІ</div>${regTable}</div>` : '') +
        `<div class="card"><p style="font-size:11px;color:#5a7a72;margin:0">Ціни довідкові (дані Мінфіну / Консалтингової групи А-95), оновлюються щодня. Ціна на конкретній АЗС може відрізнятись — уточнюйте на місці або в застосунку мережі.</p></div>`,
      spaLink: `${SITE}/`,
      ctaText: 'Усі ціни, графіки та прогноз →',
      navHtml: cheapNav + '<br><br>' + regionNav,
    });

    const dir = path.join(DIST, 'cheapest', c.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'index.html'), html);
    urls.push(`${SITE}/cheapest/${c.slug}/`);
  }
  console.log(`cheapest: ${CHEAP.length} сторінок «де найдешевше»`);

  // ── SEO-сторінка зарядок EV /ev/ (карта — інтерактивна на /#/ev, ця — для Google) ──
  try {
    const ev = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'ev-stations.json'), 'utf-8'));
    const evStations = ev.stations || [];
    const byNet = {};
    for (const s of evStations) if (s.net) byNet[s.net] = (byNet[s.net] || 0) + 1;
    const CITIES = [
      ['Київ', 50.2, 50.6, 30.2, 30.9], ['Харків', 49.9, 50.1, 36.1, 36.4],
      ['Львів', 49.75, 49.95, 23.9, 24.15], ['Одеса', 46.3, 46.65, 30.6, 30.9],
      ['Дніпро', 48.3, 48.6, 34.9, 35.2], ['Запоріжжя', 47.75, 47.95, 35.0, 35.3],
      ['Вінниця', 49.18, 49.28, 28.4, 28.55], ['Полтава', 49.52, 49.63, 34.5, 34.62],
      ['Івано-Франківськ', 48.88, 48.96, 24.66, 24.76], ['Ужгород', 48.6, 48.65, 22.25, 22.35],
    ];
    const cityCounts = CITIES.map(([n, laMin, laMax, loMin, loMax]) => [
      n,
      evStations.filter(s => s.lat >= laMin && s.lat <= laMax && s.lon >= loMin && s.lon <= loMax).length,
    ]).filter(c => c[1] > 0).sort((a, b) => b[1] - a[1]);
    const EV_LINKS = {
      Toka: 'https://toka.energy', Ecofactor: 'https://ecofactortech.com',
      YASNO: 'https://yasno.com.ua/mobile-app', GoToU: 'https://goto-u.com',
      UGV: 'https://ugv.ua', EVA: 'https://www.evachargers.com/uk', WOG: 'https://wog.ua',
      Ionity: 'https://ionity.ua', OKKO: 'https://www.okko.ua/electric-chargers', Faster: 'https://faster.in.ua',
    };
    const netRows = Object.entries(byNet).sort((a, b) => b[1] - a[1])
      .map(([n, c]) => `<tr><td>${esc(n)}</td><td>${c}</td><td>${EV_LINKS[n] ? `<a href="${EV_LINKS[n]}" target="_blank" rel="noopener">сайт ↗</a>` : '—'}</td></tr>`)
      .join('');
    const cityText = cityCounts.map(([n, c]) => `${esc(n)} — ${c}`).join(', ');
    const evHtml = page({
      title: `Зарядки для електромобілів в Україні: карта ${evStations.length} станцій`,
      description: `Карта зарядних станцій для електромобілів по Україні: ${evStations.length} точок${cityText ? `. ${cityText}` : ''}. Мережі Toka, Ecofactor, YASNO, IONITY, GO TO-U та інші — сайти й застосунки.`,
      canonical: `${SITE}/ev/`,
      h1: 'Зарядки для електромобілів в Україні',
      sub: `${evStations.length} зарядних станцій · дані OpenStreetMap`,
      bodyHtml:
        `<div class="card"><p style="font-size:13px;color:#c5d6d0">Карта зарядних станцій для електромобілів по всій Україні — ${evStations.length} точок. Дані з OpenStreetMap, оновлюються щотижня. Ціни на зарядку динамічні; актуальний тариф і запуск зарядки — у застосунку відповідної мережі.</p>` +
        (cityText ? `<p style="font-size:12px;color:#5a7a72">Найбільше зарядок: ${cityText}.</p>` : '') + `</div>` +
        `<div class="card"><div style="font-size:9px;letter-spacing:.12em;color:#5a7a72;margin-bottom:6px">МЕРЕЖІ ЗАРЯДОК УКРАЇНИ</div><table><tr><th>Мережа</th><th>Станцій</th><th></th></tr>${netRows}</table></div>`,
      spaLink: `${SITE}/#/ev`,
      ctaText: 'Відкрити інтерактивну карту →',
      navHtml: '<b style="font-size:9px;letter-spacing:.12em;color:#5a7a72">РОЗДІЛИ</b><br><a href="' + SITE + '/">Ціни на пальне</a> · <a href="' + SITE + '/#/ev">Інтерактивна карта зарядок</a>',
    });
    await mkdir(path.join(DIST, 'ev'), { recursive: true });
    await writeFile(path.join(DIST, 'ev', 'index.html'), evHtml);
    urls.push(`${SITE}/ev/`);
    console.log(`ev SEO: /ev/ (${evStations.length} станцій, ${cityCounts.length} міст)`);
  } catch (e) {
    console.log('ev SEO пропущено:', e.message);
  }

  // статичні сторінки
  urls.push(`${SITE}/widget/`, `${SITE}/privacy/`);

  // ── Повний sitemap ──
  const today = new Date().toISOString().slice(0, 10);
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls
      .map(
        u =>
          `  <url><loc>${u}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>${u === `${SITE}/` ? '1.0' : '0.7'}</priority></url>`
      )
      .join('\n') +
    '\n</urlset>\n';
  await writeFile(path.join(DIST, 'sitemap.xml'), sitemap);

  console.log(`prerender: ${urls.length - 1} сторінок (${Object.keys(regions).length} областей, ${Object.keys(networks).length} мереж) + sitemap`);
}

main().catch(e => {
  console.error('prerender ЗБІЙ:', e);
  process.exit(1);
});
