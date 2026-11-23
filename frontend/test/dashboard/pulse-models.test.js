const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('../../landing/node_modules/esbuild/lib/main');
const runtime = { module: { exports: {} } };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../../dashboard/src/pulse/pulse-models.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    define: { 'import.meta.env.VITE_API_URL': '""' },
  }).outputFiles[0].text,
  runtime,
);
const { pulsePositions, readPulseMarket, pulseContext, buildPulseCards } = runtime.module.exports;
const holdings = [
  { symbol: 'GOOGL', shares: 2, lastPrice: 100 },
  { symbol: 'GOOGL', shares: 1, lastPrice: 100 },
  { symbol: 'MSFT', shares: 1, lastPrice: 100 },
  { symbol: 'BAD', shares: 1, lastPrice: NaN },
];
const graph = {
  nodes: [
    {
      id: 'pay',
      name: 'Private employer',
      nodeType: 'INCOME',
      amountOrBalance: 1000,
      interestRateApr: 0,
    },
    {
      id: 'bills',
      name: 'Private bills',
      nodeType: 'EXPENSE',
      amountOrBalance: 700,
      interestRateApr: 0,
    },
  ],
  edges: [],
};
const quotes = {
  symbol: 'GOOGL',
  period: '1mo',
  stale: false,
  points: [
    { date: '2026-11-01', close: 100 },
    { date: '2026-11-02', close: 110 },
  ],
};

test('Pulse combined duplicate lots and excluded unpriced or invalid balances', () => {
  const positions = pulsePositions(holdings);
  assert.equal(positions.length, 2);
  assert.equal(positions[0].value, 300);
  assert.equal(positions[0].label, 'GOOGL');
  assert.equal(pulsePositions([{ symbol: 'AAPL', shares: -1, lastPrice: 100 }]).length, 0);
});

test('Pulse verified symbols, chart periods, quotes, and chronological timestamps', () => {
  assert(readPulseMarket(quotes, 'GOOGL'));
  for (const bad of [
    { ...quotes, symbol: 'MSFT' },
    { ...quotes, period: '1d' },
    { ...quotes, points: [...quotes.points].reverse() },
    { ...quotes, points: [quotes.points[0], { date: '2026-11-02', close: 0 }] },
    { ...quotes, points: [null, null] },
  ])
    assert.equal(readPulseMarket(bad, 'GOOGL'), null);
});

test('Pulse used displayed month endpoints and labeled cached history explicitly', () => {
  const market = readPulseMarket({ ...quotes, stale: true }, 'GOOGL');
  const cards = buildPulseCards(graph, holdings, [market], null);
  const stock = cards.find((c) => c.id === 'stock-GOOGL');
  assert.equal(stock.value, '+10.00%');
  assert.equal(stock.tone, 'positive');
  assert.match(stock.kicker, /1M/);
  assert.match(stock.footnote, /Cached/);
  const down = buildPulseCards(
    null,
    holdings,
    [
      {
        ...market,
        points: [
          { date: '2026-11-01', close: 100 },
          { date: '2026-11-02', close: 90 },
        ],
      },
    ],
    null,
  )[0];
  assert.equal(down.value, '-10.00%');
  assert.equal(down.tone, 'negative');
  assert.equal(buildPulseCards(null, [], [market], null)[0].id, 'start');
});

test('Pulse kept exact scenario values and identities out of AI context', () => {
  const context = pulseContext(graph, holdings, null);
  assert.equal(context.cashflow, 'surplus');
  assert.equal(context.concentration, 'high');
  assert.equal(context.forecast, 'none');
  assert.doesNotMatch(JSON.stringify(context), /Private|1000|700|GOOGL|300/);
  const card = buildPulseCards(graph, [], [], null).find((c) => c.id === 'scenario');
  assert.equal(card.chart.edges.length, 0, 'Invented a graph route');
  assert.match(card.footnote, /2 active nodes/);
});

test('Pulse labeled historical simulation figures as saved hypothetical outcomes', () => {
  const run = {
    summary: {
      kind: 'monte_carlo',
      years: 10,
      p10: -100,
      p50: 5000,
      p90: 20000,
      createdAt: '2026-11-20T12:00:00Z',
    },
    result: {
      monte_carlo: [
        { year: 0, p50: 100 },
        { year: 10, p50: 5000 },
      ],
    },
  };
  const card = buildPulseCards(null, [], [], run).find((c) => c.id === 'forecast');
  assert.equal(card.title, 'Median at 10 years');
  assert.match(card.footnote, /Hypothetical/);
  assert.equal(card.chart.points[1].value, 5000);
  assert.equal(pulseContext(null, [], run).forecast, 'downside_negative');
});
