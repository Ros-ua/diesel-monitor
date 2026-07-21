// Оновлює SEO-мету перед збіркою: вписує сьогоднішню ціну ДП у description
// та освіжає lastmod у sitemap. Запускається у CI перед `npm run build`;
// правки не комітяться — лише потрапляють у зібраний сайт.
// Запуск: node scripts/seo.mjs

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const fmtUa = v => v.toFixed(2).replace('.', ',');

async function main() {
  let latest = null;
  try {
    latest = JSON.parse(await readFile(path.join(ROOT, 'public', 'data', 'latest.json'), 'utf-8'));
  } catch {
    console.log('seo: latest.json відсутній — мету не змінюю');
    return;
  }

  const dp = latest?.avg?.dp;
  const nNets = Object.keys(latest?.networks ?? {}).length;
  const nRegs = Object.keys(latest?.regions ?? {}).length;
  const [y, m, d] = (latest?.date ?? '').split('-');
  const dateUa = d ? `${d}.${m}.${y}` : '';

  if (dp) {
    const desc =
      `Ціна дизельного пального в Україні на ${dateUa}: середня ${fmtUa(dp)} грн/л. ` +
      `Порівняння ${nNets} мереж АЗС по ${nRegs} областях, історія цін з 2024 року, прогноз і новини ринку.`;

    const htmlPath = path.join(ROOT, 'index.html');
    let html = await readFile(htmlPath, 'utf-8');
    html = html
      .replace(
        /(<meta name="description" content=")[^"]*(")/,
        `$1${desc}$2`
      )
      .replace(
        /(<meta property="og:description" content=")[^"]*(")/,
        `$1${desc}$2`
      );
    await writeFile(htmlPath, html);
    console.log(`seo: description → ДП ${fmtUa(dp)} грн/л (${dateUa})`);
  }

  // sitemap: свіжий lastmod
  const smPath = path.join(ROOT, 'public', 'sitemap.xml');
  try {
    let sm = await readFile(smPath, 'utf-8');
    const todayIso = new Date().toISOString().slice(0, 10);
    sm = sm.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${todayIso}</lastmod>`);
    await writeFile(smPath, sm);
    console.log(`seo: sitemap lastmod → ${todayIso}`);
  } catch {
    console.log('seo: sitemap.xml відсутній');
  }
}

main().catch(e => {
  console.error('seo:', e);
  process.exit(1);
});
