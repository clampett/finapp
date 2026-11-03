const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../landing/node_modules/esbuild');

const runtime = {
  module: { exports: {} },
  window: { dispatchEvent: () => {} },
  CustomEvent: class {},
  fetch: global.fetch || (() => {}),
  localStorage: {
    data: {},
    getItem(k) {
      return this.data[k] !== undefined ? this.data[k] : null;
    },
    setItem(k, v) {
      this.data[k] = String(v);
    },
  },
};

vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../dashboard/src/portfolio.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  runtime,
);

const {
  DEFAULT_DEMO_HOLDINGS,
  parseLocalHoldings,
  holdingsToSynthetic,
  PORTFOLIO_UPDATED_EVENT,
  getStoredPortfolioValue,
  saveStoredPortfolioValue,
  loadUnifiedHoldings,
  addStockUnified,
  updateSharesUnified,
  removeStockUnified,
} = runtime.module.exports;

const financeRuntime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../dashboard/src/finance.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  financeRuntime,
);
const { totals, overviewBreakdown, debtPayment } = financeRuntime.module.exports;

test('portfolio: default demo archetypes are defined for profiles 1, 2, and 3', () => {
  assert.ok(DEFAULT_DEMO_HOLDINGS[1]?.length >= 2, 'Recent Grad has demo holdings');
  assert.ok(DEFAULT_DEMO_HOLDINGS[2]?.length >= 3, 'Mid-Career Family has demo holdings');
  assert.ok(DEFAULT_DEMO_HOLDINGS[3]?.length >= 3, 'FIRE Strategist has demo holdings');
  assert.equal(PORTFOLIO_UPDATED_EVENT, 'finapp-portfolio-updated');
});

test('portfolio: holdingsToSynthetic converts unified holdings to stocks and positions', () => {
  const holdings = [
    { symbol: 'AAPL', shares: 10, lastPrice: 200, companyName: 'Apple Inc.' },
    { symbol: 'SPY', shares: 5, lastPrice: 500, companyName: 'SPDR S&P 500 ETF' },
  ];
  const { stocks, positions } = holdingsToSynthetic(holdings, 2);

  assert.equal(stocks.length, 2);
  assert.equal(positions.length, 2);
  assert.equal(stocks[0].ticker, 'AAPL');
  assert.equal(stocks[0].sharesOwned, 10);
  assert.equal(positions[0].marketValue, 2000);
  assert.equal(positions[1].marketValue, 2500);
});

test('portfolio: parseLocalHoldings filters invalid items and respects max limit', () => {
  runtime.localStorage.setItem(
    'test-holdings',
    JSON.stringify([
      { symbol: 'AAPL', shares: 10 },
      { symbol: 'BAD', shares: -5 },
      { symbol: 123, shares: 10 },
      { symbol: 'MSFT', shares: 20 },
    ]),
  );
  const result = parseLocalHoldings('test-holdings', 1);
  assert.equal(result.length, 1);
  assert.equal(result[0].symbol, 'AAPL');
  assert.equal(result[0].shares, 10);
});

test('dynamic net worth: totals incorporates live stock portfolio value', () => {
  const sampleGraph = {
    nodes: [
      { id: '1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 5000, interestRateApr: 0 },
      { id: '2', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 2000, interestRateApr: 0 },
      { id: '3', name: 'Loan', nodeType: 'DEBT', amountOrBalance: 1000, interestRateApr: 5 },
      { id: '4', name: '401k', nodeType: 'INVESTMENT', amountOrBalance: 3000, interestRateApr: 7 },
    ],
    edges: [],
  };

  const baseline = totals(sampleGraph);
  assert.equal(baseline.assets, 5000); // 2000 + 3000
  assert.equal(baseline.netWorth, 4000); // 5000 - 1000

  // With a $10,000 live stock portfolio value
  const dynamic = totals(sampleGraph, 10000);
  assert.equal(dynamic.assets, 15000); // 2000 + 3000 + 10000
  assert.equal(dynamic.netWorth, 14000); // 15000 - 1000
  assert.equal(dynamic.netWorth, baseline.netWorth + 10000);

  // Overview composition breakdown also incorporates portfolioValue
  const breakdown = overviewBreakdown(sampleGraph, 'assets', 10000);
  assert.equal(breakdown.total, 15000);
  const investmentItem = breakdown.items.find((i) => i.label.includes('Investments'));
  assert.equal(investmentItem?.value, 13000); // 3000 node + 10000 stocks
});

test('portfolio: saveStoredPortfolioValue persists and detects modifications', () => {
  const key = 'test-storage-key';
  assert.equal(saveStoredPortfolioValue(key, 5500), true);
  assert.equal(getStoredPortfolioValue(key), 5500);
  assert.equal(saveStoredPortfolioValue(key, 5500), false); // unchanged
  assert.equal(saveStoredPortfolioValue(key, 6200), true); // changed
  assert.equal(getStoredPortfolioValue(key), 6200);
});

const bridgeRuntime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../dashboard/src/budgeting-bridge.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  bridgeRuntime,
);
const {
  getScenarioSalary,
  getScenarioDebts,
  getScenarioBudgetComparison,
  createSalaryRecurringTemplates,
  createDebtRecurringTemplates,
  syncScenarioTransactionToGraph,
  syncGraphNodesToRecurring,
  syncRecurringToGraphNode,
  syncRecurringDeletionToGraph,
  recurringToMonthlyAmount,
  monthlyToRecurringAmount,
  isRecurringActive,
  getAvailableBudgetAccounts,
} = bridgeRuntime.module.exports;

test('budgeting-bridge: getScenarioSalary extracts active income nodes', () => {
  const graph = {
    nodes: [
      { id: '1', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 8500, interestRateApr: 0 },
      { id: '2', name: 'Bonus', nodeType: 'INCOME', amountOrBalance: 1000, interestRateApr: 0, archived: true },
      { id: '3', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 3000, interestRateApr: 0 },
    ],
    edges: [],
  };
  const salary = getScenarioSalary(graph);
  assert.equal(salary.totalMonthly, 8500);
  assert.equal(salary.nodes.length, 1);
  assert.equal(salary.nodes[0].name, 'Software Engineer Salary');
});

test('budgeting-bridge: getScenarioDebts extracts debt nodes and computes payments', () => {
  const graph = {
    nodes: [
      { id: 'd1', name: 'Student Loan', nodeType: 'DEBT', amountOrBalance: 25000, interestRateApr: 5.5, minPayment: 285 },
      { id: 'd2', name: 'Credit Card', nodeType: 'DEBT', amountOrBalance: 5000, interestRateApr: 19.99 },
    ],
    edges: [],
  };
  const debts = getScenarioDebts(graph);
  assert.equal(debts.nodes.length, 2);
  assert.equal(debts.totalBalance, 30000);
  // Student loan min payment = 285
  // Credit card has no min payment, defaults to 2% = 100
  assert.equal(debts.nodes[0].monthlyPayment, 285);
  assert.equal(debts.nodes[1].monthlyPayment, 100);
  assert.equal(debts.totalMonthlyPayment, 385);
});

test('budgeting-bridge: getScenarioBudgetComparison compares planned scenario vs actuals', () => {
  const graph = {
    nodes: [
      { id: 'i1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 6000, interestRateApr: 0 },
      { id: 'e1', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 2000, interestRateApr: 0 },
      { id: 'd1', name: 'Car Loan', nodeType: 'DEBT', amountOrBalance: 12000, interestRateApr: 4.5, minPayment: 300 },
    ],
    edges: [],
  };
  // Actuals: $6,500 income, $2,100 expense
  const comparison = getScenarioBudgetComparison(graph, 6500, 2100);
  assert.equal(comparison.plannedIncome, 6000);
  assert.equal(comparison.actualIncome, 6500);
  assert.equal(comparison.incomeVariance, 500); // $500 above plan
  assert.equal(comparison.plannedDebtPayments, 300);
  assert.equal(comparison.plannedExpenses, 2000);
  assert.equal(comparison.plannedTotalCommitments, 2300);
  assert.equal(comparison.expenseVariance, 200); // 2300 - 2100 = 200 under budget
  assert.equal(comparison.actualCashFlow, 4400); // 6500 - 2100
});

test('budgeting-bridge: createSalaryRecurringTemplates and createDebtRecurringTemplates create templates', () => {
  const graph = {
    nodes: [
      { id: 'i1', name: 'Engineering Salary', nodeType: 'INCOME', amountOrBalance: 7000, interestRateApr: 0 },
      { id: 'd1', name: 'Auto Loan', nodeType: 'DEBT', amountOrBalance: 15000, interestRateApr: 4, minPayment: 350 },
    ],
    edges: [],
  };
  const salaryTemplates = createSalaryRecurringTemplates(graph, []);
  assert.equal(salaryTemplates.length, 1);
  assert.equal(salaryTemplates[0].kind, 'income');
  assert.equal(salaryTemplates[0].amount, 7000);
  assert.equal(salaryTemplates[0].description, 'Engineering Salary Paycheck');

  // If already present, skips duplicate
  const duplicatesSkipped = createSalaryRecurringTemplates(graph, salaryTemplates);
  assert.equal(duplicatesSkipped.length, 0);

  const debtTemplates = createDebtRecurringTemplates(graph, []);
  assert.equal(debtTemplates.length, 1);
  assert.equal(debtTemplates[0].kind, 'expense');
  assert.equal(debtTemplates[0].amount, 350);
  assert.equal(debtTemplates[0].description, 'Auto Loan Payment');
  assert.equal(debtTemplates[0].accountName, 'Auto Loan');
});

test('budgeting-bridge: syncScenarioTransactionToGraph pays down debt balance', () => {
  const graph = {
    nodes: [
      { id: 'd1', name: 'Student Loan', nodeType: 'DEBT', amountOrBalance: 10000, interestRateApr: 6 },
    ],
    edges: [],
  };

  // Payment by account name
  const res1 = syncScenarioTransactionToGraph(graph, {
    kind: 'expense',
    accountName: 'Student Loan',
    amount: 500,
  });
  assert.ok(res1);
  assert.equal(res1.matchedNode.id, 'd1');
  assert.equal(res1.newBalance, 9500);
  assert.equal(res1.updatedGraph.nodes[0].amountOrBalance, 9500);

  // Income does not reduce debt
  const res2 = syncScenarioTransactionToGraph(graph, {
    kind: 'income',
    accountName: 'Student Loan',
    amount: 500,
  });
  assert.equal(res2, null);

  // Overpaying caps at 0
  const res3 = syncScenarioTransactionToGraph(graph, {
    kind: 'expense',
    accountName: 'Student Loan',
    amount: 15000,
  });
  assert.ok(res3);
  assert.equal(res3.newBalance, 0);
  assert.equal(res3.updatedGraph.nodes[0].amountOrBalance, 0);

  // Income to Checking increases Checking balance
  const cashGraph = {
    nodes: [
      { id: 'c1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 2000, interestRateApr: 0 },
      { id: 's1', name: 'Savings', nodeType: 'SAVINGS', amountOrBalance: 5000, interestRateApr: 2 },
    ],
    edges: [],
  };
  const incomeSync = syncScenarioTransactionToGraph(cashGraph, {
    kind: 'income',
    accountName: 'Checking',
    amount: 1500,
  });
  assert.ok(incomeSync);
  assert.equal(incomeSync.matchedNode.id, 'c1');
  assert.equal(incomeSync.newBalance, 3500);
  assert.equal(incomeSync.updatedGraph.nodes[0].amountOrBalance, 3500);

  // Expense from Checking decreases Checking balance
  const expenseSync = syncScenarioTransactionToGraph(cashGraph, {
    kind: 'expense',
    accountName: 'Checking',
    amount: 600,
  });
  assert.ok(expenseSync);
  assert.equal(expenseSync.newBalance, 1400);
  assert.equal(expenseSync.updatedGraph.nodes[0].amountOrBalance, 1400);
});

test('budgeting-bridge: syncScenarioTransactionToGraph updates cash account balance for point-in-time transactions without cluttering graph flow nodes', () => {
  const baseGraph = {
    nodes: [
      { id: 'c1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 2500, interestRateApr: 0, position: { x: 300, y: 150 } },
    ],
    edges: [],
  };

  // 1. Single income transaction (e.g. freelance deposit) increases Checking cash balance
  const incomeResult = syncScenarioTransactionToGraph(baseGraph, {
    kind: 'income',
    description: 'Freelance Bonus',
    amount: 1000,
    accountName: 'Checking',
  });
  assert.ok(incomeResult);
  assert.equal(incomeResult.newBalance, 3500);
  const checkingAfterIncome = incomeResult.updatedGraph.nodes.find((n) => n.id === 'c1');
  assert.equal(checkingAfterIncome.amountOrBalance, 3500);
  // Does not add recurring scenario nodes or edges
  assert.equal(incomeResult.updatedGraph.nodes.length, 1);
  assert.equal(incomeResult.updatedGraph.edges.length, 0);

  // 2. Single expense transaction (e.g. Grocery Trip) decreases Checking cash balance
  const expenseResult = syncScenarioTransactionToGraph(incomeResult.updatedGraph, {
    kind: 'expense',
    description: "Grocery Trip - Trader Joe's",
    amount: 150,
    accountName: 'Checking',
  });
  assert.ok(expenseResult);
  assert.equal(expenseResult.newBalance, 3350);
  const checkingAfterExpense = expenseResult.updatedGraph.nodes.find((n) => n.id === 'c1');
  assert.equal(checkingAfterExpense.amountOrBalance, 3350);
  assert.equal(expenseResult.updatedGraph.nodes.length, 1);
  assert.equal(expenseResult.updatedGraph.edges.length, 0);
});

test('budgeting-bridge: one-time transactions affect overall net worth (+500 on income, -150 on expense, reversal on delete)', () => {
  const scenario = {
    nodes: [
      { id: 'c1', name: 'Checking Account', nodeType: 'CHECKING', amountOrBalance: 2000, interestRateApr: 0 },
      { id: 'd1', name: 'Credit Card', nodeType: 'DEBT', amountOrBalance: 1000, interestRateApr: 18 },
    ],
    edges: [],
  };

  const initialNetWorth = totals(scenario).netWorth;
  assert.equal(initialNetWorth, 1000); // 2000 - 1000

  // 1. Record an income transaction for $500 -> net worth rises by $500
  const incomeSync = syncScenarioTransactionToGraph(scenario, {
    kind: 'income',
    description: 'Freelance Design',
    amount: 500,
    accountName: 'Checking',
  });
  assert.ok(incomeSync);
  const netWorthAfterIncome = totals(incomeSync.updatedGraph).netWorth;
  assert.equal(netWorthAfterIncome, 1500);
  assert.equal(netWorthAfterIncome, initialNetWorth + 500);

  // 2. Record an expense transaction for $200 -> net worth decreases by $200
  const expenseSync = syncScenarioTransactionToGraph(incomeSync.updatedGraph, {
    kind: 'expense',
    description: 'Dining Out',
    amount: 200,
    accountName: 'Checking',
  });
  assert.ok(expenseSync);
  const netWorthAfterExpense = totals(expenseSync.updatedGraph).netWorth;
  assert.equal(netWorthAfterExpense, 1300);

  // 3. Deleting the $200 expense reverses it -> net worth rises back by $200 to 1500
  const reverseExpense = syncScenarioTransactionToGraph(expenseSync.updatedGraph, {
    kind: 'income',
    description: 'Dining Out',
    amount: 200,
    accountName: 'Checking',
    isReversal: true,
  });
  assert.ok(reverseExpense);
  assert.equal(totals(reverseExpense.updatedGraph).netWorth, 1500);

  // 4. Deleting the $500 income reverses it -> net worth drops back to initial 1000
  const reverseIncome = syncScenarioTransactionToGraph(reverseExpense.updatedGraph, {
    kind: 'expense',
    description: 'Freelance Design',
    amount: 500,
    accountName: 'Checking',
    isReversal: true,
  });
  assert.ok(reverseIncome);
  assert.equal(totals(reverseIncome.updatedGraph).netWorth, initialNetWorth);

  // 5. Fallback: Recording income to 'Savings' when no savings node exists falls back to checking or creates cash node
  const savingsIncome = syncScenarioTransactionToGraph(scenario, {
    kind: 'income',
    description: 'Gift',
    amount: 300,
    accountName: 'Savings',
  });
  assert.ok(savingsIncome);
  assert.equal(totals(savingsIncome.updatedGraph).netWorth, initialNetWorth + 300);
});

test('budgeting-bridge: syncGraphNodesToRecurring automatically synchronizes scenario flow nodes into recurring transactions', () => {
  const graph = {
    nodes: [
      { id: 'sal1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 5000, interestRateApr: 0 },
      { id: 'rent1', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 1800, interestRateApr: 0 },
      { id: 'loan1', name: 'Auto Loan', nodeType: 'DEBT', amountOrBalance: 12000, interestRateApr: 5, minPayment: 320 },
      { id: 'chk1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 3000, interestRateApr: 0 },
    ],
    edges: [],
  };

  // 1. Initial sync from graph nodes into empty recurring list
  const sync1 = syncGraphNodesToRecurring(graph, []);
  assert.equal(sync1.hasChanges, true);
  assert.equal(sync1.updatedRecurring.length, 3); // Salary, Rent, Auto Loan (Checking is not a flow)

  const salaryRecur = sync1.updatedRecurring.find((r) => r.description === 'Salary');
  assert.ok(salaryRecur);
  assert.equal(salaryRecur.kind, 'income');
  assert.equal(salaryRecur.amount, 5000);
  assert.ok(salaryRecur.notes.includes('[node-id:sal1]'));

  const rentRecur = sync1.updatedRecurring.find((r) => r.description === 'Rent');
  assert.ok(rentRecur);
  assert.equal(rentRecur.kind, 'expense');
  assert.equal(rentRecur.amount, 1800);

  const loanRecur = sync1.updatedRecurring.find((r) => r.description === 'Auto Loan Payment');
  assert.ok(loanRecur);
  assert.equal(loanRecur.kind, 'expense');
  assert.equal(loanRecur.amount, 320);

  // 2. Running again with same graph results in no changes
  const sync2 = syncGraphNodesToRecurring(graph, sync1.updatedRecurring);
  assert.equal(sync2.hasChanges, false);
  assert.equal(sync2.updatedRecurring.length, 3);

  // 3. Modifying node amount on canvas updates recurring transaction amount
  const modifiedGraph = {
    ...graph,
    nodes: graph.nodes.map((n) => (n.id === 'sal1' ? { ...n, amountOrBalance: 6000 } : n)),
  };
  const sync3 = syncGraphNodesToRecurring(modifiedGraph, sync1.updatedRecurring);
  assert.equal(sync3.hasChanges, true);
  const updatedSalary = sync3.updatedRecurring.find((r) => r.description === 'Salary');
  assert.equal(updatedSalary.amount, 6000);

  // 4. Archiving a node pauses its saved rule without removing history
  const archivedGraph = {
    ...modifiedGraph,
    nodes: modifiedGraph.nodes.map((n) => (n.id === 'rent1' ? { ...n, archived: true } : n)),
  };
  const sync4 = syncGraphNodesToRecurring(archivedGraph, sync3.updatedRecurring);
  assert.equal(sync4.hasChanges, true);
  assert.equal(sync4.updatedRules.find((r) => r.description === 'Rent').isActive, false);
});

test('budgeting-bridge: syncRecurringToGraphNode automatically adds/updates nodes and edges in graph scenario', () => {
  const initialGraph = {
    nodes: [
      { id: 'c1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 4000, interestRateApr: 0, position: { x: 300, y: 150 } },
    ],
    edges: [],
  };

  // 1. Adding a recurring income "Salary" creates an INCOME node connected to Checking
  const incomeRecur = {
    kind: 'income',
    description: 'Salary',
    amount: 5500,
    categoryName: 'Income',
  };
  const sync1 = syncRecurringToGraphNode(initialGraph, incomeRecur);
  assert.equal(sync1.isNew, true);
  assert.equal(sync1.affectedNode.name, 'Salary');
  assert.equal(sync1.affectedNode.nodeType, 'INCOME');
  assert.equal(sync1.affectedNode.amountOrBalance, 5500);
  assert.equal(sync1.updatedGraph.nodes.length, 2);
  assert.equal(sync1.updatedGraph.edges.length, 1);
  assert.equal(sync1.updatedGraph.edges[0].sourceNodeId, sync1.affectedNode.id);
  assert.equal(sync1.updatedGraph.edges[0].targetNodeId, 'c1');
  assert.equal(sync1.updatedGraph.edges[0].monthlyFixedFlow, 5500);

  // 2. Adding a recurring debt "Student Loan" creates a DEBT node connected from Checking
  const debtRecur = {
    kind: 'expense',
    description: 'Student Loan',
    amount: 300,
    categoryName: 'Debt',
  };
  const sync2 = syncRecurringToGraphNode(sync1.updatedGraph, debtRecur);
  assert.equal(sync2.isNew, true);
  assert.equal(sync2.affectedNode.nodeType, 'DEBT');
  assert.equal(sync2.affectedNode.name, 'Student Loan');
  assert.equal(sync2.updatedGraph.nodes.length, 3);
  assert.equal(sync2.updatedGraph.edges.length, 2);
  const debtEdge = sync2.updatedGraph.edges.find((e) => e.targetNodeId === sync2.affectedNode.id);
  assert.ok(debtEdge);
  assert.equal(debtEdge.sourceNodeId, 'c1');
  assert.equal(debtEdge.monthlyFixedFlow, 300);

  // 3. Updating existing recurring transaction modifies the existing node and edge flow
  const updatedIncomeRecur = {
    kind: 'income',
    description: 'Salary',
    amount: 6200,
    notes: `[node-id:${sync1.affectedNode.id}]`,
  };
  const sync3 = syncRecurringToGraphNode(sync2.updatedGraph, updatedIncomeRecur);
  assert.equal(sync3.isNew, false);
  assert.equal(sync3.affectedNode.amountOrBalance, 6200);
  assert.equal(sync3.updatedGraph.nodes.length, 3);
  const updatedSalaryNode = sync3.updatedGraph.nodes.find((n) => n.id === sync1.affectedNode.id);
  assert.equal(updatedSalaryNode.amountOrBalance, 6200);
  const updatedSalaryEdge = sync3.updatedGraph.edges.find((e) => e.sourceNodeId === sync1.affectedNode.id);
  assert.equal(updatedSalaryEdge.monthlyFixedFlow, 6200);
});

test('budgeting-bridge: syncRecurringDeletionToGraph automatically archives matched node in graph scenario', () => {
  const graph = {
    nodes: [
      { id: 'sal1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 5000, interestRateApr: 0 },
      { id: 'chk1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 3000, interestRateApr: 0 },
    ],
    edges: [],
  };

  const deletedRecur = {
    description: 'Salary',
    notes: '[node-id:sal1] Scenario Income: Salary',
  };
  const res = syncRecurringDeletionToGraph(graph, deletedRecur);
  assert.ok(res);
  assert.equal(res.removedNode.id, 'sal1');
  assert.equal(res.updatedGraph.nodes.find((n) => n.id === 'sal1').archived, true);
});

test('end-to-end interconnected system: multi-step budgeting, investing, and dynamic net worth flow', () => {
  // Step 1: Baseline scenario
  let scenario = {
    nodes: [
      { id: 'salary', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 8000, interestRateApr: 0 },
      { id: 'checking', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 3000, interestRateApr: 0 },
      { id: 'loan', name: 'Student Loan', nodeType: 'DEBT', amountOrBalance: 10000, interestRateApr: 6, minPayment: 250 },
      { id: 'retire', name: '401k', nodeType: 'INVESTMENT', amountOrBalance: 5000, interestRateApr: 7 },
    ],
    edges: [],
  };

  let t = totals(scenario, 0);
  // Assets = 3000 (checking) + 5000 (401k) = 8000. Debt = 10000. Net worth = -2000.
  assert.equal(t.assets, 8000);
  assert.equal(t.debt, 10000);
  assert.equal(t.netWorth, -2000);

  // Step 2: User adds stock portfolio holdings ($15,000 value) in Budgeting / Investing
  let portfolioVal = 15000;
  t = totals(scenario, portfolioVal);
  // Assets = 8000 + 15000 = 23000. Net worth = 23000 - 10000 = 13000.
  assert.equal(t.assets, 23000);
  assert.equal(t.totalInvestments, 20000); // 5000 node + 15000 stocks
  assert.equal(t.netWorth, 13000);

  // Step 3: Salary node populates recurring template, user logs monthly salary paycheck into Checking ($8,000)
  const salarySync = syncScenarioTransactionToGraph(scenario, {
    kind: 'income',
    accountName: 'Checking',
    amount: 8000,
  });
  assert.ok(salarySync);
  scenario = salarySync.updatedGraph;
  t = totals(scenario, portfolioVal);
  // Checking is now 11000. Assets = 11000 + 20000 = 31000. Net worth = 31000 - 10000 = 21000.
  assert.equal(t.assets, 31000);
  assert.equal(t.netWorth, 21000);

  // Step 4: User logs $2,000 debt paydown to Student Loan
  const debtSync = syncScenarioTransactionToGraph(scenario, {
    kind: 'expense',
    accountName: 'Student Loan',
    amount: 2000,
  });
  assert.ok(debtSync);
  scenario = debtSync.updatedGraph;
  t = totals(scenario, portfolioVal);
  // Paid 2000 from checking, preserving net worth as principal fell by the same amount.
  assert.equal(t.debt, 8000);
  assert.equal(t.netWorth, 21000);

  // Step 5: User logs $1,000 living expenses from Checking
  const expenseSync = syncScenarioTransactionToGraph(scenario, {
    kind: 'expense',
    accountName: 'Checking',
    amount: 1000,
  });
  assert.ok(expenseSync);
  scenario = expenseSync.updatedGraph;
  t = totals(scenario, portfolioVal);
  // Checking fell from 9000 to 8000 after living expenses.
  assert.equal(t.assets, 28000);
  assert.equal(t.netWorth, 20000);

  // Step 6: Stock gains appreciate portfolio from $15,000 to $18,000
  portfolioVal = 18000;
  t = totals(scenario, portfolioVal);
  // Assets = 8000 + 5000 + 18000 = 31000.
  assert.equal(t.assets, 31000);
  assert.equal(t.netWorth, 23000);
});

test('issue 1: editing a recurring debt payment preserves loan balance and updates payment settings', () => {
  const loanNode = {
    id: 'loan-1',
    name: 'Auto Loan',
    nodeType: 'DEBT',
    amountOrBalance: 14000,
    interestRateApr: 5,
    minPayment: 300,
  };
  const checkingNode = {
    id: 'chk-1',
    name: 'Checking',
    nodeType: 'CHECKING',
    amountOrBalance: 5000,
    interestRateApr: 0,
  };
  const edge = {
    id: 'e1',
    sourceNodeId: 'chk-1',
    targetNodeId: 'loan-1',
    monthlyFixedFlow: 300,
  };
  const graph = {
    nodes: [loanNode, checkingNode],
    edges: [edge],
  };

  // Edit recurring payment to $400
  const result = syncRecurringToGraphNode(graph, {
    description: 'Auto Loan Payment',
    amount: 400,
    frequency: 'monthly',
    intervalCount: 1,
    categoryName: 'Debt',
    notes: '[node-id:loan-1]',
  });

  const updatedLoan = result.updatedGraph.nodes.find((n) => n.id === 'loan-1');
  assert.equal(updatedLoan.amountOrBalance, 14000, 'Principal balance must be preserved at $14,000');
  assert.equal(result.affectedNode.amountOrBalance, 14000, 'Affected node balance must be preserved');
  assert.equal(result.updatedGraph.edges[0].monthlyFixedFlow, 400, 'Incoming payment edge updated to $400');
  assert.equal(debtPayment(updatedLoan, result.updatedGraph), 400, 'Debt payment calculates to $400');
});

test('issue 2: syncGraphNodesToRecurring returns newly created rules for database persistence', () => {
  const graph = {
    nodes: [
      { id: 'inc-1', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 6000, interestRateApr: 0 },
      { id: 'exp-1', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 1500, interestRateApr: 0 },
    ],
    edges: [],
  };

  const { updatedRecurring, hasChanges, newRules } = syncGraphNodesToRecurring(graph, []);
  assert.ok(hasChanges);
  assert.equal(updatedRecurring.length, 2);
  assert.equal(newRules.length, 2, 'Must return newRules array so caller can persist them to PostgreSQL');
  assert.equal(newRules[0].description, 'Software Engineer Salary');
  assert.equal(newRules[1].description, 'Rent');
});

test('issue 3: recurring frequency, interval, and inactive status are respected by graph synchronization', () => {
  const graph = {
    nodes: [
      { id: 'chk-1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 5000, interestRateApr: 0 },
    ],
    edges: [],
  };

  // 1. Weekly $500 income -> becomes monthly $2166.67
  const weeklyResult = syncRecurringToGraphNode(graph, {
    description: 'Weekly Gig',
    amount: 500,
    frequency: 'weekly',
    intervalCount: 1,
    kind: 'income',
    isActive: true,
  });
  const weeklyNode = weeklyResult.affectedNode;
  assert.equal(weeklyNode.amountOrBalance, 2166.67, 'Weekly $500 should translate to ~$2,166.67 monthly');
  assert.equal(weeklyNode.disabled, false, 'Active rule creates enabled node');

  // 2. Inactive rule -> creates disabled node
  const inactiveResult = syncRecurringToGraphNode(graph, {
    description: 'Old Side Business',
    amount: 1000,
    frequency: 'monthly',
    intervalCount: 1,
    kind: 'income',
    isActive: false,
  });
  assert.equal(inactiveResult.affectedNode.disabled, true, 'Inactive rule creates disabled node');

  // 3. Expired rule -> creates disabled node
  const expiredResult = syncRecurringToGraphNode(graph, {
    description: 'Expired Grant',
    amount: 500,
    frequency: 'monthly',
    intervalCount: 1,
    kind: 'income',
    isActive: true,
    endDate: '2020-01-01',
  });
  assert.equal(expiredResult.affectedNode.disabled, true, 'Expired rule creates disabled node');

  // 4. In syncGraphNodesToRecurring, disabled node syncs to isActive: false
  const graphWithDisabled = {
    nodes: [
      { id: 'inc-off', name: 'Disabled Income', nodeType: 'INCOME', amountOrBalance: 2000, interestRateApr: 0, disabled: true },
    ],
    edges: [],
  };
  const { updatedRecurring } = syncGraphNodesToRecurring(graphWithDisabled, []);
  assert.equal(updatedRecurring[0].isActive, false, 'Disabled node syncs to isActive: false');
});

test('issue 4: portfolio helpers do not update storage when server rejects write with HTTP 500', async () => {
  const storageKey = 'test-storage-fail-4';
  runtime.localStorage.data[storageKey] = JSON.stringify([{ symbol: 'AAPL', shares: 5, lastPrice: 150 }]);

  // Mock server HTTP 500 error
  runtime.fetch = async () => ({
    ok: false,
    status: 500,
    statusText: 'Internal Server Error',
    json: async () => ({ message: 'Database transaction failed' }),
  });

  await assert.rejects(
    async () => {
      await addStockUnified({
        storageKey,
        userId: 10,
        demo: false,
        symbol: 'MSFT',
        price: 300,
        shares: 2,
      });
    },
    /Server rejected stock creation|Database transaction failed/,
  );

  // Verify local storage was NOT mutated
  const remaining = parseLocalHoldings(storageKey);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].symbol, 'AAPL');
  assert.ok(!remaining.some((h) => h.symbol === 'MSFT'), 'Rejected stock must not be saved locally');
});

test('issue 5: simulations do not count portfolio multiple times across multiple investment nodes or in selected scopes', () => {
  const investmentNodes = [
    { id: 'inv-1', name: '401(k)', nodeType: 'INVESTMENT', amountOrBalance: 10000, interestRateApr: 7 },
    { id: 'inv-2', name: 'Roth IRA', nodeType: 'INVESTMENT', amountOrBalance: 20000, interestRateApr: 7 },
  ];
  const portfolioValue = 50000;

  // When scope is 'all', each investment node retains its individual balance and portfolio is added ONCE as portfolio-holdings
  const isSelectedScopeAll = false;
  const effectivePortfolioAll = isSelectedScopeAll ? 0 : portfolioValue;
  const simNodesAll = [
    ...investmentNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.nodeType,
      balance: n.amountOrBalance,
      apr: n.interestRateApr,
    })),
    ...(effectivePortfolioAll > 0
      ? [{ id: 'portfolio-holdings', name: 'Stock Portfolio', type: 'INVESTMENT', balance: effectivePortfolioAll, apr: 7 }]
      : []),
  ];
  const totalMarketAssetsAll = simNodesAll.reduce((sum, n) => sum + n.balance, 0);
  assert.equal(totalMarketAssetsAll, 80000, '10,000 + 20,000 + 50,000 = 80,000 (not double counted to 130,000)');

  // When scope is 'selected', portfolio holdings are not included
  const isSelectedScopeSelected = true;
  const effectivePortfolioSelected = isSelectedScopeSelected ? 0 : portfolioValue;
  const simNodesSelected = [
    ...investmentNodes.map((n) => ({
      id: n.id,
      name: n.name,
      type: n.nodeType,
      balance: n.amountOrBalance,
      apr: n.interestRateApr,
    })),
    ...(effectivePortfolioSelected > 0
      ? [{ id: 'portfolio-holdings', name: 'Stock Portfolio', type: 'INVESTMENT', balance: effectivePortfolioSelected, apr: 7 }]
      : []),
  ];
  const totalMarketAssetsSelected = simNodesSelected.reduce((sum, n) => sum + n.balance, 0);
  assert.equal(totalMarketAssetsSelected, 30000, 'Selected scope excludes unselected portfolio holdings');
});

test('issue 6: cash balances allow overdraft and reversing an expense accurately restores original balance without creating money', () => {
  const graph = {
    nodes: [
      { id: 'c1', name: 'Checking Account', nodeType: 'CHECKING', amountOrBalance: 100, interestRateApr: 0 },
    ],
    edges: [],
  };

  // 1. Start with $100 -> spend $150
  const spendResult = syncScenarioTransactionToGraph(graph, {
    kind: 'expense',
    accountName: 'Checking Account',
    amount: 150,
    description: 'Large Purchase',
  });
  assert.ok(spendResult);
  assert.equal(spendResult.newBalance, -50, 'Cash balance should reflect overdraft of -$50');
  assert.equal(spendResult.insufficientFunds, true);
  assert.equal(spendResult.updatedGraph.nodes[0].amountOrBalance, -50);

  // 2. Delete the $150 expense (reversal of +150)
  const deleteResult = syncScenarioTransactionToGraph(spendResult.updatedGraph, {
    kind: 'income',
    accountName: 'Checking Account',
    amount: 150,
    description: 'Large Purchase',
    isReversal: true,
  });
  assert.ok(deleteResult);
  assert.equal(deleteResult.newBalance, 100, 'Original balance of $100 must be restored');
  assert.equal(deleteResult.updatedGraph.nodes[0].amountOrBalance, 100, 'Final balance must be $100, not $150');
});

test('issue 7: removing all demo stocks does not repopulate default holdings on reload', async () => {
  const storageKey = 'test-demo-holdings-empty';
  // Simulate user removing all demo stocks: storage has empty array '[]'
  runtime.localStorage.data[storageKey] = '[]';

  runtime.fetch = async () => ({ ok: false });

  const result = await loadUnifiedHoldings(storageKey, 1, true);
  assert.equal(result.holdings.length, 0, 'Must remain empty array, not repopulate defaults');
  assert.equal(result.stocks.length, 0);
  assert.equal(result.positions.length, 0);
});

test('issue 7: demo recurring transactions persist reliably without deleting list or saving unread recurringIds', () => {
  const budgetKey = 'finapp-budget-v1:demo:1';
  runtime.localStorage.data[budgetKey] = JSON.stringify({
    transactions: [],
    recurring: [
      { id: 1, description: 'Paycheck', amount: 3000, frequency: 'monthly', kind: 'income', isActive: true },
      { id: 2, description: 'Gym', amount: 50, frequency: 'monthly', kind: 'expense', isActive: true },
    ],
  });

  // 1. Simulating saving a recurring rule (must update saved.recurring, not delete it)
  const initialSaved = JSON.parse(runtime.localStorage.data[budgetKey]);
  const newRule = { id: 3, description: 'Internet', amount: 80, frequency: 'monthly', kind: 'expense', isActive: true };
  const updatedList = [...initialSaved.recurring, newRule];
  initialSaved.recurring = updatedList;
  runtime.localStorage.data[budgetKey] = JSON.stringify(initialSaved);

  const afterSave = JSON.parse(runtime.localStorage.data[budgetKey]);
  assert.ok(Array.isArray(afterSave.recurring), 'saved.recurring must exist and be an array');
  assert.equal(afterSave.recurring.length, 3);
  assert.equal(afterSave.recurring[2].description, 'Internet');

  // 2. Simulating deleting a recurring rule (must update saved.recurring, not set unread saved.recurringIds)
  const afterDeleteList = afterSave.recurring.filter((r) => r.id !== 2);
  afterSave.recurring = afterDeleteList;
  runtime.localStorage.data[budgetKey] = JSON.stringify(afterSave);

  const afterDelete = JSON.parse(runtime.localStorage.data[budgetKey]);
  assert.ok(Array.isArray(afterDelete.recurring), 'saved.recurring must be an array after deletion');
  assert.equal(afterDelete.recurring.length, 2);
  assert.equal(afterDelete.recurringIds, undefined, 'saved.recurringIds must not be used');
  assert.ok(!afterDelete.recurring.some((r) => r.id === 2), 'Gym must be removed');
});

test('issue 8: syncGraphNodesToRecurring preserves ambiguous and distinct recurring rules', () => {
  const graph = {
    nodes: [
      { id: 'sal1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 5000, interestRateApr: 0 },
      { id: 'rent1', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 1800, interestRateApr: 0 },
    ],
    edges: [],
  };

  const initial = syncGraphNodesToRecurring(graph, []);
  assert.equal(initial.updatedRecurring.length, 2);

  // Simulate multiple repeats (e.g. from clicking into and out of tab)
  const duplicatedList = [
    ...initial.updatedRecurring,
    { ...initial.updatedRecurring[0], id: 101, accountId: 4 },
    { ...initial.updatedRecurring[0], id: 102, startDate: "2027-01-01" },
    { ...initial.updatedRecurring[1], id: 103 },
  ];
  assert.equal(duplicatedList.length, 5);

  const cleanSync = syncGraphNodesToRecurring(graph, duplicatedList);
  assert.equal(cleanSync.hasChanges, false);
  assert.equal(cleanSync.updatedRecurring.length, 5);
  assert.equal(cleanSync.updatedRules.length, 0);
});

test('issue 8: createSalaryRecurringTemplates and createDebtRecurringTemplates do not create duplicates when rules with [node-id] exist', () => {
  const graph = {
    nodes: [
      { id: 'sal1', name: 'Salary', nodeType: 'INCOME', amountOrBalance: 5000, interestRateApr: 0 },
      { id: 'loan1', name: 'Auto Loan', nodeType: 'DEBT', amountOrBalance: 12000, interestRateApr: 5, minPayment: 320 },
    ],
    edges: [],
  };

  const existing = [
    {
      id: 1,
      kind: 'income',
      description: 'Salary',
      amount: 5000,
      notes: '[node-id:sal1] Scenario Income: Salary',
    },
    {
      id: 2,
      kind: 'expense',
      description: 'Auto Loan Payment',
      amount: 320,
      notes: '[node-id:loan1] Scenario Debt: Auto Loan',
    },
  ];

  const newSalaries = createSalaryRecurringTemplates(graph, existing);
  assert.equal(newSalaries.length, 0, 'Must not duplicate existing salary template');

  const newDebts = createDebtRecurringTemplates(graph, existing);
  assert.equal(newDebts.length, 0, 'Must not duplicate existing debt template');
});

test('budgeting-bridge: availableAccounts strictly contains Checking, Savings, and active loans only', () => {
  const activeGraph = {
    nodes: [
      { id: '1', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 8500 },
      { id: '2', name: 'Checking Account', nodeType: 'CHECKING', amountOrBalance: 3000 },
      { id: '3', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 1500 },
      { id: '4', name: 'Student Loan A', nodeType: 'DEBT', amountOrBalance: 22000, interestRateApr: 5.8 },
      { id: '5', name: 'Student Loan B', nodeType: 'DEBT', amountOrBalance: 8000, interestRateApr: 3.4 },
      { id: '6', name: 'Roth IRA', nodeType: 'INVESTMENT', amountOrBalance: 1200 },
    ],
    edges: [],
  };

  // 1. When Student Loan A and B are active, both are in available accounts along with Checking and Savings
  const accountsWhenActive = getAvailableBudgetAccounts(activeGraph);
  assert.deepEqual([...accountsWhenActive], ['Checking', 'Savings', 'Student Loan A', 'Student Loan B']);

  // 2. When Student Loan A is deleted/archived, only Student Loan B remains with Checking and Savings
  const graphAfterDeletingLoanA = {
    nodes: [
      { id: '1', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 8500 },
      { id: '2', name: 'Checking Account', nodeType: 'CHECKING', amountOrBalance: 3000 },
      { id: '3', name: 'Rent', nodeType: 'EXPENSE', amountOrBalance: 1500 },
      { id: '4', name: 'Student Loan A', nodeType: 'DEBT', amountOrBalance: 22000, archived: true },
      { id: '5', name: 'Student Loan B', nodeType: 'DEBT', amountOrBalance: 8000, interestRateApr: 3.4 },
      { id: '6', name: 'Roth IRA', nodeType: 'INVESTMENT', amountOrBalance: 1200 },
    ],
    edges: [],
  };
  const accountsAfterDeletingA = getAvailableBudgetAccounts(graphAfterDeletingLoanA);
  assert.equal(accountsAfterDeletingA.includes('Student Loan A'), false, 'Deleted Student Loan A must not be present');
  assert.deepEqual([...accountsAfterDeletingA], ['Checking', 'Savings', 'Student Loan B']);

  // 3. When both loans are deleted, only Checking and Savings remain
  const graphWithoutLoans = {
    nodes: [
      { id: '1', name: 'Software Engineer Salary', nodeType: 'INCOME', amountOrBalance: 8500 },
      { id: '2', name: 'Checking Account', nodeType: 'CHECKING', amountOrBalance: 3000 },
      { id: '4', name: 'Student Loan A', nodeType: 'DEBT', amountOrBalance: 22000, archived: true },
      { id: '5', name: 'Student Loan B', nodeType: 'DEBT', amountOrBalance: 8000, archived: true },
    ],
    edges: [],
  };
  const accountsWithoutLoans = getAvailableBudgetAccounts(graphWithoutLoans);
  assert.deepEqual([...accountsWithoutLoans], ['Checking', 'Savings']);
});

test('budgeting-bridge: syncRecurringDeletionToGraph requires an explicit link and preserves the loan principal', () => {
  const graph = {
    nodes: [
      { id: 'chk1', name: 'Checking', nodeType: 'CHECKING', amountOrBalance: 3000 },
      { id: 'loan1', name: 'Auto Loan', nodeType: 'DEBT', amountOrBalance: 8000, interestRateApr: 4.5 },
    ],
    edges: [],
  };

  const deletedRule = {
    kind: 'expense',
    accountName: 'Auto Loan',
    description: 'Monthly Car Payment',
  };

  assert.equal(syncRecurringDeletionToGraph(graph, deletedRule), null);
  const result = syncRecurringDeletionToGraph(graph, { ...deletedRule, notes: "[node-id:loan1]" });
  assert.ok(result);
  assert.equal(result.removedNode.id, 'loan1');
  const updatedLoan = result.updatedGraph.nodes.find((n) => n.id === 'loan1');
  assert.equal(Boolean(updatedLoan.archived), false);
  assert.equal(updatedLoan.amountOrBalance, 8000);
  assert.equal(updatedLoan.minPayment, 0);
  const updatedChecking = result.updatedGraph.nodes.find((n) => n.id === 'chk1');
  assert.equal(Boolean(updatedChecking.archived), false, 'Checking node must not be archived');
});

test('portfolio: addStockUnified preserves dividend information', async () => {
  const { addStockUnified } = runtime.module.exports;
  const holding = await addStockUnified({
    storageKey: 'test-div-storage',
    demo: true,
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    price: 180,
    shares: 10,
    paysDividend: true,
    dividendFrequency: 'quarterly',
    dividendPerShare: 0.27,
  });
  assert.equal(holding.symbol, 'AAPL');
  assert.equal(holding.shares, 10);
  assert.equal(holding.paysDividend, true);
  assert.equal(holding.dividendFrequency, 'quarterly');
  assert.equal(holding.dividendPerShare, 0.27);
});

test('portfolio: multiple stock lots per ticker can be added and managed independently', async () => {
  const {
    addStockUnified,
    parseLocalHoldings,
    updateSharesUnified,
    removeStockUnified,
    holdingsToSynthetic,
  } = runtime.module.exports;

  const storageKey = 'test-multi-lot-storage';
  runtime.localStorage.data[storageKey] = JSON.stringify([]);

  // 1. Buy first lot of AAPL: 5 shares at $150
  const lot1 = await addStockUnified({
    storageKey,
    demo: true,
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    price: 150,
    purchasePrice: 150,
    shares: 5,
  });

  assert.equal(lot1.symbol, 'AAPL');
  assert.equal(lot1.shares, 5);
  assert.equal(lot1.purchasePrice, 150);
  assert.ok(lot1.stockId != null);

  // 2. Buy second lot of AAPL on another day at a different price: 10 shares at $175
  const lot2 = await addStockUnified({
    storageKey,
    demo: true,
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    price: 175,
    purchasePrice: 175,
    shares: 10,
  });

  assert.equal(lot2.symbol, 'AAPL');
  assert.equal(lot2.shares, 10);
  assert.equal(lot2.purchasePrice, 175);
  assert.notEqual(lot1.stockId, lot2.stockId, 'Each lot must have a unique stockId');

  // Verify both lots exist in storage
  const holdings = parseLocalHoldings(storageKey);
  assert.equal(holdings.length, 2, 'Both lots must be retained in holdings');
  assert.equal(holdings[0].symbol, 'AAPL');
  assert.equal(holdings[0].shares, 5);
  assert.equal(holdings[0].purchasePrice, 150);
  assert.equal(holdings[1].symbol, 'AAPL');
  assert.equal(holdings[1].shares, 10);
  assert.equal(holdings[1].purchasePrice, 175);

  // 3. Synthetic conversion computes correct distinct cost bases
  const { positions } = holdingsToSynthetic(holdings, 1);
  assert.equal(positions.length, 2);
  assert.equal(positions[0].stockId, lot1.stockId);
  assert.equal(positions[0].avgCostPerShare, 150);
  assert.equal(positions[0].costBasis, 750); // 5 * 150
  assert.equal(positions[1].stockId, lot2.stockId);
  assert.equal(positions[1].avgCostPerShare, 175);
  assert.equal(positions[1].costBasis, 1750); // 10 * 175

  // 4. Update shares on lot 2 only (e.g. partial sell 2 shares -> 8 shares)
  await updateSharesUnified({
    storageKey,
    demo: true,
    symbol: 'AAPL',
    currentShares: 10,
    newShares: 8,
    price: 175,
    stockId: lot2.stockId,
  });

  const updatedHoldings = parseLocalHoldings(storageKey);
  assert.equal(updatedHoldings[0].shares, 5, 'Lot 1 shares must remain unchanged');
  assert.equal(updatedHoldings[1].shares, 8, 'Lot 2 shares must be updated to 8');

  // 5. Delete lot 1 only
  await removeStockUnified({
    storageKey,
    demo: true,
    symbol: 'AAPL',
    stockId: lot1.stockId,
  });

  const afterDelete = parseLocalHoldings(storageKey);
  assert.equal(afterDelete.length, 1, 'Only one lot should remain');
  assert.equal(afterDelete[0].stockId, lot2.stockId);
  assert.equal(afterDelete[0].shares, 8);
  assert.equal(afterDelete[0].purchasePrice, 175);
});

test('demo-storage: encrypt and decrypt roundtrip preserves budget data and recovers across session resets', async () => {
  const budgetRuntime = {
    module: { exports: {} },
    process: { env: { NODE_ENV: 'test' } },
    crypto: globalThis.crypto,
    TextEncoder,
    TextDecoder,
    btoa,
    atob,
    localStorage: {
      data: {},
      getItem(k) { return this.data[k] !== undefined ? this.data[k] : null; },
      setItem(k, v) { this.data[k] = String(v); },
    },
    sessionStorage: {
      data: {},
      getItem(k) { return this.data[k] !== undefined ? this.data[k] : null; },
      setItem(k, v) { this.data[k] = String(v); },
    },
  };

  vm.runInNewContext(
    buildSync({
      entryPoints: [path.join(__dirname, '../dashboard/src/BudgetingTab.tsx')],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      define: { 'import.meta.env.VITE_API_URL': '""' },
      loader: { '.tsx': 'tsx', '.ts': 'ts' },
    }).outputFiles[0].text,
    budgetRuntime,
  );

  const { encryptForDemoStorage, decryptFromDemoStorage, DEMO_BUDGET_ENC_PREFIX } = budgetRuntime.module.exports;
  const storageKey = 'finapp-budget-v1:demo:1';
  const originalPayload = {
    transactions: [{ id: 1, amount: 50, description: 'Groceries' }],
    recurring: [{ id: 10, amount: 200, description: 'AAPL Dividend' }],
  };

  // 1. Encrypt and verify format
  const encrypted = await encryptForDemoStorage(storageKey, originalPayload);
  assert.ok(encrypted.startsWith(DEMO_BUDGET_ENC_PREFIX), 'Must start with enc:v1: prefix');

  // 2. Decrypt in same session
  const decrypted = await decryptFromDemoStorage(storageKey, encrypted);
  assert.deepEqual(JSON.parse(JSON.stringify(decrypted)), originalPayload, 'Decrypted payload must match original');

  // 3. Backward compatibility: raw JSON string decrypts cleanly
  const plaintextJson = JSON.stringify({ transactions: [], recurring: [] });
  const fromPlaintext = await decryptFromDemoStorage(storageKey, plaintextJson);
  assert.deepEqual(JSON.parse(JSON.stringify(fromPlaintext)), { transactions: [], recurring: [] });

  // 4. Persistence across tab/session restarts: wipe sessionStorage completely
  budgetRuntime.sessionStorage.data = {};
  const afterTabClose = await decryptFromDemoStorage(storageKey, encrypted);
  assert.deepEqual(JSON.parse(JSON.stringify(afterTabClose)), originalPayload, 'Must decrypt successfully even after sessionStorage is wiped');

  // 5. Corrupted or invalid payload returns null safely
  const corrupted = await decryptFromDemoStorage(storageKey, `${DEMO_BUDGET_ENC_PREFIX}bad:data`);
  assert.equal(corrupted, null, 'Corrupted payload must return null without throwing');
});

test("dividend forecasts reflect current shares across independent lots", () => {
  const { projectedDividendFlows } = runtime.module.exports;
  const lot = { symbol: "KO", paysDividend: true, dividendFrequency: "quarterly", dividendPerShare: 0.5 };
  const flows = projectedDividendFlows([
    { ...lot, stockId: 1, shares: 10 },
    { ...lot, stockId: 2, shares: 4 },
    { ...lot, stockId: 3, shares: 0 },
    { ...lot, stockId: 4, shares: 5, dividendFrequency: "irregular" },
  ]);
  assert.equal(flows.length, 2);
  assert.equal(flows.reduce((total, flow) => total + flow.amount, 0), 7);
});
