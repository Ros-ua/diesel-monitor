// Проби безпеки й частоти запусків (облачні звіти security/health, 28.09.2026).
// Запуск: node scripts/tests-security.mjs
//
// Workflow GitHub Actions тут не запустити, тому для YAML — розбір тексту (§4а:
// «куди виклик не дотягнеться»). Розбирач — мінімальний, під наш формат: блоки
// `permissions` (верхній і в задачах) та рядки `- cron:`. reel-voice перевіряється
// ПОВЕДІНКОЮ: скрипт запускається з підміненим fetch і показує, куди пішов ключ.

import { readFileSync, readdirSync, mkdtempSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(SCRIPTS, '..');
const wf = name => readFileSync(path.join(ROOT, '.github', 'workflows', name), 'utf8').replace(/\r\n/g, '\n');

let failed = 0;
function probe(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name.padEnd(64)} -> ${JSON.stringify(got)}`);
}

/** Блок permissions з відступом `indent` під рядком-власником: {} | {ключ: значення} | null (немає). */
function permsAt(lines, start, indent) {
  const pad = ' '.repeat(indent);
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '' || l.trim().startsWith('#')) continue;
    const lead = l.length - l.trimStart().length;
    if (lead < indent) return null;              // вийшли з блоку-власника
    if (lead > indent) continue;
    const m = l.match(new RegExp(`^${pad}permissions:\\s*(.*)$`));
    if (!m) continue;
    const inline = m[1].replace(/\s+#.*$/, '').trim();
    if (inline === '{}') return {};
    // ⚠️ Вичитка Astra 28.09: `permissions: write-all` читалось як «{}» — лишні права
    // проходили пробу. Будь-яке значення в рядку, крім {}, повертаємо як є.
    if (inline) return inline;
    const out = {};
    for (let j = i + 1; j < lines.length; j++) {
      const lj = lines[j];
      if (lj.trim() === '' || lj.trim().startsWith('#')) continue;
      const lead2 = lj.length - lj.trimStart().length;
      if (lead2 <= indent) break;
      const kv = lj.trim().match(/^([\w-]+):\s*(\S+)/);
      if (kv) out[kv[1]] = kv[2];
    }
    return out;
  }
  return null;
}
/** Верхній permissions файлу (відступ 0). */
const topPerms = text => permsAt(text.split('\n'), 0, 0);
/** permissions задачі jobs.<job> (відступ 4 під `  job:`). */
function jobPerms(text, job) {
  const lines = text.split('\n');
  const i = lines.findIndex(l => l === `  ${job}:`);
  return i < 0 ? 'задачі немає' : permsAt(lines, i + 1, 4);
}
/** Запусків на добу за рядками `- cron:` (хвилини × години; день/тиждень тут завжди «*»). */
function runsPerDay(text) {
  const count = (field, max) => {
    if (field === '*') return max;
    const step = field.match(/^\*\/(\d+)$/);
    if (step) return Math.ceil(max / Number(step[1]));
    return field.split(',').length;
  };
  // ⚠️ Вичитка Astra 28.09: закоментований розклад рахувався як живий. Коментарі
  // прибираємо, а без незакоментованого `schedule:` автоматичних запусків нуль.
  const live = text.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
  if (!/^\s+schedule:\s*$/m.test(live)) return 0;
  return [...live.matchAll(/-\s*cron:\s*'([^']+)'/g)]
    .map(m => m[1].split(/\s+/))
    .filter(f => f[2] === '*' && f[4] === '*')
    .reduce((s, f) => s + count(f[0], 60) * count(f[1], 24), 0);
}

console.log('ПРАВА WORKFLOW (security п.3–4)');
for (const [file, job] of [['collect.yml', 'collect'], ['news.yml', 'news'], ['ev.yml', 'ev']]) {
  const t = wf(file);
  probe(`${file}: згори прав немає`, topPerms(t), {});
  probe(`${file}: збір — лише запис у репо (пушить дані)`, jobPerms(t, job), { contents: 'write' });
  probe(`${file}: pages/id-token — лише задачі deploy`, jobPerms(t, 'deploy'), { contents: 'read', pages: 'write', 'id-token': 'write' });
}
probe('ig-insights.yml: явно лише читання', topPerms(wf('ig-insights.yml')), { contents: 'read' });
probe('ig-refresh.yml: явно без прав токена', topPerms(wf('ig-refresh.yml')), {});
probe('notify.yml: явно без прав токена', topPerms(wf('notify.yml')), {});
{
  // жоден workflow без явного permissions (інакше права беруться з налаштувань репо)
  // список — з теки, а не вписаний: новий workflow без permissions теж почервонить пробу
  const files = readdirSync(path.join(ROOT, '.github', 'workflows')).filter(f => f.endsWith('.yml'));
  probe('workflow знайдено (стенд не сліпий)', files.length >= 13, true);
  probe('усі workflow мають явний permissions', files.filter(f => topPerms(wf(f)) === null), []);
}

console.log('');
console.log('ДРІБНЕ (security п.10–11)');
probe('ig-refresh.yml: chat_id не вписаний числом', /chat_id=\d/.test(wf('ig-refresh.yml')), false);
{
  // ⚠️ Вичитка Astra 28.09: проба бачила лише «немає цифри» і «є vars.TG_OWNER_CHAT»,
  // а порожній chat_id="" проходив. Тепер: КОЖЕН chat_id — це $CHAT, а CHAT — із vars.
  const t = wf('ig-refresh.yml');
  const ids = [...t.matchAll(/chat_id=(\S+)/g)].map(m => m[1]);
  probe('ig-refresh.yml: кожен chat_id — це "$CHAT"', [ids.length > 0, ids.every(v => v === '"$CHAT"')], [true, true]);
  probe('ig-refresh.yml: CHAT — з vars.TG_OWNER_CHAT', /\bCHAT:\s*\$\{\{\s*vars\.TG_OWNER_CHAT\s*\}\}/.test(t), true);
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
    writeFileSync(hook, `
import { writeFileSync } from 'node:fs';
globalThis.fetch = async (url, opts = {}) => {
  writeFileSync(${JSON.stringify(path.join(root, 'req.json').replace(/\\/g, '/'))},
    JSON.stringify({ url: String(url), method: opts.method, body: String(opts.body ?? ''), headers: opts.headers ?? {} }));
  const audio = Buffer.alloc(4800).toString('base64');
  return { ok: true, status: 200, async text() { return ''; },
    async json() { return { candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: audio } }] } }] }; } };
};`);
    let code = 0;
    try {
      execFileSync(process.execPath, ['--import', 'file:///' + hook.replace(/\\/g, '/'), 'scripts/reel-voice.mjs'],
        { cwd: root, stdio: 'pipe', timeout: 60000, env: { ...process.env, GEMINI_API_KEY: 'SECRET-PROBE-KEY' } });
    } catch (e) { code = e.status ?? 1; }
    const req = existsSync(path.join(root, 'req.json')) ? JSON.parse(readFileSync(path.join(root, 'req.json'), 'utf8')) : null;
    probe('reel-voice: запит до Gemini справді пішов', [code, !!req], [0, true]);
    // ⚠️ Вичитка Astra 28.09: заглушка приймала будь-яку адресу. Тепер — саме Gemini TTS.
    probe('reel-voice: запит саме до Gemini TTS (адреса, метод, тіло)', req ? [
      req.url === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent',
      req.method, JSON.parse(req.body || '{}').generationConfig?.responseModalities] : 'запиту немає',
      [true, 'POST', ['AUDIO']]);
    probe('reel-voice: ключа немає в адресі запиту', req ? req.url.includes('SECRET-PROBE-KEY') : 'запиту немає', false);
    probe('reel-voice: ключ — у заголовку x-goog-api-key', req?.headers?.['x-goog-api-key'], 'SECRET-PROBE-KEY');
    probe('reel-voice: голос записано', existsSync(path.join(root, 'frames', 'voice.wav')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

console.log('');
if (failed) { console.log(`❌ ПРОВАЛІВ: ${failed}`); process.exit(1); }
console.log('✅ усі проби безпеки пройшли');
