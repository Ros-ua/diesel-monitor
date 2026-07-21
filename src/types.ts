// Спільні типи даних застосунку

export type FuelKey = 'dp' | 'a95p' | 'a95' | 'a92' | 'gas';

export const FUEL_LABELS: Record<FuelKey, string> = {
  dp: 'Дизель (ДП)',
  a95p: 'А-95 преміум',
  a95: 'А-95',
  a92: 'А-92',
  gas: 'Автогаз (LPG)',
};

export const FUEL_ORDER: FuelKey[] = ['dp', 'a95p', 'a95', 'a92', 'gas'];

export type FuelPrices = Partial<Record<FuelKey, number>>;

export type NetworkPrices = FuelPrices & { regionCount?: number };

export interface HistoryDay {
  date: string; // YYYY-MM-DD
  source?: 'minfin' | 'wayback' | string;
  avg?: FuelPrices;
  networks?: Record<string, NetworkPrices>;
  usd?: number;
  brent?: number;
}

export interface History {
  updated: string;
  days: HistoryDay[];
}

export interface Latest {
  date: string;
  collectedAt: string;
  avg?: FuelPrices;
  avgChange?: FuelPrices; // зміна за день, грн
  networks?: Record<string, NetworkPrices>;
  regions?: Record<string, Record<string, FuelPrices>>;
  usd?: number;
  brent?: number;
}

export type NewsImpact = 'up' | 'down' | 'neutral';

export interface NewsItem {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string | null;
  impact: NewsImpact; // вплив на ціну: up = тисне вгору (🔴), down = вниз (🟢)
}

export interface News {
  updated: string;
  items: NewsItem[];
}

export interface FactorsDay {
  date: string;
  brent?: number;
  usd?: number;
}

export interface Factors {
  updated: string;
  days: FactorsDay[];
}

// ── Сповіщення (зберігаються у localStorage) ──

export type AlertRule =
  | { id: string; kind: 'below'; fuel: FuelKey; value: number }
  | { id: string; kind: 'above'; fuel: FuelKey; value: number }
  | { id: string; kind: 'network-change'; network: string }
  | { id: string; kind: 'avg-move'; percent: number };
