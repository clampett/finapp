import { useEffect, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Line,
  ReferenceLine,
} from 'recharts';
import { API_BASE, downloadJson, money } from './finance';
import type { GraphData, SimulationType } from './finance';
type ForecastPoint = {
  year: number;
  p10: number;
  p50: number;
  p90: number;
};
type DebtRow = {
  month: number;
  freed_cash_flow: number;
  [key: string]: number;
};
type DebtSummary = {
  paid_off: boolean;
  months: number | null;
  remaining_balance: number;
  total_interest: number;
  monthly_budget: number;
};
interface SimulationResult {
  // Documented the wire response here so chart fields could be traced back to
  // the metrics, percentile paths, and debt summaries returned by Python.
  status: string;
  metrics: {
    initial_investment: number;
    monthly_contribution: number;
    monthly_income: number;
    monthly_expenses: number;
    minimum_debt_payments: number;
    monthly_surplus: number;
    years: number;
    no_growth_baseline?: number;
  };
  monte_carlo?: ForecastPoint[];
  markov?: ForecastPoint[];
  debt?: Record<'avalanche' | 'snowball', DebtRow[]>;
  debt_summary?: Record<'avalanche' | 'snowball', DebtSummary>;
  debt_labels?: Record<string, string>;
  assumptions: string[];
}
const palette = ['#fb7185', '#fbbf24', '#a78bfa', '#22d3ee', '#34d399', '#60a5fa'];
const quantiles = [
  { key: 'p90', label: 'Upper outcome (P90)', color: '#34d399' },
  { key: 'p50', label: 'Median (P50)', color: '#a78bfa' },
  { key: 'p10', label: 'Lower outcome (P10)', color: '#fb7185' },
];
const titles = {
  monte_carlo: 'Lifetime wealth projection',
  markov: 'Markov wealth forecast',
  debt: 'Debt payoff optimizer',
};
const duration = (months: number) => `${Math.floor(months / 12)} yrs, ${months % 12} mos`;
export function SimulationModal({
  graphData,
  simulationType,
  onClose,
}: {
  graphData: GraphData;
  simulationType: SimulationType;
  onClose: () => void;
}) {
  const [forecast, setForecast] = useState<SimulationResult | null>(null);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [rate, setRate] = useState(100);
  const [inflation, setInflation] = useState(false);
  const [years, setYears] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Trapped keyboard focus inside the dialog and restored the previous
    // control on close, keeping keyboard navigation within the active task.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab') {
        const elements = Array.from(
          dialog.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input, select, [tabindex="0"]',
          ) ?? [],
        ).filter((e) => e.getClientRects().length);
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          event.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || document.activeElement === dialog.current)
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [onClose]);
  useEffect(() => {
    const controller = new AbortController();
    // Debounced slider changes and aborted superseded requests, preventing
    // an older forecast from replacing a newer selection after a slow response.
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 15000);
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const payload = {
          // Converted browser field names into the Python API contract;
          // node balances and monthly flow values retained their units.
          investment_rate: rate,
          inflation_rate: inflation ? 0.025 : 0,
          sim_type: simulationType,
          years,
          nodes: graphData.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.nodeType,
            balance: n.amountOrBalance,
            apr: n.interestRateApr,
            ...(n.minPayment != null ? { min_payment: n.minPayment } : {}),
          })),
          edges: graphData.edges.map((e) => ({
            source: e.sourceNodeId,
            target: e.targetNodeId,
            monthly_fixed_flow: e.monthlyFixedFlow,
            percentage_flow: e.percentageFlow,
          })),
        };
        const response = await fetch(`${API_BASE}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok || data.status !== 'success') {
          const detail = Array.isArray(data.detail)
            ? data.detail.map((d: { msg: string }) => d.msg).join('; ')
            : data.detail;
          throw new Error(
            data.message || detail || `The simulation could not run (${response.status}).`,
          );
        }
        if (
          !data.metrics ||
          !Array.isArray(simulationType === 'debt' ? data.debt?.avalanche : data[simulationType])
        )
          throw new Error('The simulation server returned an unexpected result.');
        if (!controller.signal.aborted) setForecast(data);
      } catch (err) {
        if (!controller.signal.aborted || timedOut) {
          setForecast(null);
          setError(
            timedOut
              ? 'The simulation took too long. Check the Python service and try again.'
              : err instanceof Error
                ? err.message
                : 'Unable to reach the simulation service.',
          );
        }
      } finally {
        clearTimeout(timeout);
        if (!controller.signal.aborted || timedOut) setLoading(false);
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      clearTimeout(timeout);
      controller.abort();
    };
  }, [graphData, rate, inflation, simulationType, years, retry]);
  // Prepared the P10-P90 envelope from year-specific quantiles; these bounds
  // represented a distribution, not one continuous bull or bear market path.
  const points = (simulationType === 'monte_carlo' ? forecast?.monte_carlo : forecast?.markov)?.map(
    (p) => ({ ...p, band: [p.p10, p.p90] }),
  );
  const debtRows = forecast?.debt?.[strategy] ?? [];
  const summary = forecast?.debt_summary?.[strategy];
  const labels = forecast?.debt_labels ?? {};
  const debtKeys = Object.keys(labels);
  const final = points?.[points.length - 1];
  const metrics = forecast?.metrics;
  const comparison = forecast?.debt_summary?.[strategy === 'avalanche' ? 'snowball' : 'avalanche'];
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="simulation-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-title"
        tabIndex={-1}
      >
        <header className="modal-header">
          <div>
            <div className="eyebrow">
              SCENARIO LAB{' '}
              <span> / {simulationType === 'debt' ? 'REPAYMENT' : '1,000 SIMULATED PATHS'}</span>
            </div>
            <h2 id="simulation-title">{titles[simulationType]}</h2>
            <p>
              {simulationType === 'monte_carlo'
                ? 'Explore a distribution of future net worth, including cash and debt.'
                : simulationType === 'markov'
                  ? 'Explore how changing bull and bear markets affect your financial plan.'
                  : 'Compare repayment priorities using the same monthly budget.'}
            </p>
          </div>
          <button
            className="icon-button close-button"
            aria-label="Close simulation"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="simulation-body">
          <div className="simulation-main">
            <div className="chart-toolbar">
              <div className="chart-legend">
                {simulationType !== 'debt'
                  ? [...quantiles].reverse().map((q) => (
                      <span key={q.key}>
                        <i style={{ background: q.color }} />
                        {q.label}
                      </span>
                    ))
                  : debtKeys.map((key, i) => (
                      <span key={key}>
                        <i style={{ background: palette[i % palette.length] }} />
                        {labels[key]}
                      </span>
                    ))}
              </div>
              <span className="chart-unit">
                {inflation && simulationType !== 'debt' ? 'TODAY’S USD' : 'USD'}
              </span>
            </div>
            <div className="simulation-chart" aria-busy={loading}>
              {error ? (
                <div className="chart-state" role="alert">
                  <h3>Let’s get this running</h3>
                  <p>{error}</p>
                  <button
                    className="button primary"
                    onClick={() => {
                      setLoading(true);
                      setError('');
                      setRetry((n) => n + 1);
                    }}
                  >
                    Try again
                  </button>
                </div>
              ) : !forecast ? (
                <div className="chart-state" role="status">
                  Calculating your scenario…
                </div>
              ) : (
                <>
                  {loading && (
                    <span className="updating-label" role="status">
                      Updating scenario…
                    </span>
                  )}
                  <ResponsiveContainer width="100%" height="100%">
                    {simulationType !== 'debt' ? (
                      <ComposedChart
                        data={points}
                        margin={{ top: 20, right: 16, bottom: 8, left: 4 }}
                      >
                        <defs>
                          <linearGradient id="forecast-band" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.18} />
                            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.04} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 5" stroke="#263044" vertical={false} />
                        <XAxis
                          dataKey="year"
                          interval="preserveStartEnd"
                          minTickGap={24}
                          tick={{ fill: '#93a1b8', fontSize: 11 }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          width={72}
                          tickFormatter={(v) => money(v, true)}
                          tick={{ fill: '#93a1b8', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                          domain={([min, max]) => [Math.min(0, min), Math.max(0, max)]}
                          allowDataOverflow
                        />
                        <ReferenceLine y={0} stroke="#60708a" strokeDasharray="4 4" />
                        <Tooltip
                          content={({ active, payload, label }) =>
                            active && payload?.length ? (
                              <div className="chart-tooltip">
                                <strong>Year {label}</strong>
                                {quantiles.map((q) => {
                                  const point = points?.find((p) => p.year === Number(label));
                                  return point ? (
                                    <div key={q.key} style={{ color: q.color }}>
                                      <span>{q.label}</span>
                                      <b>{money(point[q.key as 'p10' | 'p50' | 'p90'])}</b>
                                    </div>
                                  ) : null;
                                })}
                              </div>
                            ) : null
                          }
                        />
                        <Area
                          dataKey="band"
                          type="linear"
                          fill="url(#forecast-band)"
                          stroke="none"
                          tooltipType="none"
                          isAnimationActive={false}
                        />
                        {quantiles.map((q) => (
                          <Line
                            key={q.key}
                            type="linear"
                            dataKey={q.key}
                            name={q.label}
                            stroke={q.color}
                            strokeWidth={q.key === 'p50' ? 2.8 : 1.8}
                            dot={false}
                            activeDot={{ r: 4, stroke: '#10141f', strokeWidth: 2 }}
                            isAnimationActive={false}
                          />
                        ))}
                      </ComposedChart>
                    ) : (
                      <AreaChart
                        data={debtRows}
                        margin={{ top: 20, right: 16, bottom: 8, left: 4 }}
                      >
                        <CartesianGrid strokeDasharray="3 5" stroke="#263044" vertical={false} />
                        <XAxis
                          dataKey="month"
                          minTickGap={30}
                          tickFormatter={(v) => `${v} mo`}
                          tick={{ fill: '#93a1b8', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          width={72}
                          tickFormatter={(v) => money(v, true)}
                          tick={{ fill: '#93a1b8', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload, label }) =>
                            active && payload?.length ? (
                              <div className="chart-tooltip">
                                <strong>Month {label}</strong>
                                {payload.map((p, i) => (
                                  <div
                                    key={String(p.dataKey)}
                                    style={{ color: palette[i % palette.length] }}
                                  >
                                    <span>{labels[String(p.dataKey)]}</span>
                                    <b>{money(Number(p.value))}</b>
                                  </div>
                                ))}
                              </div>
                            ) : null
                          }
                        />
                        {debtKeys.map((key, i) => (
                          <Area
                            key={key}
                            type="linear"
                            dataKey={key}
                            name={labels[key]}
                            stackId="debt"
                            fill={palette[i % palette.length]}
                            stroke={palette[i % palette.length]}
                            fillOpacity={0.25}
                            isAnimationActive={false}
                          />
                        ))}
                      </AreaChart>
                    )}
                  </ResponsiveContainer>
                </>
              )}
            </div>
            <div className="chart-caption">
              <span>{simulationType === 'debt' ? 'Months from today' : 'Years from today'}</span>
              <span>
                {simulationType === 'debt'
                  ? 'Remaining debt balance'
                  : 'Net worth = cash + investments − debt'}
              </span>
            </div>
            {forecast && !loading && !error && (
              <div className="result-strip">
                {simulationType !== 'debt' ? (
                  <>
                    <div>
                      <span>Starting net worth</span>
                      <strong>{money(metrics!.initial_investment)}</strong>
                    </div>
                    <div>
                      <span>Year {years} median</span>
                      <strong className={final && final.p50 < 0 ? 'negative' : 'positive'}>
                        {money(final?.p50 ?? 0)}
                      </strong>
                    </div>
                    <div>
                      <span>Monthly surplus</span>
                      <strong className={metrics!.monthly_surplus < 0 ? 'negative' : ''}>
                        {money(metrics!.monthly_surplus)}
                      </strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span>
                        {summary?.paid_off ? 'Debt-free in' : `Debt remaining after ${years} years`}
                      </span>
                      <strong className={summary?.paid_off ? 'positive' : 'negative'}>
                        {summary?.paid_off
                          ? duration(summary.months!)
                          : money(summary?.remaining_balance ?? 0)}
                      </strong>
                    </div>
                    <div>
                      <span>Interest accrued</span>
                      <strong>{money(summary?.total_interest ?? 0)}</strong>
                    </div>
                    <div>
                      <span>Monthly payment budget</span>
                      <strong>{money(summary?.monthly_budget ?? 0)}</strong>
                    </div>
                  </>
                )}
              </div>
            )}
            {simulationType === 'debt' && summary && !loading && !summary.paid_off && (
              <div className="notice warning">
                This budget does not clear your debt within {years} years. The last chart point is
                not a payoff date.
              </div>
            )}
            {simulationType === 'debt' && comparison && summary && !loading && (
              <p className="muted small comparison-note">
                {Math.abs(comparison.total_interest - summary.total_interest) < 0.01
                  ? 'Both strategies accrue the same interest in this scenario.'
                  : `${strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} accrues ${money(Math.abs(comparison.total_interest - summary.total_interest))} ${summary.total_interest < comparison.total_interest ? 'less' : 'more'} interest than the alternative over this horizon.`}
              </p>
            )}
          </div>
          <aside className="simulation-sidebar">
            <section className="simulation-controls">
              <div className="eyebrow">YOUR ASSUMPTIONS</div>
              <h3>Make it your scenario</h3>
              <label className="control-label">
                Time horizon
                <select
                  value={years}
                  onChange={(e) => {
                    setLoading(true);
                    setError('');
                    setYears(Number(e.target.value));
                  }}
                >
                  {[5, 10, 20, 30, 40, 50].map((y) => (
                    <option key={y} value={y}>
                      {y} years
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-label" htmlFor="allocation">
                {simulationType === 'debt' ? 'Extra surplus toward debt' : 'Surplus invested'}
                <strong>{rate}%</strong>
              </label>
              <input
                id="allocation"
                type="range"
                min={0}
                max={100}
                step={1}
                value={rate}
                onChange={(e) => {
                  setLoading(true);
                  setError('');
                  setRate(Number(e.target.value));
                }}
              />
              <p className="muted small">
                {simulationType === 'debt'
                  ? 'Minimum payments are included once. This adds a share of your remaining monthly surplus.'
                  : 'The remainder stays in cash. A 0% allocation does not remove your income or expenses.'}
              </p>
              {simulationType !== 'debt' && (
                <label className="toggle-row">
                  <span>
                    Adjust for inflation<small>2.5% annually · today’s purchasing power</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={inflation}
                    onChange={(e) => {
                      setLoading(true);
                      setError('');
                      setInflation(e.target.checked);
                    }}
                  />
                </label>
              )}
              {simulationType === 'debt' && (
                <div className="strategy-switch">
                  {(['avalanche', 'snowball'] as const).map((s) => (
                    <button
                      key={s}
                      className={strategy === s ? 'selected' : ''}
                      onClick={() => setStrategy(s)}
                    >
                      <strong>{s === 'avalanche' ? 'Avalanche' : 'Snowball'}</strong>
                      <small>
                        {s === 'avalanche' ? 'Highest APR first' : 'Smallest balance first'}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {simulationType !== 'debt' && (
              <section className="chart-guide">
                <h3>How to read this chart</h3>
                {quantiles.map((q) => (
                  <div className="guide-item" key={q.key}>
                    <i style={{ background: q.color }} />
                    <div>
                      <strong style={{ color: q.color }}>{q.label}</strong>
                      <p>
                        {q.key === 'p90'
                          ? '90% of modeled outcomes fall below this value. It is an optimistic outcome, not a guaranteed bull market.'
                          : q.key === 'p50'
                            ? 'Half of modeled outcomes are above this value and half below. This is the median across 1,000 simulations.'
                            : '10% of modeled outcomes fall below this value. More severe losses are still possible.'}
                      </p>
                    </div>
                  </div>
                ))}
                <p className="muted small">
                  The shaded band spans P10–P90 at each year. These curves are percentiles, not
                  three individual market paths.
                </p>
              </section>
            )}
            {metrics && !loading && simulationType !== 'debt' && (
              <section>
                <h3>What drives the result?</h3>
                <dl className="breakdown">
                  <div>
                    <dt>Monthly income</dt>
                    <dd>{money(metrics.monthly_income)}</dd>
                  </div>
                  <div>
                    <dt>Living expenses</dt>
                    <dd>−{money(metrics.monthly_expenses)}</dd>
                  </div>
                  <div>
                    <dt>Debt payments</dt>
                    <dd>−{money(metrics.minimum_debt_payments)}</dd>
                  </div>
                  <div>
                    <dt>Initial investment /mo</dt>
                    <dd>{money(metrics.monthly_contribution)}</dd>
                  </div>
                  <div>
                    <dt>No-growth reference</dt>
                    <dd>{money(metrics.no_growth_baseline ?? 0)}</dd>
                  </div>
                </dl>
                <p className="muted small">
                  The reference uses the same cash flows and debt schedule without asset growth,
                  expressed in the chart’s dollars.
                </p>
              </section>
            )}
            <details className="model-details">
              <summary>Model assumptions</summary>
              <ul>
                {(
                  forecast?.assumptions ?? [
                    'Start the Java and Python services to calculate this scenario.',
                  ]
                ).map((a) => (
                  <li key={a}>{a}</li>
                ))}
                {simulationType === 'monte_carlo' && (
                  <li>Investment return assumption: 10% annual growth, 15% annual volatility.</li>
                )}
                {simulationType === 'markov' && (
                  <li>
                    Monthly regimes: bull mean +0.8%, volatility 3.5%; bear mean −2%, volatility 8%.
                    Transition probabilities: bull→bear 5%, bear→bull 15%.
                  </li>
                )}
                <li>
                  A fixed random seed makes comparisons repeatable. Taxes, changing salaries, and
                  trading are not modeled.
                </li>
              </ul>
            </details>
          </aside>
        </div>
        <footer className="modal-footer">
          <span>
            Educational scenario modeling ·{' '}
            {inflation && simulationType !== 'debt' ? 'Inflation adjusted' : 'Nominal dollars'}
          </span>
          <button
            className="button"
            disabled={!forecast || loading || !!error}
            onClick={() => downloadJson(forecast, `finapp-${simulationType}-${years}y.json`)}
          >
            Export results ↓
          </button>
        </footer>
      </div>
    </div>
  );
}
