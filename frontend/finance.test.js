const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { transformSync, buildSync } = require('./landing/node_modules/esbuild');
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
const workspaceRuntime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, 'dashboard/src/graph-workspace.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  workspaceRuntime,
);
const workspace = workspaceRuntime.module.exports;
const platformRuntime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, 'dashboard/src/ui-platform.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  }).outputFiles[0].text,
  platformRuntime,
);
const platform = platformRuntime.module.exports;
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

test('undo and redo restored complete node and route snapshots', () => {
  const initial = demo(1);
  const changed = {
    ...initial,
    edges: initial.edges.map((edge, index) =>
      index === 0 ? { ...edge, monthlyFixedFlow: 2500 } : edge,
    ),
  };
  const history = workspace.recordGraph(workspace.newHistory(initial), changed);
  const undone = workspace.travelGraph(history, 'undo');
  assert.equal(JSON.stringify(undone.present), JSON.stringify(initial));
  assert.equal(
    JSON.stringify(workspace.travelGraph(undone, 'redo').present),
    JSON.stringify(changed),
  );
  const branched = workspace.recordGraph(undone, {
    ...initial,
    nodes: initial.nodes.slice(0, -1),
    edges: [],
  });
  assert.equal(branched.future.length, 0);
});

test('history was bounded and a no-op did not consume an undo step', () => {
  let history = workspace.newHistory(demo(1));
  assert.equal(workspace.recordGraph(history, history.present), history);
  for (let index = 0; index < 120; index++)
    history = workspace.recordGraph(history, {
      ...history.present,
      assumptions: { ...history.present.assumptions, taxRate: index % 50 },
    });
  assert.equal(history.past.length, 100);
});

test('archiving excluded balances and routes while restoring recovered both', () => {
  const initial = demo(1),
    id = initial.nodes.find((node) => node.nodeType === 'INVESTMENT').id;
  const archived = finance.parseGraph({
    ...initial,
    nodes: initial.nodes.map((node) => (node.id === id ? { ...node, archived: true } : node)),
  });
  const reloaded = finance.parseGraph(JSON.parse(JSON.stringify(archived)));
  assert.equal(finance.activeGraph(reloaded).nodes.length, initial.nodes.length - 1);
  assert.ok(
    finance
      .activeGraph(reloaded)
      .edges.every((edge) => edge.sourceNodeId !== id && edge.targetNodeId !== id),
  );
  close(finance.totals(archived).netWorth, finance.totals(initial).netWorth - 1200);
  const restored = {
    ...reloaded,
    nodes: reloaded.nodes.map((node) => ({ ...node, archived: false })),
  };
  assert.equal(finance.activeGraph(restored).edges.length, initial.edges.length);
});

test('single-node and connected scopes excluded dangling routes and unrelated accounts', () => {
  const initial = demo(1),
    investment = initial.nodes.find((node) => node.nodeType === 'INVESTMENT');
  const single = workspace.scopeGraph(initial, 'selected', [investment.id, 'missing']);
  assert.equal(single.nodes.length, 1);
  assert.equal(single.edges.length, 0);
  const extra = { ...investment, id: 'isolated', position: { x: 1000, y: 500 } };
  const connected = workspace.scopeGraph(
    { ...initial, nodes: [...initial.nodes, extra] },
    'connected',
    [investment.id],
  );
  assert.equal(connected.nodes.length, initial.nodes.length);
  assert.ok(!connected.nodes.some((node) => node.id === 'isolated'));
  assert.equal(workspace.scopeGraph(initial, 'selected', []).nodes.length, 0);
});

test('saved positions survived import and first move undo', () => {
  const initial = demo(1),
    node = initial.nodes[0];
  const moved = finance.parseGraph({
    ...initial,
    nodes: initial.nodes.map((item) =>
      item.id === node.id ? { ...item, position: { x: -125, y: 640 } } : item,
    ),
  });
  assert.equal(finance.parseGraph(JSON.parse(JSON.stringify(moved))).nodes[0].position.x, -125);
  const history = workspace.recordGraph(workspace.newHistory(initial), moved);
  assert.equal(
    JSON.stringify(workspace.travelGraph(history, 'undo').present.nodes[0].position),
    JSON.stringify(node.position),
  );
});

test('edited expense routes updated monthly budget without double counting the node', () => {
  const initial = demo(1),
    expense = initial.nodes.find((node) => node.nodeType === 'EXPENSE');
  const route = initial.edges.find((edge) => edge.targetNodeId === expense.id);
  const fixed = {
    ...initial,
    edges: initial.edges.map((edge) =>
      edge.id === route.id ? { ...edge, monthlyFixedFlow: 1800, percentageFlow: null } : edge,
    ),
  };
  close(finance.totals(fixed).expenses, 1800);
  close(finance.totals(fixed).surplus, finance.totals(initial).surplus - 400);
  const percent = {
    ...initial,
    edges: initial.edges.map((edge) =>
      edge.id === route.id ? { ...edge, monthlyFixedFlow: null, percentageFlow: 25 } : edge,
    ),
  };
  close(finance.totals(percent).expenses, finance.totals(initial).takeHome * 0.25);
});

test('percentage debt payments used take-home income and respected an override', () => {
  const initial = demo(1),
    loan = initial.nodes.find((node) => node.nodeType === 'DEBT');
  const changed = {
    ...initial,
    edges: initial.edges.map((edge) =>
      edge.targetNodeId === loan.id
        ? { ...edge, monthlyFixedFlow: null, percentageFlow: 10 }
        : edge,
    ),
  };
  close(finance.debtPayment(loan, changed), finance.totals(initial).takeHome * 0.1);
  close(finance.debtPayment({ ...loan, minPayment: 55 }, changed), 55);
});

test('new nodes used the viewport center when clear and left existing positions unchanged', () => {
  const graph = demo(1),
    original = JSON.stringify(graph.nodes);
  const position = workspace.placeNewNode(graph.nodes, { x: 2500, y: -800 });
  close(position.x + 115, 2500);
  close(position.y + 52, -800);
  assert.equal(JSON.stringify(graph.nodes), original);
});

test('new nodes avoided occupied cards across successive additions', () => {
  const graph = demo(1),
    nodes = [...graph.nodes];
  for (let index = 0; index < 20; index++) {
    const position = workspace.placeNewNode(nodes, { x: 460, y: 52 });
    assert.ok(
      nodes.every(
        (node) =>
          position.x + 258 <= node.position.x ||
          node.position.x + 258 <= position.x ||
          position.y + 132 <= node.position.y ||
          node.position.y + 132 <= position.y,
      ),
    );
    nodes.push({ ...nodes[0], id: `added-${index}`, position });
  }
});

test('mixed node and line deletion was recoverable as one history action', () => {
  const graph = demo(1),
    loan = graph.nodes.find((node) => node.nodeType === 'DEBT');
  const independent = graph.edges.find((edge) => edge.targetNodeId !== loan.id);
  const removed = workspace.removeSelection(graph, [loan.id], [independent.id]);
  assert.ok(removed.nodes.find((node) => node.id === loan.id).archived);
  assert.ok(!removed.edges.some((edge) => edge.id === independent.id));
  assert.ok(removed.edges.some((edge) => edge.targetNodeId === loan.id));
  assert.ok(finance.activeGraph(removed).edges.every((edge) => edge.targetNodeId !== loan.id));
  const history = workspace.recordGraph(workspace.newHistory(graph), removed);
  assert.equal(
    JSON.stringify(workspace.travelGraph(history, 'undo').present),
    JSON.stringify(graph),
  );
});

for (const profile of [1, 2, 3]) {
  test(`demo ${profile}: overview separated assets, debt, and monthly allocations`, () => {
    const graph = demo(profile),
      totals = finance.totals(graph);
    const budget = finance.overviewBreakdown(graph, 'budget');
    close(budget.total, totals.income);
    close(budget.shortfall, 0);
    close(finance.overviewBreakdown(graph, 'assets').total, totals.assets);
    close(finance.overviewBreakdown(graph, 'debt').total, totals.debt);
    assert.ok(budget.items.every((item) => item.value > 0));
  });
}

test('overview showed shortfalls explicitly without negative slices or invented income', () => {
  const graph = demo(1);
  graph.nodes = graph.nodes.map((node) =>
    node.nodeType === 'INCOME' ? { ...node, amountOrBalance: 100 } : node,
  );
  const budget = finance.overviewBreakdown(graph, 'budget');
  close(budget.shortfall, 1770);
  assert.ok(budget.total > budget.income);
  assert.ok(budget.items.every((item) => item.value >= 0));
  const empty = finance.overviewBreakdown({ nodes: [], edges: [] }, 'assets');
  assert.equal(empty.total, 0);
  assert.equal(empty.items.length, 0);
});

test('missing or invalid demo profiles defaulted to family while explicit profiles remained selectable', () => {
  for (const value of [null, '', 'invalid', '0', '4', '-1'])
    assert.equal(finance.demoProfile(value), 2);
  for (const value of ['1', '2', '3']) assert.equal(finance.demoProfile(value), Number(value));
});

test('macOS hints used Command and keyboard history supported both Mac and Windows', () => {
  assert.equal(platform.platformShortcuts('MacIntel').undo, '⌘Z');
  assert.equal(platform.platformShortcuts('MacIntel').redo, '⇧⌘Z');
  assert.equal(platform.platformShortcuts('Win32').undo, 'Ctrl+Z');
  const event = { key: 'z', metaKey: true, ctrlKey: false, shiftKey: false, altKey: false };
  assert.equal(platform.historyShortcut(event), 'undo');
  assert.equal(platform.historyShortcut({ ...event, key: 'Z', shiftKey: true }), 'redo');
  assert.equal(
    platform.historyShortcut({ ...event, metaKey: false, ctrlKey: true, key: 'y' }),
    'redo',
  );
  assert.equal(platform.historyShortcut({ ...event, metaKey: false }), null);
  assert.equal(platform.historyShortcut({ ...event, altKey: true }), null);
});

test('trackpad policy distinguished two-finger hand panning from pinch zoom and active drawing', () => {
  assert.equal(platform.canvasWheelAction('pan', false, false), 'pan');
  assert.equal(platform.canvasWheelAction('pan', true, false), 'zoom');
  assert.equal(platform.canvasWheelAction('select', true, false), 'zoom');
  assert.equal(platform.canvasWheelAction('connect', true, false), 'block');
  assert.equal(platform.canvasWheelAction('box', false, true), 'block');
});
