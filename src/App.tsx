import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useDataState } from './context/DataContext';
import { timeAgo } from './lib/format';
import ViewCounter from './components/ViewCounter';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NetworkPage = lazy(() => import('./pages/NetworkPage'));
const RegionPage = lazy(() => import('./pages/RegionPage'));

function Header({ updatedAt }: { updatedAt: string | null }) {
  return (
    <header className="flex items-center gap-3.5 border-b border-line pb-2.5 shrink-0">
      <Link to="/" className="flex items-center gap-2 no-underline">
        <span
          className="inline-block size-[7px] rounded-full bg-accent"
          style={{ animation: 'pulse 1.5s infinite' }}
        />
        <h1 className="text-xs text-accent tracking-[0.2em] uppercase font-normal">
          Дизель Монітор <span className="text-muted">UA</span>
        </h1>
      </Link>
      <span className="text-[11px] text-muted ml-auto">
        {updatedAt ? `оновлено ${timeAgo(updatedAt)}` : 'завантаження…'}
      </span>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-line pt-3 mt-6 pb-4 text-[10px] text-muted leading-relaxed">
      <p>
        Джерела даних:{' '}
        <a href="https://index.minfin.com.ua/ua/markets/fuel/" target="_blank" rel="noreferrer" className="text-accent/70 hover:text-accent">
          Мінфін (Консалтингова група А-95)
        </a>
        {' · '}
        <a href="https://bank.gov.ua" target="_blank" rel="noreferrer" className="text-accent/70 hover:text-accent">
          НБУ
        </a>
        {' · '}Yahoo Finance (Brent){' · '}новини: ЕП, УНІАН, Укрінформ, РБК-Україна
      </p>
      <p className="mt-1">
        Ціни оновлюються щодня автоматично. Прогнози — статистичні оцінки за історичними даними,
        не є фінансовою порадою і не гарантують майбутніх цін.
      </p>
      <p className="mt-1">
        Зв'язок та пропозиції:{' '}
        <a href="https://t.me/Ros_Hangzhou" target="_blank" rel="noreferrer" className="text-accent/70 hover:text-accent">
          @Ros_Hangzhou
        </a>{' '}
        (Telegram) <ViewCounter />
      </p>
    </footer>
  );
}

export default function App() {
  const { data, error } = useDataState();

  return (
    <div className="min-h-screen flex flex-col px-3 py-2.5 md:px-5 md:py-3 max-w-[1400px] mx-auto">
      <Header updatedAt={data?.latest.collectedAt ?? null} />

      {error && (
        <div className="card mt-4 p-4 text-danger text-xs">
          Помилка завантаження даних: {error}
        </div>
      )}

      {!data && !error && (
        <div className="flex-1 flex items-center justify-center text-muted text-xs tracking-[0.2em] uppercase" style={{ animation: 'pulse 1.5s infinite' }}>
          Завантаження даних…
        </div>
      )}

      {data && (
        <main className="flex-1 mt-3">
          <Suspense
            fallback={
              <div className="text-muted text-xs tracking-[0.2em] uppercase mt-8 text-center" style={{ animation: 'pulse 1.5s infinite' }}>
                Завантаження…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/network/:id" element={<NetworkPage />} />
              <Route path="/region/:id" element={<RegionPage />} />
              <Route path="*" element={<div className="text-muted text-xs mt-8">Сторінку не знайдено. <Link to="/" className="text-accent">На головну</Link></div>} />
            </Routes>
          </Suspense>
        </main>
      )}

      <Footer />
    </div>
  );
}
