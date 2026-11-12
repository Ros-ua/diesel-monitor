import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const date = '2026-11-10';
const file = 'story-2026-11-10.jpg';
const fixtures = new URL('./', import.meta.url);

async function scenario(t, { state, pick = { date, file }, mode = 'ok' } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diesel-story-guard-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const scripts = path.join(dir, 'scripts');
  const data = path.join(dir, 'public', 'data');
  await mkdir(path.join(scripts, 'lib'), { recursive: true });
  await mkdir(data, { recursive: true });
  await copyFile(new URL('instagram-story.mjs', fixtures), path.join(scripts, 'instagram-story.mjs'));
  await copyFile(new URL('lib/aurora.mjs', fixtures), path.join(scripts, 'lib', 'aurora.mjs'));
  await writeFile(path.join(scripts, 'instagram-news.mjs'), 'export async function waitReady() {}');
  await writeFile(path.join(scripts, 'mock.mjs'), `
    import { appendFileSync } from 'node:fs';
    globalThis.fetch = async (url) => {
      appendFileSync(process.env.CALL_LOG, new URL(url).pathname + '\\n');
      if (url.includes('/me?')) return { json: async () => ({ id: 'fake-account' }) };
      if (url.endsWith('/media')) return { json: async () => ({ id: 'fake-container' }) };
      if (url.endsWith('/media_publish')) {
        if (process.env.MODE === 'lost-response') throw new Error('synthetic timeout');
        return { json: async () => ({ id: 'fake-media' }) };
      }
      throw new Error('Unexpected mock URL');
    };
  `);
  const log = path.join(dir, 'calls');
  const statePath = path.join(data, 'ig-story.json');
  await writeFile(log, '');
  await writeFile(path.join(data, 'ig-story-pick.json'), JSON.stringify(pick));
  if (state) await writeFile(statePath, JSON.stringify(state));
  const run = (args = [], extra = {}) => spawnSync(process.execPath,
    ['--import', pathToFileURL(path.join(scripts, 'mock.mjs')).href, path.join(scripts, 'instagram-story.mjs'), ...args],
    { env: { ...process.env, INSTAGRAM_TOKEN: 'synthetic', GITHUB_RUN_ID: '42',
      GITHUB_RUN_ATTEMPT: '1', IG_FORCE: '0', CALL_LOG: log, MODE: mode, ...extra }, encoding: 'utf8' });
  return { run, readState: async () => JSON.parse(await readFile(statePath, 'utf8')),
    restoreState: state => writeFile(statePath, JSON.stringify(state)),
    calls: () => readFile(log, 'utf8') };
}

test('publishing requires a reservation for the current run and attempt', async t => {
  const { run, calls } = await scenario(t);
  const result = run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /резерв/);
  assert.equal(await calls(), '');
});

test('a rerun cannot reuse a reservation or publish again after a lost response', async t => {
  const { run, readState, calls } = await scenario(t, { mode: 'lost-response' });
  assert.equal(run(['--reserve']).status, 0);
  assert.deepEqual((await readState()).pending, { date, file, runId: '42', attempt: '1' });
  assert.equal(run().status, 1);
  assert.match(await calls(), /media_publish/);
  assert.equal((await readState()).pending.date, date);
  const before = await calls();
  for (const args of [['--reserve'], []]) {
    assert.equal(run(args, { GITHUB_RUN_ATTEMPT: '2', IG_FORCE: '1' }).status, 1);
  }
  assert.equal(await calls(), before);
});

test('success replaces the pending state and skips the same date next time', async t => {
  const { run, readState, calls } = await scenario(t);
  assert.equal(run(['--reserve']).status, 0);
  assert.equal(await calls(), '');
  assert.equal(run().status, 0);
  const state = await readState();
  assert.equal(state.lastDataDate, date);
  assert.equal(state.mediaId, 'fake-media');
  assert.equal(state.pending, undefined);
  const before = await calls();
  assert.equal(run(['--reserve'], { GITHUB_RUN_ID: '43' }).status, 0);
  assert.equal(run([], { GITHUB_RUN_ID: '43' }).status, 0);
  assert.equal(await calls(), before);
});

test('a new checkout cannot repeat a successful story after the final push fails', async t => {
  const { run, readState, restoreState, calls } = await scenario(t);
  assert.equal(run(['--reserve']).status, 0);
  const pushedReservation = await readState();
  assert.equal(run().status, 0);
  assert.equal((await readState()).mediaId, 'fake-media');
  await restoreState(pushedReservation);
  const before = await calls();
  assert.equal(run(['--reserve'], { GITHUB_RUN_ID: '43' }).status, 1);
  assert.equal(run([], { GITHUB_RUN_ID: '43' }).status, 1);
  assert.equal(await calls(), before);
});
