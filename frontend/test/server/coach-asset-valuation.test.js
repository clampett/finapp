const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createAssetValuationService,
  heuristicAssetValuation,
} = require('../../server/coach/coach-asset-valuation');
const { createInferenceBudget } = require('../../server/coach/coach-inference-budget');
const { createCoachService } = require('../../server/coach/coach-service');
const ready = () => Response.json({ models: [{ name: 'qwen2.5:1.5b' }] });
const modelResult = (overrides = {}) =>
  Response.json({
    done: true,
    done_reason: 'stop',
    message: {
      content: JSON.stringify({
        description: '2020 Honda Civic',
        amount: 19500,
        categoryName: 'Vehicles',
        ...overrides,
      }),
    },
  });

test('requested a bounded local estimate and discarded model-authored transaction instructions', async () => {
  let payload;
  const service = createAssetValuationService({
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      payload = JSON.parse(options.body);
      return modelResult({ kind: 'income', notes: 'Verified live comparables', verified: true });
    },
  });
  const result = await service.valueAsset('2020 Honda Civic with 30k miles in good condition');
  assert.equal(result.amount, 19500);
  assert.equal(result.source, 'local_ai');
  assert.equal(result.verified, false);
  assert.equal(Object.hasOwn(result, 'kind'), false);
  assert.doesNotMatch(result.notes, /Verified live/);
  assert.match(payload.messages[0].content, /untrusted data/);
  assert.match(payload.messages[0].content, /no live market/);
  assert.equal(payload.options.num_predict, 180);
  assert.equal(payload.stream, false);
  assert.equal(payload.messages.length, 2);
});

test('offline fallback never invented market prices or confused mileage with currency', async () => {
  const service = createAssetValuationService({
    request: async () => {
      throw Error('offline');
    },
  });
  for (const description of [
    '2019 Toyota RAV4 with 45k miles',
    '3 bedroom house in Austin',
    '10 oz gold bar',
    'Vintage Rolex Submariner',
    '1st Edition Pokemon card',
  ]) {
    const result = await service.valueAsset(description);
    assert.equal(result.amount, null);
    assert.equal(result.source, 'unavailable');
    assert.equal(result.verified, false);
    assert.doesNotMatch(result.notes, /comparables|benchmarks|fair market valuation/);
  }
});

test('explicit currency amounts remained clearly labeled references without inference', async () => {
  const service = createAssetValuationService({
    request: () => assert.fail('Reference amounts need no model request'),
  });
  for (const [text, expected] of [
    ['Car reference $15,000', 15000],
    ['Car reference $15000', 15000],
    ['House $450k', 450000],
    ['Antique desk 1500 dollars', 1500],
    ['Item USD 25000', 25000],
    ['Property $1 million', 1000000],
  ]) {
    const result = await service.valueAsset(text);
    assert.equal(result.amount, expected, text);
    assert.equal(result.source, 'provided');
    assert.equal(result.verified, false);
  }
  for (const text of [
    'Car has 30k miles',
    'worth $0',
    'worth $-500',
    'asking $1e12',
    'price $12.345',
    'purchase $1000 and current $200',
  ])
    assert.equal(heuristicAssetValuation(text).amount, null, text);
});

test('invalid, incomplete, huge and nonfinite model outputs could not become financial estimates', async () => {
  for (const output of [
    modelResult({ amount: -1 }),
    modelResult({ amount: 1e12 }),
    modelResult({ amount: null }),
    modelResult({ categoryName: { bad: true } }),
    Response.json({ done: true, done_reason: 'length', message: { content: '{}' } }),
    Response.json({ done: true, done_reason: 'stop', message: { content: 'x'.repeat(20000) } }),
  ]) {
    const service = createAssetValuationService({
      request: async (url) => (url.endsWith('/api/tags') ? ready() : output),
    });
    const result = await service.valueAsset('My 2020 Honda Civic');
    assert.equal(result.amount, null);
    assert.equal(result.source, 'unavailable');
  }
});

test('rejected invalid descriptions before touching the model', async () => {
  const service = createAssetValuationService({
    request: () => assert.fail('Invalid input must not reach inference'),
  });
  for (const text of ['', '   ', null, 123, 'a'.repeat(501)])
    assert.equal(await service.valueAsset(text), null);
});

test('chat and valuation shared one slot, and cancellation released it', async () => {
  const budget = createInferenceBudget();
  let started;
  const processing = new Promise((resolve) => {
    started = resolve;
  });
  const valuer = createAssetValuationService({
    inferenceBudget: budget,
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      started();
      return new Promise((resolve, reject) =>
        options.signal.addEventListener('abort', () => reject(options.signal.reason), {
          once: true,
        }),
      );
    },
  });
  const controller = new AbortController();
  const pending = valuer.valueAsset('2020 Honda Civic', { signal: controller.signal });
  await processing;
  const coach = createCoachService({
    inferenceBudget: budget,
    request: () => assert.fail('No concurrent model job may start'),
  });
  assert.equal(await coach.explain('stress'), null);
  controller.abort();
  assert.equal(await pending, null);
  const release = budget.acquire();
  assert.ok(release);
  release();
});

test('global inference attempt quotas reset and leases could only be released once', () => {
  let now = 0;
  const budget = createInferenceBudget(() => now);
  for (let i = 0; i < 30; i++) {
    const release = budget.acquire();
    assert.ok(release);
    assert.equal(budget.acquire(), null);
    release();
    release();
  }
  assert.equal(budget.acquire(), null);
  now = 60000;
  const release = budget.acquire();
  assert.ok(release);
  release();
});

test('failed runtime probes were cached instead of retried on every click', async () => {
  let requests = 0;
  const service = createAssetValuationService({
    request: async () => {
      requests++;
      throw Error('offline');
    },
  });
  await service.valueAsset('My car');
  await service.valueAsset('My phone');
  assert.equal(requests, 1);
});

test('removed nested and unmatched angle brackets from untrusted valuation descriptions', () => {
  const { cleanText } = require('../../server/coach/asset-description');
  for (const input of [
    '<script',
    '<<script>alert(1)</script>',
    '<img src=x onerror=alert(1)',
    '<><<b>>',
  ]) {
    assert.doesNotMatch(cleanText(input, 100), /[<>]/);
    assert.doesNotMatch(heuristicAssetValuation(input).description, /[<>]/);
  }
});
