// Завантаження всіх даних один раз і роздача по дереву компонентів
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dataProvider } from '../api/provider';
import type { Factors, History, Latest, News } from '../types';

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
        if (alive) setState({ data: null, error: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      alive = false;
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
