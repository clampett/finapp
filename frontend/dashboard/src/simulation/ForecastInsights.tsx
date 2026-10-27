import { memo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dollars, money } from '../finance';
import type { SimulationResult } from '../SimulationModal';

export const ForecastInsights = memo(function ForecastInsights({
  forecast,
  mode,
  realDollars,
}: {
  forecast: SimulationResult;
  mode: 'monte_carlo' | 'markov';
  realDollars: boolean;
}) {
  const summary = forecast.summary,
    points = forecast[mode] ?? [];
  const final = points.at(-1),
    bins = forecast.ending_distribution ?? [];
  const csv = () => {
    // Exported raw numerical audit columns with explicit units so a chart's
    // purchasing-power values were not mistaken for nominal annual cash flows.
    const rows = [
      [
        'year',
        `p10_${realDollars ? 'real' : 'nominal'}_usd`,
        'p50_same_units',
        'p90_same_units',
        'cashflow_reference_same_units',
        'gross_income_nominal_usd',
        'tax_nominal_usd',
        'living_costs_nominal_usd',
        'debt_payments_nominal_usd',
        'debt_remaining_nominal_usd',
      ],
    ];
    for (const point of points) {
      const flow = forecast.yearly_cashflow?.find((row) => row.year === point.year);
      rows.push(
        [
          point.year,
          point.p10,
          point.p50,
          point.p90,
          point.reference,
          flow?.income ?? 0,
          flow?.taxes ?? 0,
          flow?.expenses ?? 0,
          flow?.debt_payments ?? 0,
          flow?.debt_remaining ?? '',
        ].map(String),
      );
    }
    const url = URL.createObjectURL(
      new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `finapp-${mode}-audit.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="forecast-insights">
      {summary && (
        <div className="outcome-card-grid">
          <article className="outcome-card">
            <span>Paths ending with positive net worth</span>
            <strong>
              {(summary.probability_positive * 100).toFixed(1)}
              <small>%</small>
            </strong>
            <p>Share of 1,000 paths at the selected horizon.</p>
          </article>
          <article className="outcome-card">
            <span>Paths reaching {money(summary.target, true)}</span>
            <strong>
              {(summary.probability_target * 100).toFixed(1)}
              <small>%</small>
            </strong>
            <p>
              Measured in {realDollars ? 'today’s purchasing power' : 'nominal dollars'}; not a
              guarantee.
            </p>
          </article>
          <article className="outcome-card">
            <span>Median net worth above zero</span>
            <strong>
              {summary.first_positive_median_year === null
                ? 'Not reached'
                : summary.first_positive_median_year === 0
                  ? 'Already positive'
                  : `Year ${summary.first_positive_median_year}`}
            </strong>
            <p>A yearly observation, not an exact payoff date.</p>
          </article>
        </div>
      )}
      {bins.length > 0 && (
        <section className="distribution-card">
          <div className="distribution-heading">
            <div>
              <div className="eyebrow">AT THE FINISH LINE</div>
              <h3>Different paths. Different outcomes.</h3>
              <p>
                Distribution of net worth after {final?.year} years ·{' '}
                {realDollars ? 'today’s dollars' : 'nominal dollars'}
              </p>
            </div>
            <span className="distribution-pill">1,000 paths</span>
          </div>
          <div
            className="distribution-chart"
            role="img"
            aria-label="Histogram of final simulated net worth"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bins.map((bin) => ({ ...bin, midpoint: (bin.lower + bin.upper) / 2 }))}
                margin={{ top: 12, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="#26334a" strokeDasharray="3 6" />
                <XAxis
                  dataKey="midpoint"
                  tickFormatter={(v) => money(Number(v), true)}
                  minTickGap={50}
                  tick={{ fill: '#91a1b8', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: '#91a1b8', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const bin = payload[0]!.payload as {
                      lower: number;
                      upper: number;
                      count: number;
                      share: number;
                    };
                    return (
                      <div className="chart-tooltip">
                        <strong>
                          {money(bin.lower)} to {money(bin.upper)}
                        </strong>
                        <p>
                          {bin.count} paths · {(bin.share * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {bins.map((bin, i) => (
                    <Cell key={i} fill={bin.upper <= 0 ? '#ec849e' : '#82cdb8'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="distribution-markers">
            {(['p10', 'p50', 'p90'] as const).map((key, i) => (
              <span key={key}>
                {['P10 · lower', 'P50 · median', 'P90 · upper'][i]}
                <b className={(final?.[key] ?? 0) < 0 ? 'negative' : ''}>
                  {money(final?.[key] ?? 0, true)}
                </b>
              </span>
            ))}
          </div>
        </section>
      )}
      <details className="annual-audit">
        <summary>
          Check the math year by year <span>Budget, debt & forecast</span>
        </summary>
        <div className="audit-toolbar">
          <p>
            Cash flows and loan balances below are nominal. Forecast values use the chart’s selected
            dollar basis.
          </p>
          <button className="button" onClick={csv}>
            Export audit CSV ↓
          </button>
        </div>
        <div className="audit-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Year</th>
                <th>Income</th>
                <th>Tax estimate</th>
                <th>Living costs</th>
                <th>Loan payments</th>
                <th>Loans remaining</th>
                <th>Median net worth{realDollars ? ' (real)' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {(forecast.yearly_cashflow ?? []).map((row) => (
                <tr key={row.year}>
                  <td>{row.year}</td>
                  <td>{dollars(row.income)}</td>
                  <td>{dollars(row.taxes)}</td>
                  <td>{dollars(row.expenses)}</td>
                  <td>{dollars(row.debt_payments)}</td>
                  <td>{dollars(row.debt_remaining)}</td>
                  <td
                    className={
                      (points.find((p) => p.year === row.year)?.p50 ?? 0) < 0 ? 'negative' : ''
                    }
                  >
                    {dollars(points.find((p) => p.year === row.year)?.p50 ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary && (
          <p className="audit-note">
            Median cumulative investment contributions: {dollars(summary.median_contributions)}{' '}
            nominal. Contributions are transfers into investments, not total net worth or guaranteed
            growth.
          </p>
        )}
      </details>
    </div>
  );
});
