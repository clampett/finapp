import { useMemo, useState } from 'react';
import {
  getScenarioSalary,
  getScenarioDebts,
  getScenarioBudgetComparison,
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
import { PersonalAssets } from '../assets/PersonalAssets';
import { BudgetSummaryCards } from '../budgeting/BudgetSummaryCards';
import { TransactionSection } from '../budgeting/TransactionSection';
import { StockSection } from '../budgeting/StockSection';
import { RecurringSection } from '../budgeting/RecurringSection';
import { SearchFilterBar } from '../budgeting/SearchFilterBar';
import {
  filterPersonalAssets,
  filterRecurringTransactions,
  filterStocks,
  filterTransactions,
  normalizeSearchQuery,
} from '../budgeting/budgeting-filters';
import { useBudgetData } from '../budgeting/useBudgetData';
import { useBudgetActions } from '../budgeting/useBudgetActions';

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

function formatTabCount(filtered: number, total: number, isFiltered: boolean): string {
  return isFiltered ? `${filtered}/${total}` : `${total}`;
}

export function BudgetingTab(props: BudgetingTabProps) {
  const { graph } = props;
  const assetSourceGraph = props.rawGraph ?? graph;
  const budgetData = useBudgetData(props);
  const actions = useBudgetActions(props, budgetData);

  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const {
    userId,
    isDemo,
    activeSubTab,
    setActiveSubTab,
    transactions,
    stocks,
    positions,
    recurringList,
    dbAccounts,
    refreshing,
    generating,
    statusMessage,
    setStatusMessage,
    activeLoad,
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
    quotePrice,
    fetchingQuote,
    detectedDividend,
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
  } = budgetData;

  const {
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
  } = actions;

  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const hasDateFilters = Boolean(startDate || endDate);
  const hasActiveFilters = Boolean(normalizedQuery || hasDateFilters);
  const hasStockFilters = Boolean(normalizedQuery);

  const filteredTransactions = useMemo(
    () => filterTransactions(transactions, searchQuery, startDate, endDate),
    [transactions, searchQuery, startDate, endDate],
  );

  const filteredRecurring = useMemo(
    () => filterRecurringTransactions(recurringList, searchQuery, startDate, endDate),
    [recurringList, searchQuery, startDate, endDate],
  );

  const filteredStocks = useMemo(() => filterStocks(stocks, searchQuery), [stocks, searchQuery]);

  const totalAssetsCount = useMemo(
    () => assetSourceGraph.nodes.filter((n) => n.nodeType === 'ASSET').length,
    [assetSourceGraph.nodes],
  );

  const filteredAssetsCount = useMemo(
    () => filterPersonalAssets(assetSourceGraph.nodes, searchQuery, startDate, endDate).length,
    [assetSourceGraph.nodes, searchQuery, startDate, endDate],
  );

  const activeNodes = graph.nodes.filter(
    (node) => !node.archived && ['INCOME', 'EXPENSE', 'DEBT'].includes(node.nodeType),
  );

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

      {/* Unified Search & Date Range Filter (PBI 7) */}
      <SearchFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        hasActiveFilters={activeSubTab === 'stocks' ? hasStockFilters : hasActiveFilters}
        showDateFilters={activeSubTab !== 'stocks'}
        searchPlaceholder={
          activeSubTab === 'stocks'
            ? 'Search stocks by ticker, company, or exchange...'
            : 'Search by name, category, or account...'
        }
        onClear={() => {
          setSearchQuery('');
          setStartDate('');
          setEndDate('');
        }}
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
          Transactions (
          {formatTabCount(filteredTransactions.length, transactions.length, hasActiveFilters)})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('recurring')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'recurring' ? 'bg-primary text-primary-fg' : 'bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Recurring Transactions (
          {formatTabCount(filteredRecurring.length, recurringList.length, hasActiveFilters)})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('stocks')}
          className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium cursor-pointer transition-colors ${activeSubTab === 'stocks' ? 'bg-primary text-primary-fg' : 'bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text'}`}
          style={{ padding: '6px 16px', fontSize: '14px' }}
        >
          Trade ledger ({formatTabCount(filteredStocks.length, stocks.length, hasStockFilters)})
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab('assets')}
          className={`rounded-lg px-4 py-2 text-sm cursor-pointer ${activeSubTab === 'assets' ? 'bg-primary text-primary-fg' : 'text-muted hover:bg-hover-bg'}`}
        >
          Assets ({formatTabCount(filteredAssetsCount, totalAssetsCount, hasActiveFilters)})
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
      <div
        className="min-h-[1.4em] flex items-center gap-2 text-(--ui-text-91a3bd) text-[13px]"
        role="status"
        aria-live="polite"
      >
        {generating
          ? 'Generating due occurrences. You can keep browsing.'
          : refreshing
            ? 'Refreshing in the background. Your current data stays visible.'
            : ''}
      </div>

      {/* Connected owned property to the canonical scenario instead of the income ledger. */}
      {activeSubTab === 'assets' && (
        <PersonalAssets
          graph={assetSourceGraph}
          onUpdate={props.onUpdateGraph}
          searchQuery={searchQuery}
          startDate={startDate}
          endDate={endDate}
        />
      )}
      {/* SECTION 1: TRANSACTIONS */}
      {activeSubTab === 'transactions' && (
        <TransactionSection
          transactions={filteredTransactions}
          userId={userId}
          isDemo={isDemo}
          hasActiveFilters={hasActiveFilters}
          onOpenAdd={handleOpenAddTransaction}
          onOpenAiAsset={() => setActiveSubTab('assets')}
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
          stocks={filteredStocks}
          positions={positions}
          currentPrices={currentPrices}
          totalPurchasedValue={totalPurchasedValue}
          totalPortfolioValue={totalPortfolioValue}
          userId={userId}
          hasActiveFilters={hasStockFilters}
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
          recurringList={filteredRecurring}
          userId={userId}
          isDemo={isDemo}
          hasActiveFilters={hasActiveFilters}
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
