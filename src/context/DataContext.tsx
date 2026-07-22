// Завантаження даних і роздача по дереву компонентів.
// Дані автоматично оновлюються кожні 15 хв та при поверненні на вкладку,
// тому давно відкрита сторінка не «застигає» на старих цінах.
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dataProvider } from '../api/provider';
import type { Factors, History, Latest, News } from '../types';

const REFRESH_MS = 15 * 60 * 1000;

export interface AppData {
  latest: Latest;
  history: History;
  news: News | null;
  factors: Factors | null;
}

interface DataState {
  data: AppData | null;
  error: string | null;
}

const DataCtx = createContext<DataState>({ data: null, error: null });

export function DataProviderComponent({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DataState>({ data: null, error: null });

  useEffect(() => {
    let alive = true;

    const load = (initial: boolean) => {
      Promise.all([
        dataProvider.latest(),
        dataProvider.history(),
        dataProvider.news(),
        dataProvider.factors(),
      ])
        .then(([latest, history, news, factors]) => {
          if (alive) setState({ data: { latest, history, news, factors }, error: null });
        })
        .catch(e => {
          // помилку показуємо лише якщо даних ще немає; тихий рефреш не ламає сторінку
          if (alive && initial) {
            setState({ data: null, error: e instanceof Error ? e.message : String(e) });
          }
        });
    };

    load(true);
    const timer = setInterval(() => load(false), REFRESH_MS);

    // повернувся на вкладку після паузи — одразу підтягуємо свіже
    const onVisible = () => {
      if (document.visibilityState === 'visible') load(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return <DataCtx.Provider value={state}>{children}</DataCtx.Provider>;
}

/** Дані вже завантажені (використовувати всередині <Loaded>) */
export function useAppData(): AppData {
  const { data } = useContext(DataCtx);
  if (!data) throw new Error('useAppData поза завантаженими даними');
  return data;
}

export function useDataState(): DataState {
  return useContext(DataCtx);
}
