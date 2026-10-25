import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  API_BASE,
  allocations,
  assumptionsFor,
  dollars,
  downloadJson,
  money,
  totals,
} from './finance';
import type { GraphData, ScenarioAssumptions, SimulationType } from './finance';
import { BudgetControls } from './components/BudgetControls';
import { ForecastChart } from './simulation/ForecastChart';
import { ForecastInsights } from './simulation/ForecastInsights';
import { SimulationGuide } from './simulation/SimulationGuide';
export type ForecastPoint = {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  reference: number;
  [key: string]: number;
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
export interface SimulationResult {
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
    monthly_taxes: number;
    take_home_income: number;
    planned_investment: number;
    planned_savings: number;
    unassigned_surplus: number;
    monthly_cash_saving: number;
  };
  monte_carlo?: ForecastPoint[];
  markov?: ForecastPoint[];
  debt?: Record<'avalanche' | 'snowball', DebtRow[]>;
  debt_summary?: Record<'avalanche' | 'snowball', DebtSummary>;
  debt_labels?: Record<string, string>;
  assumptions: string[];
  warnings?: string[];
  summary?: {
    probability_positive: number;
    probability_target: number;
    target: number;
    median_contributions: number;
    median_borrowing: number;
    first_positive_median_year: number | null;
  };
  market_data?: {
    status: string;
    source: string;
    ticker?: string;
    start?: string;
    end?: string;
    years?: number;
    observations: number;
    annual_return: number;
    annual_cagr?: number;
    observed_annual_return?: number;
    return_mode?: string;
    annual_volatility: number;
    method: string;
    pending: boolean;
    fetched_at?: string;
    regime_transitions?: number[][] | null;
  };
  ending_distribution?: { lower: number; upper: number; count: number; share: number }[];
  yearly_cashflow?: {
    year: number;
    income: number;
    taxes: number;
    expenses: number;
    debt_payments: number;
    debt_interest: number;
    debt_remaining: number;
    invested_contributions: number;
  }[];
}
const palette = ['#fb7185', '#fbbf24', '#a78bfa', '#22d3ee', '#34d399', '#60a5fa'];
const quantiles = [
  { key: 'p90', label: 'Upper outcome (P90)', color: '#a4a3f6' },
  { key: 'p50', label: 'Median (P50)', color: '#7de0bc' },
  { key: 'p10', label: 'Lower outcome (P10)', color: '#ee8ea8' },
];
const titles = {
  monte_carlo: 'Monte Carlo Simulation',
  markov: 'Markov regime simulation',
  debt: 'Debt payoff optimizer',
};
const duration = (months: number) => `${Math.floor(months / 12)} yrs, ${months % 12} mos`;
export function SimulationModal({
  graphData,
  simulationType,
  onClose,
  onAssumptionsChange,
}: {
  graphData: GraphData;
  simulationType: SimulationType;
  onClose: () => void;
  onAssumptionsChange: (settings: ScenarioAssumptions) => void;
}) {
  const [forecast, setForecast] = useState<SimulationResult | null>(null);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [rate, setRate] = useState(100);
  const [scheduledInvesting, setScheduledInvesting] = useState(true);
  const [inflation, setInflation] = useState(true);
  const [years, setYears] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [marketSource, setMarketSource] = useState<'historical' | 'manual'>('historical');
  const [returnMode, setReturnMode] = useState<'forward' | 'observed'>('forward');
  const [assetClass, setAssetClass] = useState('US_STOCKS');
  const [annualReturn, setAnnualReturn] = useState(7);
  const [annualVolatility, setAnnualVolatility] = useState(15);
  const [fee, setFee] = useState(0);
  const [borrowingApr, setBorrowingApr] = useState(12);
  const [target, setTarget] = useState(500000);
  const settings = assumptionsFor(graphData);
  const currentBudget = totals(graphData);
  // Paused only new investment transfers in this experiment; retained existing
  // assets, cash-saving routes, and the saved node graph for later use.
  const scenarioEdges = useMemo(
    () =>
      scheduledInvesting
        ? graphData.edges
        : graphData.edges.filter(
            (edge) =>
              !graphData.nodes.some(
                (node) => node.id === edge.targetNodeId && node.nodeType === 'INVESTMENT',
              ),
          ),
    [graphData, scheduledInvesting],
  );
  const allocation = allocations(
    { ...graphData, edges: scenarioEdges },
    currentBudget.surplus,
    rate,
  );
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
          income_basis: settings.incomeBasis,
          tax_rate: settings.taxRate / 100,
          income_growth: settings.incomeGrowth / 100,
          expense_growth: settings.expenseGrowth / 100,
          annual_fee: fee / 100,
          borrowing_apr: borrowingApr / 100,
          market_source: marketSource,
          historical_return_mode: returnMode,
          asset_class: assetClass,
          annual_return: annualReturn / 100,
          annual_volatility: annualVolatility / 100,
          target,
          nodes: graphData.nodes.map((n) => ({
            id: n.id,
            name: n.name,
            type: n.nodeType,
            balance: n.amountOrBalance,
            apr: n.interestRateApr,
            ...(n.minPayment != null ? { min_payment: n.minPayment } : {}),
          })),
          edges: scenarioEdges.map((e) => ({
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
        if (data.model_version !== 2)
          throw new Error('Restart FinApp to load the updated Python simulation model.');
        if (
          !data.metrics ||
          !Array.isArray(simulationType === 'debt' ? data.debt?.avalanche : data[simulationType])
        )
          throw new Error('The simulation server returned an unexpected result.');
        if (!controller.signal.aborted) setForecast(data);
      } catch (err) {
        if (!controller.signal.aborted || timedOut) {
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
  }, [
    graphData,
    scenarioEdges,
    settings.incomeBasis,
    settings.taxRate,
    settings.incomeGrowth,
    settings.expenseGrowth,
    rate,
    inflation,
    simulationType,
    years,
    retry,
    marketSource,
    returnMode,
    assetClass,
    annualReturn,
    annualVolatility,
    fee,
    borrowingApr,
    target,
  ]);
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
        className="simulation-dialog simulation-lab"
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
                ? 'A Monte Carlo simulation runs many possible market paths to show a range of financial outcomes. These 1,000 paths include your cash, investments, and debt; they are scenarios, not guarantees.'
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
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
            >
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        <div className="simulation-body">
          <div className="simulation-main">
            <div className="simulation-budget-ribbon">
              <span>
                <small>Take-home /mo</small>
                <b>{dollars(currentBudget.takeHome)}</b>
              </span>
              <i>−</i>
              <span>
                <small>Living costs</small>
                <b>{dollars(currentBudget.expenses)}</b>
              </span>
              <i>−</i>
              <span>
                <small>Loan payments</small>
                <b>{dollars(currentBudget.payments)}</b>
              </span>
              <i>=</i>
              <span className={currentBudget.surplus < 0 ? 'negative' : 'positive'}>
                <small>Available after bills</small>
                <b>{dollars(currentBudget.surplus)}</b>
              </span>
            </div>
            {!!forecast?.warnings?.length && (
              <div className="simulation-warnings" role="status">
                {forecast.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
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
                  {simulationType !== 'debt' ? (
                    <ForecastChart
                      points={
                        forecast[simulationType === 'markov' ? 'markov' : 'monte_carlo'] ?? []
                      }
                      realDollars={inflation}
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
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
                    </ResponsiveContainer>
                  )}
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
            {forecast && (
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
            {simulationType === 'debt' && summary && !summary.paid_off && (
              <div className="notice warning">
                This budget does not clear your debt within {years} years. The last chart point is
                not a payoff date.
              </div>
            )}
            {simulationType === 'debt' && comparison && summary && (
              <p className="muted small comparison-note">
                {Math.abs(comparison.total_interest - summary.total_interest) < 0.01
                  ? 'Both strategies accrue the same interest in this scenario.'
                  : `${strategy === 'avalanche' ? 'Avalanche' : 'Snowball'} accrues ${money(Math.abs(comparison.total_interest - summary.total_interest))} ${summary.total_interest < comparison.total_interest ? 'less' : 'more'} interest than the alternative over this horizon.`}
              </p>
            )}
            {forecast && simulationType !== 'debt' && (
              <ForecastInsights forecast={forecast} mode={simulationType} realDollars={inflation} />
            )}
            <SimulationGuide mode={simulationType} />
          </div>
          <aside className="simulation-sidebar">
            <section className="simulation-controls">
              <div className="eyebrow">YOUR ASSUMPTIONS</div>
              <h3>Make it your scenario</h3>
              <BudgetControls graph={graphData} onChange={onAssumptionsChange} compact />
              {simulationType !== 'debt' && (
                <section className="market-settings">
                  <label className="control-label">
                    Market assumptions
                    <select
                      value={marketSource}
                      onChange={(e) => setMarketSource(e.target.value as 'historical' | 'manual')}
                    >
                      <option value="historical">Free historical calibration</option>
                      <option value="manual">Editable return assumptions</option>
                    </select>
                  </label>
                  <label className="control-label">
                    Investment benchmark
                    <select value={assetClass} onChange={(e) => setAssetClass(e.target.value)}>
                      <option value="US_STOCKS">US stocks · SPY</option>
                      <option value="BONDS">US bonds · AGG</option>
                      <option value="INTL_STOCKS">International stocks · EFA</option>
                      <option value="REAL_ESTATE">Real estate · VNQ</option>
                    </select>
                  </label>
                  <div
                    className={
                      marketSource === 'manual' ? 'manual-market-inputs' : 'fallback-inputs'
                    }
                  >
                    <p>
                      {marketSource === 'manual'
                        ? 'Used for this simulation'
                        : returnMode === 'forward'
                          ? 'Historical risk with an editable forward return'
                          : 'Observed historical return; these values are fallbacks only'}
                    </p>
                    {marketSource === 'historical' && (
                      <label className="forward-return-choice">
                        <input
                          type="checkbox"
                          checked={returnMode === 'forward'}
                          onChange={(e) => setReturnMode(e.target.checked ? 'forward' : 'observed')}
                        />{' '}
                        Use an editable forward return
                      </label>
                    )}
                    <label className="control-label">
                      {marketSource === 'historical' && returnMode === 'observed'
                        ? 'Fallback annual return (%)'
                        : 'Forward expected return (%)'}
                      <input
                        type="number"
                        min={-50}
                        max={50}
                        step={0.5}
                        value={annualReturn}
                        onChange={(e) => setAnnualReturn(Number(e.target.value))}
                      />
                    </label>
                    <label className="control-label">
                      {marketSource === 'historical'
                        ? 'Fallback volatility (%)'
                        : 'Annual volatility (%)'}
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={annualVolatility}
                        onChange={(e) => setAnnualVolatility(Number(e.target.value))}
                      />
                    </label>
                  </div>
                </section>
              )}
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
                  {[1, 5, 10, 20, 30, 40, 50].map((y) => (
                    <option key={y} value={y}>
                      {y} years
                    </option>
                  ))}
                </select>
              </label>
              <label className="control-label" htmlFor="allocation">
                {simulationType === 'debt'
                  ? 'Extra surplus toward debt'
                  : 'Invest still-unassigned money'}
                <strong>{rate}%</strong>
              </label>
              {simulationType !== 'debt' && (
                <label className="forward-return-choice">
                  <input
                    type="checkbox"
                    checked={scheduledInvesting}
                    onChange={(e) => setScheduledInvesting(e.target.checked)}
                  />{' '}
                  Include scheduled investment transfers
                </label>
              )}
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
                  : `${dollars(allocation.plannedInvestment)} scheduled + ${rate}% of ${dollars(allocation.unassigned)} unassigned = ${dollars(allocation.investment)}/mo invested initially. Remaining cash savings: ${dollars(allocation.cash)}/mo.`}
              </p>
              {simulationType !== 'debt' && (
                <p className="muted small">
                  For $0 in new investments, turn off scheduled transfers and set the slider to 0%.
                  Uninvested surplus stays in cash. Losses can still affect existing investments;
                  expenses above take-home income can drain assets and create debt. Set a negative
                  forward return to explore a prolonged market decline.
                </p>
              )}
              {simulationType !== 'debt' && (
                <>
                  <label className="control-label">
                    Net-worth target ($)
                    <input
                      type="number"
                      min={0}
                      max={1e12}
                      step={10000}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </label>
                  <details className="advanced-assumptions">
                    <summary>Growth, fees & shortfalls</summary>
                    <div className="advanced-controls">
                      <label className="control-label">
                        Annual income growth (%)
                        <input
                          type="number"
                          min={-50}
                          max={25}
                          step={0.5}
                          value={settings.incomeGrowth}
                          onChange={(e) =>
                            onAssumptionsChange({
                              ...settings,
                              incomeGrowth: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="control-label">
                        Annual living-cost growth (%)
                        <input
                          type="number"
                          min={-25}
                          max={25}
                          step={0.5}
                          value={settings.expenseGrowth}
                          onChange={(e) =>
                            onAssumptionsChange({
                              ...settings,
                              expenseGrowth: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label className="control-label">
                        Additional portfolio fee (%)
                        <input
                          type="number"
                          min={0}
                          max={10}
                          step={0.05}
                          value={fee}
                          onChange={(e) => setFee(Number(e.target.value))}
                        />
                      </label>
                      <label className="control-label">
                        Shortfall borrowing APR (%)
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={borrowingApr}
                          onChange={(e) => setBorrowingApr(Number(e.target.value))}
                        />
                      </label>
                      <p className="muted small">
                        Growth is nominal and applied annually. Income continues through the
                        horizon; retirement withdrawals are not modeled. The additional fee is
                        separate from costs already reflected in adjusted fund prices.
                      </p>
                    </div>
                  </details>
                </>
              )}
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
            {simulationType !== 'debt' && forecast?.market_data && (
              <section
                className={`market-source-card ${forecast.market_data.status === 'fallback' ? 'is-fallback' : ''}`}
              >
                <div className="eyebrow">DATA BEHIND THE MODEL</div>
                <h3>
                  {['historical', 'stale_history'].includes(forecast.market_data.status)
                    ? `${forecast.market_data.ticker} · ${forecast.market_data.years} years`
                    : forecast.market_data.pending
                      ? 'History loading'
                      : 'Editable assumptions'}
                </h3>
                <p>{forecast.market_data.source}</p>
                {forecast.market_data.start && (
                  <p>
                    {forecast.market_data.start} → {forecast.market_data.end}
                    <br />
                    {forecast.market_data.observations} completed monthly returns
                  </p>
                )}
                <dl className="breakdown">
                  <div>
                    <dt>
                      {forecast.market_data.return_mode === 'forward'
                        ? 'Forward return assumption'
                        : 'Annualized return input'}
                    </dt>
                    <dd>{(forecast.market_data.annual_return * 100).toFixed(2)}%</dd>
                  </div>
                  <div>
                    <dt>Annual log-return volatility</dt>
                    <dd>{(forecast.market_data.annual_volatility * 100).toFixed(2)}%</dd>
                  </div>
                </dl>
                {forecast.market_data.observed_annual_return != null && (
                  <p>
                    Observed historical mean:{' '}
                    {(forecast.market_data.observed_annual_return * 100).toFixed(2)}%. Historical
                    movements have been centered on the selected forward assumption; the past
                    average is not treated as a forecast.
                  </p>
                )}
                <p>{forecast.market_data.method}</p>
                {forecast.market_data.regime_transitions && (
                  <p>
                    Bull → bear:{' '}
                    {(forecast.market_data.regime_transitions[0]![1]! * 100).toFixed(1)}%/mo · Bear
                    → bull: {(forecast.market_data.regime_transitions[1]![0]! * 100).toFixed(1)}%/mo
                  </p>
                )}
                {forecast.market_data.status === 'stale_history' && (
                  <p>
                    Cached history is older than 24 hours. Refresh is attempted in the background.
                  </p>
                )}
                <button
                  className="button"
                  disabled={loading}
                  onClick={() => setRetry((n) => n + 1)}
                >
                  {forecast.market_data.pending ? 'Check loaded history' : 'Refresh forecast'}
                </button>
                <small>
                  Free, cached data · no API key · historical performance is not a promise.
                </small>
              </section>
            )}
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
            {metrics && simulationType !== 'debt' && (
              <section>
                <h3>What drives the result?</h3>
                <dl className="breakdown">
                  <div>
                    <dt>Entered income</dt>
                    <dd>{dollars(metrics.monthly_income)}</dd>
                  </div>
                  <div>
                    <dt>Estimated tax</dt>
                    <dd>−{dollars(metrics.monthly_taxes)}</dd>
                  </div>
                  <div>
                    <dt>Take-home income</dt>
                    <dd>{dollars(metrics.take_home_income)}</dd>
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
                    <dt>Total initially invested /mo</dt>
                    <dd>{dollars(metrics.monthly_contribution)}</dd>
                  </div>
                  <div>
                    <dt>Initially kept in cash /mo</dt>
                    <dd>{dollars(metrics.monthly_cash_saving)}</dd>
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
                <li>
                  A fixed random seed makes comparisons repeatable. Market history is a modeling
                  input, not a prediction of future returns.
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
