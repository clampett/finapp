const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../../landing/node_modules/esbuild');

const compiled = buildSync({
  entryPoints: [path.join(__dirname, '../../dashboard/src/workspace/useWorkspacePortfolio.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', '../investing/portfolio'],
}).outputFiles[0].text;
const settle = () => new Promise((resolve) => setImmediate(resolve));

function workspace() {
  let state;
  let effect;
  let dependencies;
  let cleanup;
  let writes = 0;
  const requests = [];
  const cache = new Map();
  const listeners = new Map();
  const react = {
    useState(initial) {
      if (!state) state = initial();
      return [
        state,
        (value) => {
          state = value;
          writes++;
        },
      ];
    },
    useEffect(callback, nextDependencies) {
      if (!dependencies || nextDependencies.some((value, index) => value !== dependencies[index])) {
        effect = callback;
        dependencies = nextDependencies;
      }
    },
  };
  const portfolio = {
    PORTFOLIO_UPDATED_EVENT: 'changed',
    parseLocalHoldings: (key) => cache.get(key)?.holdings ?? [],
    getStoredPortfolioValue: (key) => cache.get(key)?.value ?? 0,
    projectedDividendFlows: (holdings) => holdings.map((h) => ({ amount: h.shares })),
    loadUnifiedHoldings: (key, user, demo, signal) =>
      new Promise((resolve, reject) => {
        requests.push({ key, user, demo, signal, resolve, reject });
      }),
  };
  const context = {
    module: { exports: {} },
    AbortController,
    require: (name) => (name === 'react' ? react : portfolio),
    window: {
      addEventListener: (name, callback) => listeners.set(name, callback),
      removeEventListener: (name) => listeners.delete(name),
    },
  };
  vm.runInNewContext(compiled, context);
  return {
    cache,
    requests,
    render(user = 1, demo = true) {
      return context.module.exports.useWorkspacePortfolio(user, demo);
    },
    flush() {
      if (effect) {
        cleanup?.();
        cleanup = effect();
        effect = undefined;
      }
    },
    change() {
      listeners.get('changed')?.();
    },
    unmount() {
      cleanup?.();
    },
    writes() {
      return writes;
    },
  };
}

test('workspace portfolio retains an empty demo and publishes one coherent valuation', async () => {
  const w = workspace();
  assert.equal(w.render().holdings.length, 0);
  w.flush();
  w.requests[0].resolve({ holdings: [{ symbol: 'AAPL', shares: 2, lastPrice: 50 }] });
  await settle();
  const current = w.render();
  assert.equal(current.portfolioValue, 100);
  assert.equal(current.holdings[0].shares, 2);
  assert.equal(current.dividendFlows[0].amount, 2);
});

test('workspace portfolio ignores older overlapping refreshes and completions after unmount', async () => {
  const w = workspace();
  w.render();
  w.flush();
  w.change();
  assert.equal(w.requests[0].signal.aborted, true);
  w.requests[1].resolve({ holdings: [{ symbol: 'NEW', shares: 1, lastPrice: 75 }] });
  await settle();
  // Delivered an obsolete response despite cancellation to verify the publication guard.
  w.requests[0].resolve({ holdings: [{ symbol: 'OLD', shares: 100, lastPrice: 50 }] });
  await settle();
  assert.equal(w.render().portfolioValue, 75);
  assert.equal(w.render().holdings[0].symbol, 'NEW');
  w.change();
  w.unmount();
  const writes = w.writes();
  assert.equal(w.requests[2].signal.aborted, true);
  w.requests[2].reject(new Error('late failure'));
  await settle();
  assert.equal(w.writes(), writes);
});

test('workspace portfolio isolates user switches before the next effect and during failed refreshes', async () => {
  const w = workspace();
  w.cache.set('finapp-holdings-v1:user:1', {
    value: 500,
    holdings: [{ symbol: 'PRIVATE', shares: 5, lastPrice: 100 }],
  });
  w.cache.set('finapp-holdings-v1:user:2', {
    value: 20,
    holdings: [{ symbol: 'SECOND', shares: 2, lastPrice: 10 }],
  });
  assert.equal(w.render(1, false).portfolioValue, 500);
  w.flush();
  const switched = w.render(2, false);
  assert.equal(switched.portfolioValue, 20);
  assert.equal(switched.holdings[0].symbol, 'SECOND');
  w.flush();
  assert.equal(w.requests[0].signal.aborted, true);
  w.requests[0].resolve({ holdings: [{ symbol: 'PRIVATE', shares: 999, lastPrice: 100 }] });
  w.requests[1].reject(new Error('offline'));
  await settle();
  assert.equal(w.render(2, false).portfolioValue, 20);
  assert.equal(w.render(2, false).holdings[0].symbol, 'SECOND');
});
