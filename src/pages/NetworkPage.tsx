// Сторінка мережі АЗС: поточні ціни, історія вибраного пального, статистика, ціни по областях
import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { EChartsCoreOption } from 'echarts/core';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { FUEL_LABELS, FUEL_ORDER, FUEL_SHORT } from '../types';
import type { NetworkPrices } from '../types';
import { arrow, changeColor, fmtDate, fmtDateShort, fmtPct, fmtPrice, fmtSigned } from '../lib/format';
import { averageOver, changeOver, networkSeries } from '../lib/stats';
import type { SeriesPoint } from '../lib/stats';
import Chart from '../components/Chart';
import { AXIS_DEFAULTS, CHART_COLORS, TOOLTIP_DEFAULTS } from '../lib/echarts';

/** Маленька картка «підпис + значення» у стилі термінала */
function StatCard({
  label,
  value,
  valueClass,
  unit,
  sub,
  delay = 0,
}: {
  label: string;
  value: string;
  valueClass: string;
  unit?: string;
  sub?: string;
  delay?: number;
}) {
  return (
    <motion.div
      className="card p-3"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <div className="lbl mb-1">{label}</div>
      <div className={`text-[20px] font-bold leading-none ${valueClass}`}>
        {value}
        {unit && <span className="text-[10px] text-muted font-normal ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted mt-1">{sub}</div>}
    </motion.div>
  );
}

export default function NetworkPage() {
  const { id } = useParams<{ id: string }>();
  const name = id ? decodeURIComponent(id) : '';
  const { latest } = useAppData();
  const net = name ? latest.networks?.[name] : undefined;

  if (!net) {
    return (
      <div className="card p-5 text-xs text-muted mt-2">
        Мережу не знайдено.{' '}
        <Link to="/" className="text-accent hover:underline">
          На головну
        </Link>
      </div>
    );
  }

  return <NetworkContent name={name} net={net} />;
}

function NetworkContent({ name, net }: { name: string; net: NetworkPrices }) {
  const { latest, history } = useAppData();
  const { fuel } = useFuel();

  const series = useMemo(
    () => networkSeries(history.days, name, fuel),
    [history.days, name, fuel]
  );

  const stats = useMemo(() => {
    const highest = series.reduce<SeriesPoint | null>(
      (a, p) => (!a || p.value > a.value ? p : a),
      null
    );
    const lowest = series.reduce<SeriesPoint | null>(
      (a, p) => (!a || p.value < a.value ? p : a),
      null
    );
    return {
      highest,
      lowest,
      avgAll: averageOver(series, null),
      month: changeOver(series, 30),
      year: changeOver(series, 365),
    };
  }, [series]);

  const netPrice = net[fuel];
  const countryAvg = latest.avg?.[fuel];
  const vsCountry =
    netPrice !== undefined && countryAvg !== undefined ? netPrice - countryAvg : null;

  const fuels = FUEL_ORDER.filter(f => net[f] !== undefined);

  const regionRows = useMemo(() => {
    const netMedian = net[fuel];
    return Object.entries(latest.regions ?? {})
      .flatMap(([region, regionNets]) => {
        const price = regionNets[name]?.[fuel];
        if (price === undefined) return [];
        return [{ region, price, diff: netMedian !== undefined ? price - netMedian : null }];
      })
      .sort((a, b) => a.price - b.price);
  }, [latest.regions, name, net, fuel]);

  const option = useMemo<EChartsCoreOption>(
    () => ({
      grid: { left: 46, right: 14, top: 18, bottom: 42 },
      tooltip: {
        ...TOOLTIP_DEFAULTS,
        trigger: 'axis',
        formatter: (params: unknown): string => {
          const arr = params as Array<{ data: [string, number] }>;
          if (!arr.length) return '';
          const [date, value] = arr[0].data;
          return `${fmtDate(date)}<br/>${FUEL_SHORT[fuel]}: ${fmtPrice(value)} грн/л`;
        },
      },
      xAxis: {
        type: 'time',
        ...AXIS_DEFAULTS,
        splitLine: { show: false },
        axisLabel: {
          ...AXIS_DEFAULTS.axisLabel,
          hideOverlap: true,
          formatter: (value: number) => fmtDateShort(new Date(value).toISOString().slice(0, 10)),
        },
      },
      yAxis: {
        type: 'value',
        scale: true,
        ...AXIS_DEFAULTS,
        axisLabel: {
          ...AXIS_DEFAULTS.axisLabel,
          formatter: (v: number) => fmtPrice(v, 0),
        },
      },
      dataZoom: [{ type: 'inside', throttle: 50 }],
      series: [
        {
          name: FUEL_SHORT[fuel],
          type: 'line',
          showSymbol: series.length < 40,
          symbolSize: 5,
          connectNulls: true,
          data: series.map(p => [p.date, p.value]),
          lineStyle: { color: CHART_COLORS.accent, width: 2 },
          itemStyle: { color: CHART_COLORS.accent },
          areaStyle: { color: 'rgba(0,210,170,0.07)' },
        },
      ],
    }),
    [series, fuel]
  );

  return (
    <div className="flex flex-col gap-2.5">
      {/* Хедер: breadcrumb + назва мережі */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <Link to="/" className="text-muted hover:text-accent text-xs no-underline">
          ← Всі мережі
        </Link>
        <h2 className="text-xl text-accent font-bold uppercase tracking-wider mt-1.5">{name}</h2>
        {net.regionCount !== undefined && (
          <div className="text-[10px] text-muted mt-0.5">
            медіана цін по {net.regionCount} областях
          </div>
        )}
      </motion.div>

      {/* Поточні ціни по видах пального */}
      {fuels.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {fuels.map((f, i) => (
            <StatCard
              key={f}
              label={FUEL_LABELS[f]}
              value={fmtPrice(net[f])}
              unit="грн/л"
              valueClass="text-accent"
              delay={0.04 * i}
            />
          ))}
        </div>
      )}

      {/* Графік історії вибраного пального */}
      <motion.div
        className="card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <div className="lbl mb-2">Історія ціни {FUEL_SHORT[fuel]}</div>
        {series.length < 2 ? (
          <div className="text-xs text-muted py-8 text-center">
            Історія цієї мережі накопичується — графік з'явиться за кілька днів
          </div>
        ) : (
          <Chart option={option} className="h-56 md:h-64" notMerge />
        )}
      </motion.div>

      {/* Статистика */}
      <div>
        <div className="lbl mb-2">Статистика ({FUEL_SHORT[fuel]})</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
          <StatCard
            label="Найвища ціна"
            value={stats.highest ? fmtPrice(stats.highest.value) : '—'}
            unit={stats.highest ? 'грн/л' : undefined}
            valueClass={stats.highest ? 'text-danger' : 'text-muted'}
            sub={stats.highest ? fmtDate(stats.highest.date) : 'немає даних'}
            delay={0.12}
          />
          <StatCard
            label="Найнижча ціна"
            value={stats.lowest ? fmtPrice(stats.lowest.value) : '—'}
            unit={stats.lowest ? 'грн/л' : undefined}
            valueClass={stats.lowest ? 'text-accent' : 'text-muted'}
            sub={stats.lowest ? fmtDate(stats.lowest.date) : 'немає даних'}
            delay={0.16}
          />
          <StatCard
            label="Середня за весь час"
            value={fmtPrice(stats.avgAll)}
            unit={stats.avgAll !== null ? 'грн/л' : undefined}
            valueClass={stats.avgAll !== null ? 'text-accent2' : 'text-muted'}
            delay={0.2}
          />
          <StatCard
            label="Тренд за місяць"
            value={stats.month ? `${arrow(stats.month.abs)} ${fmtSigned(stats.month.abs)} грн` : '—'}
            valueClass={stats.month ? changeColor(stats.month.abs) : 'text-muted'}
            sub={
              stats.month
                ? `з ${fmtDate(stats.month.fromDate)} · ${fmtPct(stats.month.pct)}`
                : 'замало даних'
            }
            delay={0.24}
          />
          <StatCard
            label="Тренд за рік"
            value={stats.year ? `${arrow(stats.year.abs)} ${fmtSigned(stats.year.abs)} грн` : '—'}
            valueClass={stats.year ? changeColor(stats.year.abs) : 'text-muted'}
            sub={
              stats.year
                ? `з ${fmtDate(stats.year.fromDate)} · ${fmtPct(stats.year.pct)}`
                : 'замало даних'
            }
            delay={0.28}
          />
          <StatCard
            label="vs середня по країні"
            value={vsCountry !== null ? `${arrow(vsCountry)} ${fmtSigned(vsCountry)} грн` : '—'}
            valueClass={vsCountry !== null ? changeColor(vsCountry) : 'text-muted'}
            sub="проти середньої по Україні зараз"
            delay={0.32}
          />
        </div>
      </div>

      {/* Ціни по областях */}
      <motion.div
        className="card p-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className="lbl mb-2">Ціна {FUEL_SHORT[fuel]} по областях</div>
        {regionRows.length === 0 ? (
          <div className="text-xs text-muted">Дані по областях відсутні</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-line">
                  <th className="lbl text-left py-1.5 px-2 font-normal">Область</th>
                  <th className="lbl text-right py-1.5 px-2 font-normal">
                    {FUEL_SHORT[fuel]}, грн/л
                  </th>
                  <th className="lbl text-right py-1.5 px-2 font-normal">vs медіана мережі</th>
                </tr>
              </thead>
              <tbody>
                {regionRows.map(r => (
                  <tr key={r.region} className="border-b border-line/50 hover:bg-accent/5">
                    <td className="py-1.5 px-2 whitespace-nowrap">
                      <Link
                        to={`/region/${encodeURIComponent(r.region)}`}
                        className="hover:text-accent"
                      >
                        {r.region}
                      </Link>
                    </td>
                    <td className="py-1.5 px-2 text-right text-accent">{fmtPrice(r.price)}</td>
                    <td className={`py-1.5 px-2 text-right ${changeColor(r.diff)}`}>
                      {fmtSigned(r.diff)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
