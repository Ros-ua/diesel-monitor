// Качає фонову доріжку для Reels з Openverse (лише CC0 з Freesound).
//
// Чому саме так — юридичний бік перевірено окремо:
//   CC0  — комерція дозволена, атрибуція НЕ потрібна. Єдиний повністю
//          автоматизований і чистий шлях без ключа API.
//   BY-ND — у відео заборонено взагалі (синхронізація з відео = похідний твір).
//   BY-SA — «заражає»: усе відео довелося б випускати під тією ж ліцензією.
//   BY-NC — комерція заборонена.
// Тому фільтр жорсткий: license=cc0 і source=freesound.
//
//   node scripts/reel-music.mjs [секунди]  → frames/music.mp3 + music.json
//
// Файл ліцензії поруч із треком — це доказ на випадок спору.

import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'frames');

// запити підібрані під дата-контент: рівний ритм без вокалу
const QUERIES = [
  'electronic music loop',
  'techno loop',
  'minimal beat loop',
  'electro-pop loop',
  'synth loop',
];

const MIN_BYTES = 60_000;   // зовсім короткі семпли не годяться
const MAX_BYTES = 6_000_000;

async function search(q) {
  const url = new URL('https://api.openverse.org/v1/audio/');
  url.searchParams.set('q', q);
  url.searchParams.set('license', 'cc0');
  url.searchParams.set('source', 'freesound');
  url.searchParams.set('page_size', '20');
  const res = await fetch(url, { headers: { 'User-Agent': 'diesel-monitor/1.0' } });
  if (!res.ok) throw new Error(`Openverse ${res.status}`);
  return (await res.json()).results ?? [];
}

async function main() {
  const wantSec = Number(process.argv[2] ?? 12);

  // індекс запиту крутимо за днем року — щоб музика не була щоразу та сама
  const day = Math.floor(Date.now() / 86_400_000);
  const order = QUERIES.map((_, i) => QUERIES[(i + day) % QUERIES.length]);

  let track = null;
  for (const q of order) {
    let list;
    try {
      list = await search(q);
    } catch (e) {
      console.log(`музика: запит «${q}» не вдався (${e.message})`);
      continue;
    }
    const fit = list.filter(
      r =>
        r.license === 'cc0' &&
        r.filetype === 'mp3' &&
        r.url &&
        (r.filesize ?? 0) >= MIN_BYTES &&
        (r.filesize ?? 0) <= MAX_BYTES
    );
    if (fit.length) {
      track = fit[day % fit.length];
      console.log(`музика: «${q}» → ${fit.length} придатних`);
      break;
    }
  }

  if (!track) {
    console.log('музика: нічого підхожого не знайшлось — відео буде без звуку');
    process.exit(3); // окремий код: workflow збере ролик без музики
  }

  const audio = await fetch(track.url, { headers: { 'User-Agent': 'diesel-monitor/1.0' } });
  if (!audio.ok) {
    console.log(`музика: не качається (${audio.status}) — відео буде без звуку`);
    process.exit(3);
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'music.mp3'), Buffer.from(await audio.arrayBuffer()));

  const meta = {
    title: track.title,
    creator: track.creator,
    source: track.foreign_landing_url,
    license: track.license,
    licenseVersion: track.license_version,
    licenseUrl: track.license_url,
    downloadedAt: new Date().toISOString(),
    wantSec,
  };
  await writeFile(path.join(OUT_DIR, 'music.json'), JSON.stringify(meta, null, 2));

  console.log(`музика: «${track.title}» (${track.creator}) — CC0, ${Math.round((track.filesize ?? 0) / 1024)} КБ`);
}

main().catch(e => {
  console.error('музика ЗБІЙ:', e.message);
  process.exit(3);
});
