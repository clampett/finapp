import { useState, useEffect, useCallback, useRef } from 'react';
import type { FormEvent } from 'react';
import type { GraphData } from './finance';
import { API_BASE, dollars } from './finance';
import { sessionHeaders } from './session';
import { NumberField } from './components/NumberField';
import { changeAccount, changeCategory, changeKind } from './budgeting-drafts';

interface BudgetingTabProps {
  graph: GraphData;
}

export type TransactionKind = 'income' | 'expense';
export type StockTxnType = 'buy' | 'sell' | 'dividend' | 'split';
export type RecurrenceFrequency =
  'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

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

const initialTransaction = (): Transaction => ({
  kind: 'expense',
  accountName: '',
  description: '',
  amount: 0,
  transactionDate: new Date().toISOString().split('T')[0],
  notes: '',
});

const initialStock: Stock = {
  ticker: '',
  sharesOwned: 0,
  purchasePrice: 0,
  lastPrice: 0,
  companyName: '',
  paysDividend: false,
  exchange: '',
};

const initialRecurring = (): RecurringTransaction => ({
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

export function BudgetingTab({ graph }: BudgetingTabProps) {
  const userId =
    Number(sessionStorage.getItem('finapp_user_id') || localStorage.getItem('finapp_user_id')) || 0;

  // Active view section
  const [activeSubTab, setActiveSubTab] = useState<'transactions' | 'stocks' | 'recurring'>(
    'transactions',
  );

  // Data states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>([]);
  const [dbAccounts, setDbAccounts] = useState<AccountOption[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const activeLoad = useRef<AbortController | null>(null);
  const activeGeneration = useRef<AbortController | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'info' | 'error' | 'success';
    text: string;
  } | null>(null);

  // Transaction form state
  const [transDraft, setTransDraft] = useState<Transaction>(initialTransaction);
  const [showTransForm, setShowTransForm] = useState(false);
  const [editingTransId, setEditingTransId] = useState<number | null>(null);

  // Stock form state
  const [stockDraft, setStockDraft] = useState<Stock>(initialStock);
  const [showStockForm, setShowStockForm] = useState(false);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [quotePrice, setQuotePrice] = useState<number | null>(null);
  const [fetchingQuote, setFetchingQuote] = useState(false);

  // Debounce-fetch live market quote when typing ticker in stock form
  useEffect(() => {
    if (!showStockForm) return;
    const sym = stockDraft.ticker.trim().toUpperCase();
    if (!sym || sym.length < 1) {
      const timer = setTimeout(() => {
        setQuotePrice(null);
        setFetchingQuote(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const controller = new AbortController();
    setFetchingQuote(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(sym)}`, {
          signal: controller.signal,
          headers: sessionHeaders(),
          credentials: 'include',
        });
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.latest_price === 'number') {
            setQuotePrice(data.latest_price);
            setCurrentPrices((prev) => ({ ...prev, [sym]: data.latest_price }));
            if (data.name) {
              setStockDraft((prev) => ({
                ...prev,
                companyName: prev.companyName ? prev.companyName : data.name,
              }));
            }
          } else {
            setQuotePrice(null);
          }
        } else {
          setQuotePrice(null);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          setQuotePrice(null);
        }
      } finally {
        setFetchingQuote(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [stockDraft.ticker, showStockForm]);

  // Refresh current market prices for all tracked stocks
  const refreshCurrentPrices = useCallback(async (stockList: Stock[], signal: AbortSignal) => {
    const tickers = Array.from(new Set(stockList.map((s) => s.ticker.trim().toUpperCase()))).filter(
      Boolean,
    );
    if (tickers.length === 0) return;

    const results = await Promise.allSettled(
      tickers.map(async (ticker) => {
        const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`, {
          signal,
          headers: sessionHeaders(),
          credentials: 'include',
        });
        if (!res.ok) throw new Error('Not found');
        const data = await res.json();
        if (data && typeof data.latest_price === 'number') {
          return { ticker, price: data.latest_price };
        }
        throw new Error('Invalid price data');
      }),
    );

    const priceMap: Record<string, number> = {};
    results.forEach((r) => {
      if (r.status === 'fulfilled' && r.value) {
        priceMap[r.value.ticker] = r.value.price;
      }
    });

    if (!signal.aborted && Object.keys(priceMap).length > 0) {
      setCurrentPrices((prev) => ({ ...prev, ...priceMap }));

      // Keep database last_price synced if stale
      stockList.forEach((s) => {
        const sym = s.ticker.trim().toUpperCase();
        const livePrice = priceMap[sym];
        if (livePrice !== undefined && s.id && Number(s.lastPrice) !== livePrice) {
          fetch(`${API_BASE}/stocks/${s.id}`, {
            signal,
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
            credentials: 'include',
            body: JSON.stringify({
              ticker: s.ticker,
              companyName: s.companyName,
              exchange: s.exchange,
              lastPrice: livePrice,
            }),
          }).catch(() => {});
        }
      });
    }
  }, []);

  // Stock Buy/Sell trade modal
  const [tradeModal, setTradeModal] = useState<{
    open: boolean;
    stockId: number | null;
    ticker: string;
    type: 'buy' | 'sell';
    quantity: number;
    price: number;
    accountName: string;
    notes: string;
  }>({
    open: false,
    stockId: null,
    ticker: '',
    type: 'buy',
    quantity: 1,
    price: 0,
    accountName: '',
    notes: '',
  });

  // Recurring form state
  const [recurDraft, setRecurDraft] = useState<RecurringTransaction>(initialRecurring);
  const [showRecurForm, setShowRecurForm] = useState(false);
  const [editingRecurId, setEditingRecurId] = useState<number | null>(null);

  // Load all budgeting and stock data from API
  const loadData = useCallback(
    async (includePrices = false) => {
      if (!userId) return false;
      // Cancelled superseded reads so a late response could not replace newer budgeting data.
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      setRefreshing(true);
      try {
        const headers = { ...sessionHeaders() };
        let loadedStocks: Stock[] = [];
        // Published each completed section independently while retaining the previous visible rows.
        const read = async <T,>(path: string, apply: (data: T) => void) => {
          const response = await fetch(`${API_BASE}/${path}`, {
            headers,
            credentials: 'include',
            signal: controller.signal,
          });
          if (!response.ok) throw new Error(`Could not refresh ${path}.`);
          const json = await response.json();
          if (!Array.isArray(json.data)) throw new Error(`Invalid response for ${path}.`);
          if (!controller.signal.aborted) apply(json.data);
        };
        const results = await Promise.allSettled([
          read<Transaction[]>('transactions', setTransactions),
          read<Stock[]>('stocks', (data) => {
            loadedStocks = data;
            setStocks(data);
          }),
          read<StockPosition[]>('positions', setPositions),
          read<RecurringTransaction[]>('recurring-transactions', setRecurringList),
          read<AccountOption[]>('accounts', setDbAccounts),
        ]);
        if (controller.signal.aborted) return false;
        if (results.some((result) => result.status === 'rejected')) {
          throw new Error(
            'Some budgeting data could not be refreshed. Previous values have been kept.',
          );
        }
        // Requested market quotes only on entry or explicit refresh, avoiding downloads after every edit.
        if (includePrices) await refreshCurrentPrices(loadedStocks, controller.signal);
        return !controller.signal.aborted;
      } catch (err) {
        if (controller.signal.aborted) return false;
        console.error('Failed to load budgeting data:', err);
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'Could not load data from backend.',
        });
        return false;
      } finally {
        if (activeLoad.current === controller) {
          activeLoad.current = null;
          setRefreshing(false);
        }
      }
    },
    [userId, refreshCurrentPrices],
  );

  useEffect(() => {
    void loadData(true);
    return () => {
      activeLoad.current?.abort();
      activeLoad.current = null;
      activeGeneration.current?.abort();
      activeGeneration.current = null;
    };
  }, [loadData]);

  // Derived account options from both backend accounts and graph nodes
  const availableAccounts: string[] = Array.from(
    new Set([
      ...dbAccounts.map((a) =>
        a.name.trim().toLowerCase() === 'checking account' ? 'Checking' : a.name,
      ),
      ...(graph?.nodes
        ?.filter((n) => ['CHECKING', 'SAVINGS', 'BROKERAGE'].includes(n.nodeType))
        .map((n) => (n.name.trim().toLowerCase() === 'checking account' ? 'Checking' : n.name)) ??
        []),
      'Checking',
      'Savings',
    ]),
  )
    .filter(Boolean)
    .filter((acc) => acc.trim().toLowerCase() !== 'checking account');

  // --- Transaction Handlers ---
  const handleOpenAddTransaction = () => {
    setEditingTransId(null);
    setTransDraft(initialTransaction());
    setShowTransForm(true);
  };

  const handleEditTransaction = (t: Transaction) => {
    setEditingTransId(t.id ?? null);
    setTransDraft({
      ...t,
      accountName:
        t.accountName && t.accountName.trim().toLowerCase() === 'checking account'
          ? 'Checking'
          : t.accountName,
      transactionDate: t.transactionDate || t.date || new Date().toISOString().split('T')[0],
    });
    setShowTransForm(true);
  };

  const handleSaveTransaction = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    if (!transDraft.description.trim()) {
      setStatusMessage({ type: 'error', text: 'Description is required.' });
      return;
    }
    if (transDraft.amount <= 0) {
      setStatusMessage({ type: 'error', text: 'Amount must be greater than $0.' });
      return;
    }

    try {
      const endpoint = editingTransId
        ? `${API_BASE}/transactions/${editingTransId}`
        : `${API_BASE}/transactions`;
      const payload = {
        ...transDraft,
        transactionDate: transDraft.transactionDate || transDraft.date,
        userId,
      };

      const res = await fetch(endpoint, {
        method: editingTransId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save transaction');
      }

      setStatusMessage({
        type: 'success',
        text: editingTransId ? 'Transaction updated successfully.' : 'Transaction recorded.',
      });
      setShowTransForm(false);
      setEditingTransId(null);
      setTransDraft(initialTransaction());
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving transaction';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteTransaction = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this transaction?')) return;
    try {
      const res = await fetch(`${API_BASE}/transactions/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      setStatusMessage({ type: 'success', text: 'Transaction deleted.' });
      if (editingTransId === id) {
        setShowTransForm(false);
        setEditingTransId(null);
      }
      loadData();
    } catch (err) {
      console.error('Delete failed:', err);
      setStatusMessage({ type: 'error', text: 'Failed to delete transaction.' });
    }
  };

  // --- Stock Handlers ---
  const handleOpenAddStock = () => {
    setEditingStockId(null);
    setStockDraft(initialStock);
    setQuotePrice(null);
    setShowStockForm(true);
  };

  const handleEditStock = (s: Stock) => {
    const pos = positions.find((p) => p.stockId === s.id);
    const sym = s.ticker?.toUpperCase() || '';
    const livePrice = currentPrices[sym] ?? pos?.lastPrice ?? s.lastPrice;
    const purchasePrice =
      pos?.avgCostPerShare != null && Number(pos.avgCostPerShare) > 0
        ? Number(pos.avgCostPerShare)
        : Number(s.purchasePrice ?? s.lastPrice ?? 0);

    setEditingStockId(s.id ?? null);
    setStockDraft({
      ...s,
      purchasePrice,
      sharesOwned: pos ? pos.sharesOwned : (s.sharesOwned ?? 0),
    });
    setQuotePrice(livePrice);
    setShowStockForm(true);
  };

  const handleSaveStock = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const ticker = stockDraft.ticker.trim().toUpperCase();
    if (!ticker) {
      setStatusMessage({ type: 'error', text: 'Ticker symbol is required.' });
      return;
    }

    try {
      // 1. Fetch current price through java-backend -> python-backend
      let currentPrice: number | null = quotePrice;
      let companyName = stockDraft.companyName?.trim() || null;

      if (currentPrice == null) {
        try {
          const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`, {
            headers: sessionHeaders(),
            credentials: 'include',
          });
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.latest_price === 'number') {
              currentPrice = data.latest_price;
              if (!companyName && data.name) {
                companyName = data.name;
              }
            }
          }
        } catch {
          // If market quote is unavailable, will fallback to purchase price
        }
      }

      const purchasePrice = Number(stockDraft.purchasePrice ?? stockDraft.lastPrice) || 0;
      const finalLastPrice =
        currentPrice != null && currentPrice > 0 ? currentPrice : purchasePrice;

      const endpoint = editingStockId
        ? `${API_BASE}/stocks/${editingStockId}`
        : `${API_BASE}/stocks`;
      const payload = {
        userId,
        ticker,
        companyName,
        exchange: stockDraft.exchange?.trim() || null,
        // Included opening holdings only for creation; detail edits preserved the trade ledger.
        ...(!editingStockId
          ? { purchasePrice, sharesOwned: Number(stockDraft.sharesOwned) || 0 }
          : {}),
        lastPrice: finalLastPrice,
        paysDividend: Boolean(stockDraft.paysDividend),
        dividendFrequency: stockDraft.paysDividend ? stockDraft.dividendFrequency : null,
        dividendPerShare: stockDraft.paysDividend ? Number(stockDraft.dividendPerShare) : null,
      };

      const res = await fetch(endpoint, {
        method: editingStockId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save stock');
      }

      if (finalLastPrice > 0) {
        setCurrentPrices((prev) => ({
          ...prev,
          [ticker]: finalLastPrice,
        }));
      }

      setStatusMessage({
        type: 'success',
        text: editingStockId
          ? 'Stock updated successfully.'
          : `Stock ${ticker} added. Current price: ${dollars(finalLastPrice)}.`,
      });
      setShowStockForm(false);
      setEditingStockId(null);
      setStockDraft(initialStock);
      setQuotePrice(null);
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving stock';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteStock = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this stock and associated history?')) return;
    try {
      const res = await fetch(`${API_BASE}/stocks/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete stock');
      setStatusMessage({ type: 'success', text: 'Stock deleted.' });
      if (editingStockId === id) {
        setShowStockForm(false);
        setEditingStockId(null);
      }
      loadData();
    } catch (err) {
      console.error('Delete failed:', err);
      setStatusMessage({ type: 'error', text: 'Failed to delete stock.' });
    }
  };

  // Trade Modal
  const handleOpenTrade = (s: Stock | StockPosition, type: 'buy' | 'sell') => {
    const sId = 'stockId' in s ? s.stockId : s.id!;
    const sym = s.ticker?.toUpperCase() || '';
    const livePrice = currentPrices[sym] ?? s.lastPrice ?? 0;
    setTradeModal({
      open: true,
      stockId: sId,
      ticker: s.ticker,
      type,
      quantity: 1,
      price: livePrice,
      accountName: availableAccounts[0] || 'Brokerage',
      notes: '',
    });
  };

  const handleExecuteTrade = async (e: FormEvent) => {
    e.preventDefault();
    if (!tradeModal.stockId || tradeModal.quantity <= 0) {
      setStatusMessage({ type: 'error', text: 'Valid quantity is required.' });
      return;
    }

    try {
      const payload = {
        userId,
        stockId: tradeModal.stockId,
        type: tradeModal.type,
        quantity: tradeModal.quantity,
        pricePerShare: tradeModal.price,
        accountName: tradeModal.accountName,
        transactionDate: new Date().toISOString().split('T')[0],
        notes: tradeModal.notes,
      };

      const res = await fetch(`${API_BASE}/stock-transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Trade execution failed');
      }

      setStatusMessage({
        type: 'success',
        text: `Executed ${tradeModal.type.toUpperCase()} for ${tradeModal.quantity} shares of ${tradeModal.ticker}.`,
      });
      setTradeModal((prev) => ({ ...prev, open: false }));
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error executing trade';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // --- Recurring Handlers ---
  const handleOpenAddRecurring = () => {
    setEditingRecurId(null);
    setRecurDraft(initialRecurring());
    setShowRecurForm(true);
  };

  const handleSaveRecurring = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    if (!recurDraft.description.trim()) {
      setStatusMessage({ type: 'error', text: 'Description is required.' });
      return;
    }
    if (recurDraft.amount <= 0) {
      setStatusMessage({ type: 'error', text: 'Amount must be greater than $0.' });
      return;
    }

    try {
      const endpoint = editingRecurId
        ? `${API_BASE}/recurring-transactions/${editingRecurId}`
        : `${API_BASE}/recurring-transactions`;

      const res = await fetch(endpoint, {
        method: editingRecurId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify({ ...recurDraft, userId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save recurring template');
      }

      setStatusMessage({
        type: 'success',
        text: editingRecurId ? 'Recurring rule updated.' : 'Recurring rule created.',
      });
      setShowRecurForm(false);
      setEditingRecurId(null);
      setRecurDraft(initialRecurring());
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving recurring transaction';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteRecurring = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this recurring rule?')) return;
    try {
      const res = await fetch(`${API_BASE}/recurring-transactions/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      setStatusMessage({ type: 'success', text: 'Recurring rule deleted.' });
      loadData();
    } catch (err) {
      console.error('Delete recurring failed:', err);
      setStatusMessage({ type: 'error', text: 'Failed to delete recurring rule.' });
    }
  };

  const handleGenerateDueOccurrences = async (): Promise<void> => {
    // Guarded the write synchronously so repeated clicks could not generate concurrent occurrences.
    if (!userId || activeGeneration.current) return;
    const controller = new AbortController();
    activeGeneration.current = controller;
    setGenerating(true);
    try {
      const res = await fetch(`${API_BASE}/recurring-transactions/generate`, {
        signal: controller.signal,
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Generation failed');
      const json = await res.json();
      const count = json.data ? json.data.length : 0;
      const updated = await loadData();
      if (controller.signal.aborted) return;
      setStatusMessage({
        type: 'success',
        text: `Generated ${count} due transaction occurrence(s).${updated ? '' : ' Refresh to reload the latest data.'}`,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error(err);
      setStatusMessage({ type: 'error', text: 'Failed to generate recurring transactions.' });
    } finally {
      if (activeGeneration.current === controller) {
        activeGeneration.current = null;
        setGenerating(false);
      }
    }
  };

  // Calculations for summary banner
  const totalIncome = transactions
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpense = transactions
    .filter((t) => t.kind === 'expense')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const netCashFlow = totalIncome - totalExpense;

  const totalPurchasedValue =
    positions.length > 0
      ? positions.reduce((sum, p) => sum + Number(p.costBasis || 0), 0)
      : stocks.reduce((sum, s) => {
          const shares = Number(s.sharesOwned || 0);
          const purchasePrice = Number(s.purchasePrice ?? s.lastPrice ?? 0);
          return sum + shares * purchasePrice;
        }, 0);

  const totalPortfolioValue =
    positions.length > 0
      ? positions.reduce((sum, p) => {
          const sym = p.ticker?.toUpperCase() || '';
          const currentPrice =
            currentPrices[sym] !== undefined ? currentPrices[sym] : Number(p.lastPrice || 0);
          return sum + Number(p.sharesOwned || 0) * Number(currentPrice);
        }, 0)
      : stocks.reduce((sum, s) => {
          const sym = s.ticker?.toUpperCase() || '';
          const currentPrice =
            currentPrices[sym] !== undefined ? currentPrices[sym] : Number(s.lastPrice || 0);
          return sum + Number(s.sharesOwned || 0) * Number(currentPrice);
        }, 0);

  return (
    <div
      className="w-full max-w-300 mx-auto p-4"
    >
      {/* Header and Summary Cards */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Budgeting & Stock Portfolio</h2>
          <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] mt-1 mb-0">
            Track income, expenses, recurring payments, and stock investments in your database.
          </p>
        </div>
        {!userId && (
          <div
            style={{
              padding: '6px 12px',
              background: 'var(--ui-paint-3b2f15)',
              border: '1px solid var(--ui-paint-705822)',
              borderRadius: '4px',
              color: 'var(--ui-paint-e8c67a)',
              fontSize: '13px',
            }}
          >
            Sign in to create, update, and manage private financial data.
          </div>
        )}
      </div>

      {statusMessage && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '1rem',
            background:
              statusMessage.type === 'error'
                ? 'var(--ui-paint-3d1b1b)'
                : statusMessage.type === 'success'
                  ? 'var(--ui-paint-143825)'
                  : 'var(--ui-paint-1e2838)',
            color:
              statusMessage.type === 'error'
                ? 'var(--ui-paint-fca5a5)'
                : statusMessage.type === 'success'
                  ? 'var(--ui-paint-86efac)'
                  : 'var(--ui-paint-93c5fd)',
            border: `1px solid ${statusMessage.type === 'error' ? 'var(--ui-paint-7f1d1d)' : statusMessage.type === 'success' ? 'var(--ui-paint-166534)' : 'var(--ui-paint-2563eb)'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
            onClick={() => setStatusMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Total Income
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-4ade80)', marginTop: '4px' }}>
            {dollars(totalIncome)}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Total Expenses
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-f87171)', marginTop: '4px' }}>
            {dollars(totalExpense)}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Net Cash Flow
          </span>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: netCashFlow >= 0 ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
              marginTop: '4px',
            }}
          >
            {netCashFlow >= 0 ? `+${dollars(netCashFlow)}` : `-${dollars(Math.abs(netCashFlow))}`}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Stock Portfolio
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-38bdf8)', marginTop: '4px' }}>
            {dollars(totalPortfolioValue)}
          </div>
          {totalPurchasedValue > 0 && (
            <div
              style={{
                fontSize: '12px',
                marginTop: '4px',
                color: totalPortfolioValue >= totalPurchasedValue ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
              }}
            >
              {totalPortfolioValue >= totalPurchasedValue ? '+' : ''}
              {dollars(totalPortfolioValue - totalPurchasedValue)} (
              {(((totalPortfolioValue - totalPurchasedValue) / totalPurchasedValue) * 100).toFixed(
                2,
              )}
              %)
            </div>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--ui-paint-283347)',
          paddingBottom: '0.5rem',
          marginBottom: '1.5rem',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('transactions')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'transactions' ? 'bg-primary text-primary-fg' : 'bg-transparent text-[color:var(--ui-text-97a7c2)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Transactions ({transactions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('stocks')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'stocks' ? 'bg-primary text-primary-fg' : 'bg-transparent text-[color:var(--ui-text-97a7c2)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Stocks & Positions ({stocks.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('recurring')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'recurring' ? 'bg-primary text-primary-fg' : 'bg-transparent text-[color:var(--ui-text-97a7c2)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Recurring Rules ({recurringList.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (!activeLoad.current) void loadData(true);
          }}
          disabled={!userId}
          aria-busy={refreshing}
          aria-disabled={refreshing || !userId}
          className="inline-flex items-center justify-center gap-2 min-w-30 aria-busy:cursor-progress whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ marginLeft: 'auto', padding: '6px 12px', fontSize: '12px' }}
        >
          {refreshing ? (
            <>
              <span className="stock-loading-spinner" aria-hidden="true" /> Refreshing…
            </>
          ) : (
            '↻ Refresh'
          )}
        </button>
      </div>
      <div className="min-h-[1.4em] flex items-center gap-2 text-[color:var(--ui-text-91a3bd)] text-[13px]" role="status" aria-live="polite">
        {generating
          ? 'Generating due occurrences. You can keep browsing.'
          : refreshing
            ? 'Refreshing in the background. Your current data stays visible.'
            : ''}
      </div>

      {/* ===================== SECTION 1: TRANSACTIONS ===================== */}
      {activeSubTab === 'transactions' && (
        <section aria-labelledby="transactions-section-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h3 id="transactions-section-heading" style={{ margin: 0 }}>
                Recorded Transactions
              </h3>
              <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] mt-0.5 mb-0">
                Income and expenses linked to your accounts.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={handleOpenAddTransaction}
              disabled={!userId}
            >
              + Add Transaction
            </button>
          </div>

          {/* Transaction Form (Create / Edit) */}
          {showTransForm && (
            <div
              style={{
                background: 'var(--ui-paint-161d2b)',
                border: '1px solid var(--ui-paint-283347)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0' }}>
                {editingTransId ? 'Edit Transaction' : 'Record New Transaction'}
              </h4>
              <form
                onSubmit={handleSaveTransaction}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                }}
              >
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Kind
                  <select
                    value={transDraft.kind}
                    onChange={(e) =>
                      setTransDraft((prev) => changeKind(prev, e.target.value as TransactionKind))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    <option value="income">Income (Earnings / Inflow)</option>
                    <option value="expense">Expense (Payment / Outflow)</option>
                  </select>
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Description / Payee
                  <input
                    type="text"
                    required
                    placeholder="e.g. Salary, Trader Joe's, Electric bill"
                    value={transDraft.description}
                    onChange={(e) =>
                      setTransDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Amount ($)
                  <NumberField
                    min="0.01"
                    step="0.01"
                    required
                    value={String(transDraft.amount)}
                    onChange={(e) =>
                      setTransDraft((prev) => ({ ...prev, amount: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Account
                  <select
                    value={transDraft.accountName || ''}
                    onChange={(e) =>
                      setTransDraft((prev) => changeAccount(prev, e.target.value, dbAccounts))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    <option value="">Select or Default</option>
                    {availableAccounts.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Date
                  <input
                    type="date"
                    required
                    value={transDraft.transactionDate || transDraft.date || ''}
                    onChange={(e) =>
                      setTransDraft((prev) => ({
                        ...prev,
                        transactionDate: e.target.value,
                        date: e.target.value,
                      }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Category (optional)
                  <input
                    type="text"
                    placeholder="e.g. Groceries, Utilities, Rent"
                    value={transDraft.categoryName || ''}
                    onChange={(e) => setTransDraft((prev) => changeCategory(prev, e.target.value))}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    fontSize: '13px',
                    gridColumn: '1 / -1',
                  }}
                >
                  Notes (optional)
                  <input
                    type="text"
                    placeholder="Additional details..."
                    value={transDraft.notes || ''}
                    onChange={(e) => setTransDraft((prev) => ({ ...prev, notes: e.target.value }))}
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    gridColumn: '1 / -1',
                    marginTop: '0.5rem',
                  }}
                >
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors">
                    {editingTransId ? 'Save Changes' : 'Record Transaction'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors"
                    onClick={() => {
                      setShowTransForm(false);
                      setEditingTransId(null);
                    }}
                  >
                    Cancel
                  </button>
                  {editingTransId && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-[color:var(--ui-border-633246)] bg-[var(--ui-surface-2b1b28)] hover:bg-[var(--ui-surface-hover-3d2034)] transition-colors"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => handleDeleteTransaction(editingTransId)}
                    >
                      Delete Transaction
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Transactions Table */}
          {transactions.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px dashed var(--ui-paint-283347)',
                color: 'var(--ui-paint-8f9db3)',
              }}
            >
              No transactions recorded yet. Click <strong>+ Add Transaction</strong> to record
              income or expenses.
            </div>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px solid var(--ui-paint-283347)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--ui-paint-283347)',
                      background: 'var(--ui-paint-121824)',
                      color: 'var(--ui-paint-8f9db3)',
                    }}
                  >
                    <th style={{ padding: '12px' }}>Date</th>
                    <th style={{ padding: '12px' }}>Kind</th>
                    <th style={{ padding: '12px' }}>Description</th>
                    <th style={{ padding: '12px' }}>Account</th>
                    <th style={{ padding: '12px' }}>Category</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px' }}>Notes</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {t.transactionDate || t.date}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: t.kind === 'income' ? 'var(--ui-paint-064e3b)' : 'var(--ui-paint-7f1d1d)',
                            color: t.kind === 'income' ? 'var(--ui-paint-86efac)' : 'var(--ui-paint-fca5a5)',
                          }}
                        >
                          {t.kind}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.description}</td>
                      <td style={{ padding: '10px 12px', color: 'var(--ui-paint-93c5fd)' }}>
                        {t.accountName && t.accountName.trim().toLowerCase() === 'checking account'
                          ? 'Checking'
                          : t.accountName || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--ui-paint-d1d5db)' }}>
                        {t.categoryName || '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: t.kind === 'income' ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                        }}
                      >
                        {t.kind === 'income' ? `+${dollars(t.amount)}` : `-${dollars(t.amount)}`}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          color: 'var(--ui-paint-8f9db3)',
                          maxWidth: '200px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.notes || '—'}
                      </td>
                      <td
                        style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] text-[color:var(--ui-text-97a7c2)] hover:text-text transition-colors"
                          onClick={() => handleEditTransaction(t)}
                          style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] transition-colors"
                          style={{ color: 'var(--ui-paint-f87171)', padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => t.id && handleDeleteTransaction(t.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ===================== SECTION 2: STOCKS & POSITIONS ===================== */}
      {activeSubTab === 'stocks' && (
        <section aria-labelledby="stocks-section-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <h3
                  id="stocks-section-heading"
                  style={{
                    margin: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>Stock Holdings & Valuations</span>
                  {stocks.length > 0 && (
                    <span
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: 'var(--ui-paint-8f9db3)',
                        display: 'inline-flex',
                        gap: '6px',
                        alignItems: 'center',
                      }}
                    >
                      (Purchased Price:{' '}
                      <strong style={{ color: 'var(--ui-paint-cbd5e1)' }}>{dollars(totalPurchasedValue)}</strong> |
                      Current Price:{' '}
                      <strong
                        style={{
                          color: totalPortfolioValue >= totalPurchasedValue ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                        }}
                      >
                        {dollars(totalPortfolioValue)}
                      </strong>
                      )
                    </span>
                  )}
                </h3>
              </div>
              <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] mt-0.5 mb-0">
                Track shares, cost basis, market prices, and buy/sell operations.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={handleOpenAddStock}
              disabled={!userId}
            >
              + Add Stock Ticker
            </button>
          </div>

          {/* Stock Form (Create / Edit) */}
          {showStockForm && (
            <div
              style={{
                background: 'var(--ui-paint-161d2b)',
                border: '1px solid var(--ui-paint-283347)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0' }}>
                {editingStockId ? 'Edit Stock Details' : 'Add Stock To Portfolio'}
              </h4>
              {editingStockId && (
                <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px]">
                  Current holdings are shown for reference. Use Buy or Sell to record position
                  changes; editing stock details preserves your purchase history.
                </p>
              )}
              <form
                onSubmit={handleSaveStock}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                }}
              >
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Ticker Symbol
                  <input
                    type="text"
                    required
                    maxLength={10}
                    placeholder="e.g. AAPL, NVDA, VOO"
                    value={stockDraft.ticker}
                    onChange={(e) =>
                      setStockDraft((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Price at Purchase ($)
                  <NumberField
                    min="0"
                    step="0.01"
                    required
                    value={String(stockDraft.purchasePrice ?? stockDraft.lastPrice ?? '')}
                    readOnly={Boolean(editingStockId)}
                    onChange={(e) =>
                      setStockDraft((prev) => ({ ...prev, purchasePrice: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Shares Owned
                  <NumberField
                    min="0"
                    step="0.0001"
                    required
                    value={String(stockDraft.sharesOwned ?? 0)}
                    readOnly={Boolean(editingStockId)}
                    onChange={(e) =>
                      setStockDraft((prev) => ({ ...prev, sharesOwned: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  <span style={{ color: 'var(--ui-paint-8f9db3)' }}>Current Price ($)</span>
                  <div
                    style={{
                      padding: '8px 12px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      minHeight: '38px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    {fetchingQuote ? (
                      <span style={{ color: 'var(--ui-paint-93c5fd)', fontSize: '12px' }}>
                        Fetching current price...
                      </span>
                    ) : quotePrice != null ? (
                      <span style={{ color: 'var(--ui-paint-4ade80)', fontWeight: 600 }}>
                        {dollars(quotePrice)}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--ui-paint-64748b)', fontSize: '12px' }}>
                        Auto-fetched from market
                      </span>
                    )}
                  </div>
                </div>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Company Name (optional)
                  <input
                    type="text"
                    placeholder="e.g. Apple Inc."
                    value={stockDraft.companyName || ''}
                    onChange={(e) =>
                      setStockDraft((prev) => ({ ...prev, companyName: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    gridColumn: '1 / -1',
                    marginTop: '0.25rem',
                  }}
                >
                  <input
                    type="checkbox"
                    id="paysDividendCheckbox"
                    checked={Boolean(stockDraft.paysDividend)}
                    onChange={(e) =>
                      setStockDraft((prev) => ({ ...prev, paysDividend: e.target.checked }))
                    }
                  />
                  <label
                    htmlFor="paysDividendCheckbox"
                    style={{ fontSize: '13px', cursor: 'pointer' }}
                  >
                    Pays Dividends
                  </label>
                </div>

                {stockDraft.paysDividend && (
                  <>
                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontSize: '13px',
                      }}
                    >
                      Dividend Frequency
                      <select
                        value={stockDraft.dividendFrequency || 'quarterly'}
                        onChange={(e) =>
                          setStockDraft((prev) => ({ ...prev, dividendFrequency: e.target.value }))
                        }
                        style={{
                          padding: '8px',
                          borderRadius: '4px',
                          background: 'var(--ui-paint-0f141e)',
                          border: '1px solid var(--ui-paint-283347)',
                          color: 'white',
                        }}
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="semiannual">Semiannual</option>
                        <option value="annual">Annual</option>
                        <option value="irregular">Irregular</option>
                      </select>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px',
                        fontSize: '13px',
                      }}
                    >
                      Dividend Per Share ($)
                      <NumberField
                        min="0"
                        step="0.0001"
                        value={String(stockDraft.dividendPerShare || 0)}
                        onChange={(e) =>
                          setStockDraft((prev) => ({
                            ...prev,
                            dividendPerShare: Number(e.target.value),
                          }))
                        }
                        style={{
                          padding: '8px',
                          borderRadius: '4px',
                          background: 'var(--ui-paint-0f141e)',
                          border: '1px solid var(--ui-paint-283347)',
                          color: 'white',
                        }}
                      />
                    </label>
                  </>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    gridColumn: '1 / -1',
                    marginTop: '0.5rem',
                  }}
                >
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors">
                    {editingStockId ? 'Save Changes' : 'Add Stock'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors"
                    onClick={() => {
                      setShowStockForm(false);
                      setEditingStockId(null);
                    }}
                  >
                    Cancel
                  </button>
                  {editingStockId && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-[color:var(--ui-border-633246)] bg-[var(--ui-surface-2b1b28)] hover:bg-[var(--ui-surface-hover-3d2034)] transition-colors"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => handleDeleteStock(editingStockId)}
                    >
                      Delete Stock
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Trade Buy/Sell Modal */}
          {tradeModal.open && (
            <div
              style={{
                background: 'var(--ui-paint-1c2436)',
                border: '1px solid var(--ui-paint-3b82f6)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0' }}>
                Trade {tradeModal.ticker} —{' '}
                {tradeModal.type === 'buy' ? 'Buy Shares' : 'Sell Shares'}
              </h4>
              <form
                onSubmit={handleExecuteTrade}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                  gap: '1rem',
                }}
              >
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Action
                  <select
                    value={tradeModal.type}
                    onChange={(e) =>
                      setTradeModal((prev) => ({ ...prev, type: e.target.value as 'buy' | 'sell' }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Quantity of Shares
                  <NumberField
                    min="0.0001"
                    step="0.0001"
                    required
                    value={String(tradeModal.quantity)}
                    onChange={(e) =>
                      setTradeModal((prev) => ({ ...prev, quantity: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Price per Share ($)
                  <NumberField
                    min="0.01"
                    step="0.01"
                    required
                    value={String(tradeModal.price)}
                    onChange={(e) =>
                      setTradeModal((prev) => ({ ...prev, price: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Account
                  <select
                    value={tradeModal.accountName}
                    onChange={(e) =>
                      setTradeModal((prev) => ({ ...prev, accountName: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    {availableAccounts.map((acc) => (
                      <option key={acc} value={acc}>
                        {acc}
                      </option>
                    ))}
                  </select>
                </label>

                <div style={{ gridColumn: '1 / -1', fontSize: '13px', color: 'var(--ui-paint-93c5fd)' }}>
                  Total Estimated {tradeModal.type === 'buy' ? 'Cost' : 'Proceeds'}:{' '}
                  <strong>{dollars(tradeModal.quantity * tradeModal.price)}</strong>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', gridColumn: '1 / -1' }}>
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors">
                    Execute {tradeModal.type.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors"
                    onClick={() => setTradeModal((prev) => ({ ...prev, open: false }))}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Stocks and Positions Table */}
          {stocks.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px dashed var(--ui-paint-283347)',
                color: 'var(--ui-paint-8f9db3)',
              }}
            >
              No stock positions yet. Click <strong>+ Add Stock Ticker</strong> to track your
              investments.
            </div>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px solid var(--ui-paint-283347)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--ui-paint-283347)',
                      background: 'var(--ui-paint-121824)',
                      color: 'var(--ui-paint-8f9db3)',
                    }}
                  >
                    <th style={{ padding: '12px' }}>Ticker</th>
                    <th style={{ padding: '12px' }}>Company</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Shares Owned</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Purchased Price</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Current Price</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Market Value</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Cost Basis</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Dividends</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Trade & Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {stocks.map((stock) => {
                    const pos = positions.find((p) => p.stockId === stock.id);
                    const shares = pos
                      ? Number(pos.sharesOwned || 0)
                      : Number(stock.sharesOwned || 0);
                    const sym = stock.ticker?.toUpperCase() || '';
                    const currentPrice =
                      currentPrices[sym] !== undefined
                        ? currentPrices[sym]
                        : (pos?.lastPrice ?? stock.lastPrice ?? 0);
                    const purchasedPrice =
                      pos?.avgCostPerShare != null && Number(pos.avgCostPerShare) > 0
                        ? Number(pos.avgCostPerShare)
                        : Number(stock.purchasePrice ?? stock.lastPrice ?? 0);
                    const marketVal = shares * currentPrice;
                    const costBasis = pos?.costBasis
                      ? Number(pos.costBasis)
                      : shares * purchasedPrice;
                    const totalDiv = pos ? pos.totalDividends : 0;

                    return (
                      <tr key={stock.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ui-paint-38bdf8)' }}>
                          {stock.ticker}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--ui-paint-cbd5e1)' }}>
                          {stock.companyName || '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                          {Number(shares)
                            .toFixed(4)
                            .replace(/\.?0+$/, '')}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                          {dollars(purchasedPrice)}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: currentPrice >= purchasedPrice ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                          }}
                        >
                          {dollars(currentPrice)}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: 'var(--ui-paint-4ade80)',
                          }}
                        >
                          {dollars(marketVal)}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ui-paint-8f9db3)' }}>
                          {costBasis ? dollars(costBasis) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ui-paint-a7f3d0)' }}>
                          {totalDiv ? dollars(totalDiv) : '—'}
                        </td>
                        <td
                          style={{
                            padding: '10px 12px',
                            textAlign: 'center',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <button
                            type="button"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] transition-colors"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              marginRight: '4px',
                              color: 'var(--ui-paint-4ade80)',
                            }}
                            onClick={() => handleOpenTrade(pos || stock, 'buy')}
                          >
                            + Buy
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] transition-colors"
                            style={{
                              padding: '4px 8px',
                              fontSize: '11px',
                              marginRight: '6px',
                              color: 'var(--ui-paint-fb923c)',
                            }}
                            onClick={() => handleOpenTrade(pos || stock, 'sell')}
                          >
                            − Sell
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] text-[color:var(--ui-text-97a7c2)] hover:text-text transition-colors"
                            onClick={() => handleEditStock(stock)}
                            style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] transition-colors"
                            style={{ color: 'var(--ui-paint-f87171)', padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => stock.id && handleDeleteStock(stock.id)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ===================== SECTION 3: RECURRING TRANSACTIONS ===================== */}
      {activeSubTab === 'recurring' && (
        <section aria-labelledby="recurring-section-heading">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h3 id="recurring-section-heading" style={{ margin: 0 }}>
                Recurring Transaction Templates
              </h3>
              <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] mt-0.5 mb-0">
                Automate repeating expenses and income (e.g. rent, payroll, Netflix). Occurrences
                are generated into Transactions.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 min-w-30 aria-busy:cursor-progress whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                onClick={handleGenerateDueOccurrences}
                disabled={!userId}
                aria-busy={generating}
                aria-disabled={generating || !userId}
                title="Generate all transactions due on or before today"
              >
                {generating ? (
                  <>
                    <span className="stock-loading-spinner" aria-hidden="true" /> Generating…
                  </>
                ) : (
                  '⚡ Generate Due Occurrences'
                )}
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                onClick={handleOpenAddRecurring}
                disabled={!userId}
              >
                + Add Recurring Rule
              </button>
            </div>
          </div>

          {/* Recurring Form (Create / Edit) */}
          {showRecurForm && (
            <div
              style={{
                background: 'var(--ui-paint-161d2b)',
                border: '1px solid var(--ui-paint-283347)',
                borderRadius: '8px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
              }}
            >
              <h4 style={{ margin: '0 0 1rem 0' }}>
                {editingRecurId ? 'Edit Recurring Rule' : 'New Recurring Rule Template'}
              </h4>
              <form
                onSubmit={handleSaveRecurring}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                }}
              >
                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Kind
                  <select
                    value={recurDraft.kind}
                    onChange={(e) =>
                      setRecurDraft((prev) => changeKind(prev, e.target.value as TransactionKind))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Description
                  <input
                    type="text"
                    required
                    placeholder="e.g. Monthly Rent, Bi-weekly Salary"
                    value={recurDraft.description}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({ ...prev, description: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Amount ($)
                  <NumberField
                    min="0.01"
                    step="0.01"
                    required
                    value={String(recurDraft.amount)}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({ ...prev, amount: Number(e.target.value) }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Frequency
                  <select
                    value={recurDraft.frequency}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({
                        ...prev,
                        frequency: e.target.value as RecurrenceFrequency,
                      }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Interval Count
                  <NumberField
                    min="1"
                    step="1"
                    required
                    value={String(recurDraft.intervalCount || 1)}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({
                        ...prev,
                        intervalCount: Math.max(1, Number(e.target.value)),
                      }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Next Due Date
                  <input
                    type="date"
                    required
                    value={recurDraft.nextDueDate}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({ ...prev, nextDueDate: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  Start Date
                  <input
                    type="date"
                    required
                    value={recurDraft.startDate}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <label
                  style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
                >
                  End Date (Optional)
                  <input
                    type="date"
                    value={recurDraft.endDate || ''}
                    onChange={(e) =>
                      setRecurDraft((prev) => ({ ...prev, endDate: e.target.value || null }))
                    }
                    style={{
                      padding: '8px',
                      borderRadius: '4px',
                      background: 'var(--ui-paint-0f141e)',
                      border: '1px solid var(--ui-paint-283347)',
                      color: 'white',
                    }}
                  />
                </label>

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    gridColumn: '1 / -1',
                    marginTop: '0.5rem',
                  }}
                >
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-[var(--ui-surface-hover-cbbcfc)] transition-colors">
                    {editingRecurId ? 'Save Changes' : 'Create Recurring Rule'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors"
                    onClick={() => {
                      setShowRecurForm(false);
                      setEditingRecurId(null);
                    }}
                  >
                    Cancel
                  </button>
                  {editingRecurId && (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-[color:var(--ui-border-633246)] bg-[var(--ui-surface-2b1b28)] hover:bg-[var(--ui-surface-hover-3d2034)] transition-colors"
                      style={{ marginLeft: 'auto' }}
                      onClick={() => handleDeleteRecurring(editingRecurId)}
                    >
                      Delete Rule
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* Recurring List Table */}
          {recurringList.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '3rem',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px dashed var(--ui-paint-283347)',
                color: 'var(--ui-paint-8f9db3)',
              }}
            >
              No recurring rules set up yet. Click <strong>+ Add Recurring Rule</strong> to template
              repetitive bills or paychecks.
            </div>
          ) : (
            <div
              style={{
                overflowX: 'auto',
                background: 'var(--ui-paint-161d2b)',
                borderRadius: '8px',
                border: '1px solid var(--ui-paint-283347)',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '13px',
                }}
              >
                <thead>
                  <tr
                    style={{
                      borderBottom: '1px solid var(--ui-paint-283347)',
                      background: 'var(--ui-paint-121824)',
                      color: 'var(--ui-paint-8f9db3)',
                    }}
                  >
                    <th style={{ padding: '12px' }}>Description</th>
                    <th style={{ padding: '12px' }}>Kind</th>
                    <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                    <th style={{ padding: '12px' }}>Frequency</th>
                    <th style={{ padding: '12px' }}>Next Due</th>
                    <th style={{ padding: '12px' }}>Active</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recurringList.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.description}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            textTransform: 'uppercase',
                            background: r.kind === 'income' ? 'var(--ui-paint-064e3b)' : 'var(--ui-paint-7f1d1d)',
                            color: r.kind === 'income' ? 'var(--ui-paint-86efac)' : 'var(--ui-paint-fca5a5)',
                          }}
                        >
                          {r.kind}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                        {dollars(r.amount)}
                      </td>
                      <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                        {r.intervalCount > 1
                          ? `Every ${r.intervalCount} ${r.frequency}`
                          : r.frequency}
                      </td>
                      <td style={{ padding: '10px 12px' }}>{r.nextDueDate}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: r.isActive ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-8f9db3)' }}>
                          {r.isActive ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td
                        style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}
                      >
                        <button
                          type="button"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] text-[color:var(--ui-text-97a7c2)] hover:text-text transition-colors"
                          onClick={() => {
                            setEditingRecurId(r.id ?? null);
                            setRecurDraft(r);
                            setShowRecurForm(true);
                          }}
                          style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] transition-colors"
                          style={{ color: 'var(--ui-paint-f87171)', padding: '4px 8px', fontSize: '11px' }}
                          onClick={() => r.id && handleDeleteRecurring(r.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
