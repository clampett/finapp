import type { FormEvent } from 'react';
import { API_BASE, dollars } from '../common/finance';
import { sessionHeaders } from '../common/session';
import {
  notifyPortfolioUpdated,
  addStockUnified,
  removeStockUnified,
  updateSharesUnified,
} from '../investing/portfolio';
import {
  createSalaryRecurringTemplates,
  createDebtRecurringTemplates,
  syncScenarioTransactionToGraph,
  syncRecurringToGraphNode,
  syncRecurringDeletionToGraph,
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
  BudgetingTabProps,
  TransactionKind,
} from './types';
import {
  initialTransaction,
  initialStock,
  initialRecurring,
} from './types';
import type { useBudgetData } from './useBudgetData';

export function useBudgetActions(
  props: BudgetingTabProps,
  data: ReturnType<typeof useBudgetData>,
) {
  const { graph, rawGraph, onUpdateGraph } = props;
  const {
    userId,
    isDemo,
    transactions,
    setTransactions,
    stocks,
    positions,
    recurringList,
    setRecurringList,
    currentPrices,
    setCurrentPrices,
    quotePrice,
    setQuotePrice,
    transDraft,
    setTransDraft,
    setShowTransForm,
    editingTransId,
    setEditingTransId,
    stockDraft,
    setStockDraft,
    setShowStockForm,
    editingStockId,
    setEditingStockId,
    tradeModal,
    setTradeModal,
    recurDraft,
    setRecurDraft,
    setShowRecurForm,
    editingRecurId,
    setEditingRecurId,
    setDetectedDividend,
    setGenerating,
    setStatusMessage,
    activeGeneration,
    availableAccounts,
    loadData,
    refreshCurrentPrices,
    rawGraphRef,
    graphRef,
  } = data;

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
      transactionDate:
        t.transactionDate || t.date || new Date().toISOString().split('T')[0],
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
      setStatusMessage({
        type: 'error',
        text: 'Amount must be greater than $0.',
      });
      return;
    }

    let syncResult: ReturnType<typeof syncScenarioTransactionToGraph> | null =
      null;
    let syncStatusMsg = '';
    const baseInitial = rawGraph || graph;
    if (onUpdateGraph && baseInitial) {
      const prevTxn = editingTransId
        ? transactions.find((t) => t.id === editingTransId)
        : null;
      let baseGraph = baseInitial;
      if (prevTxn) {
        const reverseTxn = {
          kind:
            prevTxn.kind === 'income'
              ? ('expense' as TransactionKind)
              : ('income' as TransactionKind),
          accountName: prevTxn.accountName || 'Checking',
          description: prevTxn.description,
          amount: prevTxn.amount,
          categoryName: prevTxn.categoryName,
          isReversal: true,
        };
        const reverseResult = syncScenarioTransactionToGraph(
          baseGraph,
          reverseTxn,
        );
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
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
        text:
          (editingTransId
            ? 'Transaction updated successfully.'
            : 'Transaction recorded.') + syncStatusMsg,
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
        text:
          (editingTransId
            ? 'Transaction updated successfully.'
            : 'Transaction recorded.') + syncStatusMsg,
      });
      setShowTransForm(false);
      setEditingTransId(null);
      setTransDraft(initialTransaction());
      loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Error saving transaction';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleDeleteTransaction = async (id: number): Promise<void> => {
    if (!window.confirm('Delete this transaction?')) return;
    const transToDelete = transactions.find((t) => t.id === id);
    let reverseSync: ReturnType<typeof syncScenarioTransactionToGraph> | null =
      null;
    const baseGraph = rawGraph || graph;
    if (transToDelete && onUpdateGraph && baseGraph) {
      const reverseTxn = {
        kind:
          transToDelete.kind === 'income'
            ? ('expense' as TransactionKind)
            : ('income' as TransactionKind),
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
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
      const msg =
        err instanceof Error ? err.message : 'Error deleting transaction';
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
        stockDraft.dividendPerShare != null
          ? Number(stockDraft.dividendPerShare)
          : null;

      if (currentPrice == null) {
        try {
          const res = await fetch(
            `${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`,
          );
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
        currentPrice ||
        Number(stockDraft.purchasePrice || stockDraft.lastPrice) ||
        100;
      const shares = Number(stockDraft.sharesOwned || 1);
      const purchasePrice = Number(
        stockDraft.purchasePrice ?? stockDraft.lastPrice ?? finalPrice,
      );

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
      let currentPrice: number | null = quotePrice;
      let companyName = stockDraft.companyName?.trim() || null;
      let paysDividend = Boolean(stockDraft.paysDividend);
      let dividendFrequency = stockDraft.dividendFrequency || 'quarterly';
      let dividendPerShare =
        stockDraft.dividendPerShare != null
          ? Number(stockDraft.dividendPerShare)
          : null;

      if (currentPrice == null) {
        try {
          const res = await fetch(
            `${API_BASE}/market/stocks/${encodeURIComponent(ticker)}`,
            {
              headers: sessionHeaders(),
              credentials: 'include',
            },
          );
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
        } catch {}
      }

      const purchasePrice =
        Number(stockDraft.purchasePrice ?? stockDraft.lastPrice) || 0;
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

      if (editingStockId) {
        const originalPos = positions.find((p) => p.stockId === editingStockId);
        const originalShares = originalPos ? Number(originalPos.sharesOwned) : 0;
        const delta = shares - originalShares;
        if (delta !== 0) {
          try {
            await fetch(`${API_BASE}/stock-transactions`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...sessionHeaders(),
              },
              credentials: 'include',
              body: JSON.stringify({
                userId,
                stockId: editingStockId,
                type: delta > 0 ? 'buy' : 'sell',
                quantity: Math.abs(delta),
                pricePerShare:
                  purchasePrice > 0 ? purchasePrice : finalLastPrice,
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
  const handleOpenTrade = (
    s: Stock | StockPosition,
    type: 'buy' | 'sell',
  ) => {
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
      const currentPos = positions.find(
        (p) => p.stockId === tradeModal.stockId,
      );
      const currentShares = currentPos?.sharesOwned ?? stock?.sharesOwned ?? 0;
      const delta =
        tradeModal.type === 'buy' ? tradeModal.quantity : -tradeModal.quantity;
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
      setStatusMessage({
        type: 'error',
        text: 'Amount must be greater than $0.',
      });
      return;
    }

    let activeRecurDraft = { ...recurDraft };
    let graphSync: ReturnType<typeof syncRecurringToGraphNode> | null = null;
    const baseGraph = rawGraph || graph;
    if (onUpdateGraph && baseGraph) {
      graphSync = syncRecurringToGraphNode(baseGraph, activeRecurDraft);
      if (
        graphSync.affectedNode &&
        !activeRecurDraft.notes?.includes(
          `[node-id:${graphSync.affectedNode.id}]`,
        )
      ) {
        activeRecurDraft.notes =
          `${activeRecurDraft.notes || ''} [node-id:${graphSync.affectedNode.id}]`.trim();
      }
    }

    if (isDemo) {
      const budgetStorageKey = `finapp-budget-v1:demo:${userId || 1}`;
      let updated: RecurringTransaction[];
      if (editingRecurId) {
        updated = recurringList.map((r) =>
          r.id === editingRecurId
            ? { ...activeRecurDraft, id: editingRecurId }
            : r,
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
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
        text: editingRecurId
          ? 'Recurring rule updated.'
          : 'Recurring rule created.',
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
        text: editingRecurId
          ? 'Recurring rule updated.'
          : 'Recurring rule created.',
      });
      setShowRecurForm(false);
      setEditingRecurId(null);
      setRecurDraft(initialRecurring());
      loadData();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Error saving recurring transaction';
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
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
      setStatusMessage({
        type: 'error',
        text: 'Failed to delete recurring rule.',
      });
    }
  };

  const handleGenerateDueOccurrences = async (): Promise<void> => {
    if (!userId || activeGeneration.current) return;
    const controller = new AbortController();
    activeGeneration.current = controller;
    setGenerating(true);
    try {
      if (!(await loadData()) || controller.signal.aborted)
        throw new Error(
          'Could not synchronize recurring rules before generating.',
        );
      const res = await fetch(`${API_BASE}/recurring-transactions/generate`, {
        signal: controller.signal,
        method: 'POST',
        headers: sessionHeaders(),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Generation failed');
      const json = await res.json();
      const occurrences: Transaction[] = Array.isArray(json.data)
        ? json.data
        : [];
      const count = occurrences.length;
      const currentGraph = rawGraphRef.current ?? graphRef.current;
      const nextGraph = occurrences.reduce(
        (next, transaction) =>
          syncScenarioTransactionToGraph(next, transaction)?.updatedGraph ??
          next,
        currentGraph,
      );
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
      setStatusMessage({
        type: 'error',
        text: 'Failed to generate recurring transactions.',
      });
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
      const created = newTemplates.map(
        (t) => ({ ...t, id: nextId++ }) as RecurringTransaction,
      );
      const updated = [...created, ...recurringList];
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
      setStatusMessage({
        type: 'error',
        text: 'Failed to import scenario salary.',
      });
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
      const created = newTemplates.map(
        (t) => ({ ...t, id: nextId++ }) as RecurringTransaction,
      );
      const updated = [...created, ...recurringList];
      try {
        const saved =
          (await decryptFromDemoStorage<Record<string, unknown>>(
            budgetStorageKey,
            localStorage.getItem(budgetStorageKey),
          )) || {};
        saved.recurring = updated;
        localStorage.setItem(
          budgetStorageKey,
          await encryptForDemoStorage(budgetStorageKey, saved),
        );
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
      setStatusMessage({
        type: 'error',
        text: 'Failed to import scenario debt payments.',
      });
    }
  };

  return {
    handleOpenAddTransaction,
    handleEditTransaction,
    handleSaveTransaction,
    handleDeleteTransaction,
    handleOpenAddStock,
    handleEditStock,
    handleSaveStock,
    handleDeleteStock,
    handleOpenTrade,
    handleExecuteTrade,
    handleOpenAddRecurring,
    handleSaveRecurring,
    handleDeleteRecurring,
    handleGenerateDueOccurrences,
    handleImportScenarioSalary,
    handleImportScenarioDebts,
  };
}
