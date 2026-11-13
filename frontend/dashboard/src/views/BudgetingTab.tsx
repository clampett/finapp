import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import type { GraphData } from '../common/finance';
import { API_BASE, dollars, totals } from '../common/finance';
import { sessionHeaders } from '../common/session';
import {
  PORTFOLIO_UPDATED_EVENT,
  notifyPortfolioUpdated,
  loadUnifiedHoldings,
  addStockUnified,
  removeStockUnified,
  updateSharesUnified,
  saveStoredPortfolioValue,
} from '../investing/portfolio';
import {
  getScenarioSalary,
  getScenarioDebts,
  getScenarioBudgetComparison,
  createSalaryRecurringTemplates,
  createDebtRecurringTemplates,
  syncScenarioTransactionToGraph,
  syncGraphNodesToRecurring,
  syncRecurringToGraphNode,
  syncRecurringDeletionToGraph,
  getAvailableBudgetAccounts,
} from '../budgeting/budgeting-bridge';
import {
  DEMO_BUDGET_ENC_PREFIX,
  toB64,
  fromB64,
  getDemoStorageSecret,
  deriveDemoCryptoKey,
  encryptForDemoStorage,
  decryptFromDemoStorage,
} from '../budgeting/budget-crypto';
import type {
  TransactionKind,
  StockTxnType,
  RecurrenceFrequency,
  Transaction,
  Stock,
  StockPosition,
  RecurringTransaction,
  AccountOption,
  BudgetingTabProps,
} from '../budgeting/types';
import {
  initialTransaction,
  initialStock,
  initialRecurring,
} from '../budgeting/types';
import { BudgetSummaryCards } from '../budgeting/BudgetSummaryCards';
import { TransactionSection } from '../budgeting/TransactionSection';
import { StockSection } from '../budgeting/StockSection';
import type { TradeModalData } from '../budgeting/TradeModal';
import { RecurringSection } from '../budgeting/RecurringSection';

// Re-export for compatibility with tests & external consumers
export {
  DEMO_BUDGET_ENC_PREFIX,
  toB64,
  fromB64,
  getDemoStorageSecret,
  deriveDemoCryptoKey,
  encryptForDemoStorage,
  decryptFromDemoStorage,
};
export type {
  TransactionKind,
  StockTxnType,
  RecurrenceFrequency,
  Transaction,
  Stock,
  StockPosition,
  RecurringTransaction,
  AccountOption,
  BudgetingTabProps,
};

export function BudgetingTab({
  graph,
  rawGraph,
  userId: propUserId,
  demo,
  portfolioValue: propPortfolioValue,
  onUpdateGraph,
}: BudgetingTabProps) {
  const sessionUserId =
    Number(sessionStorage.getItem('finapp_user_id') || localStorage.getItem('finapp_user_id')) || 0;
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
            const hasDiv = Boolean(data.pays_dividend);
            const perShare = typeof data.dividend_per_share === 'number' ? data.dividend_per_share : 0;
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
      const tickers = Array.from(new Set(stockList.map((s) => s.ticker.trim().toUpperCase()))).filter(
        Boolean,
      );
      if (tickers.length === 0) return;
      lastQuoteRefresh.current = Date.now();

      const results = await Promise.allSettled(
        tickers.map(async (ticker) => {
          const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`, {
            ...(signal ? { signal } : {}),
            headers: sessionHeaders(),
            credentials: 'include',
          });
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
          if (livePrice !== undefined && s.id && Number(s.lastPrice) !== livePrice) {
            fetch(`${API_BASE}/stocks/${s.id}`, {
              ...(signal ? { signal } : {}),
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
  const [recurDraft, setRecurDraft] = useState<RecurringTransaction>(initialRecurring);
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
          const { stocks: loadedStocks, positions: loadedPositions } = await loadUnifiedHoldings(
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
            const parsed = await decryptFromDemoStorage<Record<string, unknown>>(
              budgetStorageKey,
              savedRaw,
            );
            if (parsed) {
              demoTxns = Array.isArray(parsed.transactions) ? (parsed.transactions as Transaction[]) : [];
              demoRecur = Array.isArray(parsed.recurring) ? (parsed.recurring as RecurringTransaction[]) : [];
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

          const { updatedRecurring: syncedDemoRecur, hasChanges } = syncGraphNodesToRecurring(
            rawGraphRef.current ?? graphRef.current,
            demoRecur,
          );
          if (hasChanges || !localStorage.getItem(budgetStorageKey)) try {
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
          if (includePrices) await refreshCurrentPrices(loadedStocks, controller.signal, forcePrices);
          return true;
        } finally {
          if (activeLoad.current === controller) {
            activeLoad.current = null;
            setRefreshing(false);
          }
        }
      }

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
        const read = async <T,>(path: string, apply: (data: T) => void | Promise<void>) => {
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
            } catch {
              // Ignore non-json body
            }
            throw new Error(errorMsg);
          }
          let json: any = null;
          try {
            json = await response.json();
          } catch {
            throw new Error(`Invalid response for ${path}.`);
          }
          if (!Array.isArray(json?.data)) throw new Error(`Invalid response for ${path}.`);
          if (!controller.signal.aborted) await apply(json.data);
        };
        // Serialized reconciliation across tabs so each pass fetched the latest saved rules.
        const synchronizeRecurring = (task: () => Promise<void>) =>
          navigator.locks ? navigator.locks.request('finapp-recurring:' + userId, task) : task();
        const results = await Promise.allSettled([
          read<Transaction[]>('transactions', setTransactions),
          read<Stock[]>('stocks', (data) => {
            loadedStocks = data;
            setStocks(data);
          }),
          read<StockPosition[]>('positions', setPositions),
          synchronizeRecurring(() => read<RecurringTransaction[]>('recurring-transactions', async (data) => {
            const { newRules, updatedRules } = syncGraphNodesToRecurring(rawGraphRef.current ?? graphRef.current, data);
            const write = async (rule: RecurringTransaction, existing: boolean) => {
              const path = existing ? '/recurring-transactions/' + rule.id : '/recurring-transactions';
              const response = await fetch(API_BASE + path, {
                method: existing ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                credentials: 'include',
                body: JSON.stringify(existing ? { amount: rule.amount, kind: rule.kind, isActive: rule.isActive } : { ...rule, id: undefined, userId }),
              });
              if (!response.ok) throw new Error('Could not synchronize recurring rules.');
              return (await response.json()).data as RecurringTransaction;
            };
            // Applied saved rules in order and retained database IDs for subsequent edits.
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
          })),
          // Loaded saved accounts independently of the browser’s scenario nodes.
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
        // Requested market quotes only on entry or explicit refresh, avoiding downloads after every edit.
        if (includePrices) await refreshCurrentPrices(loadedStocks, controller.signal, forcePrices);
        return !controller.signal.aborted;
      } catch (err) {
        if (controller.signal.aborted) return false;
        console.error('Failed to load budgeting data:', err);
        setStatusMessage({
          type: 'error',
          text: err instanceof Error ? err.message : 'We couldn’t load your budget. Please try again.',
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
    // Only load budgeting data without re-fetching live market prices on tab entry
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
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdated);
  }, [loadData]);

  // Reloaded recurring rules when the active graph changed while this tab was open.
  useEffect(() => {
    if (!isInitialLoaded.current || lastSyncedGraph.current === graph) return;
    lastSyncedGraph.current = graph;
    void loadData(false);
  }, [graph, loadData]);

  const availableAccounts = useMemo(() => getAvailableBudgetAccounts(graph, dbAccounts), [graph, dbAccounts]);
  // Ensure transaction draft account stays valid when an account or loan is deleted
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

    let syncResult: ReturnType<typeof syncScenarioTransactionToGraph> | null = null;
    let syncStatusMsg = '';
    const baseInitial = rawGraph || graph;
    if (onUpdateGraph && baseInitial) {
      const prevTxn = editingTransId ? transactions.find((t) => t.id === editingTransId) : null;
      let baseGraph = baseInitial;
      if (prevTxn) {
        const reverseTxn = {
          kind: prevTxn.kind === 'income' ? ('expense' as TransactionKind) : ('income' as TransactionKind),
          accountName: prevTxn.accountName || 'Checking',
          description: prevTxn.description,
          amount: prevTxn.amount,
          categoryName: prevTxn.categoryName,
          isReversal: true,
        };
        const reverseResult = syncScenarioTransactionToGraph(baseGraph, reverseTxn);
        if (reverseResult) {
          baseGraph = reverseResult.updatedGraph;
        }
      }

      syncResult = syncScenarioTransactionToGraph(baseGraph, transDraft);
      if (syncResult) {
        if (syncResult.isNew) {
          syncStatusMsg = ` Created ${syncResult.matchedNode.name} node with balance ${dollars(syncResult.newBalance)} (Net Worth updated).`;
        } else if (syncResult.matchedNode.nodeType === 'DEBT') {
          syncStatusMsg = ` Paid down ${syncResult.matchedNode.name} to ${dollars(syncResult.newBalance)}.`;
        } else if (transDraft.kind === 'income') {
          syncStatusMsg = ` Added ${dollars(transDraft.amount)} to ${syncResult.matchedNode.name} balance (Net Worth +${dollars(transDraft.amount)}).`;
        } else {
          syncStatusMsg = ` Deducted ${dollars(transDraft.amount)} from ${syncResult.matchedNode.name} balance (Net Worth -${dollars(transDraft.amount)}).`;
        }
        if (syncResult.insufficientFunds) {
          syncStatusMsg += ` (Account overdraft: ${dollars(syncResult.newBalance)}).`;
        }
      }
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      let updated: Transaction[];
      if (editingTransId) {
        updated = transactions.map((t) =>
          t.id === editingTransId
            ? {
                ...transDraft,
                id: editingTransId,
                transactionDate: transDraft.transactionDate || transDraft.date,
              }
            : t,
        );
      } else {
        const newId = Math.max(0, ...transactions.map((t) => t.id || 0)) + 1;
        updated = [
          {
            ...transDraft,
            id: newId,
            transactionDate: transDraft.transactionDate || transDraft.date,
          },
          ...transactions,
        ];
      }
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.transactions = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setTransactions(updated);
      if (syncResult && onUpdateGraph) {
        onUpdateGraph(syncResult.updatedGraph);
      }
      setStatusMessage({
        type: 'success',
        text: (editingTransId ? 'Transaction updated successfully.' : 'Transaction recorded.') + syncStatusMsg,
      });
      setShowTransForm(false);
      setEditingTransId(null);
      setTransDraft(initialTransaction());
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

      if (syncResult && onUpdateGraph) {
        onUpdateGraph(syncResult.updatedGraph);
      }

      setStatusMessage({
        type: 'success',
        text: (editingTransId ? 'Transaction updated successfully.' : 'Transaction recorded.') + syncStatusMsg,
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
    const transToDelete = transactions.find((t) => t.id === id);
    let reverseSync: ReturnType<typeof syncScenarioTransactionToGraph> | null = null;
    const baseGraph = rawGraph || graph;
    if (transToDelete && onUpdateGraph && baseGraph) {
      const reverseTxn = {
        kind: transToDelete.kind === 'income' ? ('expense' as TransactionKind) : ('income' as TransactionKind),
        accountName: transToDelete.accountName || 'Checking',
        description: transToDelete.description,
        amount: transToDelete.amount,
        categoryName: transToDelete.categoryName,
        isReversal: true,
      };
      reverseSync = syncScenarioTransactionToGraph(baseGraph, reverseTxn);
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      const updated = transactions.filter((t) => t.id !== id);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.transactions = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setTransactions(updated);
      if (reverseSync && onUpdateGraph) {
        onUpdateGraph(reverseSync.updatedGraph);
      }
      setStatusMessage({ type: 'success', text: 'Transaction deleted.' });
      if (editingTransId === id) {
        setShowTransForm(false);
        setEditingTransId(null);
      }
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/transactions/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to delete transaction');
      }
      if (reverseSync && onUpdateGraph) {
        onUpdateGraph(reverseSync.updatedGraph);
      }
      setStatusMessage({ type: 'success', text: 'Transaction deleted.' });
      if (editingTransId === id) {
        setShowTransForm(false);
        setEditingTransId(null);
      }
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error deleting transaction';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  // --- Stock Handlers ---
  const handleOpenAddStock = () => {
    setEditingStockId(null);
    setStockDraft(initialStock);
    setQuotePrice(null);
    setDetectedDividend(null);
    setShowStockForm(true);
    // Refresh current stock prices when trying to add a new stock
    if (stocks.length > 0) {
      void refreshCurrentPrices(stocks, undefined, true);
    }
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
    setDetectedDividend(
      s.paysDividend
        ? {
            pays: true,
            perShare: Number(s.dividendPerShare || 0),
            frequency: s.dividendFrequency || 'quarterly',
            yieldPct: null,
            rate: null,
          }
        : null,
    );
    setShowStockForm(true);
  };

  const handleSaveStock = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const ticker = stockDraft.ticker.trim().toUpperCase();
    if (!ticker) {
      setStatusMessage({ type: 'error', text: 'Ticker symbol is required.' });
      return;
    }

    if (isDemo) {
      const storageKey = `finapp-holdings-v1:demo:${userId || 1}`;
      let currentPrice: number | null = quotePrice;
      let companyName = stockDraft.companyName?.trim() || null;
      let paysDividend = Boolean(stockDraft.paysDividend);
      let dividendFrequency = stockDraft.dividendFrequency || 'quarterly';
      let dividendPerShare =
        stockDraft.dividendPerShare != null ? Number(stockDraft.dividendPerShare) : null;

      if (currentPrice == null) {
        try {
          const res = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`);
          if (res.ok) {
            const data = await res.json();
            if (data && typeof data.latest_price === 'number') {
              currentPrice = data.latest_price;
              if (!companyName && data.name) companyName = data.name;
              if (data.pays_dividend && !paysDividend) {
                paysDividend = true;
                dividendFrequency = data.dividend_frequency || 'quarterly';
                dividendPerShare = data.dividend_per_share ?? 0;
              }
            }
          }
        } catch {}
      }

      const finalPrice =
        currentPrice || Number(stockDraft.purchasePrice || stockDraft.lastPrice) || 100;
      const shares = Number(stockDraft.sharesOwned || 1);
      const purchasePrice = Number(stockDraft.purchasePrice ?? stockDraft.lastPrice ?? finalPrice);

      await addStockUnified({
        storageKey,
        userId: userId || 1,
        demo: true,
        symbol: ticker,
        companyName,
        price: finalPrice,
        purchasePrice,
        shares,
        paysDividend,
        dividendFrequency: paysDividend ? dividendFrequency : null,
        dividendPerShare: paysDividend ? dividendPerShare : null,
        stockId: editingStockId ?? undefined,
      });

      setStatusMessage({
        type: 'success',
        text: editingStockId
          ? `Stock ${ticker} updated. Current price: ${dollars(finalPrice)}.`
          : `Stock ${ticker} added. Current price: ${dollars(finalPrice)}.`,
      });
      setShowStockForm(false);
      setEditingStockId(null);
      setStockDraft(initialStock);
      setDetectedDividend(null);
      setQuotePrice(null);
      void loadData();
      return;
    }

    try {
      // 1. Fetch current price and dividend data through java-backend -> python-backend if not already loaded
      let currentPrice: number | null = quotePrice;
      let companyName = stockDraft.companyName?.trim() || null;
      let paysDividend = Boolean(stockDraft.paysDividend);
      let dividendFrequency = stockDraft.dividendFrequency || 'quarterly';
      let dividendPerShare =
        stockDraft.dividendPerShare != null ? Number(stockDraft.dividendPerShare) : null;

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
              if (data.pays_dividend && !paysDividend) {
                paysDividend = true;
                dividendFrequency = data.dividend_frequency || 'quarterly';
                dividendPerShare = data.dividend_per_share ?? 0;
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
      const shares = Number(stockDraft.sharesOwned) || 0;

      const endpoint = editingStockId
        ? `${API_BASE}/stocks/${editingStockId}`
        : `${API_BASE}/stocks`;
      const payload = {
        userId,
        ticker,
        companyName,
        exchange: stockDraft.exchange?.trim() || null,
        // Included opening holdings only for creation; detail edits preserved the trade ledger.
        ...(!editingStockId ? { purchasePrice, sharesOwned: shares } : {}),
        lastPrice: finalLastPrice,
        paysDividend,
        dividendFrequency: paysDividend ? dividendFrequency : null,
        dividendPerShare: paysDividend ? dividendPerShare : null,
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

      // If editing in live database mode and shares were adjusted, record balancing trade
      if (editingStockId) {
        const originalPos = positions.find((p) => p.stockId === editingStockId);
        const originalShares = originalPos ? Number(originalPos.sharesOwned) : 0;
        const delta = shares - originalShares;
        if (delta !== 0) {
          try {
            await fetch(`${API_BASE}/stock-transactions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
              credentials: 'include',
              body: JSON.stringify({
                userId,
                stockId: editingStockId,
                type: delta > 0 ? 'buy' : 'sell',
                quantity: Math.abs(delta),
                pricePerShare: purchasePrice > 0 ? purchasePrice : finalLastPrice,
                accountName: availableAccounts[0] || 'Brokerage',
                transactionDate: new Date().toISOString().split('T')[0],
                notes: 'Position adjusted via edit',
              }),
            });
          } catch (e) {
            console.error('Failed to adjust stock transaction position:', e);
          }
        }
      }

      setStatusMessage({
        type: 'success',
        text: editingStockId
          ? `Stock ${ticker} updated. Current price: ${dollars(finalLastPrice)}.`
          : `Stock ${ticker} added. Current price: ${dollars(finalLastPrice)}.`,
      });
      setShowStockForm(false);
      setEditingStockId(null);
      setStockDraft(initialStock);
      setDetectedDividend(null);
      setQuotePrice(null);
      notifyPortfolioUpdated();
      loadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving stock';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteStock = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this stock and associated history?')) return;
    if (isDemo) {
      const storageKey = `finapp-holdings-v1:demo:${userId || 1}`;
      const stock = stocks.find((s) => s.id === id);
      if (stock) {
        await removeStockUnified({
          storageKey,
          userId: userId || 1,
          demo: true,
          symbol: stock.ticker,
          stockId: id,
        });
      }
      setStatusMessage({ type: 'success', text: 'Stock deleted.' });
      if (editingStockId === id) {
        setShowStockForm(false);
        setEditingStockId(null);
      }
      void loadData();
      return;
    }

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
      notifyPortfolioUpdated();
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

    if (isDemo) {
      const storageKey = `finapp-holdings-v1:demo:${userId || 1}`;
      const stock = stocks.find((s) => s.id === tradeModal.stockId);
      const sym = stock?.ticker || tradeModal.ticker;
      const currentPos = positions.find((p) => p.stockId === tradeModal.stockId);
      const currentShares = currentPos?.sharesOwned ?? stock?.sharesOwned ?? 0;
      const delta = tradeModal.type === 'buy' ? tradeModal.quantity : -tradeModal.quantity;
      const newShares = Math.max(0, currentShares + delta);
      await updateSharesUnified({
        storageKey,
        userId: userId || 1,
        demo: true,
        symbol: sym,
        currentShares,
        newShares,
        price: tradeModal.price,
        stockId: tradeModal.stockId,
      });
      setStatusMessage({
        type: 'success',
        text: `Executed ${tradeModal.type.toUpperCase()} for ${tradeModal.quantity} shares of ${sym}.`,
      });
      setTradeModal((prev) => ({ ...prev, open: false }));
      void loadData();
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
      notifyPortfolioUpdated();
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

    // Automatically synchronize to graph scenario node
    let activeRecurDraft = { ...recurDraft };
    let graphSync: ReturnType<typeof syncRecurringToGraphNode> | null = null;
    const baseGraph = rawGraph || graph;
    if (onUpdateGraph && baseGraph) {
      graphSync = syncRecurringToGraphNode(baseGraph, activeRecurDraft);
      if (
        graphSync.affectedNode &&
        !activeRecurDraft.notes?.includes(`[node-id:${graphSync.affectedNode.id}]`)
      ) {
        activeRecurDraft.notes = `${activeRecurDraft.notes || ''} [node-id:${graphSync.affectedNode.id}]`.trim();
      }
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      let updated: RecurringTransaction[];
      if (editingRecurId) {
        updated = recurringList.map((r) =>
          r.id === editingRecurId ? { ...activeRecurDraft, id: editingRecurId } : r,
        );
      } else {
        const newId = Math.max(0, ...recurringList.map((r) => r.id || 0)) + 1;
        updated = [{ ...activeRecurDraft, id: newId }, ...recurringList];
      }
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setRecurringList(updated);
      if (graphSync && onUpdateGraph) {
        onUpdateGraph(graphSync.updatedGraph);
      }
      setStatusMessage({
        type: 'success',
        text: editingRecurId ? 'Recurring rule updated.' : 'Recurring rule created.',
      });
      setShowRecurForm(false);
      setEditingRecurId(null);
      setRecurDraft(initialRecurring());
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
        body: JSON.stringify({ ...activeRecurDraft, userId }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save recurring template');
      }

      if (graphSync && onUpdateGraph) {
        onUpdateGraph(graphSync.updatedGraph);
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
    const itemToDelete = recurringList.find((r) => r.id === id);
    let graphSync: ReturnType<typeof syncRecurringDeletionToGraph> | null = null;
    const baseGraph = rawGraph || graph;
    if (itemToDelete && onUpdateGraph && baseGraph) {
      graphSync = syncRecurringDeletionToGraph(baseGraph, itemToDelete);
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      const updated = recurringList.filter((r) => r.id !== id);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setRecurringList(updated);
      if (graphSync && onUpdateGraph) {
        onUpdateGraph(graphSync.updatedGraph);
      }
      setStatusMessage({ type: 'success', text: 'Recurring rule deleted.' });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/recurring-transactions/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      if (graphSync && onUpdateGraph) {
        onUpdateGraph(graphSync.updatedGraph);
      }
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
      if (!(await loadData()) || controller.signal.aborted) throw new Error('Could not synchronize recurring rules before generating.');
      const res = await fetch(`${API_BASE}/recurring-transactions/generate`, {
        signal: controller.signal,
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Generation failed');
      const json = await res.json();
      // Applied only newly generated transactions to the scenario balances.
      const occurrences: Transaction[] = Array.isArray(json.data) ? json.data : [];
      const count = occurrences.length;
      const currentGraph = rawGraphRef.current ?? graphRef.current;
      const nextGraph = occurrences.reduce((next, transaction) =>
        syncScenarioTransactionToGraph(next, transaction)?.updatedGraph ?? next, currentGraph);
      if (nextGraph !== currentGraph) onUpdateGraph?.(nextGraph);
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

  const handleImportScenarioSalary = async (): Promise<void> => {
    const newTemplates = createSalaryRecurringTemplates(graph, recurringList);
    if (newTemplates.length === 0) {
      setStatusMessage({
        type: 'info',
        text: 'All scenario income sources are already in your recurring templates.',
      });
      return;
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      let nextId = Math.max(0, ...recurringList.map((r) => r.id || 0)) + 1;
      const created = newTemplates.map((t) => ({ ...t, id: nextId++ } as RecurringTransaction));
      const updated = [...created, ...recurringList];
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setRecurringList(updated);
      setStatusMessage({
        type: 'success',
        text: `Imported ${created.length} salary template(s) into recurring transactions.`,
      });
      return;
    }

    let count = 0;
    try {
      for (const t of newTemplates) {
        const res = await fetch(`${API_BASE}/recurring-transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
          credentials: 'include',
          body: JSON.stringify({ ...t, userId }),
        });
        if (res.ok) count++;
      }
      setStatusMessage({
        type: 'success',
        text: `Imported ${count} salary template(s) into recurring transactions.`,
      });
      loadData();
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to import scenario salary.' });
    }
  };

  const handleImportScenarioDebts = async (): Promise<void> => {
    const newTemplates = createDebtRecurringTemplates(graph, recurringList);
    if (newTemplates.length === 0) {
      setStatusMessage({
        type: 'info',
        text: 'All scenario debt obligations are already in your recurring templates or have $0 payments.',
      });
      return;
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      let nextId = Math.max(0, ...recurringList.map((r) => r.id || 0)) + 1;
      const created = newTemplates.map((t) => ({ ...t, id: nextId++ } as RecurringTransaction));
      const updated = [...created, ...recurringList];
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch (err) {
        setStatusMessage({ type: 'error', text: (err as Error).message });
        return;
      }
      setRecurringList(updated);
      setStatusMessage({
        type: 'success',
        text: `Imported ${created.length} debt payment template(s) into recurring transactions.`,
      });
      return;
    }

    let count = 0;
    try {
      for (const t of newTemplates) {
        const res = await fetch(`${API_BASE}/recurring-transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
          credentials: 'include',
          body: JSON.stringify({ ...t, userId }),
        });
        if (res.ok) count++;
      }
      setStatusMessage({
        type: 'success',
        text: `Imported ${count} debt obligation template(s) into recurring transactions.`,
      });
      loadData();
    } catch {
      setStatusMessage({ type: 'error', text: 'Failed to import scenario debt payments.' });
    }
  };

  const activeNodes = graph.nodes.filter((node) => !node.archived && ['INCOME', 'EXPENSE', 'DEBT'].includes(node.nodeType));

  // Calculations for summary banner
  const totalIncome = transactions
    .filter((t) => t.kind === 'income')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const totalExpense = transactions
    .filter((t) => t.kind === 'expense')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const netCashFlow = totalIncome - totalExpense;

  const scenarioSalary = getScenarioSalary(graph);
  const scenarioDebts = getScenarioDebts(graph);
  const budgetComparison = getScenarioBudgetComparison(graph, totalIncome, totalExpense);

  const matchedDebtNode = graph?.nodes?.find(
    (n) =>
      n.nodeType === 'DEBT' &&
      !n.archived &&
      (n.name.trim().toLowerCase() === (transDraft.accountName || '').trim().toLowerCase() ||
        (transDraft.description || '').trim().toLowerCase().includes(n.name.trim().toLowerCase())),
  );

  const matchedRecurDebtNode = graph?.nodes?.find(
    (n) =>
      n.nodeType === 'DEBT' &&
      !n.archived &&
      (n.name.trim().toLowerCase() === (recurDraft.accountName || '').trim().toLowerCase() ||
        (recurDraft.description || '').trim().toLowerCase().includes(n.name.trim().toLowerCase())),
  );

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

  const activePortfolioValue =
    propPortfolioValue !== undefined ? propPortfolioValue : totalPortfolioValue;
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

  return (
    <div className="budget-workspace w-full mx-auto">
      {/* Summary cards and ledger tools */}
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

      {/* KPI Cards & Scenario Alignment */}
      <BudgetSummaryCards
        currentNetWorth={currentNetWorth}
        currentTotals={currentTotals}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        netCashFlow={netCashFlow}
        totalPortfolioValue={totalPortfolioValue}
        totalPurchasedValue={totalPurchasedValue}
        scenarioSalary={scenarioSalary}
        scenarioDebts={scenarioDebts}
        budgetComparison={budgetComparison}
        activeNodes={activeNodes}
        graph={graph}
        onNavigateRecurring={() => setActiveSubTab('recurring')}
        onImportScenarioSalary={handleImportScenarioSalary}
        onImportScenarioDebts={handleImportScenarioDebts}
      />

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '0.5rem',
          borderBottom: '1px solid var(--ui-paint-283347)',
          paddingBottom: '0.5rem',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveSubTab('transactions')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'transactions' ? 'bg-primary text-primary-fg' : 'bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Transactions ({transactions.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('recurring')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'recurring' ? 'bg-primary text-primary-fg' : 'bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Recurring Transactions ({recurringList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('stocks')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'stocks' ? 'bg-primary text-primary-fg' : 'bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Trade ledger ({stocks.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (!activeLoad.current) void loadData(true, true);
          }}
          disabled={!userId}
          aria-busy={refreshing}
          aria-disabled={refreshing || !userId}
          className="inline-flex items-center justify-center gap-2 min-w-30 aria-busy:cursor-progress whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
      <div className="min-h-[1.4em] flex items-center gap-2 text-(--ui-text-91a3bd) text-[13px]" role="status" aria-live="polite">
        {generating
          ? 'Generating due occurrences. You can keep browsing.'
          : refreshing
            ? 'Refreshing in the background. Your current data stays visible.'
            : ''}
      </div>

      {/* SECTION 1: TRANSACTIONS */}
      {activeSubTab === 'transactions' && (
        <TransactionSection
          transactions={transactions}
          userId={userId}
          isDemo={isDemo}
          onOpenAdd={handleOpenAddTransaction}
          onEdit={handleEditTransaction}
          onDelete={handleDeleteTransaction}
          showTransForm={showTransForm}
          editingTransId={editingTransId}
          transDraft={transDraft}
          setTransDraft={setTransDraft}
          availableAccounts={availableAccounts}
          dbAccounts={dbAccounts}
          matchedDebtNode={matchedDebtNode}
          graph={graph}
          onSaveTrans={handleSaveTransaction}
          onCancelTrans={() => {
            setShowTransForm(false);
            setEditingTransId(null);
          }}
        />
      )}

      {/* SECTION 2: STOCKS & POSITIONS */}
      {activeSubTab === 'stocks' && (
        <StockSection
          stocks={stocks}
          positions={positions}
          currentPrices={currentPrices}
          totalPurchasedValue={totalPurchasedValue}
          totalPortfolioValue={totalPortfolioValue}
          userId={userId}
          onOpenAddStock={handleOpenAddStock}
          onEditStock={handleEditStock}
          onDeleteStock={handleDeleteStock}
          onOpenTrade={handleOpenTrade}
          showStockForm={showStockForm}
          editingStockId={editingStockId}
          stockDraft={stockDraft}
          setStockDraft={setStockDraft}
          fetchingQuote={fetchingQuote}
          quotePrice={quotePrice}
          detectedDividend={detectedDividend}
          onSaveStock={handleSaveStock}
          onCancelStock={() => {
            setShowStockForm(false);
            setEditingStockId(null);
          }}
          tradeModal={tradeModal}
          setTradeModal={setTradeModal}
          availableAccounts={availableAccounts}
          onExecuteTrade={handleExecuteTrade}
          onCancelTrade={() => setTradeModal((prev) => ({ ...prev, open: false }))}
        />
      )}

      {/* SECTION 3: RECURRING TRANSACTIONS */}
      {activeSubTab === 'recurring' && (
        <RecurringSection
          recurringList={recurringList}
          userId={userId}
          isDemo={isDemo}
          generating={generating}
          scenarioSalary={scenarioSalary}
          scenarioDebts={scenarioDebts}
          onGenerateDueOccurrences={handleGenerateDueOccurrences}
          onImportScenarioSalary={handleImportScenarioSalary}
          onImportScenarioDebts={handleImportScenarioDebts}
          onOpenAddRecurring={handleOpenAddRecurring}
          onEditRecurring={(r) => {
            setEditingRecurId(r.id ?? null);
            setRecurDraft(r);
            setShowRecurForm(true);
          }}
          onDeleteRecurring={handleDeleteRecurring}
          showRecurForm={showRecurForm}
          editingRecurId={editingRecurId}
          recurDraft={recurDraft}
          setRecurDraft={setRecurDraft}
          matchedRecurDebtNode={matchedRecurDebtNode}
          graph={graph}
          onSaveRecur={handleSaveRecurring}
          onCancelRecur={() => {
            setShowRecurForm(false);
            setEditingRecurId(null);
          }}
        />
      )}
    </div>
  );
}
