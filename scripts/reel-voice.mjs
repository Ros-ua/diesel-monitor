// Озвучка Reels: голос диктора з цифр ролика через Gemini TTS.
//
// Єдина генеративна модальність, що входить у БЕЗКОШТОВНИЙ ключ Gemini
// (перевірено 07.08.2026: картинки/відео — квота 0, TTS — працює).
//
//   node scripts/reel-voice.mjs   → frames/voice.wav (читає frames/meta.json)
//
// env: GEMINI_API_KEY. Збій некритичний (exit 3) — ролик збереться без голосу,
// як і без музики: пайплайн деградує м'яко, а не падає.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { текстГолосу } from './lib/голос.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAMES_DIR = path.join(ROOT, 'frames');

const MODEL = 'gemini-2.5-flash-preview-tts';
const VOICE = 'Charon'; // спокійний низький диктор; альтернативи: Kore, Puck

const key = process.env.GEMINI_API_KEY;



// API віддає сирий PCM 16-біт моно — загортаємо в WAV-заголовок для ffmpeg
function wav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function main() {
  if (!key) {
    console.error('озвучка: немає GEMINI_API_KEY — ролик буде без голосу');
    process.exit(3);
  }
  const meta = JSON.parse(await readFile(path.join(FRAMES_DIR, 'meta.json'), 'utf-8'));
  const text = текстГолосу(meta);
  console.error(`озвучка: «${text}»`);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: 'POST',
      // ⚠️ Ключ — у заголовку, а не в адресі (?key=): адреси частіше потрапляють
      // у журнали й повідомлення про помилки (звіт безпеки 28.09, п.9).
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Прочитай спокійним упевненим дикторським голосом українською: ${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } },
        },
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`озвучка: TTS відповів ${res.status} — ролик буде без голосу`);
    console.error(`озвучка: ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
    process.exit(3);
  }
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) {
    console.error('озвучка: у відповіді немає аудіо — ролик буде без голосу');
    process.exit(3);
  }
  const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType ?? '')?.[1] ?? 24000);
  const pcm = Buffer.from(part.inlineData.data, 'base64');
  await writeFile(path.join(FRAMES_DIR, 'voice.wav'), wav(pcm, rate));
  console.error(`озвучка: voice.wav готовий (${Math.round(pcm.length / rate / 2)} с, голос ${VOICE})`);
}

main().catch(e => {
  console.error('озвучка ЗБІЙ:', e.message);
  process.exit(3);
});
