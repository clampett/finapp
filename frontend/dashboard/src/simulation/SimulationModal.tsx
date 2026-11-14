import type { SimulationDefaults } from './simulationPreferences';
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
} from '../common/finance';
import type { GraphData, ScenarioAssumptions, SimulationType } from '../common/finance';
import { ForecastChart } from './ForecastChart';
import { ForecastInsights } from './ForecastInsights';
import { SimulationGuide } from './SimulationGuide';
import { sessionHeaders } from '../common/session';
import type { projectedDividendFlows } from '../investing/portfolio';
import { decryptFromDemoStorage } from '../budgeting/budget-crypto';
import type { RecurringTransactionItem } from '../budgeting/budgeting-bridge';
import type { SimulationResult } from './simulation-types';
import { titles, palette, quantiles, duration } from './simulation-types';
import { SimulationParameters } from './SimulationParameters';
import { SimulationMarketData } from './SimulationMarketData';
import { SimulationOutcomeTable } from './SimulationOutcomeTable';

export type { ForecastPoint, SimulationResult } from './simulation-types';

export function SimulationModal({
  graphData,
  simulationType,
  onClose,
  onOpenCoach,
  onAssumptionsChange,
  scopeLabel,
  scope,
  portfolioValue = 0,
  dividendFlows,
  userId,
  demo,
  recurringTransactions,
  defaults,
}: {
  graphData: GraphData;
  simulationType: SimulationType;
  onClose: () => void;
  onOpenCoach?: () => void;
  onAssumptionsChange: (settings: ScenarioAssumptions) => void;
  scopeLabel?: string;
  scope?: 'all' | 'selected' | 'connected';
  portfolioValue?: number;
  dividendFlows?: ReturnType<typeof projectedDividendFlows>;
  userId?: number;
  demo?: boolean;
  recurringTransactions?: RecurringTransactionItem[];
  defaults?: SimulationDefaults;
}) {
  const [forecast, setForecast] = useState<SimulationResult | null>(null);
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>(
    defaults?.strategy ?? 'avalanche',
  );
  const [rate, setRate] = useState(defaults?.contribution ?? 100);
  const [scheduledInvesting, setScheduledInvesting] = useState(true);
  const inflationRate = defaults?.inflation ?? 2.5;
  const [inflation, setInflation] = useState(inflationRate > 0);
  const [years, setYears] = useState(defaults?.years ?? 30);
  const horizons = [...new Set([1, 5, 10, 20, 30, 40, 50, defaults?.years ?? 30])].sort(
    (a, b) => a - b,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [marketSource, setMarketSource] = useState<'historical' | 'manual'>(
    defaults?.marketSource ?? 'historical',
  );
  const [returnMode, setReturnMode] = useState<'forward' | 'observed'>(
    defaults?.returnMode ?? 'forward',
  );
  const [assetClass, setAssetClass] = useState('US_STOCKS');
  const [annualReturn, setAnnualReturn] = useState(defaults?.annualReturn ?? 7);
  const [annualVolatility, setAnnualVolatility] = useState(defaults?.volatility ?? 15);
  const [fee, setFee] = useState(defaults?.fee ?? 0);
  const [borrowingApr, setBorrowingApr] = useState(defaults?.borrowingApr ?? 12);
  const [target, setTarget] = useState(defaults?.target ?? 500000);
  const [recurringList, setRecurringList] = useState<RecurringTransactionItem[]>(
    () => recurringTransactions || [],
  );

  useEffect(() => {
    if (recurringTransactions && recurringTransactions.length > 0) {
      setRecurringList(recurringTransactions);
      return;
    }
    const controller = new AbortController();
    (async () => {
      try {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location?.search || '');
        const isDemo = demo ?? params.get('demo') === 'true';
        const profile = userId || Number(params.get('profile')) || 1;
        const uid = userId || Number(sessionStorage.getItem('finapp_user_id')) || 0;
        if (isDemo) {
          const budgetKey = `finapp-budget-v1:demo:${profile}`;
          const raw = localStorage.getItem(budgetKey);
          const parsed = await decryptFromDemoStorage<{ recurring?: RecurringTransactionItem[] }>(
            budgetKey,
            raw,
          );
          if (!controller.signal.aborted && parsed?.recurring && Array.isArray(parsed.recurring)) {
            setRecurringList(parsed.recurring);
          }
        } else if (uid) {
          const res = await fetch(`${API_BASE}/recurring-transactions`, {
            headers: sessionHeaders(),
            credentials: 'include',
            signal: controller.signal,
          });
          if (res.ok) {
            const response = await res.json();
            if (!controller.signal.aborted && Array.isArray(response.data)) {
              setRecurringList(response.data);
            }
          }
        }
      } catch {}
    })();
    return () => controller.abort();
  }, [demo, userId, recurringTransactions]);

  const settings = assumptionsFor(graphData);
  const isSelectedScope =
    scope != null
      ? scope !== 'all'
      : Boolean(
          scopeLabel?.toLowerCase().includes('selected') ||
          scopeLabel?.toLowerCase().includes('selection'),
        );
  const effectivePortfolioValue = isSelectedScope ? 0 : Math.max(0, portfolioValue);
  const currentBudget = totals(graphData, effectivePortfolioValue);
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
          investment_rate: rate,
          inflation_rate: inflation ? inflationRate / 100 : 0,
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
          nodes: [
            ...graphData.nodes.map((n) => ({
              id: n.id,
              name: n.name,
              type: n.nodeType,
              balance: n.amountOrBalance,
              apr: n.interestRateApr,
              ...(n.frequency ? { frequency: n.frequency } : {}),
              ...(n.intervalCount ? { interval_count: n.intervalCount } : {}),
              ...(n.minPayment != null ? { min_payment: n.minPayment } : {}),
            })),
            ...(effectivePortfolioValue > 0
              ? [
                  {
                    id: 'portfolio-holdings',
                    name: 'Stock Portfolio',
                    type: 'INVESTMENT' as const,
                    balance: effectivePortfolioValue,
                    apr: 7,
                  },
                ]
              : []),
          ],
          recurring_transactions: isSelectedScope
            ? []
            : [
                ...recurringList
                  .filter((rule) => !rule.notes?.startsWith('Auto-generated dividend for '))
                  .map((rule) => ({
                    id: rule.id,
                    kind: rule.kind,
                    amount: rule.amount,
                    frequency: rule.frequency,
                    interval_count: rule.intervalCount || 1,
                    is_active: rule.isActive !== false,
                    start_date: rule.startDate,
                    end_date: rule.endDate,
                    description: rule.description,
                    category_name: rule.categoryName,
                    account_name: rule.accountName,
                    notes: rule.notes,
                  })),
                ...(marketSource === 'manual' ? (dividendFlows ?? []) : []),
              ],
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
    inflationRate,
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
    effectivePortfolioValue,
    recurringList,
    dividendFlows,
    isSelectedScope,
  ]);

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
      className="fixed inset-0 z-50 bg-(--ui-surface-04070dbd) backdrop-blur-md flex items-center justify-center p-[clamp(12px,3vw,40px)] max-[760px]:p-2"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialog}
        className="w-[min(1460px,100%)] h-[min(990px,94dvh)] max-h-[calc(100dvh-32px)] 2xl:w-[min(1540px,100%)] flex flex-col border border-border rounded-2xl bg-raised shadow-[0_30px_140px_var(--ui-shadow-0009)] overflow-hidden outline-none max-[800px]:h-[96dvh] max-[800px]:max-h-[calc(100dvh-16px)] max-[800px]:rounded-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="simulation-title"
        tabIndex={-1}
      >
        <header className="flex items-start justify-between gap-5 p-[25px_28px] border-b border-(--ui-border-293247) shrink-0 bg-[radial-gradient(ellipse_at_top_left,var(--ui-surface-24364075),transparent_65%)] max-[1100px]:p-4.5 max-[800px]:p-4.5">
          <div>
            <div className="text-[8px] mb-2.25 text-(--ui-text-b7a4e9)">
              SCENARIO LAB{' '}
              <span className="text-(--ui-text-6e7f99)">
                {' '}
                / {simulationType === 'debt' ? 'REPAYMENT' : '1,000 SIMULATED PATHS'}
              </span>
            </div>
            <h2
              id="simulation-title"
              className="text-[clamp(24px,2.5vw,34px)] font-semibold tracking-[-1px] max-[760px]:text-[22px] m-0"
            >
              {titles[simulationType]}
            </h2>
            {scopeLabel && (
              <div className="text-(--ui-text-7de0bc) text-[11px] mt-2">{scopeLabel}</div>
            )}
            <p className="text-xs max-w-180 leading-[1.6] text-(--ui-text-8798b3) mt-1.75 max-[760px]:text-[10px] max-[760px]:max-w-[90%] mb-0">
              {simulationType === 'monte_carlo'
                ? 'A Monte Carlo simulation runs many possible market paths to show a range of financial outcomes. These 1,000 paths include your cash, investments, and debt; they are scenarios, not guarantees.'
                : simulationType === 'markov'
                  ? 'Explore how changing bull and bear markets affect your financial plan.'
                  : 'Compare repayment priorities using the same monthly budget.'}
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center border border-(--ui-border-303c54) bg-(--ui-surface-1a2538) hover:bg-(--ui-surface-hover-25354e) text-(--ui-text-d6e2f5) rounded-full w-8 h-8 shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-(--ui-border-a78bfa) focus-visible:outline-offset-2"
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
        <div className="grid grid-cols-[minmax(0,1fr)_340px] max-[1100px]:grid-cols-[minmax(0,1fr)_300px] max-[800px]:grid-cols-1 flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-gutter-stable">
          <div className="block p-6.25 min-w-0 bg-[radial-gradient(ellipse_at_top_right,var(--ui-surface-24352e26),transparent_60%)] max-[1100px]:p-4.5 max-[760px]:p-[18px_12px] max-[500px]:p-3">
            <div className="flex flex-wrap items-center gap-4 m-0 mb-6.25 p-[18px_20px] border border-(--ui-border-2b3e50) rounded-xl bg-(--ui-surface-14212a) max-[1100px]:gap-2.75 max-[1100px]:p-3.5 max-[500px]:grid max-[500px]:grid-cols-2 max-[500px]:gap-3 [&>span]:flex [&>span]:flex-col [&>span]:gap-1.5 [&_small]:text-(--ui-text-91a7ba) [&_small]:text-[9px] [&_small]:tracking-[0.35px] [&_b]:text-[clamp(12px,1.25vw,16px)] [&_b]:tabular-nums [&_b]:font-medium max-[1100px]:[&_b]:text-[13px] [&>i]:text-(--ui-text-667f92) [&>i]:not-italic max-[500px]:[&>i]:hidden">
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
              <span
                className={currentBudget.surplus < 0 ? 'negative text-coral' : 'positive text-mint'}
              >
                <small>Available after bills</small>
                <b>{dollars(currentBudget.surplus)}</b>
              </span>
            </div>
            {onOpenCoach && simulationType !== 'debt' && (
              <button
                type="button"
                onClick={onOpenCoach}
                className="mb-4 cursor-pointer rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-active-text hover:bg-hover-bg"
              >
                Compare assumptions in AI Coach
              </button>
            )}
            {!!forecast?.warnings?.length && (
              <div
                className="border-l-2 border-(--ui-border-bea16f) rounded-sm bg-(--ui-surface-30291c55) p-[10px_15px] mb-4.5 text-(--ui-text-d9bd90) text-[11px] leading-[1.7] [&>p]:m-0 [&>p]:leading-[1.7]"
                role="status"
              >
                {forecast.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            <div className="flex justify-between gap-3 items-center min-h-5 mb-2.5">
              <div className="flex gap-3.75 flex-wrap max-[760px]:gap-2.5">
                {simulationType !== 'debt'
                  ? [...quantiles].reverse().map((q) => (
                      <span
                        key={q.key}
                        className="text-[10px] text-(--ui-text-afbdd3) max-[760px]:text-[9px] inline-flex items-center gap-1.5"
                      >
                        <i
                          className="w-1.75 h-1.75 rounded-full inline-block"
                          style={{ background: q.color }}
                        />
                        {q.label}
                      </span>
                    ))
                  : debtKeys.map((key, i) => (
                      <span
                        key={key}
                        className="text-[10px] text-(--ui-text-afbdd3) max-[760px]:text-[9px] inline-flex items-center gap-1.5"
                      >
                        <i
                          className="w-1.75 h-1.75 rounded-full inline-block"
                          style={{ background: palette[i % palette.length] }}
                        />
                        {labels[key]}
                      </span>
                    ))}
              </div>
              <span className="text-[8px] tracking-[1px] text-(--ui-text-778ca8) whitespace-nowrap max-[760px]:hidden">
                {inflation && simulationType !== 'debt' ? 'TODAY’S USD' : 'USD'}
              </span>
            </div>
            <div
              className="h-[clamp(400px,49vh,590px)] min-h-100 relative flex-none max-[800px]:min-h-107.5"
              aria-busy={loading}
            >
              {error ? (
                <div
                  className="absolute inset-0 flex items-center justify-center flex-col text-center p-8 gap-3.25 text-(--ui-text-a9b9d0) text-xs"
                  role="alert"
                >
                  <h3 className="text-base m-0">Let’s get this running</h3>
                  <p className="max-w-95 m-0">{error}</p>
                  <button
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors"
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
                <div
                  className="absolute inset-0 flex items-center justify-center flex-col text-center p-8 gap-3.25 text-(--ui-text-a9b9d0) text-xs"
                  role="status"
                >
                  Calculating your scenario…
                </div>
              ) : (
                <>
                  {loading && (
                    <span
                      className="absolute right-2.5 top-0 text-[10px] bg-(--ui-surface-26314c) text-(--ui-text-d8d0f5) rounded-[5px] px-2 py-1.25 z-1"
                      role="status"
                    >
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
                        <CartesianGrid
                          strokeDasharray="3 5"
                          stroke="var(--ui-paint-263044)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="month"
                          minTickGap={30}
                          tickFormatter={(v) => `${v} mo`}
                          tick={{ fill: 'var(--ui-paint-93a1b8)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          width={72}
                          tickFormatter={(v) => money(v, true)}
                          tick={{ fill: 'var(--ui-paint-93a1b8)', fontSize: 11 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          content={({ active, payload, label }) =>
                            active && payload?.length ? (
                              <div className="p-[13px_15px] bg-(--ui-surface-1c2638) border border-(--ui-border-47536d) rounded-[9px] shadow-[0_10px_30px_var(--ui-shadow-0005)] min-w-50 text-[11px]">
                                <strong className="block text-[11px] text-(--ui-text-d9e3f3) mb-3">{`Month ${label}`}</strong>
                                {payload.map((p, i) => (
                                  <div
                                    key={String(p.dataKey)}
                                    className="flex justify-between gap-5.5 mt-2.5"
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
            <div className="flex justify-between text-[9px] text-(--ui-text-788ca8) p-[12px_6px_17px] gap-2.5 max-[760px]:text-[8px]">
              <span>{simulationType === 'debt' ? 'Months from today' : 'Years from today'}</span>
              <span>
                {simulationType === 'debt'
                  ? 'Remaining debt balance'
                  : 'Net worth = cash + investments − debt'}
              </span>
            </div>
            {forecast && (
              <div className="grid grid-cols-3 max-[760px]:gap-2.5 gap-3.75 border border-(--ui-border-2c3850) bg-(--ui-surface-172030) rounded-[9px] p-[17px_19px] max-[760px]:p-[14px_12px] [&>div]:flex [&>div]:flex-col [&>div]:gap-2.5 [&_span]:text-[9px] max-[760px]:[&_span]:text-[8px] [&_span]:text-(--ui-text-8b9fba) [&_span]:leading-[1.4] [&_strong]:text-[clamp(15px,1.7vw,23px)] max-[760px]:[&_strong]:text-[17px] [&_strong]:font-semibold [&_strong]:tracking-[-0.5px]">
                {simulationType !== 'debt' ? (
                  <>
                    <div>
                      <span>Starting net worth</span>
                      <strong>{money(metrics!.initial_investment)}</strong>
                    </div>
                    <div>
                      <span>Year {years} median</span>
                      <strong
                        className={
                          final && final.p50 < 0 ? 'negative text-coral' : 'positive text-mint'
                        }
                      >
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
                      <strong
                        className={summary?.paid_off ? 'positive text-mint' : 'negative text-coral'}
                      >
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
              <div
                className="border-l-2 border-(--ui-border-bea16f) rounded-sm bg-(--ui-surface-30291c55) p-[10px_15px] mt-3.5 mb-0 text-(--ui-text-d9bd90) text-[11px] leading-[1.7]"
                role="alert"
              >
                This budget does not clear your debt within {years} years. The last chart point is
                not a payoff date.
              </div>
            )}
            {simulationType === 'debt' && comparison && summary && (
              <p className="text-(--ui-text-8b9ab1) text-[11px] mt-3.25 mb-0 leading-[1.6]">
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
          <aside className="border-l border-(--ui-border-2c3447) bg-(--ui-surface-121c29) p-6 max-[1100px]:p-4.5 max-[800px]:p-5 max-[800px]:border-l-0 max-[800px]:border-t max-[800px]:border-(--ui-border-314257) overflow-y-auto max-[800px]:overflow-visible min-h-0 [&>section]:pb-5.75 [&>section]:mb-5.5 [&>section]:border-b [&>section]:border-(--ui-border-2c364b) max-[760px]:[&>section]:pb-4.5 max-[760px]:[&>section]:mb-4.5">
            <SimulationParameters
              graphData={graphData}
              simulationType={simulationType}
              settings={settings}
              onAssumptionsChange={onAssumptionsChange}
              marketSource={marketSource}
              setMarketSource={setMarketSource}
              assetClass={assetClass}
              setAssetClass={setAssetClass}
              returnMode={returnMode}
              setReturnMode={setReturnMode}
              annualReturn={annualReturn}
              setAnnualReturn={setAnnualReturn}
              annualVolatility={annualVolatility}
              setAnnualVolatility={setAnnualVolatility}
              years={years}
              setYears={setYears}
              horizons={horizons}
              rate={rate}
              setRate={setRate}
              scheduledInvesting={scheduledInvesting}
              setScheduledInvesting={setScheduledInvesting}
              target={target}
              setTarget={setTarget}
              fee={fee}
              setFee={setFee}
              borrowingApr={borrowingApr}
              setBorrowingApr={setBorrowingApr}
              inflation={inflation}
              setInflation={setInflation}
              inflationRate={inflationRate}
              strategy={strategy}
              setStrategy={setStrategy}
              allocation={allocation}
              setLoading={setLoading}
              setError={setError}
            />
            <SimulationMarketData
              simulationType={simulationType}
              forecast={forecast}
              loading={loading}
              onRefresh={() => setRetry((attempt) => attempt + 1)}
            />
            <SimulationOutcomeTable
              simulationType={simulationType}
              quantiles={quantiles}
              metrics={metrics}
              forecast={forecast}
            />
          </aside>
        </div>
        <footer className="flex items-center justify-between gap-4 border-t border-(--ui-border-2c3448) shrink-0 p-[12px_24px] max-[760px]:p-[10px_15px] bg-(--ui-surface-111925)">
          <span className="text-[9px] text-(--ui-text-7d90ad) max-[760px]:text-[8px]">
            Educational scenario modeling ·{' '}
            {inflation && simulationType !== 'debt' ? 'Inflation adjusted' : 'Nominal dollars'}
          </span>
          <button
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
