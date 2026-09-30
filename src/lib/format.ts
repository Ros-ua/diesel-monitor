// Форматування чисел і дат (українська локаль)

export const fmtPrice = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '—' : v.toFixed(digits).replace('.', ',');

export const fmtSigned = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits).replace('.', ',')}`;

export const fmtPct = (v: number | null | undefined, digits = 1): string =>
  v === null || v === undefined ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits).replace('.', ',')}%`;

export const arrow = (v: number | null | undefined): string =>
  v === null || v === undefined || v === 0 ? '→' : v > 0 ? '▲' : '▼';

/** Колір зміни ЦІНИ: зростання — погано (danger), падіння — добре (accent) */
export const changeColor = (v: number | null | undefined): string =>
  v === null || v === undefined || Math.abs(v) < 0.005
    ? 'text-muted'
    : v > 0
      ? 'text-danger'
      : 'text-accent';

const MONTHS = ['січ', 'лют', 'бер', 'кві', 'тра', 'чер', 'лип', 'сер', 'вер', 'жов', 'лис', 'гру'];

export const fmtDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

export const fmtDateShort = (iso: string): string => {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
};

/**
 * Мітка часу осі ECharts → 'YYYY-MM-DD' за МІСЦЕВИМ часом браузера.
 *
 * ⚠️ ECharts ставить дату 'YYYY-MM-DD' на МІСЦЕВУ північ і мітки осі теж
 * рахує в місцевому часі (замір 26.09.2026 на ECharts 6.1.0). Раніше підпис
 * будувався через toISOString (UTC), і в Україні (UTC+2/+3) кожна мітка
 * виходила на день раніше: 1 вересня підписувалось «31 сер» — живий сайт.
 */
export const isoFromMs = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Підпис колонки «Вчора»: так, якщо попередній день збору справді вчора, інакше «з 25 вер» */
export const previousDayLabel = (from: string, to: string): string =>
  Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z') === 86_400_000
    ? 'Вчора'
    : `з ${fmtDateShort(from)}`;

/**
 * Позначка над таблицею мереж, коли карта мереж старша за дані (networksDate ≠ date):
 * /tm/ не відповів і збирач лишив попередню карту. Без неї таблиця показувала
 * старі ціни мереж під сьогоднішньою шапкою (ревізія S4 30.09, P2-5). null — карта свіжа.
 */
export const networksAsOfLabel = (date: string, networksDate?: string): string | null =>
  networksDate && networksDate !== date ? `ціни мереж станом на ${fmtDateShort(networksDate)}` : null;

export const fmtDateTime = (iso: string): string => {
  const dt = new Date(iso);
  return `${dt.toLocaleDateString('uk-UA')} ${dt.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`;
};

export const timeAgo = (iso: string | null): string => {
  if (!iso) return '';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} хв тому`;
  if (s < 86400) return `${Math.floor(s / 3600)} год тому`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'вчора' : `${d} дн тому`;
};
