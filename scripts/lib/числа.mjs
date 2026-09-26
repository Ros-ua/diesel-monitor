// Числа, яким можна вірити.
//
// ⚠️ 12.09.2026. Курси НБУ і котирування Brent бралися як є, без жодної
// перевірки. Порожній рядок від НБУ ставав НУЛЕМ (`Math.round("" * 100)` = 0),
// і на сайті та в картці ціни стояло «EUR 0,00». Нечислове значення давало NaN,
// перевірка `!== null` його пропускала, JSON перетворював на null — а прапорець
// у журналі вже стояв `usd:true`. Від Yahoo так само проходило -80: мінусової
// нафти не буває.
//
// Перевірено справжнім прогоном збирача з підміненою мережею: людина бачила
// «USD 41,00 · EUR 0,00 · Brent $-80,00», а журнал у тому ж рядку рапортував
// успіх.

export const round2 = v =>
  (v === null || v === undefined ? null : Math.round(v * 100) / 100);

/**
 * Число, схоже на курс або котирування. Усе інше — null, а не нуль.
 *
 * Межі широкі навмисно: це захист від безглуздя, а не прогноз ринку.
 */
export function курс(v, { від = 0.01, до = 10000 } = {}) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n) || n < від || n > до) return null;
  const r = round2(n);
  return Number.isFinite(r) ? r : null;
}

// ── Межі, у яких число ще може бути правдою ─────────────────────────────────
//
// ⚠️ 26.09.2026 (аудит). Межі «від 1 до 1000» для всіх трьох чисел ловили
// тільки нуль і мінус. Курс 4,48 (кома не там), 1,17 (курс EUR/USD замість
// гривні) чи Brent 9,75 проходили мовчки. Нижче — вужчі межі з запасом на
// кризу: гривня з 2014 року не була дорожчою за 8 за долар, Brent денним
// закриттям з 1999 року не падав нижче 9.
export const МЕЖІ = {
  usd: { від: 20, до: 150 },
  eur: { від: 20, до: 180 },
  brent: { від: 10, до: 300 },
};

/** Відношення EUR/USD за НБУ: за всю історію євро — від 0,82 до 1,60 долара. */
const EUR_ДО_USD = { від: 0.8, до: 1.7 };

/** Денний стрибок, більший за цей, — не ринок, а підміна. */
// Найбільший справжній за історію проєкту: Brent −14,5% (01.04.2026); у гривні
// найбільший за десятиліття — девальвація 21.07.2022 на +25%.
export const МАКС_СТРИБОК = 0.3;

/**
 * Курс НБУ з відповіді statdirectory/exchange — САМЕ ТІЄЇ валюти, яку просили.
 *
 * ⚠️ 26.09.2026 (аудит). Раніше бралося `json[0].rate` — перший рядок, хоч би
 * що в ньому стояло. Якщо НБУ проігнорує `valcode` і віддасть повний список
 * (першим у ньому йде AUD, ~27 грн), це число проходило б за курс долара або
 * євро і лягало на сайт і в картки. Тепер рядок шукається за кодом валюти.
 */
export function курсНБУ(json, код) {
  if (!Array.isArray(json)) return null;
  const рядок = json.find(р => String(р?.cc ?? '').toUpperCase() === код);
  if (!рядок) return null;
  return курс(рядок.rate, МЕЖІ[код.toLowerCase()]);
}

/**
 * Останнє закриття Brent з відповіді Yahoo — тільки якщо це справді BZ=F у доларах.
 *
 * ⚠️ 26.09.2026 (аудит). Символ і валюта не перевірялись: відповідь по
 * іншому інструменту (WTI, інша біржа, котирування в пенсах) лягала б
 * як Brent.
 */
export function brentЗYahoo(json) {
  const р = json?.chart?.result?.[0];
  if (!р) return null;
  const символ = р.meta?.symbol;
  if (символ !== undefined && символ !== 'BZ=F') return null;
  const валюта = р.meta?.currency;
  if (валюта !== undefined && валюта !== 'USD') return null;
  const закриття = р.indicators?.quote?.[0]?.close?.filter(v => v != null);
  if (!закриття?.length) return null;
  return курс(закриття[закриття.length - 1], МЕЖІ.brent);
}

/** EUR, який не сходиться з USD, — не євро (наприклад, курс іншої валюти). */
export function євроЗгідне(eur, usd) {
  if (eur === null || usd === null) return true;   // нема з чим звірити
  const к = eur / usd;
  return к >= EUR_ДО_USD.від && к <= EUR_ДО_USD.до;
}

/** Чи не стрибнуло число відносно попереднього відомого більш ніж на МАКС_СТРИБОК. */
export function безСтрибка(нове, попереднє) {
  if (нове === null || попереднє === null || попереднє === undefined) return true;
  if (!Number.isFinite(попереднє) || попереднє <= 0) return true;
  return Math.abs(нове / попереднє - 1) <= МАКС_СТРИБОК;
}

// ── Ряди для бекфілу ─────────────────────────────────────────────────────────
//
// ⚠️ 26.09.2026 (аудит). backfill.mjs писав у history.json і factors.json
// `round2(close)` і `round2(row.rate)` без жодної перевірки — тобто рівно ту
// дірку, яку 12.09 закрили в щоденному зборі: −80, 0 і NaN лягали б у ВСЮ
// трирічну історію графіків. Тепер обидва ряди йдуть через ті самі межі.

/** Yahoo chart (range=3y) → Map('YYYY-MM-DD' → Brent) лише з придатних закриттів. */
export function рядBrent(json) {
  const р = json?.chart?.result?.[0];
  const out = new Map();
  if (!р) return out;
  if (р.meta?.symbol !== undefined && р.meta.symbol !== 'BZ=F') return out;
  const закриття = р.indicators?.quote?.[0]?.close ?? [];
  (р.timestamp ?? []).forEach((t, i) => {
    const v = курс(закриття[i], МЕЖІ.brent);
    if (v !== null) out.set(new Date(t * 1000).toISOString().slice(0, 10), v);
  });
  return out;
}

/** НБУ exchange_site (масив рядків) → Map('YYYY-MM-DD' → USD) лише з придатних курсів. */
export function рядUSD(рядки) {
  const out = new Map();
  if (!Array.isArray(рядки)) return out;
  for (const р of рядки) {
    if (р?.cc !== undefined && String(р.cc).toUpperCase() !== 'USD') continue;
    const [d, m, y] = String(р?.exchangedate ?? '').split('.');
    if (!y) continue;
    const v = курс(р?.rate ?? р?.rate_per_unit, МЕЖІ.usd);
    if (v !== null) out.set(`${y}-${m}-${d}`, v);
  }
  return out;
}
