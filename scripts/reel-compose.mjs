// Збирає готовий Reels: кадри (прозорі PNG з reel-frames.mjs) кладе поверх
// відеофону з assets/reel-bg, зверху — музика.
//
//   node scripts/reel-compose.mjs
//   REEL_BG=02-nozzle.mp4 node scripts/reel-compose.mjs   ← примусово певний фон
//
// Чому окремий скрипт, а не рядок у reels.yml: граф фільтрів ffmpeg завеликий,
// щоб жити в YAML, і його треба ганяти локально перед комітом.
//
// Якщо в assets/reel-bg немає жодного кліпу — фон буде суцільний BG, тобто
// рівно те, що було до появи відео. Пайплайн не ламається.

import { spawn } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAMES_DIR = path.join(ROOT, 'frames');
const BG_DIR = path.join(ROOT, 'assets', 'reel-bg');
const OUT_DIR = path.join(ROOT, 'public', 'reels');

const W = 1080, H = 1920, FPS = 24, SEC = 12;
const BG_COLOR = '0x0a0e12';

// Скільки «пригасити» відео, щоб графік і дрібні написи читались. Підбиралось
// на око по готовому ролику: менше — текст тоне, більше — фон стає сірою кашею.
const BLUR = 5;          // gblur sigma
const BRIGHTNESS = -0.10;
const SATURATION = 1.08;

const ffmpeg = process.env.FFMPEG || 'ffmpeg';

// wantErr — бо ffmpeg пише службове (зокрема Duration) у stderr навіть коли все добре
function run(bin, args, wantErr = false) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', d => (out += d));
    p.stderr.on('data', d => (err += d));
    p.on('error', reject);
    p.on('close', code =>
      code === 0 ? resolve((wantErr ? err : out).trim()) : reject(new Error(`${bin} → ${code}\n${err.slice(-2000)}`)));
  });
}

const exists = p => stat(p).then(() => true, () => false);

// Фон чергуємо по тижнях — так само, як пальне в reel-frames.mjs. Інакше всі
// ролики починались би однаковим кадром, а Instagram ріже охоплення за одноманітність.
async function pickBg() {
  if (process.env.REEL_BG) {
    const forced = path.join(BG_DIR, process.env.REEL_BG);
    if (await exists(forced)) return forced;
    throw new Error(`немає фону ${process.env.REEL_BG}`);
  }
  if (!(await exists(BG_DIR))) return null;
  const clips = (await readdir(BG_DIR)).filter(f => f.endsWith('.mp4')).sort();
  if (!clips.length) return null;
  const week = Math.floor(Date.now() / (7 * 86_400_000));
  return path.join(BG_DIR, clips[week % clips.length]);
}

// Тривалість беремо з ffmpeg, а не з ffprobe: ffprobe є не в кожній збірці
// (зокрема в локальній, якою я перевіряю ролик перед комітом), а ffmpeg є завжди.
async function duration(file) {
  const err = await run(ffmpeg, ['-hide_banner', '-i', file, '-f', 'null', '-'], true).catch(e => String(e.message));
  const m = /Duration:\s*(\d+):(\d+):(\d+\.?\d*)/.exec(err);
  if (!m) throw new Error(`не вдалось визначити тривалість ${file}`);
  return +m[1] * 3600 + +m[2] * 60 + +m[3];
}

async function main() {
  const meta = JSON.parse(await readFile(path.join(FRAMES_DIR, 'meta.json'), 'utf-8'));
  const out = path.join(OUT_DIR, meta.file);
  const music = path.join(FRAMES_DIR, 'music.mp3');
  const voice = path.join(FRAMES_DIR, 'voice.wav');
  const hasMusic = await exists(music);
  const hasVoice = await exists(voice);
  const bg = await pickBg();

  const args = ['-y', '-loglevel', 'error'];
  const filters = [];

  if (bg) {
    // Кліпи з Flow — 8–10 c, ролик 12 c. Розтягуємо часом (setpts), а не лупом:
    // шов лупа помітний, а сповільнення на 20 % на око не читається.
    const slow = SEC / (await duration(bg));
    args.push('-i', bg);
    filters.push(
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `setpts=PTS*${slow.toFixed(4)},fps=${FPS},` +
      `gblur=sigma=${BLUR},eq=brightness=${BRIGHTNESS}:saturation=${SATURATION},vignette=PI/6,` +
      `trim=duration=${SEC},setpts=PTS-STARTPTS[bed]`
    );
  } else {
    args.push('-f', 'lavfi', '-i', `color=c=${BG_COLOR}:s=${W}x${H}:r=${FPS}:d=${SEC}`);
    filters.push('[0:v]null[bed]');
  }

  args.push('-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%04d.png'));
  filters.push('[bed][1:v]overlay=format=auto:shortest=1,format=yuv420p[v]');

  // Аудіо: голос диктора поверх пригашеної музики. Коли голосу немає —
  // музика на повну, як і раніше. Порядок входів: 0=фон, 1=кадри, 2=музика, 3=голос.
  if (hasMusic) args.push('-stream_loop', '-1', '-i', music);
  if (hasVoice) args.push('-i', voice);

  if (hasMusic && hasVoice) {
    filters.push(
      `[2:a]volume=0.22,atrim=duration=${SEC},afade=t=out:st=${SEC - 2}:d=2[mus]`,
      `[3:a]adelay=700|700,apad=whole_dur=${SEC}[voi]`,
      `[mus][voi]amix=inputs=2:normalize=0[a]`
    );
  } else if (hasMusic) {
    filters.push(`[2:a]atrim=duration=${SEC},afade=t=out:st=${SEC - 2}:d=2[a]`);
  } else if (hasVoice) {
    filters.push(`[2:a]adelay=700|700,apad=whole_dur=${SEC}[a]`);
  }

  args.push('-filter_complex', filters.join(';'), '-map', '[v]');
  if (hasMusic || hasVoice) args.push('-map', '[a]', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100');

  args.push(
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.0',
    '-crf', '20', '-preset', 'medium', '-r', String(FPS),
    '-t', String(SEC), '-movflags', '+faststart', out
  );

  await run(ffmpeg, args);
  console.error(
    `фон: ${bg ? path.basename(bg) : 'суцільний (кліпів немає)'}, ` +
      `музика: ${hasMusic ? 'є' : 'нема'}, голос: ${hasVoice ? 'є' : 'нема'}`
  );
  console.log(out);
}

await main();
