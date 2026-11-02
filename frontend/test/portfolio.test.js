const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../landing/node_modules/esbuild');

const runtime = {
  module: { exports: {} },
  window: { dispatchEvent: () => {} },
  CustomEvent: class {},
  localStorage: {
    data: {},
    getItem(k) {
      return this.data[k] || null;
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
const { totals, overviewBreakdown } = financeRuntime.module.exports;

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

  // 4. Archiving node removes it from recurring list
  const archivedGraph = {
    ...modifiedGraph,
    nodes: modifiedGraph.nodes.map((n) => (n.id === 'rent1' ? { ...n, archived: true } : n)),
  };
  const sync4 = syncGraphNodesToRecurring(archivedGraph, sync3.updatedRecurring);
  assert.equal(sync4.hasChanges, true);
  assert.equal(sync4.updatedRecurring.find((r) => r.description === 'Rent'), undefined);
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
  // Debt reduced to 8000. Net worth = 31000 - 8000 = 23000.
  assert.equal(t.debt, 8000);
  assert.equal(t.netWorth, 23000);

  // Step 5: User logs $1,000 living expenses from Checking
  const expenseSync = syncScenarioTransactionToGraph(scenario, {
    kind: 'expense',
    accountName: 'Checking',
    amount: 1000,
  });
  assert.ok(expenseSync);
  scenario = expenseSync.updatedGraph;
  t = totals(scenario, portfolioVal);
  // Checking reduced from 11000 to 10000. Assets = 10000 + 20000 = 30000. Net worth = 30000 - 8000 = 22000.
  assert.equal(t.assets, 30000);
  assert.equal(t.netWorth, 22000);

  // Step 6: Stock gains appreciate portfolio from $15,000 to $18,000
  portfolioVal = 18000;
  t = totals(scenario, portfolioVal);
  // Assets = 10000 + 5000 + 18000 = 33000. Net worth = 33000 - 8000 = 25000.
  assert.equal(t.assets, 33000);
  assert.equal(t.netWorth, 25000);
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
