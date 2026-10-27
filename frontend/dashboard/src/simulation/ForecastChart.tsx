import { memo, useId, useMemo, useState } from 'react';
import { scaleSymlog, ticks as valueTicks } from 'd3';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dollars, money } from '../finance';
import type { ForecastPoint } from '../SimulationModal';

export const ForecastChart = memo(function ForecastChart({
  points,
  realDollars,
}: {
  points: ForecastPoint[];
  realDollars: boolean;
}) {
  const [samples, setSamples] = useState(false);
  const [reference, setReference] = useState(true);
  const [compressed, setCompressed] = useState(false);
  const [early, setEarly] = useState(false);
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const visible = early ? points.filter((p) => p.year <= 5) : points;
  const values = visible
    .flatMap((p) => [
      p.p10,
      p.p50,
      p.p90,
      ...(reference ? [p.reference] : []),
      ...(samples ? Array.from({ length: 8 }, (_, i) => p[`path_${i}`]) : []),
    ])
    .filter(Number.isFinite);
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values);
  const padding = Math.max(100, (max - min) * 0.08);
  const domain: [number, number] = [min < 0 ? min - padding : 0, max > 0 ? max + padding : 0];
  if (domain[0] === domain[1]) domain[1] = 100;
  // Included a negative observation explicitly when automatic tick spacing
  // skipped it, keeping the opening debt position readable on compressed charts.
  const axisTicks = [
    ...new Set([0, ...valueTicks(domain[0], domain[1], 5), ...(min < 0 ? [min] : [])]),
  ].sort((a, b) => a - b);
  // Used a symmetric logarithmic scale only when selected, preserving zero and
  // negative balances rather than applying an invalid ordinary logarithm to debt.
  const scale = useMemo(() => scaleSymlog().constant(10000), []);
  const transform = (value: number) =>
    compressed ? Math.sign(value) * Math.log1p(Math.abs(value) / 10000) : value;
  // Matched the color boundary to the median line's own SVG bounds, keeping
  // negative sections red even when other paths expanded the chart's axis.
  const medianLow = Math.min(...visible.map((p) => p.p50));
  const medianHigh = Math.max(...visible.map((p) => p.p50));
  const medianSpan = transform(medianHigh) - transform(medianLow);
  const offset = medianSpan
    ? Math.max(0, Math.min(1, transform(medianHigh) / medianSpan))
    : medianHigh < 0
      ? 0
      : 1;
  return (
    <div className="forecast-plot">
      <div className="forecast-tools">
        <div className="segmented-control" aria-label="Chart time range">
          <button className={!early ? 'selected' : ''} onClick={() => setEarly(false)}>
            Full horizon
          </button>
          <button className={early ? 'selected' : ''} onClick={() => setEarly(true)}>
            First 5 years
          </button>
        </div>
        <label>
          <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />{' '}
          Sample paths
        </label>
        <label>
          <input
            type="checkbox"
            checked={reference}
            onChange={(e) => setReference(e.target.checked)}
          />{' '}
          Cashflow reference
        </label>
        <label title="Compresses large balances while keeping negative values and zero">
          <input
            type="checkbox"
            checked={compressed}
            onChange={(e) => setCompressed(e.target.checked)}
          />{' '}
          Compressed scale
        </label>
      </div>
      <div
        className="forecast-chart-surface"
        role="img"
        aria-label="Monte Carlo net worth forecast with negative balances below the zero line"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={visible.map((p) => ({ ...p, band: [p.p10, p.p90] }))}
            margin={{ top: 25, right: 20, bottom: 10, left: 2 }}
          >
            <defs>
              <linearGradient id={`${id}-band`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b8a3fa" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#778cdd" stopOpacity={0.03} />
              </linearGradient>
              <linearGradient id={`${id}-median`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={offset} stopColor="#7de0bc" />
                <stop offset={offset} stopColor="#ff879b" />
              </linearGradient>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop offset={offset} stopColor="#65d8b0" stopOpacity={0.1} />
                <stop offset={offset} stopColor="#ff718c" stopOpacity={0.12} />
              </linearGradient>
            </defs>
            {min < 0 && (
              <ReferenceArea
                y1={domain[0]}
                y2={0}
                fill="#ff6b88"
                fillOpacity={0.045}
                stroke="none"
              />
            )}
            <CartesianGrid strokeDasharray="3 7" stroke="#29364a" vertical={false} />
            <XAxis
              dataKey="year"
              tickFormatter={(v) => `Y${v}`}
              tick={{ fill: '#91a3bd', fontSize: 11 }}
              minTickGap={22}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={domain}
              ticks={axisTicks}
              scale={compressed ? scale : 'linear'}
              tickFormatter={(v) => money(v, true)}
              width={82}
              tick={{ fill: '#91a3bd', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              allowDataOverflow
            />
            <ReferenceLine
              y={0}
              stroke="#9caec5"
              strokeWidth={1.3}
              label={{
                value: '$0 · net worth breakeven',
                position: 'insideTopRight',
                fill: '#a6b7ce',
                fontSize: 10,
              }}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as ForecastPoint;
                return (
                  <div className="chart-tooltip forecast-tooltip">
                    <strong>
                      Year {point.year}{' '}
                      <small>{realDollars ? 'today’s dollars' : 'nominal dollars'}</small>
                    </strong>
                    {(['p90', 'p50', 'p10'] as const).map((key, i) => (
                      <div key={key}>
                        <span>
                          {['Upper outcome · P90', 'Median · P50', 'Lower outcome · P10'][i]}
                        </span>
                        <b className={point[key] < 0 ? 'negative' : ''}>{dollars(point[key])}</b>
                      </div>
                    ))}
                    {reference && (
                      <div className="tooltip-reference">
                        <span>Cashflow reference</span>
                        <b>{dollars(point.reference)}</b>
                      </div>
                    )}
                    {point.p50 < 0 && <p>Median liabilities still exceed assets.</p>}
                  </div>
                );
              }}
            />
            <Area
              dataKey="band"
              type="linear"
              stroke="none"
              fill={`url(#${id}-band)`}
              isAnimationActive={false}
              tooltipType="none"
            />
            {/* Retained one closed percentile envelope; removed the overlapping
                zero-baseline fill that obscured the band around negative values. */}
            {samples &&
              Array.from({ length: 8 }, (_, i) => (
                <Line
                  key={i}
                  dataKey={`path_${i}`}
                  stroke="#829bc0"
                  strokeOpacity={0.27}
                  strokeWidth={0.8}
                  dot={false}
                  activeDot={false}
                  isAnimationActive={false}
                  tooltipType="none"
                />
              ))}
            {reference && (
              <Line
                dataKey="reference"
                stroke="#a6b2c8"
                strokeDasharray="5 5"
                strokeWidth={1.3}
                dot={false}
                isAnimationActive={false}
              />
            )}
            <Line
              dataKey="p90"
              stroke="#a4a3f6"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="p10"
              stroke="#ee8ea8"
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="p50"
              stroke={`url(#${id}-median)`}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 5, fill: '#e9f6ff', stroke: '#10212c', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="forecast-plot-note">
        <span>
          <i className="legend-band" /> Middle 80% of simulated outcomes
        </span>
        <span>
          {compressed ? 'Compressed distances · signs retained' : 'Linear dollar scale'} ·{' '}
          {early ? 'First five years' : `${points.at(-1)?.year ?? 0}-year horizon`}
        </span>
      </div>
    </div>
  );
});
