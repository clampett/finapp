import type { CSSProperties } from 'react';
import type { GraphData } from '../common/finance';

export type TransactionKind = 'income' | 'expense';
export type StockTxnType = 'buy' | 'sell' | 'dividend' | 'split';
export type RecurrenceFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

export interface Transaction {
  id?: number;
  userId?: number;
  kind: TransactionKind;
  accountId?: number | null;
  accountName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  description: string;
  amount: number;
  transactionDate?: string;
  date?: string;
  notes?: string;
}

export interface Stock {
  id?: number;
  userId?: number;
  ticker: string;
  companyName?: string | null;
  exchange?: string | null;
  paysDividend?: boolean;
  dividendFrequency?: string | null;
  dividendPerShare?: number | null;
  purchasePrice?: number;
  lastPrice: number;
  sharesOwned?: number;
}

export interface StockPosition {
  stockId: number;
  userId: number;
  ticker: string;
  companyName?: string | null;
  sharesOwned: number;
  costBasis: number;
  avgCostPerShare?: number | null;
  totalDividends?: number;
  totalSaleProceeds?: number;
  lastPrice: number;
  marketValue: number;
}

export interface RecurringTransaction {
  id?: number;
  userId?: number;
  accountId?: number | null;
  accountName?: string | null;
  categoryId?: number | null;
  categoryName?: string | null;
  kind: TransactionKind;
  description: string;
  amount: number;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  startDate: string;
  endDate?: string | null;
  nextDueDate: string;
  isActive: boolean;
  notes?: string;
}

export interface AccountOption {
  id: number;
  name: string;
  type?: string;
}

export interface BudgetingTabProps {
  graph: GraphData;
  rawGraph?: GraphData;
  userId?: number;
  demo?: boolean;
  portfolioValue?: number;
  onUpdateGraph?: (next: GraphData) => void;
}

export const formFieldStyle: CSSProperties = {
  padding: '8px',
  borderRadius: '4px',
  background: 'var(--ui-paint-0f141e)',
  border: '1px solid var(--ui-paint-283347)',
  color: 'var(--color-text)',
};

export const initialTransaction = (): Transaction => ({
  kind: 'expense',
  accountName: 'Checking',
  description: '',
  amount: 0,
  transactionDate: new Date().toISOString().split('T')[0],
  notes: '',
});

export const initialStock: Stock = {
  ticker: '',
  sharesOwned: 0,
  purchasePrice: 0,
  lastPrice: 0,
  companyName: '',
  paysDividend: false,
  exchange: '',
};

export const initialRecurring = (): RecurringTransaction => ({
  kind: 'expense',
  description: '',
  amount: 0,
  frequency: 'monthly',
  intervalCount: 1,
  startDate: new Date().toISOString().split('T')[0],
  nextDueDate: new Date().toISOString().split('T')[0],
  isActive: true,
  notes: '',
});
