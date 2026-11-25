const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('../../landing/node_modules/esbuild');

function load(file, modules = {}, globals = {}) {
  const context = {
    module: { exports: {} },
    require: (name) => modules[name] || {},
    ...globals,
  };
  vm.runInNewContext(
    transformSync(fs.readFileSync(path.join(__dirname, '../../dashboard/src', file), 'utf8'), {
      loader: file.endsWith('tsx') ? 'tsx' : 'ts',
      format: 'cjs',
      jsx: 'automatic',
      define: { 'import.meta.env.VITE_API_URL': '""' },
    }).code,
    context,
  );
  return context.module.exports;
}
const finance = load('common/finance.ts');
const jsx = (type, props, key) => ({ type, props: props || {}, key });
const jsxRuntime = { jsx, jsxs: jsx, Fragment: 'fragment' };
function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return;
  if (Array.isArray(tree)) return tree.map((node) => find(node, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}

function warning() {
  let dismissed = false,
    effect,
    cleanup,
    dependency,
    nextDependency,
    opened = 0,
    closed = 0;
  const ref = { current: null };
  const nativeDialog = { showModal: () => opened++, close: () => closed++ };
  const { OverspendingWarning } = load(
    'common/OverspendingWarning.tsx',
    {
      react: {
        useState: () => [
          dismissed,
          (value) => {
            dismissed = value;
          },
        ],
        useRef: () => ref,
        useEffect: (callback, deps) => {
          effect = callback;
          nextDependency = deps[0];
        },
      },
      'react-dom': { createPortal: (child) => child },
      'react/jsx-runtime': jsxRuntime,
      './finance': finance,
    },
    { document: { body: {} } },
  );
  return {
    render(props = {}) {
      const tree = OverspendingWarning({
        income: 1000,
        expenses: 1100,
        onReviewBudget() {},
        ...props,
      });
      ref.current = tree ? nativeDialog : null;
      if (dependency !== nextDependency) {
        cleanup?.();
        cleanup = effect();
        dependency = nextDependency;
      }
      return tree;
    },
    counts: () => ({ opened, closed }),
  };
}

test('warning uses native modal lifecycle and can be dismissed with Escape', () => {
  const w = warning();
  const tree = w.render();
  assert.equal(tree.type, 'dialog');
  assert.equal(tree.props['aria-describedby'], 'overspending-warning-description');
  assert.deepEqual(w.counts(), { opened: 1, closed: 0 });
  let prevented = false;
  tree.props.onCancel({
    preventDefault: () => {
      prevented = true;
    },
  });
  assert.equal(w.render(), null);
  assert.equal(prevented, true);
  assert.deepEqual(w.counts(), { opened: 1, closed: 1 });
});

test('Dismiss stays closed during the episode; Review budget navigates once', () => {
  const w = warning();
  const tree = w.render();
  const dismiss = find(tree, (node) => node.type === 'button' && node.props.children === 'Dismiss');
  assert.equal(dismiss.props.autoFocus, true);
  dismiss.props.onClick();
  assert.equal(w.render({ expenses: 1200 }), null);
  const review = warning();
  let navigated = 0;
  find(
    review.render({ onReviewBudget: () => navigated++ }),
    (node) => node.type === 'button' && node.props.children === 'Review budget',
  ).props.onClick();
  assert.equal(navigated, 1);
  assert.equal(review.render(), null);
});

test('balanced budgets and floating-point dust do not open a warning', () => {
  assert.equal(warning().render({ income: 100, expenses: 100 }), null);
  assert.equal(warning().render({ income: 100, expenses: 99 }), null);
  assert.equal(warning().render({ income: 0.3, expenses: 0.1 + 0.2 }), null);
  const penny = warning().render({ income: 100, expenses: 100.01 });
  assert.ok(find(penny, (node) => node.type === 'strong' && node.props.children === '$0.01'));
});

function workspace() {
  let scenario;
  const Marker = () => {};
  const { GraphWorkspace } = load('views/GraphWorkspace.tsx', {
    react: {
      useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
      useMemo: (fn) => fn(),
      useCallback: (fn) => fn,
    },
    'react/jsx-runtime': jsxRuntime,
    '../common/finance': finance,
    '../common/OverspendingWarning': { OverspendingWarning: Marker },
    '../workspace/graph-workspace': { scopeGraph: (graph) => graph },
    '../workspace/useWorkspacePortfolio': {
      useWorkspacePortfolio: () => ({ portfolioValue: 0, holdings: [], dividendFlows: [] }),
    },
    '../workspace/useScenarioGraph': { useScenarioGraph: () => scenario },
    '../workspace/useGraphEditing': { useGraphEditing: () => ({ selectionIds: [] }) },
  });
  return (graph, extra = {}) => {
    scenario = { graph, live: graph, loaded: true, error: '', storageKey: 'user:1', ...extra };
    const tree = GraphWorkspace({
      userId: 1,
      demo: true,
      view: 'overview',
      search: '',
      onNavigate() {},
    });
    return find(tree, (node) => node.type === Marker);
  };
}

const graph = () => ({
  nodes: [
    { id: 'pay', nodeType: 'INCOME', name: 'Pay', amountOrBalance: 1000, interestRateApr: 0 },
    { id: 'rent', nodeType: 'EXPENSE', name: 'Rent', amountOrBalance: 850, interestRateApr: 0 },
    {
      id: 'loan',
      nodeType: 'DEBT',
      name: 'Loan',
      amountOrBalance: 5000,
      minPayment: 100,
      interestRateApr: 0,
    },
  ],
  edges: [],
  assumptions: { incomeBasis: 'gross', taxRate: 20 },
});

test('workspace warns on take-home shortfall including loan payments and rearms after recovery', () => {
  const render = workspace(),
    data = graph();
  const warningProps = render(data).props;
  assert.equal(warningProps.income, 800);
  assert.equal(warningProps.expenses, 950);
  data.nodes[1].amountOrBalance = 600;
  assert.equal(render(data), undefined); // unmount resets dismissal for the next episode
  data.nodes[1].amountOrBalance = 850;
  assert.ok(render(data));
  assert.equal(render(data, { loaded: false }), undefined);
  assert.equal(render(data, { error: 'Graph unavailable' }), undefined);
});

test('workspace uses take-home input without applying tax again and scopes warning to the profile', () => {
  const render = workspace(),
    data = graph();
  data.assumptions.incomeBasis = 'net';
  assert.equal(render(data), undefined);
  data.nodes[1].amountOrBalance = 950;
  assert.equal(render(data).props.income, 1000);
  assert.equal(render(data).props.expenses, 1050); // loan payments alone create the shortfall
  data.nodes[1].amountOrBalance = 1100;
  assert.equal(render(data, { storageKey: 'demo:2' }).key, 'demo:2');
});
