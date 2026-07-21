// Абстракція джерела даних. Зараз — статичні JSON, які оновлює GitHub Actions;
// у майбутньому легко замінити на REST API, реалізувавши той самий інтерфейс.

import type { Factors, History, Latest, News } from '../types';

export interface DataProvider {
  latest(): Promise<Latest>;
  history(): Promise<History>;
  news(): Promise<News | null>;
  factors(): Promise<Factors | null>;
}

const base = import.meta.env.BASE_URL + 'data/';

async function getJson<T>(file: string): Promise<T> {
  const res = await fetch(base + file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Не вдалося завантажити ${file}: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const staticJsonProvider: DataProvider = {
  latest: () => getJson<Latest>('latest.json'),
  history: () => getJson<History>('history.json'),
  news: () => getJson<News>('news.json').catch(() => null),
  factors: () => getJson<Factors>('factors.json').catch(() => null),
};

/** Активний провайдер даних застосунку */
export const dataProvider: DataProvider = staticJsonProvider;
