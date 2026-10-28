import { NumberField } from './components/NumberField';
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
  markov: 'Markov Regime Simulation',
  debt: 'Debt payoff optimizer',
};
const duration = (months: number) => `${Math.floor(months / 12)} yrs, ${months % 12} mos`;
export function SimulationModal({
  graphData,
  simulationType,
  onClose,
  onAssumptionsChange,
  scopeLabel,
}: {
  graphData: GraphData;
  simulationType: SimulationType;
  onClose: () => void;
  onAssumptionsChange: (settings: ScenarioAssumptions) => void;
  scopeLabel?: string;
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
        if (data.model_version !== 3)
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
      className="fixed inset-0 z-[100] bg-[#04070dbd] backdrop-blur-md flex items-center justify-center p-[clamp(12px,3vw,40px)] max-[760px]:p-2"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="w-[min(1460px,100%)] h-[min(990px,94dvh)] max-h-[calc(100dvh-32px)] 2xl:w-[min(1540px,100%)] flex flex-col border border-[#405269] rounded-[20px] bg-[#0e1520] shadow-[0_30px_140px_#0009] overflow-hidden outline-none max-[800px]:h-[96dvh] max-[800px]:max-h-[calc(100dvh-16px)] max-[800px]:rounded-[13px]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-title"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-5 p-[25px_28px] border-b border-[#293247] shrink-0 bg-[radial-gradient(ellipse_at_top_left,#24364075,transparent_65%)] max-[1100px]:p-[18px] max-[800px]:p-[18px]">
          <div>
            <div className="text-[8px] mb-[9px] text-[#b7a4e9]">
              SCENARIO LAB{' '}
              <span className="text-[#6e7f99]"> / {simulationType === 'debt' ? 'REPAYMENT' : '1,000 SIMULATED PATHS'}</span>
            </div>
            <h2 id="simulation-title" className="text-[clamp(24px,2.5vw,34px)] font-semibold tracking-[-1px] max-[760px]:text-[22px] m-0">{titles[simulationType]}</h2>
            {scopeLabel && <div className="text-[#7de0bc] text-[11px] mt-2">{scopeLabel}</div>}
            <p className="text-xs max-w-[720px] leading-[1.6] text-[#8798b3] mt-[7px] max-[760px]:text-[10px] max-[760px]:max-w-[90%] mb-0">
              {simulationType === 'monte_carlo'
                ? 'A Monte Carlo simulation runs many possible market paths to show a range of financial outcomes. These 1,000 paths include your cash, investments, and debt; they are scenarios, not guarantees.'
                : simulationType === 'markov'
                  ? 'Explore how changing bull and bear markets affect your financial plan.'
                  : 'Compare repayment priorities using the same monthly budget.'}
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center border border-[#303c54] bg-[#1a2538] hover:bg-[#25354e] text-[#d6e2f5] rounded-full w-8 h-8 shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[#a78bfa] focus-visible:outline-offset-2"
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
        <div className="grid grid-cols-[minmax(0,1fr)_340px] max-[1100px]:grid-cols-[minmax(0,1fr)_300px] max-[800px]:grid-cols-1 flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
          <div className="block p-[25px] min-w-0 bg-[radial-gradient(ellipse_at_top_right,#24352e26,transparent_60%)] max-[1100px]:p-[18px] max-[760px]:p-[18px_12px] max-[500px]:p-3">
            <div className="flex flex-wrap items-center gap-4 m-0 mb-[25px] p-[18px_20px] border border-[#2b3e50] rounded-xl bg-[#14212a] max-[1100px]:gap-[11px] max-[1100px]:p-[14px] max-[500px]:grid max-[500px]:grid-cols-2 max-[500px]:gap-3 [&>span]:flex [&>span]:flex-col [&>span]:gap-1.5 [&_small]:text-[#91a7ba] [&_small]:text-[9px] [&_small]:tracking-[0.35px] [&_b]:text-[clamp(12px,1.25vw,16px)] [&_b]:tabular-nums [&_b]:font-medium max-[1100px]:[&_b]:text-[13px] [&>i]:text-[#667f92] [&>i]:not-italic max-[500px]:[&>i]:hidden">
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
              <span className={currentBudget.surplus < 0 ? 'negative text-coral' : 'positive text-mint'}>
                <small>Available after bills</small>
                <b>{dollars(currentBudget.surplus)}</b>
              </span>
            </div>
            {!!forecast?.warnings?.length && (
              <div className="border-l-2 border-[#bea16f] rounded-[4px] bg-[#30291c55] p-[10px_15px] mb-[18px] text-[#d9bd90] text-[11px] leading-[1.7] [&>p]:m-0 [&>p]:leading-[1.7]" role="status">
                {forecast.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            <div className="flex justify-between gap-3 items-center min-h-[20px] mb-2.5">
              <div className="flex gap-[15px] flex-wrap max-[760px]:gap-2.5">
                {simulationType !== 'debt'
                  ? [...quantiles].reverse().map((q) => (
                      <span key={q.key} className="text-[10px] text-[#afbdd3] max-[760px]:text-[9px] inline-flex items-center gap-1.5">
                        <i className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: q.color }} />
                        {q.label}
                      </span>
                    ))
                  : debtKeys.map((key, i) => (
                      <span key={key} className="text-[10px] text-[#afbdd3] max-[760px]:text-[9px] inline-flex items-center gap-1.5">
                        <i className="w-[7px] h-[7px] rounded-full inline-block" style={{ background: palette[i % palette.length] }} />
                        {labels[key]}
                      </span>
                    ))}
              </div>
              <span className="text-[8px] tracking-[1px] text-[#778ca8] whitespace-nowrap max-[760px]:hidden">
                {inflation && simulationType !== 'debt' ? 'TODAY’S USD' : 'USD'}
              </span>
            </div>
            <div className="h-[clamp(400px,49vh,590px)] min-h-[400px] relative flex-none max-[800px]:min-h-[430px]" aria-busy={loading}>
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center flex-col text-center p-8 gap-[13px] text-[#a9b9d0] text-xs" role="alert">
                  <h3 className="text-base text-text m-0">Let’s get this running</h3>
                  <p className="max-w-[380px] m-0">{error}</p>
                  <button
                    className="inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[7px] px-3.5 py-[9px] text-[11px] font-medium min-h-[34px] cursor-pointer bg-primary text-primary-fg hover:bg-[#cbbcfc] transition-colors"
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
                <div className="absolute inset-0 flex items-center justify-center flex-col text-center p-8 gap-[13px] text-[#a9b9d0] text-xs" role="status">
                  Calculating your scenario…
                </div>
              ) : (
                <>
                  {loading && (
                    <span className="absolute right-2.5 top-0 text-[10px] bg-[#26314c] text-[#d8d0f5] rounded-[5px] px-2 py-[5px] z-[1]" role="status">
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
                              <div className="p-[13px_15px] bg-[#1c2638] border border-[#47536d] rounded-[9px] shadow-[0_10px_30px_#0005] min-w-[200px] text-[11px]">
                                <strong className="block text-[11px] text-[#d9e3f3] mb-3">{`Month ${label}`}</strong>
                                {payload.map((p, i) => (
                                  <div
                                    key={String(p.dataKey)}
                                    className="flex justify-between gap-[22px] mt-2.5"
                                    style={{ color: palette[i % palette.length] }}
                                  >
                                    <span>{labels[String(p.dataKey)]}</span>
                                    <b className="font-medium">{money(Number(p.value))}</b>
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
            <div className="flex justify-between text-[9px] text-[#788ca8] p-[12px_6px_17px] gap-2.5 max-[760px]:text-[8px]">
              <span>{simulationType === 'debt' ? 'Months from today' : 'Years from today'}</span>
              <span>
                {simulationType === 'debt'
                  ? 'Remaining debt balance'
                  : 'Net worth = cash + investments − debt'}
              </span>
            </div>
            {forecast && (
              <div className="grid grid-cols-3 max-[760px]:gap-2.5 gap-[15px] border border-[#2c3850] bg-[#172030] rounded-[9px] p-[17px_19px] max-[760px]:p-[14px_12px] [&>div]:flex [&>div]:flex-col [&>div]:gap-2.5 [&_span]:text-[9px] max-[760px]:[&_span]:text-[8px] [&_span]:text-[#8b9fba] [&_span]:leading-[1.4] [&_strong]:text-[clamp(15px,1.7vw,23px)] max-[760px]:[&_strong]:text-[17px] [&_strong]:font-semibold [&_strong]:tracking-[-0.5px]">
                {simulationType !== 'debt' ? (
                  <>
                    <div>
                      <span>Starting net worth</span>
                      <strong>{money(metrics!.initial_investment)}</strong>
                    </div>
                    <div>
                      <span>Year {years} median</span>
                      <strong className={final && final.p50 < 0 ? 'negative text-coral' : 'positive text-mint'}>
                        {money(final?.p50 ?? 0)}
                      </strong>
                    </div>
                    <div>
                      <span>Monthly surplus</span>
                      <strong className={metrics!.monthly_surplus < 0 ? 'negative text-coral' : ''}>
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
                      <strong className={summary?.paid_off ? 'positive text-mint' : 'negative text-coral'}>
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
              <div className="border-l-2 border-[#bea16f] rounded-[4px] bg-[#30291c55] p-[10px_15px] mt-3.5 mb-0 text-[#d9bd90] text-[11px] leading-[1.7]" role="alert">
                This budget does not clear your debt within {years} years. The last chart point is
                not a payoff date.
              </div>
            )}
            {simulationType === 'debt' && comparison && summary && (
              <p className="text-[#8b9ab1] text-[11px] mt-[13px] mb-0 leading-[1.6]">
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
          <aside className="border-l border-[#2c3447] bg-[#121c29] p-6 max-[1100px]:p-[18px] max-[800px]:p-5 max-[800px]:border-l-0 max-[800px]:border-t max-[800px]:border-[#314257] overflow-y-auto max-[800px]:overflow-visible min-h-0 [&>section]:pb-[23px] [&>section]:mb-[22px] [&>section]:border-b [&>section]:border-[#2c364b] max-[760px]:[&>section]:pb-[18px] max-[760px]:[&>section]:mb-[18px]">
            <section>
              <div className="text-[8px] text-[#889ab6] mb-1.5 font-semibold tracking-wider">YOUR ASSUMPTIONS</div>
              <h3 className="text-sm font-semibold text-text mb-4 mt-0">Make it your scenario</h3>
              <BudgetControls graph={graphData} onChange={onAssumptionsChange} compact />
              {simulationType !== 'debt' && (
                <section className="my-[17px] p-0 border-0">
                  <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                    Market assumptions
                    <select
                      className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
                      value={marketSource}
                      onChange={(e) => setMarketSource(e.target.value as 'historical' | 'manual')}
                    >
                      <option value="historical">Free historical calibration</option>
                      <option value="manual">Editable return assumptions</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                    Investment benchmark
                    <select
                      className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
                      value={assetClass}
                      onChange={(e) => setAssetClass(e.target.value)}
                    >
                      <option value="US_STOCKS">US stocks · SPY</option>
                      <option value="BONDS">US bonds · AGG</option>
                      <option value="INTL_STOCKS">International stocks · EFA</option>
                      <option value="REAL_ESTATE">Real estate · VNQ</option>
                    </select>
                  </label>
                  <div
                    className="bg-[#0c1520] border border-[#2a3d51] rounded-[9px] p-[13px] my-4"
                  >
                    <p className="text-[10px] text-[#95abc2] leading-[1.6] mb-3.5 mt-0">
                      {marketSource === 'manual'
                        ? 'Used for this simulation'
                        : returnMode === 'forward'
                          ? 'Historical risk with an editable forward return'
                          : 'Observed historical return; these values are fallbacks only'}
                    </p>
                    {marketSource === 'historical' && (
                      <label className="inline-flex items-center gap-2 text-[11px] text-[#b9c5d9] cursor-pointer mb-3">
                        <input
                          type="checkbox"
                          className="accent-[#82c9b1] w-[13px] h-[13px]"
                          checked={returnMode === 'forward'}
                          onChange={(e) => setReturnMode(e.target.checked ? 'forward' : 'observed')}
                        />{' '}
                        Use an editable forward return
                      </label>
                    )}
                    <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                      {marketSource === 'historical' && returnMode === 'observed'
                        ? 'Fallback annual return (%)'
                        : 'Forward expected return (%)'}
                      <NumberField
                        type="number"
                        min={-50}
                        max={50}
                        step={0.5}
                        value={annualReturn}
                        onChange={(e) => setAnnualReturn(Number(e.target.value))}
                      />
                    </label>
                    <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                      {marketSource === 'historical'
                        ? 'Fallback volatility (%)'
                        : 'Annual volatility (%)'}
                      <NumberField
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
              <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                Time horizon
                <select
                  className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
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
              <label className="flex items-center justify-between gap-3 text-[11px] text-[#b9c5d9] mt-[17px]" htmlFor="allocation">
                <span>{simulationType === 'debt'
                  ? 'Extra surplus toward debt'
                  : 'Invest still-unassigned money'}</span>
                <strong className="text-[#cebeff]">{rate}%</strong>
              </label>
              {simulationType !== 'debt' && (
                <label className="inline-flex items-center gap-2 text-[11px] text-[#b9c5d9] cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    className="accent-[#82c9b1] w-[13px] h-[13px]"
                    checked={scheduledInvesting}
                    onChange={(e) => setScheduledInvesting(e.target.checked)}
                  />{' '}
                  Include scheduled investment transfers
                </label>
              )}
              <input
                id="allocation"
                type="range"
                className="w-full mt-3 accent-brand cursor-pointer"
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
              <p className="text-[#8b9ab1] text-[11px] mt-2 mb-0 leading-[1.6]">
                {simulationType === 'debt'
                  ? 'Minimum payments are included once. This adds a share of your remaining monthly surplus.'
                  : `${dollars(allocation.plannedInvestment)} scheduled + ${rate}% of ${dollars(allocation.unassigned)} unassigned = ${dollars(allocation.investment)}/mo invested initially. Remaining cash savings: ${dollars(allocation.cash)}/mo.`}
              </p>
              {simulationType !== 'debt' && (
                <p className="text-[#8b9ab1] text-[11px] mt-2 mb-0 leading-[1.6]">
                  For $0 in new investments, turn off scheduled transfers and set the slider to 0%.
                  Uninvested surplus stays in cash. Losses can still affect existing investments;
                  expenses above take-home income can drain assets and create debt. Set a negative
                  forward return to explore a prolonged market decline.
                </p>
              )}
              {simulationType !== 'debt' && (
                <>
                  <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                    Net-worth target ($)
                    <NumberField
                      type="number"
                      min={0}
                      max={1e12}
                      step={10000}
                      value={target}
                      onChange={(e) => setTarget(Number(e.target.value))}
                    />
                  </label>
                  <details className="my-5 border border-[#2d3f55] rounded-lg">
                    <summary className="text-[11px] p-3 text-[#adbed0] cursor-pointer font-medium select-none">Growth, fees & shortfalls</summary>
                    <div className="px-3 pt-1 pb-3">
                      <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                        Annual income growth (%)
                        <NumberField
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
                      <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                        Annual living-cost growth (%)
                        <NumberField
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
                      <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                        Additional portfolio fee (%)
                        <NumberField
                          type="number"
                          min={0}
                          max={10}
                          step={0.05}
                          value={fee}
                          onChange={(e) => setFee(Number(e.target.value))}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-[11px] text-[#b9c5d9] mt-[17px]">
                        Shortfall borrowing APR (%)
                        <NumberField
                          type="number"
                          min={0}
                          max={100}
                          step={0.5}
                          value={borrowingApr}
                          onChange={(e) => setBorrowingApr(Number(e.target.value))}
                        />
                      </label>
                      <p className="text-[#8b9ab1] text-[11px] mt-3 mb-0 leading-[1.6]">
                        Growth is nominal and applied annually. Income continues through the
                        horizon; retirement withdrawals are not modeled. The additional fee is
                        separate from costs already reflected in adjusted fund prices.
                      </p>
                    </div>
                  </details>
                </>
              )}
              {simulationType !== 'debt' && (
                <label className="flex items-center justify-between gap-2.5 mt-5 text-[11px] cursor-pointer">
                  <span>
                    Adjust for inflation<small className="block text-[#7f91ac] text-[9px] mt-1">2.5% annually · today’s purchasing power</small>
                  </span>
                  <input
                    type="checkbox"
                    className="accent-brand w-4 h-4"
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
                <div className="flex flex-col gap-2 mt-[18px]">
                  {(['avalanche', 'snowball'] as const).map((s) => (
                    <button
                      key={s}
                      className={`text-left p-[10px_12px] rounded-[7px] border transition-colors cursor-pointer ${
                        strategy === s
                          ? 'border-[#a78bfa] bg-[#2a2440]'
                          : 'border-[#354259] bg-[#182233] hover:border-[#4f6080]'
                      }`}
                      onClick={() => setStrategy(s)}
                    >
                      <strong className="block text-[11px] text-text font-semibold">{s === 'avalanche' ? 'Avalanche' : 'Snowball'}</strong>
                      <small className="block text-[10px] text-[#97a5bd] mt-1">
                        {s === 'avalanche' ? 'Highest APR first' : 'Smallest balance first'}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </section>
            {simulationType !== 'debt' && forecast?.market_data && (
              <section
                className={`rounded-[10px] p-[17px] border ${
                  forecast.market_data.status === 'fallback'
                    ? 'border-[#6a5535] bg-[#30291b55]'
                    : 'border-[#365b54] bg-[#182f2b60]'
                }`}
              >
                <div className="text-[8px] text-[#87bea9] mb-[9px] font-semibold tracking-wider">DATA BEHIND THE MODEL</div>
                <h3 className="text-sm font-semibold text-[#c1e3d5] m-0">
                  {['historical', 'stale_history'].includes(forecast.market_data.status)
                    ? `${forecast.market_data.ticker} · ${forecast.market_data.years} years`
                    : forecast.market_data.pending
                      ? 'History loading'
                      : 'Editable assumptions'}
                </h3>
                <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">{forecast.market_data.source}</p>
                {forecast.market_data.start && (
                  <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">
                    {forecast.market_data.start} → {forecast.market_data.end}
                    <br />
                    {forecast.market_data.observations} completed monthly returns
                  </p>
                )}
                <dl className="text-[10px] leading-[1.5] my-2 [&>div]:flex [&>div]:justify-between [&>div]:gap-[9px] [&>div]:mb-2.5 [&_dt]:text-[#879bb8] [&_dd]:m-0 [&_dd]:text-right font-medium">
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
                  <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">
                    Observed historical mean:{' '}
                    {(forecast.market_data.observed_annual_return * 100).toFixed(2)}%. Historical
                    movements have been centered on the selected forward assumption; the past
                    average is not treated as a forecast.
                  </p>
                )}
                <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">{forecast.market_data.method}</p>
                {forecast.market_data.regime_transitions && (
                  <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">
                    Bull → bear:{' '}
                    {(forecast.market_data.regime_transitions[0]![1]! * 100).toFixed(1)}%/mo · Bear
                    → bull: {(forecast.market_data.regime_transitions[1]![0]! * 100).toFixed(1)}%/mo
                  </p>
                )}
                {forecast.market_data.status === 'stale_history' && (
                  <p className="text-[10px] text-[#a0b7b1] leading-[1.8] my-[9px]">
                    Cached history is older than 24 hours. Refresh is attempted in the background.
                  </p>
                )}
                <button
                  className="w-full mt-2.5 inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[7px] px-3.5 py-[9px] text-[11px] font-medium min-h-[34px] cursor-pointer bg-[#20293a] text-text border border-[#37445c] hover:bg-[#28354c] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                  disabled={loading}
                  onClick={() => setRetry((n) => n + 1)}
                >
                  {forecast.market_data.pending ? 'Check loaded history' : 'Refresh forecast'}
                </button>
                <small className="block text-[#91a99f] text-[9px] leading-[1.7] mt-3">
                  Free, cached data · no API key · historical performance is not a promise.
                </small>
              </section>
            )}
            {simulationType !== 'debt' && (
              <section>
                <h3 className="text-sm font-semibold text-text mb-4 mt-0">How to read this chart</h3>
                {quantiles.map((q) => (
                  <div className="flex gap-2.5 mb-[15px]" key={q.key}>
                    <i className="w-[7px] h-[7px] rounded-full mt-[5px] shrink-0" style={{ background: q.color }} />
                    <div>
                      <strong className="text-[11px] font-[550]" style={{ color: q.color }}>{q.label}</strong>
                      <p className="text-[10px] text-[#8e9fb9] mt-[5px] mb-0 leading-[1.65] max-[760px]:text-[11px]">
                        {q.key === 'p90'
                          ? '90% of modeled outcomes fall below this value. It is an optimistic outcome, not a guaranteed bull market.'
                          : q.key === 'p50'
                            ? 'Half of modeled outcomes are above this value and half below. This is the median across 1,000 simulations.'
                            : '10% of modeled outcomes fall below this value. More severe losses are still possible.'}
                      </p>
                    </div>
                  </div>
                ))}
                <p className="text-[#8b9ab1] text-[9px] leading-[1.6] mt-2 mb-0">
                  The shaded band spans P10–P90 at each year. These curves are percentiles, not
                  three individual market paths.
                </p>
              </section>
            )}
            {metrics && simulationType !== 'debt' && (
              <section>
                <h3 className="text-sm font-semibold text-text mb-4 mt-0">What drives the result?</h3>
                <dl className="text-[10px] leading-[1.5] my-2 [&>div]:flex [&>div]:justify-between [&>div]:gap-[9px] [&>div]:mb-2.5 [&_dt]:text-[#879bb8] [&_dd]:m-0 [&_dd]:text-right font-medium">
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
                <p className="text-[#8b9ab1] text-[11px] leading-[1.6] mt-2 mb-0">
                  The reference uses the same cash flows and debt schedule without asset growth,
                  expressed in the chart’s dollars.
                </p>
              </section>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-[11px] text-[#b6c2d9] font-medium select-none">Model assumptions</summary>
              <ul className="pl-[15px] text-[10px] text-[#8fa1bb] leading-[1.8] my-2 [&>li]:mt-[9px]">
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
        <footer className="flex items-center justify-between gap-4 border-t border-[#2c3448] shrink-0 p-[12px_24px] max-[760px]:p-[10px_15px] bg-[#111925]">
          <span className="text-[9px] text-[#7d90ad] max-[760px]:text-[8px]">
            Educational scenario modeling ·{' '}
            {inflation && simulationType !== 'debt' ? 'Inflation adjusted' : 'Nominal dollars'}
          </span>
          <button
            className="inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[7px] px-3.5 py-[9px] text-[11px] font-medium min-h-[34px] cursor-pointer bg-[#20293a] text-text border border-[#37445c] hover:bg-[#28354c] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
