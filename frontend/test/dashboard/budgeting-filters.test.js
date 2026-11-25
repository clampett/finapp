const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createRequire } = require('node:module');
const { buildSync } = require('../../landing/node_modules/esbuild/lib/main');

const sourceRoot = path.join(__dirname, '../../dashboard/src');
const requireDashboard = createRequire(path.join(sourceRoot, '../package.json'));
const { renderToStaticMarkup } = requireDashboard('react-dom/server');

function loadModule(entryRelativePath, extraContext = {}) {
  const compiled = buildSync({
    entryPoints: [path.join(sourceRoot, entryRelativePath)],
    jsx: 'automatic',
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/jsx-runtime'],
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text;
  const runtime = {
    module: { exports: {} },
    require: requireDashboard,
    crypto: webcrypto,
    ...extraContext,
  };
  vm.runInNewContext(compiled, runtime);
  return runtime.module.exports;
}

const {
  matchesDateRange,
  filterTransactions,
  filterRecurringTransactions,
  filterStocks,
  filterPersonalAssets,
} = loadModule('budgeting/budgeting-filters.ts');
const { savePersonalAsset } = loadModule('assets/personal-assets.ts');
const { parseGraph } = loadModule('common/finance.ts');
const { SearchFilterBar } = loadModule('budgeting/SearchFilterBar.tsx');
const { TransactionSection } = loadModule('budgeting/TransactionSection.tsx');
const { RecurringSection } = loadModule('budgeting/RecurringSection.tsx');

test('matchesDateRange handles date-only boundaries, ISO timestamps, invalid dates, and inverted ranges', () => {
  assert.equal(matchesDateRange('2026-11-24', '', ''), true);
  assert.equal(matchesDateRange('2026-11-24', '2026-11-24', '2026-11-24'), true);
  assert.equal(matchesDateRange('2026-11-23', '2026-11-24', '2026-11-26'), false);
  assert.equal(matchesDateRange('2026-11-27', '2026-11-24', '2026-11-26'), false);

  const localEndOfDay = new Date('2026-11-24T23:59:59.500').toISOString();
  assert.equal(matchesDateRange(localEndOfDay, '2026-11-24', '2026-11-24'), true);

  assert.equal(matchesDateRange(undefined, '2026-11-01', ''), false);
  assert.equal(matchesDateRange('not-a-date', '2026-11-01', ''), false);
  assert.equal(matchesDateRange('2026-11-10', '2026-11-20', '2026-11-01'), false);
});

test('filterTransactions and filterRecurringTransactions match description, category, account, and dates', () => {
  const transactions = [
    {
      id: 1,
      kind: 'income',
      description: 'Monthly Salary',
      categoryName: 'Payroll',
      accountName: 'Checking',
      amount: 5000,
      transactionDate: '2026-11-01',
    },
    {
      id: 2,
      kind: 'expense',
      description: 'Trader Joes',
      categoryName: 'Groceries',
      accountName: 'Savings',
      amount: 120,
      date: '2026-11-15',
    },
  ];
  assert.equal(filterTransactions(transactions, '  grocer ', '', '').length, 1);
  assert.equal(filterTransactions(transactions, 'checking', '', '').length, 1);
  assert.equal(filterTransactions(transactions, '', '2026-11-10', '2026-11-20').length, 1);
  assert.equal(filterTransactions(transactions, '', '2026-11-10', '2026-11-20')[0].id, 2);

  const recurring = [
    {
      id: 10,
      kind: 'expense',
      description: 'Apartment Rent',
      categoryName: 'Housing',
      accountName: 'Checking',
      amount: 1800,
      frequency: 'monthly',
      intervalCount: 1,
      startDate: '2026-01-01',
      nextDueDate: '2026-12-01',
      isActive: true,
    },
  ];
  assert.equal(filterRecurringTransactions(recurring, 'housing', '', '').length, 1);
  assert.equal(filterRecurringTransactions(recurring, '', '2026-12-01', '2026-12-01').length, 1);
  assert.equal(filterRecurringTransactions(recurring, '', '2026-11-01', '2026-11-30').length, 0);
});

test('filterStocks matches ticker, companyName, and exchange', () => {
  const stocks = [
    { id: 1, ticker: 'AAPL', companyName: 'Apple Inc.', exchange: 'NASDAQ', lastPrice: 200 },
    { id: 2, ticker: 'VTI', companyName: 'Vanguard Total Stock', exchange: 'NYSE', lastPrice: 280 },
  ];
  assert.equal(filterStocks(stocks, 'apple').length, 1);
  assert.equal(filterStocks(stocks, 'nyse')[0].ticker, 'VTI');
  assert.equal(filterStocks(stocks, '').length, 2);
});

test('personal assets retain timestamps through savePersonalAsset and parseGraph and filter by name/date', () => {
  const graph = savePersonalAsset({ nodes: [], edges: [] }, 'Honda Civic', 18000, -8);
  const restored = parseGraph(JSON.parse(JSON.stringify(graph)));
  const asset = restored.nodes[0];
  assert.ok(asset.createdAt, 'createdAt must be stamped and preserved by parseGraph');
  assert.ok(asset.updatedAt, 'updatedAt must be stamped and preserved by parseGraph');

  const localDay = new Date(asset.updatedAt);
  const yyyy = localDay.getFullYear();
  const mm = String(localDay.getMonth() + 1).padStart(2, '0');
  const dd = String(localDay.getDate()).padStart(2, '0');
  const todayLocal = `${yyyy}-${mm}-${dd}`;

  assert.equal(filterPersonalAssets(restored.nodes, 'civic', todayLocal, todayLocal).length, 1);
  assert.equal(filterPersonalAssets(restored.nodes, '', '2020-01-01', '2020-12-31').length, 0);
});

test('SearchFilterBar and empty sections render appropriate states for filters and stock tab', () => {
  const stockBarHtml = renderToStaticMarkup(
    SearchFilterBar({
      searchQuery: 'AAPL',
      onSearchQueryChange: () => {},
      startDate: '',
      onStartDateChange: () => {},
      endDate: '',
      onEndDateChange: () => {},
      onClear: () => {},
      hasActiveFilters: true,
      showDateFilters: false,
      searchPlaceholder: 'Search stocks by ticker, company, or exchange...',
    }),
  );
  assert.doesNotMatch(stockBarHtml, /From date/);
  assert.match(stockBarHtml, /Clear filters/);

  const invalidRangeHtml = renderToStaticMarkup(
    SearchFilterBar({
      searchQuery: '',
      onSearchQueryChange: () => {},
      startDate: '2026-11-20',
      onStartDateChange: () => {},
      endDate: '2026-11-10',
      onEndDateChange: () => {},
      onClear: () => {},
      hasActiveFilters: true,
    }),
  );
  assert.match(invalidRangeHtml, /From date must be on or before To date/);

  const filteredTxHtml = renderToStaticMarkup(
    TransactionSection({
      transactions: [],
      userId: 1,
      isDemo: true,
      hasActiveFilters: true,
      onOpenAdd: () => {},
      onEdit: () => {},
      onDelete: async () => {},
      showTransForm: false,
      editingTransId: null,
      transDraft: { kind: 'expense', description: '', amount: 0 },
      setTransDraft: () => {},
      availableAccounts: ['Checking'],
      dbAccounts: [],
      graph: { nodes: [], edges: [] },
      onSaveTrans: async () => {},
      onCancelTrans: () => {},
    }),
  );
  assert.match(filteredTxHtml, /No transactions match your search or date filter/);

  const filteredRecurHtml = renderToStaticMarkup(
    RecurringSection({
      recurringList: [],
      userId: 1,
      isDemo: true,
      hasActiveFilters: true,
      generating: false,
      scenarioSalary: { totalMonthly: 0, nodes: [] },
      scenarioDebts: { totalBalance: 0, totalMonthlyPayment: 0, nodes: [] },
      onGenerateDueOccurrences: async () => {},
      onImportScenarioSalary: async () => {},
      onImportScenarioDebts: async () => {},
      onOpenAddRecurring: () => {},
      onEditRecurring: () => {},
      onDeleteRecurring: async () => {},
      showRecurForm: false,
      editingRecurId: null,
      recurDraft: {
        kind: 'expense',
        description: '',
        amount: 0,
        frequency: 'monthly',
        intervalCount: 1,
        startDate: '2026-11-01',
        nextDueDate: '2026-11-01',
        isActive: true,
      },
      setRecurDraft: () => {},
      graph: { nodes: [], edges: [] },
      onSaveRecur: async () => {},
      onCancelRecur: () => {},
    }),
  );
  assert.match(filteredRecurHtml, /No recurring transactions match your search or date filter/);
});
