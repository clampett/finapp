import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { GraphData } from '../common/finance';
import { API_BASE, totals } from '../common/finance';
import { sessionHeaders } from '../common/session';
import {
  PORTFOLIO_UPDATED_EVENT,
  notifyPortfolioUpdated,
  loadUnifiedHoldings,
  saveStoredPortfolioValue,
} from '../investing/portfolio';
import {
  syncGraphNodesToRecurring,
  getAvailableBudgetAccounts,
} from './budgeting-bridge';
import {
  decryptFromDemoStorage,
  encryptForDemoStorage,
} from './budget-crypto';
import type {
  Transaction,
  Stock,
  StockPosition,
  RecurringTransaction,
  AccountOption,
  BudgetingTabProps,
} from './types';
import {
  initialTransaction,
  initialStock,
  initialRecurring,
} from './types';
import type { TradeModalData } from './TradeModal';

export function useBudgetData({
  graph,
  rawGraph,
  userId: propUserId,
  demo,
  portfolioValue: propPortfolioValue,
}: BudgetingTabProps) {
  const sessionUserId =
    Number(
      sessionStorage.getItem('finapp_user_id') ||
        localStorage.getItem('finapp_user_id'),
    ) || 0;
  const userId = propUserId || sessionUserId;
  const isDemo = Boolean(demo || !sessionUserId);

  // Active view section
  const [activeSubTab, setActiveSubTab] = useState<
    'transactions' | 'recurring' | 'stocks'
  >('transactions');

  // Data states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [positions, setPositions] = useState<StockPosition[]>([]);
  const [recurringList, setRecurringList] = useState<RecurringTransaction[]>(
    [],
  );
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
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>(
    {},
  );
  const [quotePrice, setQuotePrice] = useState<number | null>(null);
  const [fetchingQuote, setFetchingQuote] = useState(false);
  const [detectedDividend, setDetectedDividend] = useState<{
    pays: boolean;
    perShare: number;
    frequency: string;
    yieldPct: number | null;
    rate: number | null;
  } | null>(null);

  // Debounce-fetch live market quote when typing ticker in stock form
  useEffect(() => {
    if (!showStockForm) return;
    if (editingStockId != null) return;
    const sym = stockDraft.ticker.trim().toUpperCase();
    if (!sym || sym.length < 1) {
      const timer = setTimeout(() => {
        setQuotePrice(null);
        setDetectedDividend(null);
        setFetchingQuote(false);
      }, 0);
      return () => clearTimeout(timer);
    }

    const controller = new AbortController();
    setFetchingQuote(true);

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/market/stocks/${encodeURIComponent(sym)}`,
          {
            signal: controller.signal,
            headers: sessionHeaders(),
            credentials: 'include',
          },
        );
        if (res.ok) {
          const data = await res.json();
          if (data && typeof data.latest_price === 'number') {
            setQuotePrice(data.latest_price);
            setCurrentPrices((prev) => ({ ...prev, [sym]: data.latest_price }));
            const hasDiv = Boolean(data.pays_dividend);
            const perShare =
              typeof data.dividend_per_share === 'number'
                ? data.dividend_per_share
                : 0;
            const freq = data.dividend_frequency || 'quarterly';
            setDetectedDividend({
              pays: hasDiv,
              perShare,
              frequency: freq,
              yieldPct: data.dividend_yield ?? null,
              rate: data.dividend_rate ?? null,
            });
            setStockDraft((prev) => ({
              ...prev,
              companyName: prev.companyName ? prev.companyName : data.name,
              paysDividend: hasDiv,
              dividendFrequency: hasDiv ? freq : prev.dividendFrequency,
              dividendPerShare: hasDiv ? perShare : prev.dividendPerShare,
            }));
          } else {
            setQuotePrice(null);
            setDetectedDividend(null);
          }
        } else {
          setQuotePrice(null);
          setDetectedDividend(null);
        }
      } catch (err: unknown) {
        if ((err as Error)?.name !== 'AbortError') {
          setQuotePrice(null);
          setDetectedDividend(null);
        }
      } finally {
        setFetchingQuote(false);
      }
    }, 350);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [stockDraft.ticker, showStockForm, editingStockId]);

  const lastQuoteRefresh = useRef<number>(0);
  const graphRef = useRef(graph);
  graphRef.current = graph;
  const rawGraphRef = useRef(rawGraph);
  rawGraphRef.current = rawGraph;

  // Refresh current market prices for all tracked stocks
  const refreshCurrentPrices = useCallback(
    async (stockList: Stock[], signal?: AbortSignal, force = false) => {
      if (!force && Date.now() - lastQuoteRefresh.current < 60000) {
        return;
      }
      const tickers = Array.from(
        new Set(stockList.map((s) => s.ticker.trim().toUpperCase())),
      ).filter(Boolean);
      if (tickers.length === 0) return;
      lastQuoteRefresh.current = Date.now();

      const results = await Promise.allSettled(
        tickers.map(async (ticker) => {
          const res = await fetch(
            `${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`,
            {
              ...(signal ? { signal } : {}),
              headers: sessionHeaders(),
              credentials: 'include',
            },
          );
          if (!res.ok) throw new Error('Not found');
          const data = await res.json().catch(() => null);
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

      if (!signal?.aborted && Object.keys(priceMap).length > 0) {
        setCurrentPrices((prev) => ({ ...prev, ...priceMap }));

        // Keep database last_price synced if stale
        stockList.forEach((s) => {
          const sym = s.ticker.trim().toUpperCase();
          const livePrice = priceMap[sym];
          if (
            livePrice !== undefined &&
            s.id &&
            Number(s.lastPrice) !== livePrice
          ) {
            fetch(`${API_BASE}/stocks/${s.id}`, {
              ...(signal ? { signal } : {}),
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...sessionHeaders(),
              },
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
    },
    [],
  );

  // Stock Buy/Sell trade modal
  const [tradeModal, setTradeModal] = useState<TradeModalData>({
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
  const [recurDraft, setRecurDraft] =
    useState<RecurringTransaction>(initialRecurring);
  const [showRecurForm, setShowRecurForm] = useState(false);
  const [editingRecurId, setEditingRecurId] = useState<number | null>(null);

  // Load all budgeting and stock data from API or demo storage
  const loadData = useCallback(
    async (includePrices = false, forcePrices = false) => {
      // Demo mode or unauthenticated fallback
      if (isDemo) {
        activeLoad.current?.abort();
        const controller = new AbortController();
        activeLoad.current = controller;
        setRefreshing(true);
        try {
          const storageKey = `finapp-holdings-v1:demo:${userId || 1}`;
          const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
          const { stocks: loadedStocks, positions: loadedPositions } =
            await loadUnifiedHoldings(
              storageKey,
              userId || 1,
              true,
              controller.signal,
            );
          if (controller.signal.aborted) return false;
          setStocks(loadedStocks);
          setPositions(loadedPositions);

          let demoTxns: Transaction[] = [];
          let demoRecur: RecurringTransaction[] = [];
          try {
            const savedRaw = localStorage.getItem(budgetStorageKey);
            const parsed = await decryptFromDemoStorage<
              Record<string, unknown>
            >(budgetStorageKey, savedRaw);
            if (parsed) {
              demoTxns = Array.isArray(parsed.transactions)
                ? (parsed.transactions as Transaction[])
                : [];
              demoRecur = Array.isArray(parsed.recurring)
                ? (parsed.recurring as RecurringTransaction[])
                : [];
            }
          } catch (err) {
            setStatusMessage({ type: 'error', text: (err as Error).message });
            return false;
          }

          // Single, non-recurring sample transactions (e.g. grocery trip, coffee, dining out)
          if (!localStorage.getItem(budgetStorageKey)) {
            const now = new Date().toISOString().split('T')[0];
            demoTxns = [
              {
                id: 1,
                kind: 'expense',
                accountName: 'Checking',
                categoryName: 'Groceries',
                description: 'Grocery Trip - Trader Joe’s',
                amount: 112.5,
                transactionDate: now,
                notes: 'Weekly groceries',
              },
              {
                id: 2,
                kind: 'expense',
                accountName: 'Checking',
                categoryName: 'Food & Dining',
                description: 'Coffee Shop',
                amount: 6.75,
                transactionDate: now,
                notes: 'Morning coffee',
              },
              {
                id: 3,
                kind: 'expense',
                accountName: 'Checking',
                categoryName: 'Transportation',
                description: 'Gas Station',
                amount: 45.0,
                transactionDate: now,
                notes: 'Fuel',
              },
              {
                id: 4,
                kind: 'expense',
                accountName: 'Checking',
                categoryName: 'Food & Dining',
                description: 'Dinner with Friends',
                amount: 68.2,
                transactionDate: now,
                notes: 'Weekend dining out',
              },
              {
                id: 5,
                kind: 'expense',
                accountName: 'Checking',
                categoryName: 'Household',
                description: 'Target Home Supplies',
                amount: 38.45,
                transactionDate: now,
                notes: 'Cleaning supplies',
              },
            ];
          }

          const { updatedRecurring: syncedDemoRecur, hasChanges } =
            syncGraphNodesToRecurring(
              rawGraphRef.current ?? graphRef.current,
              demoRecur,
            );
          if (hasChanges || !localStorage.getItem(budgetStorageKey))
            try {
              localStorage.setItem(
                budgetStorageKey,
                await encryptForDemoStorage(budgetStorageKey, {
                  transactions: demoTxns,
                  recurring: syncedDemoRecur,
                }),
              );
            } catch {}

          setTransactions(demoTxns);
          setRecurringList(syncedDemoRecur);
          isInitialLoaded.current = true;
          lastSyncedGraph.current = graphRef.current;
          if (includePrices)
            await refreshCurrentPrices(
              loadedStocks,
              controller.signal,
              forcePrices,
            );
          return true;
        } finally {
          if (activeLoad.current === controller) {
            activeLoad.current = null;
            setRefreshing(false);
          }
        }
      }

      if (!userId) return false;
      activeLoad.current?.abort();
      const controller = new AbortController();
      activeLoad.current = controller;
      setRefreshing(true);
      try {
        const headers = { ...sessionHeaders() };
        let loadedStocks: Stock[] = [];
        const read = async <T>(
          path: string,
          apply: (data: T) => void | Promise<void>,
        ) => {
          if (controller.signal.aborted) return;
          const response = await fetch(`${API_BASE}/${path}`, {
            headers,
            credentials: 'include',
            signal: controller.signal,
          });
          if (controller.signal.aborted) return;
          if (!response.ok) {
            let errorMsg = `Could not refresh ${path}.`;
            try {
              const errJson = await response.json();
              if (errJson?.message) errorMsg = errJson.message;
            } catch {}
            throw new Error(errorMsg);
          }
          let json: any = null;
          try {
            json = await response.json();
          } catch {
            throw new Error(`Invalid response for ${path}.`);
          }
          if (!Array.isArray(json?.data))
            throw new Error(`Invalid response for ${path}.`);
          if (!controller.signal.aborted) await apply(json.data);
        };

        const synchronizeRecurring = (task: () => Promise<void>) =>
          navigator.locks
            ? navigator.locks.request('finapp-recurring:' + userId, task)
            : task();

        const results = await Promise.allSettled([
          read<Transaction[]>('transactions', setTransactions),
          read<Stock[]>('stocks', (data) => {
            loadedStocks = data;
            setStocks(data);
          }),
          read<StockPosition[]>('positions', setPositions),
          synchronizeRecurring(() =>
            read<RecurringTransaction[]>(
              'recurring-transactions',
              async (data) => {
                const { newRules, updatedRules } = syncGraphNodesToRecurring(
                  rawGraphRef.current ?? graphRef.current,
                  data,
                );
                const write = async (
                  rule: RecurringTransaction,
                  existing: boolean,
                ) => {
                  const path = existing
                    ? '/recurring-transactions/' + rule.id
                    : '/recurring-transactions';
                  const response = await fetch(API_BASE + path, {
                    method: existing ? 'PUT' : 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...headers,
                    },
                    credentials: 'include',
                    body: JSON.stringify(
                      existing
                        ? {
                            amount: rule.amount,
                            kind: rule.kind,
                            isActive: rule.isActive,
                          }
                        : { ...rule, id: undefined, userId },
                    ),
                  });
                  if (!response.ok)
                    throw new Error('Could not synchronize recurring rules.');
                  return (await response.json()).data as RecurringTransaction;
                };

                const saved = [...data];
                for (const rule of updatedRules) {
                  if (controller.signal.aborted) return;
                  const result = await write(rule, true);
                  const index = saved.findIndex((row) => row.id === result.id);
                  if (index >= 0) saved[index] = result;
                }
                for (const rule of newRules) {
                  if (controller.signal.aborted) return;
                  saved.push(await write(rule, false));
                }
                if (!controller.signal.aborted) setRecurringList(saved);
              },
            ),
          ),
          read<AccountOption[]>('accounts', setDbAccounts),
        ]);
        if (controller.signal.aborted) return false;
        if (results.some((result) => result.status === 'rejected')) {
          if (controller.signal.aborted) return false;
          throw new Error(
            'Some budgeting data could not be refreshed. Previous values have been kept.',
          );
        }
        isInitialLoaded.current = true;
        lastSyncedGraph.current = graphRef.current;
        if (includePrices)
          await refreshCurrentPrices(
            loadedStocks,
            controller.signal,
            forcePrices,
          );
        return !controller.signal.aborted;
      } catch (err) {
        if (controller.signal.aborted) return false;
        console.error('Failed to load budgeting data:', err);
        setStatusMessage({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'We couldn’t load your budget. Please try again.',
        });
        return false;
      } finally {
        if (activeLoad.current === controller) {
          activeLoad.current = null;
          setRefreshing(false);
        }
      }
    },
    [userId, isDemo, refreshCurrentPrices],
  );

  const isSelfUpdate = useRef(false);
  const isInitialLoaded = useRef(false);
  const lastSyncedGraph = useRef<GraphData | null>(null);

  useEffect(() => {
    isInitialLoaded.current = false;
    lastSyncedGraph.current = null;
    void loadData(false);
    return () => {
      activeLoad.current?.abort();
      activeLoad.current = null;
      activeGeneration.current?.abort();
      activeGeneration.current = null;
    };
  }, [userId, isDemo, loadData]);

  // Synchronize stocks when prices are updated at login or page refresh
  useEffect(() => {
    const handlePortfolioUpdated = () => {
      if (isSelfUpdate.current) return;
      void loadData(false);
    };
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdated);
    return () =>
      window.removeEventListener(
        PORTFOLIO_UPDATED_EVENT,
        handlePortfolioUpdated,
      );
  }, [loadData]);

  // Reloaded recurring rules when the active graph changed while this tab was open.
  useEffect(() => {
    if (!isInitialLoaded.current || lastSyncedGraph.current === graph) return;
    lastSyncedGraph.current = graph;
    void loadData(false);
  }, [graph, loadData]);

  const availableAccounts = useMemo(
    () => getAvailableBudgetAccounts(graph, dbAccounts),
    [graph, dbAccounts],
  );

  useEffect(() => {
    if (
      transDraft.accountName &&
      !availableAccounts.some(
        (a) => a.toLowerCase() === transDraft.accountName?.trim().toLowerCase(),
      )
    ) {
      setTransDraft((prev) => ({
        ...prev,
        accountName: availableAccounts[0] || 'Checking',
        accountId: undefined,
      }));
    }
  }, [availableAccounts, transDraft.accountName]);

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
            currentPrices[sym] !== undefined
              ? currentPrices[sym]
              : Number(p.lastPrice || 0);
          return sum + Number(p.sharesOwned || 0) * Number(currentPrice);
        }, 0)
      : stocks.reduce((sum, s) => {
          const sym = s.ticker?.toUpperCase() || '';
          const currentPrice =
            currentPrices[sym] !== undefined
              ? currentPrices[sym]
              : Number(s.lastPrice || 0);
          return sum + Number(s.sharesOwned || 0) * Number(currentPrice);
        }, 0);

  const activePortfolioValue =
    propPortfolioValue !== undefined
      ? propPortfolioValue
      : totalPortfolioValue;
  const currentTotals = totals(graph, activePortfolioValue);
  const currentNetWorth = currentTotals.netWorth;

  useEffect(() => {
    const storageKey = `finapp-holdings-v1:${isDemo ? 'demo' : 'user'}:${userId || 1}`;
    if (totalPortfolioValue >= 0) {
      if (saveStoredPortfolioValue(storageKey, totalPortfolioValue)) {
        isSelfUpdate.current = true;
        notifyPortfolioUpdated();
        queueMicrotask(() => {
          isSelfUpdate.current = false;
        });
      }
    }
  }, [totalPortfolioValue, isDemo, userId]);

  return {
    userId,
    isDemo,
    activeSubTab,
    setActiveSubTab,
    transactions,
    setTransactions,
    stocks,
    setStocks,
    positions,
    setPositions,
    recurringList,
    setRecurringList,
    dbAccounts,
    refreshing,
    generating,
    setGenerating,
    statusMessage,
    setStatusMessage,
    activeLoad,
    activeGeneration,
    transDraft,
    setTransDraft,
    showTransForm,
    setShowTransForm,
    editingTransId,
    setEditingTransId,
    stockDraft,
    setStockDraft,
    showStockForm,
    setShowStockForm,
    editingStockId,
    setEditingStockId,
    currentPrices,
    setCurrentPrices,
    quotePrice,
    setQuotePrice,
    fetchingQuote,
    detectedDividend,
    setDetectedDividend,
    tradeModal,
    setTradeModal,
    recurDraft,
    setRecurDraft,
    showRecurForm,
    setShowRecurForm,
    editingRecurId,
    setEditingRecurId,
    availableAccounts,
    totalPurchasedValue,
    totalPortfolioValue,
    currentTotals,
    currentNetWorth,
    loadData,
    refreshCurrentPrices,
    rawGraphRef,
    graphRef,
  };
}
