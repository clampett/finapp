import type { GraphNode } from '../common/finance';
import type { RecurringTransaction, Stock, Transaction } from './types';

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesDateRange(
  rawDate: string | undefined | null,
  startDate: string,
  endDate: string,
): boolean {
  if (!startDate && !endDate) return true;
  if (startDate && endDate && startDate > endDate) return false;
  if (!rawDate) return false;

  const trimmed = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    if (startDate && trimmed < startDate) return false;
    if (endDate && trimmed > endDate) return false;
    return true;
  }

  const itemTime = new Date(trimmed).getTime();
  if (Number.isNaN(itemTime)) return false;

  const startTime = startDate ? new Date(`${startDate}T00:00:00`).getTime() : -Infinity;
  const endTime = endDate ? new Date(`${endDate}T23:59:59.999`).getTime() : Infinity;
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return false;

  return itemTime >= startTime && itemTime <= endTime;
}

export function filterTransactions(
  transactions: Transaction[],
  searchQuery: string,
  startDate: string,
  endDate: string,
): Transaction[] {
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  return transactions.filter((t) => {
    const matchesName =
      !normalizedQuery ||
      (t.description || '').toLowerCase().includes(normalizedQuery) ||
      (t.categoryName || '').toLowerCase().includes(normalizedQuery) ||
      (t.accountName || '').toLowerCase().includes(normalizedQuery);
    const txDate = t.transactionDate ?? t.date;
    return matchesName && matchesDateRange(txDate, startDate, endDate);
  });
}

export function filterRecurringTransactions(
  recurringList: RecurringTransaction[],
  searchQuery: string,
  startDate: string,
  endDate: string,
): RecurringTransaction[] {
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  return recurringList.filter((r) => {
    const matchesName =
      !normalizedQuery ||
      (r.description || '').toLowerCase().includes(normalizedQuery) ||
      (r.categoryName || '').toLowerCase().includes(normalizedQuery) ||
      (r.accountName || '').toLowerCase().includes(normalizedQuery);
    const recurDate = r.nextDueDate || r.startDate;
    return matchesName && matchesDateRange(recurDate, startDate, endDate);
  });
}

export function filterStocks(stocks: Stock[], searchQuery: string): Stock[] {
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  if (!normalizedQuery) return stocks;
  return stocks.filter(
    (s) =>
      (s.ticker || '').toLowerCase().includes(normalizedQuery) ||
      (s.companyName || '').toLowerCase().includes(normalizedQuery) ||
      (s.exchange || '').toLowerCase().includes(normalizedQuery),
  );
}

export function filterPersonalAssets(
  nodes: GraphNode[],
  searchQuery: string,
  startDate: string,
  endDate: string,
): GraphNode[] {
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const hasDateFilter = Boolean(startDate || endDate);

  return nodes.filter((n) => {
    if (n.nodeType !== 'ASSET') return false;
    if (normalizedQuery && !n.name.toLowerCase().includes(normalizedQuery)) {
      return false;
    }
    if (hasDateFilter) {
      const rawDate = n.date ?? n.updatedAt ?? n.createdAt;
      return matchesDateRange(rawDate, startDate, endDate);
    }
    return true;
  });
}
