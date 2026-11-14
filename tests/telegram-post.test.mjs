import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';

function runPost(t, { cardFails = false, sendFails = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'diesel-post-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const scripts = join(root, 'scripts');
  const data = join(root, 'public', 'data');
  mkdirSync(scripts);
  mkdirSync(data, { recursive: true });
  copyFileSync(new URL('../scripts/telegram-post.mjs', import.meta.url), join(scripts, 'telegram-post.mjs'));
  writeFileSync(join(scripts, 'price-card.mjs'), cardFails
    ? 'export function makeCard() { throw Error("render error"); }'
    : 'export function makeCard() { return Buffer.from("image"); }');
  writeFileSync(join(data, 'latest.json'), JSON.stringify({ date: '2026-11-13', avg: { dp: 103.24 } }));
  writeFileSync(join(data, 'tg-post.json'), JSON.stringify({ lastDate: '2026-11-12' }));
  const fake = join(root, 'fake.mjs');
  writeFileSync(fake, `
    globalThis.fetch = async (url) => {
      const method = new URL(url).pathname.split('/').at(-1);
      console.log('attempt:', method);
      if (${sendFails}) throw new TypeError('fetch failed', {
        cause: Object.assign(new Error('secret-example'), { code: 'UND_ERR_SOCKET' }),
      });
      return { json: async () => ({ ok: true }) };
    };
  `);
  const { status, stdout, stderr } = spawnSync(process.execPath,
    ['--import', pathToFileURL(fake).href, join(scripts, 'telegram-post.mjs')], {
      encoding: 'utf8',
      env: { ...process.env, TELEGRAM_BOT_TOKEN: 'synthetic-credential', TELEGRAM_CHANNEL: '@synthetic' },
    });
  return { status, stdout, stderr, state: JSON.parse(readFileSync(join(data, 'tg-post.json'), 'utf8')) };
}

test('ambiguous photo delivery does not send another post or advance state', t => {
  const result = runPost(t, { sendFails: true });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /attempt: sendPhoto/);
  assert.doesNotMatch(result.stdout, /attempt: sendMessage/);
  assert.match(result.stderr, /sendPhoto.*UND_ERR_SOCKET/);
  assert.doesNotMatch(result.stderr, /secret-example|synthetic-credential/);
  assert.equal(result.state.lastDate, '2026-11-12');
});

test('render failure falls back to text and saves the confirmed date', t => {
  const result = runPost(t, { cardFails: true });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /attempt: sendPhoto/);
  assert.match(result.stdout, /attempt: sendMessage/);
  assert.equal(result.state.lastDate, '2026-11-13');
});

test('confirmed photo delivery saves the date', t => {
  const result = runPost(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /attempt: sendPhoto/);
  assert.equal(result.state.lastDate, '2026-11-13');
});
