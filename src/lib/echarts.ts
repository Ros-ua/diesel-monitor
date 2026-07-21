// Легка збірка ECharts: реєструємо лише те, що використовуємо
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  LegendComponent,
  CanvasRenderer,
]);

export default echarts;

export const CHART_COLORS = {
  accent: '#00d2aa',
  accent2: '#00aaff',
  warn: '#ffb347',
  danger: '#ff5f5f',
  purple: '#aa88ff',
  muted: '#5a7a72',
  grid: 'rgba(0,210,170,0.07)',
  border: 'rgba(0,210,170,0.15)',
};

/** Спільні дефолти для осей/тултіпів у стилі терміналу */
export const AXIS_DEFAULTS = {
  axisLabel: { color: CHART_COLORS.muted, fontFamily: "'Courier New', monospace", fontSize: 10 },
  axisLine: { lineStyle: { color: CHART_COLORS.border } },
  splitLine: { lineStyle: { color: CHART_COLORS.grid } },
};

export const TOOLTIP_DEFAULTS = {
  backgroundColor: '#111820',
  borderColor: CHART_COLORS.border,
  textStyle: { color: '#e0ede9', fontFamily: "'Courier New', monospace", fontSize: 11 },
};
