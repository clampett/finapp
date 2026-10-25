const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { transformSync } = require('./landing/node_modules/esbuild');
const code = transformSync(
  fs.readFileSync(path.join(__dirname, 'dashboard/src/finance.ts'), 'utf8'),
  {
    loader: 'ts',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  },
).code;
const runtime = { module: { exports: {} } };
vm.runInNewContext(code, runtime);
const finance = runtime.module.exports;
const sql = fs.readFileSync(
  path.join(__dirname, '../java-backend/src/main/resources/db/migration/V2__Seed_archetypes.sql'),
  'utf8',
);
function demo(profile) {
  const nodes = [
    ...sql.matchAll(
      /\((\d+),\s*(\d+),\s*'(INCOME|CHECKING|SAVINGS|INVESTMENT|DEBT|EXPENSE)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+)\)/g,
    ),
  ]
    .filter((match) => Number(match[2]) === profile)
    .map((match) => ({
      id: match[1],
      nodeType: match[3],
      name: match[4],
      amountOrBalance: Number(match[5]),
      interestRateApr: Number(match[6]),
    }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const block of sql.matchAll(/INSERT INTO node_edges \(([^)]+)\) VALUES\s*([\s\S]*?);/g)) {
    for (const row of block[2].matchAll(/\((\d+),\s*(\d+),\s*([\d.]+)\)/g)) {
      if (ids.has(row[1]) && ids.has(row[2]))
        edges.push({
          id: String(edges.length),
          sourceNodeId: row[1],
          targetNodeId: row[2],
          monthlyFixedFlow: block[1].includes('percentage_flow') ? null : Number(row[3]),
          percentageFlow: block[1].includes('percentage_flow') ? Number(row[3]) : null,
        });
    }
  }
  return finance.parseGraph({ nodes, edges });
}
const close = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} did not match ${expected}`);
for (const [profile, takeHome, surplus, investment, savings, free] of [
  [1, 3666.664, 1816.664, 200, 0, 1616.664],
  [2, 9000, 3950, 1100, 300, 2550],
  [3, 6533.336, 4333.336, 3033.3352, 216.6668, 1083.334],
]) {
  test(`demo ${profile}: browser budget matched the Python golden values`, () => {
    const graph = demo(profile),
      budget = finance.totals(graph);
    close(budget.takeHome, takeHome);
    close(budget.surplus, surplus);
    close(budget.plannedInvestment, investment);
    close(budget.plannedSavings, savings);
    close(budget.unassigned, free);
    const zero = finance.allocations(graph, surplus, 0),
      all = finance.allocations(graph, surplus, 100);
    close(zero.investment, investment);
    close(all.investment, investment + free);
    close(all.cash, savings);
    close(zero.investment + zero.cash, surplus);
  });
}
test('net income avoided double taxation and settings survived export/import', () => {
  const graph = demo(1);
  graph.assumptions.incomeBasis = 'net';
  graph.assumptions.incomeGrowth = 4;
  const imported = finance.parseGraph(JSON.parse(JSON.stringify(graph)));
  close(finance.totals(imported).surplus, 2733.33);
  assert.equal(imported.assumptions.incomeBasis, 'net');
  assert.equal(imported.assumptions.incomeGrowth, 4);
});
test('invalid scenario tax and growth settings were rejected', () => {
  const graph = demo(1);
  for (const settings of [
    { taxRate: 61 },
    { incomeGrowth: 26 },
    { expenseGrowth: NaN },
    { incomeBasis: 'unknown' },
  ]) {
    assert.throws(() =>
      finance.parseGraph({ ...graph, assumptions: { ...graph.assumptions, ...settings } }),
    );
  }
});
test('loan payment was capped at the final amount due', () => {
  const debt = {
    id: 'a',
    name: 'Loan',
    nodeType: 'DEBT',
    amountOrBalance: 100,
    interestRateApr: 0,
    minPayment: 200,
  };
  close(finance.debtPayment(debt, { nodes: [debt], edges: [] }), 100);
});
test('overcommitted saving transfers were capped without creating money', () => {
  const graph = demo(2),
    allocation = finance.allocations(graph, 100, 100);
  close(allocation.investment + allocation.cash, 100);
  assert.equal(allocation.overcommitted, true);
});
