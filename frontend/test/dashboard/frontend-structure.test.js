const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { buildSync } = require('../../landing/node_modules/esbuild');
const sourceRoot = path.join(__dirname, '../../dashboard/src');
const requireDashboard = createRequire(path.join(sourceRoot, '../package.json'));
const { renderToStaticMarkup } = requireDashboard('react-dom/server');

test('frontend module names remained unambiguous on case-insensitive filesystems', () => {
  function inspect(directory) {
    const modules = new Map();
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        inspect(file);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      // Rejected competing .ts/.tsx stems before Windows resolved the component import to a helper.
      const stem = entry.name.replace(/\.tsx?$/, '').toLowerCase();
      assert.ok(
        !modules.has(stem),
        `${modules.get(stem)} and ${file} collide during module resolution`,
      );
      modules.set(stem, file);
    }
  }
  inspect(sourceRoot);
});

const compiled = buildSync({
  entryPoints: [path.join(sourceRoot, 'simulation/SimulationMarketData.tsx')],
  jsx: 'automatic',
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: ['react', 'react/jsx-runtime'],
}).outputFiles[0].text;
const moduleContext = { module: { exports: {} }, require: requireDashboard };
vm.runInNewContext(compiled, moduleContext);
const { SimulationMarketData } = moduleContext.module.exports;
const forecast = {
  market_data: {
    status: 'historical',
    ticker: 'SPY',
    years: 30,
    source: 'Yahoo Finance adjusted history',
    start: '1996-01-31',
    end: '2026-10-31',
    observations: 369,
    annual_return: 0.07,
    annual_volatility: 0.15,
    observed_annual_return: 0.103,
    method: 'Historical block bootstrap',
    regime_transitions: [
      [0.96, 0.04],
      [0.25, 0.75],
    ],
    pending: false,
  },
};

test('extracted simulation calibration retained rates, source dates and regime probabilities', () => {
  const html = renderToStaticMarkup(
    SimulationMarketData({
      simulationType: 'markov',
      forecast,
      loading: false,
      onRefresh: () => {},
    }),
  );
  for (const text of [
    '7.00%',
    '15.00%',
    '10.30%',
    '4.0%',
    '25.0%',
    '1996-01-31',
    '2026-10-31',
    '369 completed monthly returns',
    'Historical block bootstrap',
    'Refresh forecast',
  ]) {
    assert.ok(html.includes(text), `Calibration should include ${text}`);
  }
  assert.doesNotMatch(html, /0\.07%|0\.15%/);
});

test('extracted market panel preserved refresh, pending and stale-history behavior', () => {
  let calls = 0;
  const panel = SimulationMarketData({
    simulationType: 'monte_carlo',
    forecast,
    loading: false,
    onRefresh: () => calls++,
  });
  function find(node) {
    if (!node || typeof node !== 'object') return undefined;
    if (node.type === 'button') return node;
    return [node.props?.children].flat(Infinity).map(find).find(Boolean);
  }
  find(panel).props.onClick();
  assert.equal(calls, 1);
  const pending = { market_data: { ...forecast.market_data, status: 'fallback', pending: true } };
  const html = renderToStaticMarkup(
    SimulationMarketData({
      simulationType: 'monte_carlo',
      forecast: pending,
      loading: true,
      onRefresh: () => {},
    }),
  );
  assert.match(html, /History loading/);
  assert.match(html, /Check loaded history/);
  assert.match(html, /disabled/);
  const stale = { market_data: { ...forecast.market_data, status: 'stale_history' } };
  assert.match(
    renderToStaticMarkup(
      SimulationMarketData({
        simulationType: 'markov',
        forecast: stale,
        loading: false,
        onRefresh: () => {},
      }),
    ),
    /older than 24 hours/,
  );
  assert.equal(
    SimulationMarketData({ simulationType: 'debt', forecast, loading: false, onRefresh: () => {} }),
    null,
  );
});
