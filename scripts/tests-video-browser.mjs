// Справжній Chrome + повний GSAP/CSSPlugin: видимість, лінія і кожна ціна.
// Залежності — .github/price-video; у звичайний збір цін вони не входять.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { makeVideoHtml, DURATION } from './price-video.mjs';

const root = path.join(import.meta.dirname, '..');
const requireTool = createRequire(process.env.DM_VIDEO_TOOL_PACKAGE ?? path.join(root, '.github/price-video/package.json'));
const { default: puppeteer } = requireTool('puppeteer-core');
const requireRoot = createRequire(path.join(process.env.DM_NODE_MODULES ?? path.join(root, 'node_modules'), '_probe.cjs'));
const gsap = fs.readFileSync(requireRoot.resolve('gsap/dist/gsap.min.js'));
const latest = {
  date: '2026-09-24', networksDate: '2026-09-15',
  avg: { dp: 99.59, a95p: 93.55, a95: 89.69, a92: 86.2, gas: 48.24 },
  avgChange: {}, networks: { 'ОККО': { dp: 100.9 } },
};
const html = makeVideoHtml(latest, [{ value: 98 }, { value: 99.59 }], { gsapSrc: '/gsap.min.js' });
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); }
  else if (req.url === '/gsap.min.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(gsap); }
  else { res.statusCode = 404; res.end(); }
});
let browser;
let failed = 0;
let count = 0;
function check(name, ok, details) {
  count++;
  if (!ok) { failed++; console.log(`❌ ${name}: ${JSON.stringify(details)}`); }
}
try {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = process.env.HYPERFRAMES_BROWSER_PATH ?? (process.platform === 'win32'
    ? 'C:/Program Files/Google/Chrome Beta/Application/chrome.exe' : '/usr/bin/google-chrome');
  browser = await puppeteer.launch({ executablePath, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'], defaultViewport: { width: 1080, height: 1920 } });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', req => req.url().startsWith(origin + '/') ? req.continue() : req.abort());
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin, { waitUntil: 'load', timeout: 15000 });
  // GSAP Timeline — thenable; повертати його напряму означає чекати кінця паузи.
  await page.waitForFunction(() => Boolean(window.__timelines?.main), { timeout: 5000 })
    .catch(error => { throw new Error(`${error.message}; page errors: ${JSON.stringify(errors)}`); });
  const final = await page.evaluate(duration => {
    window.gsap.ticker.sleep();
    window.__timelines.main.pause().seek(duration, false);
    const visible = element => {
      let opacity = 1;
      for (let node = element; node?.nodeType === 1; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        opacity *= Number(style.opacity);
      }
      const rect = element.getBoundingClientRect();
      return opacity >= 0.99 && rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0
        && rect.left < innerWidth && rect.top < innerHeight;
    };
    const line = document.querySelector('#line');
    return { rows: [...document.querySelectorAll('.row')].map(row => ({
      visible: visible(row), price: row.querySelector('.num').textContent,
      name: row.querySelector('.name').textContent,
    })), line: { visible: visible(line), offset: parseFloat(getComputedStyle(line).strokeDashoffset) } };
  }, DURATION);
  const expected = ['99,59','93,55','89,69','86,20','48,24'];
  check('браузер: усі рядки видимі на останньому кадрі', final.rows.length === 5 && final.rows.every(row => row.visible), final.rows);
  check('браузер: останній кадр містить точні ціни', JSON.stringify(final.rows.map(row => row.price)) === JSON.stringify(expected), final.rows);
  check('браузер: лінія дизеля справді намальована', final.line.visible && final.line.offset === 0, final.line);
  for (let i = 0; i < expected.length; i++) {
    const value = await page.evaluate(({ i, time }) => {
      window.__timelines.main.seek(time, false);
      return document.querySelectorAll('.row .num')[i]?.textContent;
    }, { i, time: 1.2 + i * 0.35 + 0.45 });
    check(`браузер: ціна ${i + 1} анімується`, value !== expected[i], value);
  }
  check('браузер: виконання без помилок', errors.length === 0, errors);
  console.log(`БРАУЗЕР ВІДЕО: ${count - failed}/${count}`);
  if (failed) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
