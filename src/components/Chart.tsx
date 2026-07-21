// Обгортка над ECharts: ініціалізація, resize, оновлення опцій
import { useEffect, useRef } from 'react';
import type { EChartsCoreOption, ECharts } from 'echarts/core';
import echarts from '../lib/echarts';

interface Props {
  option: EChartsCoreOption;
  className?: string;
  /** notMerge=true — повністю замінити опції (напр., при зміні діапазону) */
  notMerge?: boolean;
  onReady?: (chart: ECharts) => void;
}

export default function Chart({ option, className = 'h-64', notMerge = false, onReady }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    onReady?.(chart);
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge });
  }, [option, notMerge]);

  return <div ref={ref} className={className} />;
}
