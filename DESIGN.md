# Дизель Монітор UA — дизайн-система і контракти компонентів

Успадковано від Pro Speedtest (vpn-speedtest): темний термінальний UI, моноширинний шрифт,
бірюзовий акцент, тонкі рамки, сканлайни, пульсуючі індикатори.

## МОВА: всі тексти інтерфейсу — УКРАЇНСЬКОЮ. Без винятків.

## Токени (Tailwind v4, вже налаштовані в src/index.css)

Кольори: `bg` #0a0e12 (фон), `surface` #111820 (картки), `accent` #00d2aa (бірюза, головний),
`accent2` #00aaff (блакитний), `warn` #ffb347, `danger` #ff5f5f, `purple` #aa88ff,
`muted` #5a7a72 (другорядний текст), `line` rgba(0,210,170,.15) (рамки), `grid` rgba(0,210,170,.05).
Класи: `bg-bg text-accent border-line text-muted bg-surface` тощо. Шрифт — успадковується (Courier New).

Утиліти (вже в index.css):
- `card` — surface + 1px рамка line + radius 5px. Основа будь-якого блока.
- `lbl` — 9px uppercase muted letter-spacing .15em. Підписи над значеннями.
- `scanlines` — фонові горизонтальні лінії (для hero-блоків).
- `btn` — прозора кнопка з бірюзовою рамкою, hover інвертує. `btn-ghost` — сіра до hover. `btn-danger`.
- Анімації: `style={{animation:'pulse 1.5s infinite'}}` (пульс), keyframes `flashval` (блимання при зміні).

## Патерни дизайну

- Картка: `<div className="card p-3">` з `<div className="lbl mb-1">ПІДПИС</div>` та значенням
  `text-[22px] font-bold text-accent leading-none`.
- Великі числа hero: 56–72px font-bold, колір accent.
- ЗМІНА ЦІНИ: зростання = `text-danger` (погано для водія), падіння = `text-accent` (добре),
  нейтрально = `text-muted`. Стрілки ▲ ▼ →. Використовуй хелпери з `lib/format.ts`.
- Заголовки секцій: `lbl` + `mb-2`.
- Таблиці: рядки з `border-b border-line/50`, hover `bg-accent/5`; заголовки — `lbl` клікабельні для сортування.
- Анімації framer-motion: стримані — fade/slide 0.25–0.4s на появу блоків, layout-анімації в таблицях.
  `import { motion } from 'framer-motion'`.

## Дані (все вже реалізовано, НЕ створюй нових фетчерів)

```ts
import { useAppData } from '../context/DataContext'; // { latest, history, news, factors }
```
Типи в `src/types.ts`: `Latest { date, collectedAt, avg?, avgChange?, networks?, regions?, usd?, brent? }`,
`History { updated, days: HistoryDay[] }`, `HistoryDay { date, source?, avg?, networks?, usd?, brent? }`,
`News { items: NewsItem[] }`, `NewsItem { title, summary, url, source, publishedAt, impact: 'up'|'down'|'neutral' }`
(impact = тиск на ціну: up=вгору=🔴, down=вниз=🟢, neutral=🟡),
`Factors { days: { date, brent?, usd? }[] }`, `FuelKey = 'dp'|'a95p'|'a95'|'a92'|'gas'`, `FUEL_LABELS`, `FUEL_ORDER`.
`AlertRule` — типи правил сповіщень.

ВАЖЛИВО про дані: історія РОЗРІДЖЕНА (архівні точки ~1–5 на місяць з 2024, щоденні — лише з 2026-07-21).
Всі функції статистики це враховують. `latest.networks[name]` = медіана по областях (`regionCount` — к-ть областей).
`latest.regions[область][мережа]` = ціни в області. Області БЕЗ слова «обл.» («Вінницька», «м. Київ»...).

## Готові бібліотеки (використовуй, не дублюй)

`src/lib/stats.ts`: `avgSeries(days, fuel)`, `networkSeries(days, network, fuel)` → `SeriesPoint {date, value}[]`;
`clipRange(series, days|null)`, `changeOver(series, days)` → `{abs, pct, fromDate}|null`,
`extremeMoves(series, windowDays)` → `{rise, drop}`, `volatility(series, windowDays)`,
`averageOver(series, windowDays)`, `mean/median/stddev`, `analytics(latest, history, fuel)` → `Analytics`.

`src/lib/forecast.ts`: `forecast(series)` → `{direction, confidence('низька'|'середня'|'висока'), slopePerDay, tomorrow/week/month: {value, low, high}} | null`.

`src/lib/drivers.ts`: `drivers(history, factors, news)` → `Driver { label, dir:'up'|'down', strength:1|2|3, detail }[]`.

`src/lib/format.ts`: `fmtPrice(v)` → '58,42', `fmtSigned(v)` → '+0,37', `fmtPct(v)`, `arrow(v)` → ▲▼→,
`changeColor(v)` → tailwind-клас, `fmtDate('2026-07-21')` → '21 лип 2026', `fmtDateShort`, `fmtDateTime`, `timeAgo`.

Графіки: `import Chart from '../components/Chart'` — `<Chart option={...} className="h-64" notMerge />`.
ECharts вже сконфігуровано в `src/lib/echarts.ts`; звідти ж бери `CHART_COLORS, AXIS_DEFAULTS, TOOLTIP_DEFAULTS`.
Лінії — колір accent `#00d2aa`, заливка `rgba(0,210,170,0.07)`, для порівнянь — accent2/warn/purple.
Осі часу: type 'time' або category з `fmtDateShort`. Для розрідженої історії `connectNulls: true`.

Роутінг: `react-router-dom`, посилання `<Link to={'/network/' + encodeURIComponent(name)}>`,
`/region/` + назва області. Параметр читати через `useParams()` + `decodeURIComponent`.

## Глобальний перемикач пального (тикер-стрічка)

`src/context/FuelContext.tsx`: `const { fuel, setFuel } = useFuel()` — глобально вибране пальне
(FuelKey, типово 'dp', зберігається в localStorage). Всі компоненти дашборда показують дані
для `fuel`, НЕ хардкодять 'dp'. Назви: `FUEL_SHORT[fuel]` (тикери/заголовки колонок),
`FUEL_HERO[fuel]` (hero: «Середня ціна {FUEL_HERO} по Україні»), `FUEL_LABELS[fuel]` (повна).
Тикер-стрічка `FuelTickers` — верх Dashboard: 5 карток (ціна, зміна за день, «тижд …»,
спарклайн 30д з avgSeries), активна — рамка border-accent, клік = setFuel.

## Верстка

Мобільний-перший, брейкпоінти `md:` (768) і `lg:` (1024). Компонент завжди займає 100% ширини
контейнера (сітку задає Dashboard). Висоти графіків: головний `h-72 md:h-80`, малі `h-40`.
