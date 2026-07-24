import { lazy, Suspense } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { useDataState } from './context/DataContext';
import { timeAgo } from './lib/format';
import ViewCounter from './components/ViewCounter';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const NetworkPage = lazy(() => import('./pages/NetworkPage'));
const RegionPage = lazy(() => import('./pages/RegionPage'));
const EvPage = lazy(() => import('./pages/EvPage'));

function Header({ updatedAt }: { updatedAt: string | null }) {
  return (
    <header className="flex items-center gap-2 border-b border-line pb-2.5 shrink-0">
      <Link to="/" className="flex items-center gap-2 no-underline flex-1 min-w-0">
        <span
          className="inline-block size-[7px] rounded-full bg-accent shrink-0"
          style={{ animation: 'pulse 1.5s infinite' }}
        />
        <h1 className="text-xs text-accent tracking-[0.2em] uppercase font-normal truncate">
          Дизель Монітор <span className="text-muted">UA</span>
        </h1>
      </Link>
      <Link
        to="/ev"
        className="btn btn-ghost px-2! py-1! text-[10px]! no-underline shrink-0"
        title="Мапа зарядних станцій для електромобілів по Україні"
      >
        <span className="hidden md:inline">⚡ У вас електрокар? Де зарядка поряд</span>
        <span className="md:hidden">⚡ Зарядки EV</span>
      </Link>
      <span className="text-[10px] text-muted/70 hidden sm:block flex-1 text-right">
        {updatedAt ? `ціни: ${timeAgo(updatedAt)}` : 'завантаження…'}
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
        📢 Телеграм-канал:{' '}
        <a href="https://t.me/diesel_monitor_ua" target="_blank" rel="noreferrer" className="text-accent/70 hover:text-accent">
          @diesel_monitor_ua
        </a>{' '}
        — щоденні ціни й новини · Зв'язок:{' '}
        <a href="https://t.me/Ros_Hangzhou" target="_blank" rel="noreferrer" className="text-accent/70 hover:text-accent">
          @Ros_Hangzhou
        </a>{' '}
        (Telegram) <ViewCounter />
      </p>
      <p className="mt-1">
        <a href="/widget/" className="text-accent/70 hover:text-accent">Віджет для сайту</a>
        {' · '}
        <a href="/privacy/" className="text-accent/70 hover:text-accent">Політика конфіденційності</a>
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
              <Route path="/ev" element={<EvPage />} />
              <Route path="*" element={<div className="text-muted text-xs mt-8">Сторінку не знайдено. <Link to="/" className="text-accent">На головну</Link></div>} />
            </Routes>
          </Suspense>
        </main>
      )}

      <Footer />
    </div>
  );
}
