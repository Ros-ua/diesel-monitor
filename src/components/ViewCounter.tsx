// Лічильник переглядів. Основний сервіс — Abacus, запасний — CounterAPI
// (обидва безкоштовні, без реєстрації). Інкремент — раз на сесію браузера.
// Значення двох сервісів не синхронізовані: запасний вмикається лише коли
// основний недоступний, тому цифра може «стрибнути» — це компроміс за простоту.
import { useEffect, useState } from 'react';

interface Provider {
  hit: string;
  get: string;
  pick: (data: Record<string, unknown>) => number | null;
}

const NS = 'ros-ua-diesel-monitor';

const PROVIDERS: Provider[] = [
  {
    hit: `https://abacus.jasoncameron.dev/hit/${NS}/views`,
    get: `https://abacus.jasoncameron.dev/get/${NS}/views`,
    pick: d => (typeof d.value === 'number' ? d.value : null),
  },
  {
    hit: `https://api.counterapi.dev/v1/${NS}/views/up`,
    get: `https://api.counterapi.dev/v1/${NS}/views`,
    pick: d => (typeof d.count === 'number' ? d.count : null),
  },
];

const SESSION_KEY = 'dm-view-counted';

// Захист від подвійного інкременту (StrictMode у дев-режимі монтує ефекти двічі)
let requestOnce: Promise<number | null> | null = null;

async function hitOrRead(): Promise<number | null> {
  const counted = sessionStorage.getItem(SESSION_KEY) === '1';
  for (const p of PROVIDERS) {
    try {
      const res = await fetch(counted ? p.get : p.hit);
      if (!res.ok) continue;
      const value = p.pick((await res.json()) as Record<string, unknown>);
      if (value === null) continue;
      if (!counted) sessionStorage.setItem(SESSION_KEY, '1');
      return value;
    } catch {
      // сервіс недоступний — пробуємо наступний
    }
  }
  return null;
}

function pluralViews(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'перегляд';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'перегляди';
  return 'переглядів';
}

export default function ViewCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    requestOnce ??= hitOrRead();
    let alive = true;
    requestOnce.then(v => {
      if (alive) setCount(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (count === null) return null;

  return (
    <span title="Кількість завантажень сторінки">
      · <span className="text-accent/70">{count.toLocaleString('uk-UA')}</span> {pluralViews(count)}
    </span>
  );
}
