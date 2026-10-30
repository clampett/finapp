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
    <div>
      {summary && (
        <div className="grid grid-cols-3 gap-3 mb-4.75 max-[500px]:grid-cols-1">
          <article className="border border-[color:var(--ui-border-2e3b50)] rounded-[10px] p-4.25 bg-[var(--ui-surface-131d2b)]">
            <span className="block text-[color:var(--ui-text-9aafc6)] text-[10px] leading-relaxed">Paths ending with positive net worth</span>
            <strong className="block text-[clamp(17px,1.8vw,25px)] font-medium text-[color:var(--ui-text-d6e9e2)] my-[10px_7px]">
              {(summary.probability_positive * 100).toFixed(1)}
              <small className="text-[13px] text-[color:var(--ui-text-94b8aa)] ml-0.75">%</small>
            </strong>
            <p className="text-[color:var(--ui-text-778fa9)] text-[9px] leading-[1.7] m-0">Share of 1,000 paths at the selected horizon.</p>
          </article>
          <article className="border border-[color:var(--ui-border-2e3b50)] rounded-[10px] p-4.25 bg-[var(--ui-surface-131d2b)]">
            <span className="block text-[color:var(--ui-text-9aafc6)] text-[10px] leading-relaxed">Paths reaching {money(summary.target, true)}</span>
            <strong className="block text-[clamp(17px,1.8vw,25px)] font-medium text-[color:var(--ui-text-d6e9e2)] my-[10px_7px]">
              {(summary.probability_target * 100).toFixed(1)}
              <small className="text-[13px] text-[color:var(--ui-text-94b8aa)] ml-0.75">%</small>
            </strong>
            <p className="text-[color:var(--ui-text-778fa9)] text-[9px] leading-[1.7] m-0">
              Measured in {realDollars ? 'today’s purchasing power' : 'nominal dollars'}; not a
              guarantee.
            </p>
          </article>
          <article className="border border-[color:var(--ui-border-2e3b50)] rounded-[10px] p-4.25 bg-[var(--ui-surface-131d2b)]">
            <span className="block text-[color:var(--ui-text-9aafc6)] text-[10px] leading-relaxed">Median net worth above zero</span>
            <strong className="block text-[clamp(17px,1.8vw,25px)] font-medium text-[color:var(--ui-text-d6e9e2)] my-[10px_7px]">
              {summary.first_positive_median_year === null
                ? 'Not reached'
                : summary.first_positive_median_year === 0
                  ? 'Already positive'
                  : `Year ${summary.first_positive_median_year}`}
            </strong>
            <p className="text-[color:var(--ui-text-778fa9)] text-[9px] leading-[1.7] m-0">A yearly observation, not an exact payoff date.</p>
          </article>
        </div>
      )}
      {bins.length > 0 && (
        <section className="bg-[var(--ui-surface-121c2a)] border border-[color:var(--ui-border-2e4056)] rounded-xl p-5">
          <div className="flex items-start justify-between gap-3.75">
            <div>
              <div className="text-[color:var(--ui-text-86c7b5)] text-[8px] tracking-[1.7px] font-semibold mb-2">AT THE FINISH LINE</div>
              <h3 className="text-[15px] my-1.75 font-medium text-text">Different paths. Different outcomes.</h3>
              <p className="text-[color:var(--ui-text-889eb8)] text-[10px] leading-relaxed m-0">
                Distribution of net worth after {final?.year} years ·{' '}
                {realDollars ? 'today’s dollars' : 'nominal dollars'}
              </p>
            </div>
            <span className="text-[9px] text-[color:var(--ui-text-a6c9c0)] bg-[var(--ui-surface-203933)] px-2.25 py-1.5 rounded-full whitespace-nowrap">1,000 paths</span>
          </div>
          <div
            className="h-47.5 my-[12px_8px]"
            role="img"
            aria-label="Histogram of final simulated net worth"
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bins.map((bin) => ({ ...bin, midpoint: (bin.lower + bin.upper) / 2 }))}
                margin={{ top: 12, right: 8, bottom: 0, left: -12 }}
              >
                <CartesianGrid vertical={false} stroke="var(--ui-paint-26334a)" strokeDasharray="3 6" />
                <XAxis
                  dataKey="midpoint"
                  tickFormatter={(v) => money(Number(v), true)}
                  minTickGap={50}
                  tick={{ fill: 'var(--ui-paint-91a1b8)', fontSize: 9 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fill: 'var(--ui-paint-91a1b8)', fontSize: 9 }} axisLine={false} tickLine={false} />
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
                      <div className="p-[13px_15px] bg-[var(--ui-surface-1c2638)] border border-[color:var(--ui-border-47536d)] rounded-[9px] shadow-[0_10px_30px_var(--ui-shadow-0005)] min-w-50 text-[11px]">
                        <strong className="block text-[11px] text-[color:var(--ui-text-d9e3f3)] mb-3">
                          {money(bin.lower)} to {money(bin.upper)}
                        </strong>
                        <p className="m-0 text-text">
                          {bin.count} paths · {(bin.share * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {bins.map((bin, i) => (
                    <Cell key={i} fill={bin.upper <= 0 ? 'var(--ui-paint-ec849e)' : 'var(--ui-paint-82cdb8)'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2.5 border-t border-[color:var(--ui-border-293a50)] pt-3.5">
            {(['p10', 'p50', 'p90'] as const).map((key, i) => (
              <span key={key} className="text-[color:var(--ui-text-88a0ba)] text-[9px]">
                {['P10 · lower', 'P50 · median', 'P90 · upper'][i]}
                <b className={`block text-base font-medium mt-1.75 ${(final?.[key] ?? 0) < 0 ? 'negative text-coral' : 'text-[color:var(--ui-text-d5dfef)]'}`}>
                  {money(final?.[key] ?? 0, true)}
                </b>
              </span>
            ))}
          </div>
        </section>
      )}
      <details className="mt-4.5 border border-[color:var(--ui-border-2b3c50)] rounded-[10px] overflow-hidden bg-[var(--ui-surface-111a26)]">
        <summary className="flex justify-between p-[15px_18px] text-xs cursor-pointer select-none [&::-webkit-details-marker]:hidden">
          Check the math year by year <span className="text-[color:var(--ui-text-7790ac)] text-[10px]">Budget, debt & forecast</span>
        </summary>
        <div className="flex gap-3.75 items-center justify-between p-[15px_18px] border-t border-[color:var(--ui-border-29384c)] max-[500px]:flex-col max-[500px]:items-stretch">
          <p className="text-[10px] leading-[1.7] text-[color:var(--ui-text-899fb8)] m-0">
            Cash flows and loan balances below are nominal. Forecast values use the chart’s selected
            dollar basis.
          </p>
          <button className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap border border-[color:var(--ui-border-344056)] rounded-[7px] px-3.25 py-2.25 bg-[var(--ui-surface-182131)] hover:bg-[var(--ui-surface-hover-232f43)] hover:border-[color:var(--ui-border-65738c)] text-[11px] font-medium min-h-8.5 cursor-pointer text-text" onClick={csv}>
            Export audit CSV ↓
          </button>
        </div>
        <div className="max-h-90 overflow-auto">
          <table className="w-full border-collapse text-[10px] whitespace-nowrap">
            <thead>
              <tr>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Year</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Income</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Tax estimate</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Living costs</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Loan payments</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Loans remaining</th>
                <th className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-[color:var(--ui-text-9fb3cb)] bg-[var(--ui-surface-1a2737)] sticky top-0 z-1 font-medium first:text-left">Median net worth{realDollars ? ' (real)' : ''}</th>
              </tr>
            </thead>
            <tbody>
              {(forecast.yearly_cashflow ?? []).map((row) => (
                <tr key={row.year}>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{row.year}</td>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{dollars(row.income)}</td>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{dollars(row.taxes)}</td>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{dollars(row.expenses)}</td>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{dollars(row.debt_payments)}</td>
                  <td className="text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums text-text first:text-left">{dollars(row.debt_remaining)}</td>
                  <td
                    className={`text-right p-[11px_15px] border-b border-[color:var(--ui-border-243246)] tabular-nums first:text-left ${
                      (points.find((p) => p.year === row.year)?.p50 ?? 0) < 0 ? 'negative text-coral' : 'text-text'
                    }`}
                  >
                    {dollars(points.find((p) => p.year === row.year)?.p50 ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {summary && (
          <p className="text-[10px] leading-[1.7] text-[color:var(--ui-text-899fb8)] p-[14px_18px] m-0">
            Median cumulative investment contributions: {dollars(summary.median_contributions)}{' '}
            nominal. Contributions are transfers into investments, not total net worth or guaranteed
            growth.
          </p>
        )}
      </details>
    </div>
  );
});
