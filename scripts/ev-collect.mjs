// Збір локацій зарядних станцій електромобілів по Україні з OpenStreetMap
// (Overpass API, без ключів). Пише public/data/ev-stations.json.
// Локації змінюються повільно — запускати раз на тиждень.
// Запуск: node scripts/ev-collect.mjs

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// Канонічні мережі + їх варіанти написання в OSM (для нормалізації operator/brand)
const NETWORKS = [
  ['Toka', /toka|autoenterprise|auto\s*enterprise|автоентерпрайз/i],
  ['Ionity', /ionity/i],
  ['YASNO', /yasno|ясно/i],
  ['GoToU', /go.?to.?u/i],
  ['Ecofactor', /ecofactor|еко.?фактор/i],
  ['EVA', /\beva\b|eva.?charg/i],
  ['Faster', /faster/i],
  ['WOG', /\bwog\b|вог/i],
  ['OKKO', /okko|окко/i],
  ['UGV', /\bugv\b/i],
  ['Порше', /porsche|порше/i],
  ['Tesla', /tesla|тесла/i],
];

function canonicalNetwork(tags) {
  const raw = [tags.operator, tags.brand, tags.network, tags.name].filter(Boolean).join(' ');
  for (const [name, re] of NETWORKS) if (re.test(raw)) return name;
  return null; // невідома мережа
}

function powerKw(tags) {
  // збираємо максимальну потужність із різних тегів OSM
  const cands = [];
  for (const [k, v] of Object.entries(tags)) {
    if (/output|maxpower|charge$|:kw$/i.test(k) || k === 'maxpower') {
      const m = String(v).match(/(\d+(?:[.,]\d+)?)\s*k?w?/i);
      if (m) cands.push(parseFloat(m[1].replace(',', '.')));
    }
  }
  const pw = Math.max(0, ...cands);
  return pw > 0 && pw < 1000 ? Math.round(pw) : null;
}

// Тимчасово окуповані території — не показуємо (станції недоступні/недостовірні).
// Прямокутники приблизні по областях; невелика похибка на межах припустима.
const EXCLUDE = [
  { name: 'Крим', latMin: 44.0, latMax: 46.25, lonMin: 32.4, lonMax: 36.65 },
  { name: 'Донеччина', latMin: 46.85, latMax: 49.1, lonMin: 36.55, lonMax: 38.95 },
  { name: 'Луганщина', latMin: 48.0, latMax: 49.95, lonMin: 38.1, lonMax: 40.25 },
];
const isOccupied = (lat, lon) =>
  EXCLUDE.some(z => lat >= z.latMin && lat <= z.latMax && lon >= z.lonMin && lon <= z.lonMax);

function sockets(tags) {
  const out = [];
  if (tags['socket:type2'] || tags['socket:type2_combo']) out.push('Type2');
  if (tags['socket:ccs'] || tags['socket:type2_combo']) out.push('CCS');
  if (tags['socket:chademo']) out.push('CHAdeMO');
  if (tags['socket:type1']) out.push('Type1');
  return out;
}

async function overpass(query) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const url of ENDPOINTS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'diesel-monitor-ev' },
          body: 'data=' + encodeURIComponent(query),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastErr = e;
        console.log(`overpass ${url} (спроба ${attempt + 1}): ${e.message}`);
      }
    }
    await new Promise(r => setTimeout(r, 8000));
  }
  throw lastErr;
}

async function main() {
  // Адмінмежа України (area) — Overpass віддає лише станції в межах країни,
  // сусідні РФ/Молдова/Румунія/Білорусь відсікаються автоматично.
  const query =
    '[out:json][timeout:120];area["ISO3166-1"="UA"]["admin_level"="2"]->.ua;' +
    'node["amenity"="charging_station"](area.ua);out body;';
  const data = await overpass(query);

  // дефолтні беззмістовні назви OSM → null
  const DEF = /^(ev )?charging station|^зарядна станц|^charging|^station|^зарядка$/i;
  const stations = [];
  for (const el of data.elements ?? []) {
    const t = el.tags ?? {};
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    if (isOccupied(lat, lon)) continue; // тимчасово окуповані території
    const nm = t.name || t.operator || t.brand || null;
    stations.push({
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      net: canonicalNetwork(t),
      name: nm && !DEF.test(nm) ? nm : null,
      pw: powerKw(t),
      sk: sockets(t),
    });
  }

  const byNet = {};
  for (const s of stations) byNet[s.net || '—'] = (byNet[s.net || '—'] || 0) + 1;

  await writeFile(
    path.join(DATA_DIR, 'ev-stations.json'),
    JSON.stringify({ updated: new Date().toISOString(), count: stations.length, stations })
  );
  console.log(`ev-stations.json: ${stations.length} станцій`);
  console.log('за мережами:', Object.entries(byNet).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(', '));
}

main().catch(e => {
  console.error('ev-collect ЗБІЙ:', e.message);
  process.exit(1);
});
