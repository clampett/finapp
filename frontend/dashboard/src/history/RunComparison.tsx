import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dollars, money } from '../common/finance';
import type { SavedRun } from './run-store';

export function RunComparison({ runs }: { runs: [SavedRun, SavedRun] }) {
  const [a, b] = runs;
  const compatible =
    a.summary.years === b.summary.years &&
    Number(a.inputs.inflation_rate) === Number(b.inputs.inflation_rate);
  if (!compatible)
    return (
      <section className="history-detail">
        <h2>These runs use different horizons or inflation adjustments.</h2>
        <p className="history-explainer">
          Open each run separately, or choose two with the same horizon and inflation rate for an
          ending-value comparison. Comparing different timeframes as if they were equivalent would
          be misleading.
        </p>
      </section>
    );
  // Aligned saved medians by forecast year without rerunning either model or changing its inputs.
  const points = (a.result[a.summary.kind] ?? []).map((point, index) => ({
    year: point.year,
    a: point.p50,
    b: b.result[b.summary.kind]?.[index]?.p50,
  }));
  const delta = b.summary.p50 - a.summary.p50;
  return (
    <section className="history-detail">
      <span className="history-eyebrow">TWO PERSPECTIVES · SAME HORIZON</span>
      <h2>What changed between runs?</h2>
      <p className="history-explainer">
        {a.summary.title} → {b.summary.title}. The median ending value is {dollars(Math.abs(delta))}{' '}
        {delta < 0 ? 'lower' : 'higher'} in the second run. This comparison does not establish which
        input caused the difference.
      </p>
      <div
        className="history-chart"
        role="img"
        aria-label={`Median comparison of ${a.summary.title} and ${b.summary.title}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ left: 10, right: 20, top: 20, bottom: 5 }}>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 5" />
            <XAxis dataKey="year" tick={{ fill: 'var(--color-muted)', fontSize: 10 }} />
            <YAxis
              width={75}
              tickFormatter={(value) => money(Number(value), true)}
              tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--color-surface)',
                borderColor: 'var(--color-border)',
                borderRadius: 10,
              }}
              formatter={(value) => dollars(Number(value))}
              labelFormatter={(value) => `Year ${value}`}
            />
            <Legend />
            <Line
              dataKey="a"
              name={a.summary.title}
              stroke="var(--color-primary)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="b"
              name={b.summary.title}
              stroke="var(--color-blue)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="history-table-wrap">
        <table>
          <caption className="sr-only">Saved ending outcomes</caption>
          <thead>
            <tr>
              <th>Saved run</th>
              <th>P10</th>
              <th>P50</th>
              <th>P90</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr key={run.summary.id}>
                <th>{run.summary.title}</th>
                <td>{dollars(run.summary.p10)}</td>
                <td>{dollars(run.summary.p50)}</td>
                <td>{dollars(run.summary.p90)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
