// Головний інтерактивний графік динаміки цін (стиль TradingView)
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import type { EChartsCoreOption } from 'echarts/core';
import Chart from './Chart';
import { useAppData } from '../context/DataContext';
import { useFuel } from '../context/FuelContext';
import { avgSeries, clipRange, toTime, type SeriesPoint } from '../lib/stats';
import { fmtDate, fmtDateShort, fmtPrice } from '../lib/format';
import { AXIS_DEFAULTS, CHART_COLORS, TOOLTIP_DEFAULTS } from '../lib/echarts';
import { FUEL_SHORT } from '../types';

const RANGES: { label: string; days: number | null }[] = [
  { label: '7Д', days: 7 },
  { label: '30Д', days: 30 },
  { label: '90Д', days: 90 },
  { label: '6М', days: 183 },
  { label: '1Р', days: 365 },
  { label: 'ВСЕ', days: null },
];

const WEEK_MS = 7 * 86_400_000;

const isoFromMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

interface AxisTooltipParam {
  value?: [string | number, number];
}

function buildOption(pts: SeriesPoint[], longRange: boolean): EChartsCoreOption {
  const mono = "'Courier New', monospace";
  return {
    grid: { left: 46, right: 14, top: 16, bottom: 54 },
    tooltip: {
      ...TOOLTIP_DEFAULTS,
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        lineStyle: { color: CHART_COLORS.border },
        crossStyle: { color: CHART_COLORS.border },
        label: {
          backgroundColor: '#111820',
          borderColor: CHART_COLORS.border,
          borderWidth: 1,
          color: '#e0ede9',
          fontFamily: mono,
          fontSize: 10,
          formatter: (p: { axisDimension?: string; value: number | string }) =>
            p.axisDimension === 'x'
              ? fmtDateShort(isoFromMs(Number(p.value)))
              : fmtPrice(Number(p.value)),
        },
      },
      formatter: (params: AxisTooltipParam | AxisTooltipParam[]) => {
        const p = Array.isArray(params) ? params[0] : params;
        if (!p?.value) return '';
        const [date, value] = p.value;
        return `${fmtDate(String(date))}<br/><b style="color:${CHART_COLORS.accent}">${fmtPrice(value)} грн/л</b>`;
      },
    },
    xAxis: {
      type: 'time',
      ...AXIS_DEFAULTS,
      splitLine: { show: false },
      axisLabel: {
        ...AXIS_DEFAULTS.axisLabel,
        hideOverlap: true,
        formatter: (value: number) =>
          longRange ? fmtDate(isoFromMs(value)) : fmtDateShort(isoFromMs(value)),
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
      ...AXIS_DEFAULTS,
      axisLabel: {
        ...AXIS_DEFAULTS.axisLabel,
        formatter: (value: number) => fmtPrice(value, 1),
      },
    },
    dataZoom: [
      { type: 'inside' },
      {
        type: 'slider',
        height: 18,
        bottom: 8,
        borderColor: CHART_COLORS.border,
        fillerColor: 'rgba(0,210,170,0.1)',
        backgroundColor: 'transparent',
        textStyle: { color: CHART_COLORS.muted, fontFamily: mono, fontSize: 9 },
        handleStyle: { color: CHART_COLORS.accent, borderColor: CHART_COLORS.border },
        moveHandleStyle: { color: CHART_COLORS.border },
        dataBackground: {
          lineStyle: { color: CHART_COLORS.border },
          areaStyle: { color: CHART_COLORS.grid },
        },
        selectedDataBackground: {
          lineStyle: { color: CHART_COLORS.accent },
          areaStyle: { color: 'rgba(0,210,170,0.1)' },
        },
        labelFormatter: (value: number) => fmtDateShort(isoFromMs(value)),
      },
    ],
    series: [
      {
        type: 'line',
        smooth: 0.3,
        connectNulls: true,
        symbol: 'circle',
        symbolSize: 4,
        showSymbol: pts.length < 40,
        lineStyle: { color: '#00d2aa', width: 1.5 },
        itemStyle: { color: '#00d2aa', borderColor: '#0a0e12' },
        areaStyle: { color: 'rgba(0,210,170,0.07)' },
        data: pts.map(p => [p.date, p.value]),
      },
    ],
  };
}

export default function PriceChart() {
  const { history } = useAppData();
  const { fuel } = useFuel();
  const [rangeDays, setRangeDays] = useState<number | null>(90);

  const fullSeries = useMemo(() => avgSeries(history.days, fuel), [history.days, fuel]);
  const pts = useMemo(() => clipRange(fullSeries, rangeDays), [fullSeries, rangeDays]);

  // Розріджені архівні дані: розрив понад 7 днів між сусідніми точками
  const hasSparse = useMemo(() => {
    for (let i = 1; i < pts.length; i++) {
      if (toTime(pts[i].date) - toTime(pts[i - 1].date) > WEEK_MS) return true;
    }
    return false;
  }, [pts]);

  const longRange = rangeDays === null || rangeDays > 320;
  const option = useMemo(() => buildOption(pts, longRange), [pts, longRange]);

  return (
    <motion.div
      className="card p-3 h-full"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <div className="lbl">Динаміка цін — {FUEL_SHORT[fuel]}</div>
        <div className="ml-auto flex flex-wrap gap-1">
          {RANGES.map(r => (
            <button
              key={r.label}
              type="button"
              onClick={() => setRangeDays(r.days)}
              className={`${r.days === rangeDays ? 'btn' : 'btn btn-ghost'} px-2! py-0.5! text-[10px]!`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {pts.length === 0 ? (
        <div className="h-72 md:h-80 flex items-center justify-center text-muted text-xs tracking-[0.15em] uppercase">
          Замало даних за період
        </div>
      ) : (
        <>
          <Chart option={option} className="h-72 md:h-80" notMerge />
          {hasSparse && (
            <div className="text-[9px] text-muted mt-1.5">
              · розріджені історичні точки (архів) з&apos;єднано лінією
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
