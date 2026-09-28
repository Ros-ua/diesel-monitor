// Проби безпеки й частоти запусків (облачні звіти security/health, 28.09.2026).
// Запуск: node scripts/tests-security.mjs   (потрібен python з PyYAML — лише для цієї проби)
//
// Workflow GitHub Actions тут не запустити, тому YAML розбираємо СПРАВЖНІМ розбирачем
// (PyYAML → JSON) і перевіряємо структуру — §4а: «куди виклик не дотягнеться».
// ⚠️ Раніше тут був саморобний розбирач тексту, і дві вичитки Astra 28.09 знайшли в
// ньому 9 сліпих місць: write-all, ключі в лапках, значення в коментарі, діапазони
// cron, коментар після schedule:… Справжній розбирач закриває цей клас цілком.
// reel-voice перевіряється ПОВЕДІНКОЮ: скрипт запускається з підміненим fetch.

import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(SCRIPTS, '..');
const WF_DIR = path.join(ROOT, '.github', 'workflows');

let failed = 0;
function probe(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(64)} -> ${JSON.stringify(got)}`);
}

/** YAML → обʼєкт справжнім розбирачем. ⚠️ YAML 1.1 читає ключ `on` як true — повертаємо назву. */
function yaml(text) {
  const out = execFileSync('python', ['-c',
    // байти UTF-8 в обидва боки: у Windows python інакше читає stdin у cp1251
    'import sys,json,yaml;d=yaml.safe_load(sys.stdin.buffer.read().decode("utf-8"));' +
    'd={("on" if k is True else k):v for k,v in d.items()} if isinstance(d,dict) else d;' +
    'sys.stdout.buffer.write(json.dumps(d).encode("utf-8"))'], { input: Buffer.from(text, 'utf8') }).toString('utf8');
  return JSON.parse(out);
}
const wf = name => yaml(readFileSync(path.join(WF_DIR, name), 'utf8'));
/** permissions: відсутні → null; інакше як є (обʼєкт, {} або рядок на кшталт write-all). */
const perms = p => (p === undefined ? null : p);

// Скільки значень дає поле cron: «*», «*/n», «a-b», «a-b/n», списки через кому.
function cronCount(field, min, max) {
  const set = new Set();
  for (const part of field.split(',')) {
    const [range, stepStr] = part.split('/');
    const step = stepStr ? Number(stepStr) : 1;
    let lo, hi;
    if (range === '*') [lo, hi] = [min, max];
    else if (range.includes('-')) [lo, hi] = range.split('-').map(Number);
    else [lo, hi] = [Number(range), stepStr ? max : Number(range)];
    for (let v = lo; v <= hi; v += step) set.add(v);
  }
  return set.size;
}
/** Автоматичних запусків на добу з on.schedule (день місяця й тижня в наших cron — «*»). */
function runsPerDay(doc) {
  const sched = doc?.on?.schedule;
  if (!Array.isArray(sched)) return 0;
  return sched.map(s => String(s.cron).trim().split(/\s+/))
    .filter(f => f[2] === '*' && f[4] === '*')
    .reduce((sum, f) => sum + cronCount(f[0], 0, 59) * cronCount(f[1], 0, 23), 0);
}

console.log('РОЗБИРАЧ НЕ СЛІПИЙ (власні проби на еталонних входах)');
probe('розбирач: write-all лишається рядком', perms(yaml('permissions: write-all').permissions), 'write-all');
probe('розбирач: ключ у лапках — це право', perms(yaml("permissions:\n  'contents': write").permissions), { contents: 'write' });
probe('розбирач: коментар після schedule: не вимикає розклад',
  runsPerDay(yaml("on:\n  schedule: # щодня\n    - cron: '0 0 * * *'")), 1);
probe('розбирач: закоментований розклад — нуль запусків',
  runsPerDay(yaml("on:\n  # schedule:\n  #   - cron: '0 0 * * *'\n  workflow_dispatch:")), 0);
probe('розбирач: діапазон годин 0-23 — 24 запуски', runsPerDay(yaml("on:\n  schedule:\n    - cron: '0 0-23 * * *'")), 24);

console.log('');
console.log('ПРАВА WORKFLOW (security п.3–4)');
for (const [file, job] of [['collect.yml', 'collect'], ['news.yml', 'news'], ['ev.yml', 'ev']]) {
  const d = wf(file);
  probe(`${file}: згори прав немає`, perms(d.permissions), {});
  probe(`${file}: збір — лише запис у репо (пушить дані)`, perms(d.jobs?.[job]?.permissions), { contents: 'write' });
  probe(`${file}: pages/id-token — лише задачі deploy`, perms(d.jobs?.deploy?.permissions), { contents: 'read', pages: 'write', 'id-token': 'write' });
}
probe('ig-insights.yml: явно лише читання', perms(wf('ig-insights.yml').permissions), { contents: 'read' });
probe('ig-refresh.yml: явно без прав токена', perms(wf('ig-refresh.yml').permissions), {});
probe('notify.yml: явно без прав токена', perms(wf('notify.yml').permissions), {});
{
  // список — з теки: новий workflow без permissions теж почервонить пробу
  const files = readdirSync(WF_DIR).filter(f => f.endsWith('.yml'));
  probe('workflow знайдено (стенд не сліпий)', files.length >= 13, true);
  probe('усі workflow мають явний permissions', files.filter(f => perms(wf(f).permissions) === null), []);
}

console.log('');
console.log('ДРІБНЕ (security п.10–11)');
{
  const d = wf('ig-refresh.yml');
  const steps = Object.values(d.jobs ?? {}).flatMap(j => j.steps ?? []);
  const run = steps.map(s => s.run ?? '').join('\n');
  const ids = [...run.matchAll(/chat_id=(\S+)/g)].map(m => m[1]);
  probe('ig-refresh.yml: chat_id не вписаний числом', ids.some(v => /^["']?-?\d/.test(v)), false);
  probe('ig-refresh.yml: кожен chat_id — це "$CHAT"', [ids.length > 0, ids.every(v => v === '"$CHAT"')], [true, true]);
  // значення після розбору YAML: коментар «# CHAT: ${{ vars… }}» тут уже не рахується
  const chats = steps.map(s => s.env?.CHAT).filter(v => v !== undefined);
  probe('ig-refresh.yml: CHAT — саме vars.TG_OWNER_CHAT', chats.length > 0 && chats.every(v => /^\$\{\{\s*vars\.TG_OWNER_CHAT\s*\}\}$/.test(v)), true);
}
{
  const gi = readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  probe('.gitignore: .env і .env.* не потрапляють у репо', [gi.includes('.env'), gi.includes('.env.*')], [true, true]);
}

console.log('');
console.log('ЧАСТОТА ЗАПУСКІВ (health В1)');
probe('news.yml: не частіше разу на 3 години', runsPerDay(wf('news.yml')), 8);
probe('tg-post.yml: 6 запусків на добу (стеля 4 пости — у telegram-news.mjs)', runsPerDay(wf('tg-post.yml')), 6);
probe('collect.yml: збір цін як і був — 2 рази на добу', runsPerDay(wf('collect.yml')), 2);

console.log('');
console.log('КЛЮЧ GEMINI НЕ В АДРЕСІ (security п.9)');
{
  const root = mkdtempSync(path.join(tmpdir(), 'diesel-sec-'));
  try {
    cpSync(SCRIPTS, path.join(root, 'scripts'), { recursive: true });
    mkdirSync(path.join(root, 'frames'));
    writeFileSync(path.join(root, 'frames', 'meta.json'),
      JSON.stringify({ fuel: 'dp', last: 58.4, months: 3, pct: -1.2, diff: -0.7 }));
    const hook = path.join(root, 'hook.mjs');
    // ⚠️ Кожен запит — окремим рядком (appendFileSync): раніше зберігався лише останній,
    // і зайвий запит із ключем до чужої адреси перед штатним ховався (вичитка Astra 28.09).
    writeFileSync(hook, `
import { appendFileSync } from 'node:fs';
globalThis.fetch = async (url, opts = {}) => {
  appendFileSync(${JSON.stringify(path.join(root, 'req.jsonl').replace(/\\/g, '/'))},
    JSON.stringify({ url: String(url), method: opts.method, body: String(opts.body ?? ''), headers: opts.headers ?? {} }) + '\\n');
  const audio = Buffer.alloc(4800).toString('base64');
  return { ok: true, status: 200, async text() { return ''; },
    async json() { return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: audio } }] } }] }; } };
};`);
    let code = 0;
    try {
      execFileSync(process.execPath, ['--import', 'file:///' + hook.replace(/\\/g, '/'), 'scripts/reel-voice.mjs'],
        { cwd: root, stdio: 'pipe', timeout: 60000, env: { ...process.env, GEMINI_API_KEY: 'SECRET-PROBE-KEY' } });
    } catch (e) { code = e.status ?? 1; }
    const log = path.join(root, 'req.jsonl');
    const reqs = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
    const req = reqs[0];
    probe('reel-voice: рівно один запит — і той пішов', [code, reqs.length], [0, 1]);
    probe('reel-voice: запит саме до Gemini TTS (адреса, метод, тіло)', req ? [
      req.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      req.method, JSON.parse(req.body || '{}').generationConfig?.responseModalities] : 'запиту немає',
      [true, 'POST', ['AUDIO']]);
    probe('reel-voice: ключа немає в жодній адресі', reqs.some(r => r.url.includes('SECRET-PROBE-KEY')), false);
    probe('reel-voice: ключ — у заголовку x-goog-api-key', req?.headers?.['x-goog-api-key'], 'SECRET-PROBE-KEY');
    probe('reel-voice: голос записано', existsSync(path.join(root, 'frames', 'voice.wav')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('');
if (failed) { console.log(`❌ ПРОВАЛІВ: ${failed}`); process.exit(1); }
console.log('✅ усі проби безпеки пройшли');
