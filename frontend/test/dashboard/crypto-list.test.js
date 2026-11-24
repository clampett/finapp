const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('../../landing/node_modules/esbuild');
const compiled = buildSync({
  entryPoints: [path.join(__dirname, '../../dashboard/src/investing/MarketPrices.tsx')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', '../common/finance'],
}).outputFiles[0].text;

function market() {
  const slots = [],
    cache = new Map(),
    requests = [];
  let cursor = 0;
  const element = (type, props, key) => ({ type, props: props || {}, key });
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [
        slots[index],
        (value) => {
          slots[index] = typeof value === 'function' ? value(slots[index]) : value;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      return (slots[index] ??= { current: initial });
    },
    useEffect() {}, // Background refresh isn't needed to exercise user-initiated writes.
  };
  const context = {
    module: { exports: {} },
    AbortController,
    AbortSignal,
    localStorage: {
      getItem: (key) => cache.get(key) ?? null,
      setItem: (key, value) => cache.set(key, value),
    },
    fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
    require: (name) =>
      name === 'react'
        ? react
        : name === 'react/jsx-runtime'
          ? { jsx: element, jsxs: element, Fragment: 'fragment' }
          : { API_BASE: '/api/v1', dollars: String },
  };
  vm.runInNewContext(compiled, context);
  function render(key = 'profile') {
    cursor = 0;
    const wrapper = context.module.exports.MarketPrices({ storageKey: key });
    return wrapper.type(wrapper.props);
  }
  function find(tree, predicate) {
    if (!tree || typeof tree !== 'object') return;
    if (Array.isArray(tree)) return tree.map((node) => find(node, predicate)).find(Boolean);
    if (typeof tree.type === 'function') return find(tree.type(tree.props), predicate);
    return predicate(tree) ? tree : find(tree.props?.children, predicate);
  }
  return {
    cache,
    requests,
    render,
    find,
    wrapper: (key) => context.module.exports.MarketPrices({ storageKey: key }),
  };
}

test('removing a coin while another lookup is pending does not resurrect the removed coin', async () => {
  const m = market();
  m.cache.set('profile:crypto-list', '["BTC","ETH"]');
  const add = m.find(m.render(), (node) => node.props.title === 'Solana');
  const pending = add.props.onClick();
  m.find(m.render(), (node) => node.props['aria-label'] === 'Remove BTC').props.onClick();
  m.requests[0].resolve({
    ok: true,
    json: async () => ({
      symbol: 'SOL',
      name: 'Solana',
      price: 100,
      change_percent: 1,
      as_of: '2026-11-23T00:00:00Z',
    }),
  });
  await pending;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(m.cache.get('profile:crypto-list')), ['ETH', 'SOL']);
});

test('market state is remounted when its profile changes', () => {
  const m = market();
  assert.notEqual(m.wrapper('demo:1').key, m.wrapper('demo:2').key);
});

test('canonical duplicate symbols do not create a second saved row', async () => {
  const m = market();
  m.cache.set('profile:crypto-list', '["BTC"]');
  m.find(m.render(), (node) => node.props.title === 'Ethereum').props.onClick();
  m.requests[0].resolve({
    ok: true,
    json: async () => ({
      symbol: 'BTC',
      price: 100,
      change_percent: 1,
      as_of: '2026-11-23T00:00:00Z',
    }),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(JSON.parse(m.cache.get('profile:crypto-list')), ['BTC']);
});
