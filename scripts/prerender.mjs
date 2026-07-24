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
  const regions = latest.regions ?? {};
  const networks = latest.networks ?? {};
  const urls = [`${SITE}/`];

  // ── Сторінки областей ──
  const regionEntries = Object.keys(regions).sort((a, b) => a.localeCompare(b, 'uk'));
  const regionNav =
    '<b style="font-size:9px;letter-spacing:.12em;color:#5a7a72">ІНШІ ОБЛАСТІ</b><br>' +
    regionEntries.map(r => `<a href="${SITE}/region/${slugify(r)}/">${esc(r)}</a>`).join(' ');

  for (const [region, nets] of Object.entries(regions)) {
    const slug = slugify(region);
    const rows = Object.entries(nets)
      .filter(([, p]) => p.dp !== undefined || p.a95 !== undefined)
      .sort((a, b) => (a[1].dp ?? 999) - (b[1].dp ?? 999));
    if (!rows.length) continue;

    const dpPrices = rows.map(([, p]) => p.dp).filter(v => v !== undefined);
    const minDp = dpPrices.length ? Math.min(...dpPrices) : null;

    const table =
      `<table><tr><th>Мережа</th>${FUELS.map(([, n]) => `<th>${n}</th>`).join('')}</tr>` +
      rows
        .map(
          ([name, p]) =>
            `<tr><td><a href="${SITE}/network/${slugify(name)}/">${esc(name)}</a></td>` +
            FUELS.map(([k]) => `<td>${fmt(p[k])}</td>`).join('') +
            '</tr>'
        )
        .join('') +
      '</table>';

    const html = page({
      title: `Ціни на пальне — ${region} область: дизель, бензин, автогаз (${date})`,
      description: `${region} область — ціни на АЗС станом на ${date}: дизель${minDp ? ` від ${fmt(minDp)} грн/л` : ''}, А-95, А-92, автогаз. Порівняння ${rows.length} мереж, оновлюється щодня.`,
      canonical: `${SITE}/region/${slug}/`,
      h1: `Ціни на пальне — ${region} область`,
      sub: `оновлено ${date} · ${rows.length} мереж АЗС · грн/л`,
      bodyHtml: `<div class="card">${table}</div>`,
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

  // ── SEO-контент головної: вставляємо в #root справжній HTML (H1, ціни, лінки).
  // React при монтуванні його замінить, але Googlebot і користувач бачать одразу —
  // головна перестає бути порожнім div для пошуковика. ──
  const avg = latest.avg ?? {};
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
    `<h2 style="font-size:14px;color:#00d2aa;margin-top:16px">Ціни на пальне по областях України</h2>` +
    `<p style="font-size:12px;line-height:1.9">${regionLinks}</p>` +
    `<h2 style="font-size:14px;color:#00d2aa;margin-top:12px">Ціни по мережах АЗС</h2>` +
    `<p style="font-size:12px;line-height:1.9">${netLinks}</p>` +
    `</div>`;

  const idxPath = path.join(DIST, 'index.html');
  let idx = await readFile(idxPath, 'utf-8');
  idx = idx.replace('<div id="root"></div>', `<div id="root">${seoHome}</div>`);
  await writeFile(idxPath, idx);

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
