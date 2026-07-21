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
