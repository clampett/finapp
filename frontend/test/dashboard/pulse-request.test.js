const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const path = require('node:path');
const { buildSync } = require('../../landing/node_modules/esbuild/lib/main');
const runtime = { module: { exports: {} }, fetch, Date };
vm.runInNewContext(
  buildSync({
    entryPoints: [path.join(__dirname, '../../dashboard/src/pulse/pulse-request.ts')],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
  }).outputFiles[0].text,
  runtime,
);
const { createPulseRequester } = runtime.module.exports;
const context = { cashflow: 'surplus', concentration: 'high', forecast: 'available' };
const signal = () => AbortSignal.timeout(2000);

test('Pulse reused the working chat route on older gateways without a canned response', async () => {
  const calls = [];
  const request = createPulseRequester({
    request: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return url.endsWith('/pulse')
        ? Response.json({ message: 'Sign in to access this workspace.' }, { status: 401 })
        : Response.json({
            answer:
              'Inspect P10 alongside P50 over 20 years to understand the weaker modeled outcomes. Keep assumptions consistent.',
          });
    },
  });
  const result = await request(context, signal(), 'user:private-id');
  assert.equal(result.source, 'local_ai');
  assert.match(result.message, /Inspect P10/);
  assert.doesNotMatch(result.message, /Keep assumptions/);
  assert.equal(calls[1].url, '/api/v1/coach/explain');
  assert.equal(calls[1].body.context.market, false);
  assert.doesNotMatch(JSON.stringify(calls), /private-id|shares|balance|accountName/);
});

test('Pulse kept busy responses distinct and never used the legacy route to bypass a rate limit', async () => {
  let calls = 0;
  const request = createPulseRequester({
    request: async () => {
      calls++;
      return Response.json({ code: 'busy' }, { status: 503 });
    },
  });
  await assert.rejects(request(context, signal(), 'user:1'), /answering another request/);
  assert.equal(calls, 1);
  const limited = createPulseRequester({
    request: async () => Response.json({ code: 'rate_limit' }, { status: 429 }),
  });
  await assert.rejects(limited(context, signal(), 'user:1'), /wait a few minutes/);
});

test('Pulse rejected fabricated figures from legacy answers and bounded compatibility inference attempts', async () => {
  let chatCalls = 0;
  const request = createPulseRequester({
    request: async (url) =>
      url.endsWith('/pulse')
        ? Response.json({}, { status: 404 })
        : (chatCalls++, Response.json({ answer: 'Your return will be 50%.' })),
  });
  for (let i = 0; i < 3; i++)
    await assert.rejects(request(context, signal(), 'user:1'), /usable suggestion/);
  await assert.rejects(request(context, signal(), 'user:1'), /wait a few minutes/);
  assert.equal(chatCalls, 3);
});

test('Pulse accepted ordinary forecast terminology from the current endpoint', async () => {
  const message = 'Inspect P10 and P50 together to understand your forecast.';
  const request = createPulseRequester({
    request: async () => Response.json({ source: 'local_ai', action: 'forecast', message }),
  });
  assert.equal((await request(context, signal(), 'demo:2')).message, message);
});
