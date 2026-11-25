const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoachMarket } = require('../../server/coach/coach-market');
const date = Date.parse('2026-11-12T15:00:00Z');
const body = () => ({
  status: 'ready',
  fetched_at: new Date(date).toISOString(),
  markets: [{ symbol: 'VOO' }],
  news: [
    {
      title: 'Public story',
      url: 'https://finance.yahoo.com/news/example.html',
      published_at: new Date(date).toISOString(),
    },
  ],
});

test('shared one fixed upstream fetch and rejected forged source URLs', async () => {
  let calls = 0;
  const market = createCoachMarket({
    now: () => date,
    request: async (url, options) => {
      calls++;
      assert.equal(String(url), 'http://127.0.0.1:8081/api/v1/market/context');
      assert.equal(options.redirect, 'error');
      const data = body();
      data.news.push({ ...data.news[0], url: 'https://evil.example/news' });
      return Response.json(data);
    },
  });
  const values = await Promise.all(Array.from({ length: 10 }, () => market.get()));
  assert.equal(calls, 1);
  assert.ok(values.every((value) => value.news.length === 1));
  await market.get();
  assert.equal(calls, 1);
});

test('outages used dated stale observations briefly and expired them after a day', async () => {
  let time = date;
  let calls = 0;
  const market = createCoachMarket({
    now: () => time,
    request: async () => {
      if (++calls > 1) throw Error('offline');
      return Response.json(body());
    },
  });
  await market.get();
  time += 60000;
  assert.equal((await market.get()).status, 'stale');
  time += 86400000;
  assert.equal(await market.get(), null);
});

test('pending and failed refreshes were coalesced and backed off', async () => {
  let calls = 0;
  let time = date;
  const market = createCoachMarket({
    now: () => time,
    request: async () => {
      calls++;
      return Response.json({
        status: 'pending',
        pending: true,
        fetched_at: null,
        markets: [],
        news: [],
      });
    },
  });
  await market.get();
  await market.get();
  assert.equal(calls, 1);
  time += 3000;
  await market.get();
  assert.equal(calls, 2);
  assert.throws(() => createCoachMarket({ upstream: 'file:///etc/passwd' }));
  assert.throws(() => createCoachMarket({ upstream: 'http://localhost:8081/private' }));
});
