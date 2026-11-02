import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { FormEvent } from 'react';
import type { GraphData } from './finance';
import { API_BASE, dollars, debtPayment, expenseAmount, colors, totals } from './finance';
import { sessionHeaders } from './session';
import { NumberField } from './components/NumberField';
import { changeAccount, changeCategory, changeKind } from './budgeting-drafts';
import {
  PORTFOLIO_UPDATED_EVENT,
  notifyPortfolioUpdated,
  loadUnifiedHoldings,
  addStockUnified,
  removeStockUnified,
  updateSharesUnified,
  saveStoredPortfolioValue,
} from './portfolio';
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
} from './budgeting-bridge';

interface BudgetingTabProps {
  graph: GraphData;
  rawGraph?: GraphData;
  userId?: number;
  demo?: boolean;
  portfolioValue?: number;
  onUpdateGraph?: (next: GraphData) => void;
}

const DEMO_BUDGET_ENC_PREFIX = 'enc:v1:';

const toB64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromB64 = (b64: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getDemoStorageSecret = (storageKey: string): string => {
  const existing = sessionStorage.getItem(`${storageKey}:k`);
  if (existing) return existing;
  const generated = `${storageKey}:${crypto.randomUUID()}`;
  sessionStorage.setItem(`${storageKey}:k`, generated);
  return generated;
};

const deriveDemoCryptoKey = async (storageKey: string): Promise<CryptoKey> => {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(getDemoStorageSecret(storageKey)),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(storageKey),
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

const encryptForDemoStorage = async (storageKey: string, payload: unknown): Promise<string> => {
  const key = await deriveDemoCryptoKey(storageKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  return `${DEMO_BUDGET_ENC_PREFIX}${toB64(iv)}:${toB64(new Uint8Array(cipher))}`;
};

const decryptFromDemoStorage = async <T,>(storageKey: string, raw: string | null): Promise<T | null> => {
  if (!raw) return null;
  if (!raw.startsWith(DEMO_BUDGET_ENC_PREFIX)) {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  const body = raw.slice(DEMO_BUDGET_ENC_PREFIX.length);
  const [ivB64, dataB64] = body.split(':');
  if (!ivB64 || !dataB64) return null;
  try {
    const key = await deriveDemoCryptoKey(storageKey);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(ivB64) },
      key,
      fromB64(dataB64)
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
};

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
  accountName: 'Checking',
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
  }, [stockDraft.ticker, showStockForm]);

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
              savedRaw
            );
            if (parsed) {
              demoTxns = Array.isArray(parsed.transactions) ? (parsed.transactions as Transaction[]) : [];
              demoRecur = Array.isArray(parsed.recurring) ? (parsed.recurring as RecurringTransaction[]) : [];
            }
          } catch {}

          // Ensure the Transaction tab only holds single, non-recurring transactions
          demoTxns = demoTxns.filter((t) => {
            const desc = (t.description || '').toLowerCase();
            const notes = (t.notes || '').toLowerCase();
            return (
              !desc.includes('paycheck') &&
              !desc.includes('salary') &&
              !notes.includes('monthly salary') &&
              !notes.includes('from scenario') &&
              !notes.includes('living expense from scenario') &&
              !notes.includes('monthly payment (')
            );
          });

          // Single, non-recurring sample transactions (e.g. grocery trip, coffee, dining out)
          if (demoTxns.length === 0) {
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

          const { updatedRecurring: syncedDemoRecur } = syncGraphNodesToRecurring(
            graphRef.current,
            demoRecur,
          );
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
        const read = async <T,>(path: string, apply: (data: T) => void) => {
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
        const results = await Promise.allSettled([
          read<Transaction[]>('transactions', setTransactions),
          read<Stock[]>('stocks', (data) => {
            loadedStocks = data;
            setStocks(data);
          }),
          read<StockPosition[]>('positions', setPositions),
          read<RecurringTransaction[]>('recurring-transactions', async (data) => {
            const { updatedRecurring, newRules, removedDuplicates } = syncGraphNodesToRecurring(
              graphRef.current,
              data,
            );
            if (!isDemo) {
              if (removedDuplicates && removedDuplicates.length > 0) {
                for (const dup of removedDuplicates) {
                  if (dup.id) {
                    try {
                      await fetch(`${API_BASE}/recurring-transactions/${dup.id}`, {
                        method: 'DELETE',
                        headers: sessionHeaders(),
                        credentials: 'include',
                        signal: controller.signal,
                      });
                    } catch {}
                  }
                }
              }
              if (newRules && newRules.length > 0) {
                const persistedRules: RecurringTransaction[] = [];
                for (const rule of newRules) {
                  try {
                    const res = await fetch(`${API_BASE}/recurring-transactions`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
                      credentials: 'include',
                      body: JSON.stringify({ ...rule, userId }),
                      signal: controller.signal,
                    });
                    if (res.ok) {
                      const resJson = await res.json();
                      if (resJson?.data) {
                        persistedRules.push(resJson.data);
                      }
                    }
                  } catch {}
                }
                const finalRules = updatedRecurring
                  .filter((r) => !newRules.some((nr) => nr.id === r.id))
                  .concat(persistedRules);
                setRecurringList(finalRules);
              } else {
                setRecurringList(updatedRecurring);
              }
            } else {
              setRecurringList(updatedRecurring);
            }
          }),
          read<AccountOption[]>('accounts', (data) => {
            const allNodes = [...(rawGraphRef.current?.nodes ?? []), ...(graphRef.current?.nodes ?? [])];
            const activeDebts = new Set(
              allNodes
                .filter((n) => n.nodeType === 'DEBT' && !n.archived && !n.disabled)
                .map((n) => n.name.trim().toLowerCase()),
            );

            const orphanedAccounts = data.filter((a) => {
              const lower = a.name.trim().toLowerCase();
              if (lower === 'checking' || lower === 'checking account' || lower === 'savings') return false;
              if (activeDebts.has(lower)) return false;
              return true;
            });

            if (!isDemo && orphanedAccounts.length > 0) {
              for (const orphan of orphanedAccounts) {
                if (orphan.id) {
                  void fetch(`${API_BASE}/accounts/${orphan.id}`, {
                    method: 'DELETE',
                    headers: sessionHeaders(),
                    credentials: 'include',
                    signal: controller.signal,
                  }).catch(() => {});
                }
              }
            }

            const validAccounts = data.filter((a) => !orphanedAccounts.some((o) => o.id === a.id));
            setDbAccounts(validAccounts);
          }),
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

  // Automatically synchronize active graph flow nodes (Income, Expense, Debt) into recurring transactions
  useEffect(() => {
    // Only sync if initial budgeting data has been loaded and graph actually changed
    if (!isInitialLoaded.current) return;
    if (!graph?.nodes?.length) return;
    if (lastSyncedGraph.current === graph) return;
    lastSyncedGraph.current = graph;

    setRecurringList((prevList) => {
      const { updatedRecurring, hasChanges, newRules, removedDuplicates } = syncGraphNodesToRecurring(
        graph,
        prevList,
      );
      if (!hasChanges) return prevList;
      if (isDemo) {
        const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
        void (async () => {
          try {
            const saved =
              (await decryptFromDemoStorage<Record<string, unknown>>(
                budgetStorageKey,
                localStorage.getItem(budgetStorageKey)
              )) || {};
            saved.recurring = updatedRecurring;
            localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
          } catch {}
        })();
        return updatedRecurring;
      }
      // For signed-in users, clean up duplicates and save graph-generated new rules to PostgreSQL
      if (removedDuplicates && removedDuplicates.length > 0) {
        for (const dup of removedDuplicates) {
          if (dup.id) {
            void fetch(`${API_BASE}/recurring-transactions/${dup.id}`, {
              method: 'DELETE',
              headers: sessionHeaders(),
              credentials: 'include',
            }).catch(() => {});
          }
        }
      }
      if (newRules && newRules.length > 0) {
        const existingRules = updatedRecurring.filter((r) => !newRules.some((nr) => nr.id === r.id));
        void (async () => {
          for (const rule of newRules) {
            try {
              const res = await fetch(`${API_BASE}/recurring-transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
                credentials: 'include',
                body: JSON.stringify({ ...rule, userId }),
              });
              if (res.ok) {
                const resJson = await res.json();
                if (resJson?.data) {
                  setRecurringList((cur) => {
                    if (cur.some((r) => r.id === resJson.data.id)) return cur;
                    return [...cur, resJson.data];
                  });
                }
              }
            } catch (err) {
              console.error('Failed to save recurring rule to database:', err);
            }
          }
        })();
        return existingRules;
      }
      return updatedRecurring;
    });
  }, [graph, isDemo, userId]);

  // Automatically clean up any dbAccounts if their loan was deleted/archived in the scenario graph
  useEffect(() => {
    if (dbAccounts.length === 0) return;
    const allNodes = [...(rawGraph?.nodes ?? []), ...(graph?.nodes ?? [])];
    const activeDebts = new Set(
      allNodes
        .filter((n) => n.nodeType === 'DEBT' && !n.archived && !n.disabled)
        .map((n) => n.name.trim().toLowerCase()),
    );

    const orphanedAccounts = dbAccounts.filter((a) => {
      const lower = a.name.trim().toLowerCase();
      if (lower === 'checking' || lower === 'checking account' || lower === 'savings') return false;
      if (activeDebts.has(lower)) return false;
      return true;
    });

    if (orphanedAccounts.length > 0) {
      if (!isDemo && userId) {
        for (const orphan of orphanedAccounts) {
          if (orphan.id) {
            void fetch(`${API_BASE}/accounts/${orphan.id}`, {
              method: 'DELETE',
              headers: sessionHeaders(),
              credentials: 'include',
            }).catch(() => {});
          }
        }
      }
      setDbAccounts((prev) => prev.filter((a) => !orphanedAccounts.some((o) => o.id === a.id)));
    }
  }, [rawGraph, graph, dbAccounts, isDemo, userId]);

  // Derived account options strictly: Checking, Savings, and active loans
  const availableAccounts = useMemo(() => {
    return getAvailableBudgetAccounts(graph);
  }, [graph]);

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
          kind: prevTxn.kind === 'income' ? 'expense' : 'income',
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
      setTransactions(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.transactions = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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
        kind: transToDelete.kind === 'income' ? 'expense' : 'income',
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
      setTransactions(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.transactions = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
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

      await addStockUnified({
        storageKey,
        userId: userId || 1,
        demo: true,
        symbol: ticker,
        companyName,
        price: finalPrice,
        shares,
        paysDividend,
        dividendFrequency: paysDividend ? dividendFrequency : null,
        dividendPerShare: paysDividend ? dividendPerShare : null,
      });

      // Automatically sync recurring dividend income transaction if paysDividend and shares > 0
      let dividendCreatedNote = '';
      const divDesc = `${ticker} Dividend`;
      const recFreq: RecurringTransaction['frequency'] =
        dividendFrequency === 'annual'
          ? 'yearly'
          : dividendFrequency === 'monthly'
          ? 'monthly'
          : 'quarterly';
      const intervalCount = dividendFrequency === 'semiannual' ? 6 : 1;

      if (paysDividend && dividendPerShare && dividendPerShare > 0 && shares > 0) {
        const totalPayout = Math.round(shares * dividendPerShare * 100) / 100;
        if (totalPayout > 0) {
          const existing = recurringList.find(
            (r) => r.description.toLowerCase() === divDesc.toLowerCase(),
          );
          let updatedRecur: RecurringTransaction[];
          if (existing) {
            updatedRecur = recurringList.map((r) =>
              r.id === existing.id
                ? {
                    ...r,
                    amount: totalPayout,
                    frequency: recFreq,
                    intervalCount,
                    isActive: true,
                    notes: `Auto-generated dividend for ${ticker} (${shares} shares @ $${dividendPerShare}/${dividendFrequency || 'quarterly'})`,
                  }
                : r,
            );
          } else {
            const newId = Math.max(0, ...recurringList.map((r) => r.id || 0)) + 1;
            const newRecurring: RecurringTransaction = {
              id: newId,
              kind: 'income',
              categoryName: 'Dividends',
              description: divDesc,
              amount: totalPayout,
              frequency: recFreq,
              intervalCount,
              startDate: new Date().toISOString().split('T')[0],
              nextDueDate: new Date().toISOString().split('T')[0],
              isActive: true,
              notes: `Auto-generated dividend for ${ticker} (${shares} shares @ $${dividendPerShare}/${dividendFrequency || 'quarterly'})`,
            };
            updatedRecur = [newRecurring, ...recurringList];
          }
          setRecurringList(updatedRecur);

          try {
            const saved = JSON.parse(localStorage.getItem(budgetStorageKey) || '{}');
            saved.recurring = updatedRecur;
            localStorage.setItem(budgetStorageKey, JSON.stringify(saved));
          } catch {}

          dividendCreatedNote = ` with recurring dividend income (${dollars(totalPayout)}/${dividendFrequency || 'quarterly'})`;
        }
      } else if (editingStockId) {
        const existing = recurringList.find(
          (r) => r.description.toLowerCase() === divDesc.toLowerCase(),
        );
        if (existing) {
          const updatedRecur = recurringList.filter((r) => r.id !== existing.id);
          setRecurringList(updatedRecur);
          try {
            const saved = JSON.parse(localStorage.getItem(budgetStorageKey) || '{}');
            saved.recurring = updatedRecur;
            localStorage.setItem(budgetStorageKey, JSON.stringify(saved));
          } catch {}
        }
      }

      setStatusMessage({
        type: 'success',
        text: editingStockId
          ? `Stock ${ticker} updated${dividendCreatedNote}. Current price: ${dollars(finalPrice)}.`
          : `Stock ${ticker} added${dividendCreatedNote}. Current price: ${dollars(finalPrice)}.`,
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

      let divNote = '';
      if (paysDividend && dividendPerShare && dividendPerShare > 0 && shares > 0) {
        const totalPayout = Math.round(shares * dividendPerShare * 100) / 100;
        if (totalPayout > 0) {
          divNote = ` with recurring dividend income (${dollars(totalPayout)}/${dividendFrequency || 'quarterly'})`;
        }
      }

      setStatusMessage({
        type: 'success',
        text: editingStockId
          ? `Stock ${ticker} updated${divNote}. Current price: ${dollars(finalLastPrice)}.`
          : `Stock ${ticker} added${divNote}. Current price: ${dollars(finalLastPrice)}.`,
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
      setRecurringList(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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

    if (itemToDelete) {
      const acctName = (itemToDelete.accountName || '').trim();
      const matchingDbAccount = dbAccounts.find(
        (a) => a.name.trim().toLowerCase() === acctName.toLowerCase(),
      );
      if (matchingDbAccount) {
        setDbAccounts((prev) => prev.filter((a) => a.id !== matchingDbAccount.id));
        if (!isDemo && matchingDbAccount.id) {
          void fetch(`${API_BASE}/accounts/${matchingDbAccount.id}`, {
            method: 'DELETE',
            headers: sessionHeaders(),
            credentials: 'include',
          }).catch(() => {});
        }
      }
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      const updated = recurringList.filter((r) => r.id !== id);
      setRecurringList(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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
      setRecurringList(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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
      let nextId = Math.max(0, ...recurringList.map((r) => r.id || 0)) + 1;
      const created = newTemplates.map((t) => ({ ...t, id: nextId++ } as RecurringTransaction));
      const updated = [...created, ...recurringList];
      setRecurringList(updated);
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey)
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(budgetStorageKey, await encryptForDemoStorage(budgetStorageKey, saved));
      } catch {}
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

  const activeNodes = graph?.nodes?.filter((n) => !n.archived) || [];

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
          <p className="text-(--ui-text-8b9ab1) text-[11px] mt-1 mb-0">
            Track income, expenses, recurring payments, and stock investments in your database.
          </p>
        </div>
        {demo ? (
          <div
            style={{
              padding: '6px 12px',
              background: '#3b2f15',
              border: '1px solid #705822',
              borderRadius: '4px',
              color: '#e8c67a',
              fontSize: '13px',
            }}
          >
            DEMO SCENARIO: Local edits stay in this browser session.
          </div>
        ) : !userId && (
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
          marginBottom: '1rem',
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
            Overall Net Worth
          </span>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: currentNetWorth < 0 ? 'var(--ui-paint-f87171)' : 'var(--ui-paint-4ade80)',
              marginTop: '4px',
            }}
          >
            {dollars(currentNetWorth)}
          </div>
          <div style={{ fontSize: '11px', color: '#8f9db3', marginTop: '4px' }}>
            Assets: <strong style={{ color: '#cbd5e1' }}>{dollars(currentTotals.assets)}</strong> • Debt:{' '}
            <strong style={{ color: '#cbd5e1' }}>{dollars(currentTotals.debt)}</strong>
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
            Total Income
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-4ade80)', marginTop: '4px' }}>
            {dollars(totalIncome)}
          </div>
          <div style={{ fontSize: '11px', color: '#8f9db3', marginTop: '4px' }}>
            Scenario Salary:{' '}
            <strong style={{ color: '#cbd5e1' }}>{dollars(scenarioSalary.totalMonthly)}/mo</strong>
            {scenarioSalary.totalMonthly > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  color: totalIncome >= scenarioSalary.totalMonthly ? '#4ade80' : '#f59e0b',
                }}
              >
                {totalIncome >= scenarioSalary.totalMonthly
                  ? '✓ Target Met'
                  : `${dollars(scenarioSalary.totalMonthly - totalIncome)} remaining`}
              </span>
            )}
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
          <div style={{ fontSize: '11px', color: '#8f9db3', marginTop: '4px' }}>
            Commitments:{' '}
            <strong style={{ color: '#cbd5e1' }}>
              {dollars(budgetComparison.plannedTotalCommitments)}/mo
            </strong>
            {scenarioDebts.totalMonthlyPayment > 0 && (
              <span style={{ marginLeft: '4px', color: '#fda4af' }}>
                ({dollars(scenarioDebts.totalMonthlyPayment)} debt)
              </span>
            )}
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
          <div style={{ fontSize: '11px', color: '#8f9db3', marginTop: '4px' }}>
            Scenario Surplus Target:{' '}
            <strong style={{ color: '#cbd5e1' }}>{dollars(budgetComparison.plannedSurplus)}/mo</strong>
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

      {/* Scenario & Budget Alignment Card */}
      <div
        style={{
          background: '#161d2b',
          border: '1px solid #283347',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
              🔗 Scenario & Budget Alignment
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#1e2838',
                color: '#93c5fd',
                border: '1px solid #2563eb',
              }}
            >
              {scenarioSalary.nodes.length} Income • {scenarioDebts.nodes.length} Debt Accounts
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#8f9db3', marginTop: '6px', lineHeight: 1.5 }}>
            Scenario Monthly Salary:{' '}
            <strong style={{ color: '#4ade80' }}>
              {dollars(scenarioSalary.totalMonthly)}/mo
            </strong>
            {' • '}Debt Commitments:{' '}
            <strong style={{ color: '#fb7185' }}>
              {dollars(scenarioDebts.totalMonthlyPayment)}/mo
            </strong>{' '}
            across {scenarioDebts.nodes.length} loans ({dollars(scenarioDebts.totalBalance)} total balance)
            {scenarioDebts.nodes.length > 0 && (
              <span style={{ color: '#94a3b8', marginLeft: '6px' }}>
                ({scenarioDebts.nodes.map((n) => `${n.name}: ${dollars(n.monthlyPayment)}/mo`).join(', ')})
              </span>
            )}
          </div>

          {/* Active Nodes Display Chips */}
          {activeNodes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', alignSelf: 'center', marginRight: '4px' }}>
                Scenario Nodes:
              </span>
              {activeNodes.map((n) => {
                const isIncome = n.nodeType === 'INCOME';
                const isExpense = n.nodeType === 'EXPENSE';
                const isDebt = n.nodeType === 'DEBT';
                const amount = isExpense
                  ? expenseAmount(n, graph)
                  : isDebt
                    ? debtPayment(n, graph)
                    : n.amountOrBalance;

                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={() => setActiveSubTab('recurring')}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      background: '#121824',
                      border: '1px solid #283347',
                      color: '#cbd5e1',
                      cursor: 'pointer',
                    }}
                    title={`View recurring rule for ${n.name} in Recurring tab`}
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: colors[n.nodeType] || '#8b9ab1',
                      }}
                    />
                    <span>{n.name}</span>
                    <strong
                      style={{
                        color: isIncome
                          ? '#4ade80'
                          : isExpense || isDebt
                            ? '#fb7185'
                            : '#38bdf8',
                      }}
                    >
                      {dollars(amount)}
                      {isIncome || isExpense ? '/mo' : ''}
                    </strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {scenarioSalary.nodes.length > 0 && (
            <button
              type="button"
              onClick={handleImportScenarioSalary}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #22c55e',
                background: 'rgba(34, 197, 94, 0.12)',
                color: '#86efac',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📥 Import Scenario Salary
            </button>
          )}
          {scenarioDebts.nodes.length > 0 && (
            <button
              type="button"
              onClick={handleImportScenarioDebts}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid #f43f5e',
                background: 'rgba(244, 63, 94, 0.12)',
                color: '#fda4af',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              📥 Import Scenario Debt Service
            </button>
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
          Stocks & Positions ({stocks.length})
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
              <p className="text-(--ui-text-8b9ab1) text-[11px] mt-0.5 mb-0">
                Income and expenses linked to your accounts.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              onClick={handleOpenAddTransaction}
              disabled={!userId && !isDemo}
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

                {matchedDebtNode && transDraft.kind === 'expense' && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: 'rgba(244, 63, 94, 0.12)',
                      border: '1px solid #f43f5e',
                      color: '#fecdd3',
                      fontSize: '12px',
                    }}
                  >
                    💳 <strong>Linked Scenario Debt Account:</strong> {matchedDebtNode.name}
                    <div style={{ marginTop: '2px', color: '#fda4af' }}>
                      Current Balance: <strong>{dollars(matchedDebtNode.amountOrBalance)}</strong> • Interest:{' '}
                      <strong>{matchedDebtNode.interestRateApr}% APR</strong> • Minimum Monthly Payment:{' '}
                      <strong>{dollars(debtPayment(matchedDebtNode, graph))}</strong>.
                      Logging this expense will automatically pay down this debt balance and increase your net worth.
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    gridColumn: '1 / -1',
                    marginTop: '0.5rem',
                  }}
                >
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors">
                    {editingTransId ? 'Save Changes' : 'Record Transaction'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
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
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
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
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '15px', color: '#f1f5f9' }}>
                No single transactions recorded yet.
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#8b9ab1' }}>
                Click <strong>+ Add Transaction</strong> above to log single, non-recurring expenses (such as grocery trips, dining, and retail). Recurring salary and bills are managed in the <strong>Recurring Transactions</strong> tab.
              </p>
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
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
                          onClick={() => handleEditTransaction(t)}
                          style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
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
              <p className="text-(--ui-text-8b9ab1) text-[11px] mt-0.5 mb-0">
                Track shares, cost basis, market prices, and buy/sell operations.
              </p>
            </div>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
                <p className="text-(--ui-text-8b9ab1) text-[11px]">
                  Modify your stock details, dividend settings, or position holdings below.
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

                {detectedDividend && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: detectedDividend.pays
                        ? 'rgba(74, 222, 128, 0.12)'
                        : 'rgba(148, 163, 184, 0.10)',
                      border: `1px solid ${
                        detectedDividend.pays ? 'rgba(74, 222, 128, 0.3)' : 'rgba(148, 163, 184, 0.2)'
                      }`,
                      color: detectedDividend.pays
                        ? 'var(--ui-paint-4ade80)'
                        : '#94a3b8',
                    }}
                  >
                    {detectedDividend.pays ? (
                      <>
                        <span>✓</span>
                        <span>
                          <strong>Dividend detected:</strong> ${detectedDividend.perShare.toFixed(4)}
                          /share ({detectedDividend.frequency})
                          {detectedDividend.yieldPct != null &&
                            ` • ~${detectedDividend.yieldPct}% yield`}
                          {Number(stockDraft.sharesOwned || 0) > 0 && (
                            <span style={{ color: '#cbd5e1', marginLeft: '6px' }}>
                              → {dollars(Number(stockDraft.sharesOwned) * detectedDividend.perShare)}/
                              {detectedDividend.frequency} recurring income
                            </span>
                          )}
                        </span>
                      </>
                    ) : (
                      <>
                        <span>ℹ</span>
                        <span>No dividend distributions detected for this security.</span>
                      </>
                    )}
                  </div>
                )}

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
                    style={{
                      fontSize: '13px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    Pays Dividends
                    {detectedDividend?.pays && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--ui-paint-4ade80)',
                          background: 'rgba(74, 222, 128, 0.15)',
                          borderRadius: '4px',
                          padding: '1px 6px',
                        }}
                      >
                        Auto-detected
                      </span>
                    )}
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

                    {Number(stockDraft.sharesOwned || 0) > 0 &&
                      Number(stockDraft.dividendPerShare || 0) > 0 && (
                        <div
                          style={{
                            gridColumn: '1 / -1',
                            fontSize: '12px',
                            color: 'var(--ui-paint-93c5fd)',
                            background: 'rgba(59, 130, 246, 0.1)',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            border: '1px solid rgba(59, 130, 246, 0.2)',
                          }}
                        >
                          A recurring income transaction of{' '}
                          <strong>
                            {dollars(
                              (Number(stockDraft.sharesOwned) || 0) *
                                (Number(stockDraft.dividendPerShare) || 0),
                            )}
                            /{stockDraft.dividendFrequency || 'quarterly'}
                          </strong>{' '}
                          will be automatically added under Recurring Transactions.
                        </div>
                      )}
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
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors">
                    {editingStockId ? 'Save Changes' : 'Add Stock'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
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
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
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
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors">
                    Execute {tradeModal.type.toUpperCase()}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
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
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
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
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
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
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
                            onClick={() => handleEditStock(stock)}
                            style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
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
              <p className="text-(--ui-text-8b9ab1) text-[11px] mt-0.5 mb-0">
                Automate repeating expenses and income (e.g. rent, payroll, Netflix). Occurrences
                are generated into Transactions.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 min-w-30 aria-busy:cursor-progress whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
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
              {scenarioSalary.nodes.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-3 py-2 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[#86efac] border border-[#22c55e]/40 hover:bg-[#22c55e]/10 transition-colors"
                  onClick={handleImportScenarioSalary}
                  title="Import scenario salary node as monthly recurring income"
                >
                  📥 Import Salary ({dollars(scenarioSalary.totalMonthly)})
                </button>
              )}
              {scenarioDebts.nodes.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-3 py-2 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-[#fda4af] border border-[#f43f5e]/40 hover:bg-[#f43f5e]/10 transition-colors"
                  onClick={handleImportScenarioDebts}
                  title="Import scenario debt payments as monthly recurring obligations"
                >
                  📥 Import Debts ({dollars(scenarioDebts.totalMonthlyPayment)})
                </button>
              )}
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                onClick={handleOpenAddRecurring}
                disabled={!userId && !isDemo}
              >
                + Add Recurring Transaction
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

                {matchedRecurDebtNode && recurDraft.kind === 'expense' && (
                  <div
                    style={{
                      gridColumn: '1 / -1',
                      padding: '10px 14px',
                      borderRadius: '6px',
                      background: 'rgba(244, 63, 94, 0.12)',
                      border: '1px solid #f43f5e',
                      color: '#fecdd3',
                      fontSize: '12px',
                    }}
                  >
                    💳 <strong>Linked Scenario Debt Account:</strong> {matchedRecurDebtNode.name}
                    <div style={{ marginTop: '2px', color: '#fda4af' }}>
                      Current Balance: <strong>{dollars(matchedRecurDebtNode.amountOrBalance)}</strong> • Interest:{' '}
                      <strong>{matchedRecurDebtNode.interestRateApr}% APR</strong> • Minimum Monthly Payment:{' '}
                      <strong>{dollars(debtPayment(matchedRecurDebtNode, graph))}</strong>.
                    </div>
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    gridColumn: '1 / -1',
                    marginTop: '0.5rem',
                  }}
                >
                  <button type="submit" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors">
                    {editingRecurId ? 'Save Changes' : 'Create Recurring Rule'}
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
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
                      className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
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
              No recurring transactions set up yet. Click <strong>+ Add Recurring Rule</strong> to template
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
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
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
                          className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
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
