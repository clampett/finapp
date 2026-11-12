import { money } from '../finance';
import type { CoachComparison } from '../scenarioCoach';
import { memo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
const secondary =
  'cursor-pointer rounded-lg border border-border px-3 py-2 text-sm text-text hover:bg-hover-bg disabled:opacity-50';
const probability = (value: number) => `${(value * 100).toFixed(1)}%`;
// Reused the plotted result while chat input changed so typing did not redraw the forecast chart.
export const Comparison = memo(function Comparison({ result }: { result: CoachComparison }) {
  const [metric, setMetric] = useState<'p10' | 'p50' | 'p90'>('p50');
  // Joined actual forecast years instead of interpolating outcomes from the ending balances.
  const stressYears = new Map(result.stress.path?.map((point) => [point.year, point]));
  const chart =
    result.baseline.path?.map((point) => ({
      year: point.year,
      baseline: point[metric],
      stress: stressYears.get(point.year)?.[metric],
    })) ?? [];
  // Presented both runs at the same horizon and kept percentages separate from dollar values.
  const delta = result.stress.median - result.baseline.median;
  const rows = [
    ['Median ending net worth (P50)', money(result.baseline.median), money(result.stress.median)],
    [
      'Downside ending net worth (P10)',
      money(result.baseline.downside),
      money(result.stress.downside),
    ],
    [
      'Chance of reaching the target',
      probability(result.baseline.targetChance),
      probability(result.stress.targetChance),
    ],
  ];
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h4 className="m-0 text-base font-semibold text-text">{result.years}-year comparison</h4>
      <p className="mt-1 text-sm text-muted">
        {delta === 0
          ? 'Median ending net worth stayed the same.'
          : `Median ending net worth was ${money(Math.abs(delta))} ${delta < 0 ? 'lower' : 'higher'} in the stress case.`}
      </p>
      {!!chart.length && (
        <div className="my-5">
          <div className="mb-3 flex flex-wrap gap-2" aria-label="Chart outcome">
            {(['p10', 'p50', 'p90'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={metric === value}
                onClick={() => setMetric(value)}
                className={`${secondary} ${metric === value ? 'border-active-border bg-active-bg text-active-text' : ''}`}
              >
                {value === 'p10'
                  ? 'Downside · P10'
                  : value === 'p50'
                    ? 'Middle · P50'
                    : 'Upper · P90'}
              </button>
            ))}
          </div>
          <div
            className="h-64 w-full"
            role="img"
            aria-label={`Baseline and stress-case ${metric} ending net worth by forecast year`}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid
                  stroke="var(--ui-paint-29364a)"
                  strokeDasharray="3 6"
                  vertical={true}
                />
                <XAxis dataKey="year" tick={{ fill: 'var(--ui-paint-91a3bd)', fontSize: 11 }} />
                <YAxis
                  tickFormatter={(value) => money(Number(value))}
                  width={75}
                  tick={{ fill: 'var(--ui-paint-91a3bd)', fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="var(--ui-paint-91a3bd)" strokeDasharray="4 4" />
                <Tooltip
                  content={({ active, payload, label }) =>
                    !active || !payload?.length ? null : (
                      <div className="rounded-xl border border-border bg-surface p-3 text-xs text-text shadow-lg">
                        <strong>Year {label}</strong>
                        {payload.map((item) => (
                          <p className="mb-0 mt-1" key={String(item.dataKey)}>
                            {item.name} · {money(Number(item.value))}
                          </p>
                        ))}
                      </div>
                    )
                  }
                />
                <Legend />
                <Line
                  dataKey="baseline"
                  name="Baseline"
                  stroke="var(--color-primary)"
                  dot={false}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
                <Line
                  dataKey="stress"
                  name="Stress case"
                  stroke="var(--color-coral)"
                  dot={false}
                  strokeWidth={2.5}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted">
            Each point is a percentile across simulated paths at that year. The chart is a
            distribution summary.
          </p>
        </div>
      )}
      <table className="w-full border-collapse text-left text-xs sm:text-sm">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-2">
              Metric
            </th>
            <th scope="col" className="py-2 text-right">
              Baseline
            </th>
            <th scope="col" className="py-2 text-right">
              Stress case
            </th>
          </tr>
        </thead>
        <tbody className="text-text">
          {rows.map(([label, baseline, stress]) => (
            <tr key={label} className="border-t border-border">
              <th scope="row" className="py-2 pr-2 font-medium">
                {label}
              </th>
              <td className="py-2 pl-1 text-right tabular-nums">{baseline}</td>
              <td className="py-2 pl-1 text-right tabular-nums">{stress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});
