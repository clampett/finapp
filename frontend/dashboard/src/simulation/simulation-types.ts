import type { GraphData, ScenarioAssumptions, SimulationType } from '../common/finance';
import type { projectedDividendFlows } from '../investing/portfolio';
import type { RecurringTransactionItem } from '../budgeting/budgeting-bridge';

export type { SimulationType };

export type ForecastPoint = {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  reference: number;
  [key: string]: number;
};

export type DebtRow = {
  month: number;
  freed_cash_flow: number;
  [key: string]: number;
};

export type DebtSummary = {
  paid_off: boolean;
  months: number | null;
  remaining_balance: number;
  total_interest: number;
  monthly_budget: number;
};

export interface SimulationResult {
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

export interface SimulationModalProps {
  graphData: GraphData;
  simulationType: SimulationType;
  onClose: () => void;
  onOpenCoach?: (question?: string) => void;
  onAssumptionsChange: (a: ScenarioAssumptions) => void;
  scopeLabel?: string;
  scope?: string;
  portfolioValue?: number;
  dividendFlows?: ReturnType<typeof projectedDividendFlows>;
  userId?: number;
  demo?: boolean;
  recurringTransactions?: RecurringTransactionItem[];
}

export const palette = [
  'var(--ui-paint-fb7185)',
  'var(--ui-paint-fbbf24)',
  'var(--ui-paint-a78bfa)',
  'var(--ui-paint-22d3ee)',
  'var(--ui-paint-34d399)',
  'var(--ui-paint-60a5fa)',
];

export const quantiles = [
  { key: 'p90', label: 'Upper outcome (P90)', color: 'var(--ui-paint-a4a3f6)' },
  { key: 'p50', label: 'Median (P50)', color: 'var(--ui-paint-7de0bc)' },
  { key: 'p10', label: 'Lower outcome (P10)', color: 'var(--ui-paint-ee8ea8)' },
];

export const titles = {
  monte_carlo: 'Monte Carlo Simulation',
  markov: 'Markov Regime Simulation',
  debt: 'Debt payoff optimizer',
};

export const duration = (months: number) => `${Math.floor(months / 12)} yrs, ${months % 12} mos`;
