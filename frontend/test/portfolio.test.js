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
} = runtime.module.exports;

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
