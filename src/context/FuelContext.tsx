// Глобально вибраний вид пального: тикер-стрічка перемикає, весь дашборд слідує
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { FUEL_ORDER, type FuelKey } from '../types';

const STORAGE_KEY = 'dm-fuel';

const FuelCtx = createContext<{ fuel: FuelKey; setFuel: (f: FuelKey) => void }>({
  fuel: 'dp',
  setFuel: () => {},
});

export function FuelProvider({ children }: { children: ReactNode }) {
  const [fuel, setFuel] = useState<FuelKey>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && (FUEL_ORDER as string[]).includes(saved)) return saved as FuelKey;
    } catch {
      /* localStorage недоступний — лишаємо типовий ДП */
    }
    return 'dp';
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, fuel);
    } catch {
      /* ігноруємо */
    }
  }, [fuel]);

  return <FuelCtx.Provider value={{ fuel, setFuel }}>{children}</FuelCtx.Provider>;
}

export function useFuel() {
  return useContext(FuelCtx);
}
