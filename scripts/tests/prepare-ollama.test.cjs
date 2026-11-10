const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareOllama } = require('../prepare-ollama.cjs');

const model = { name: 'qwen2.5:1.5b' };
const tags = (...models) => Response.json({ models });
const silent = () => {};

test('reused an existing local model without starting Docker or pulling', async () => {
  await prepareOllama({
    start: () => assert.fail('Docker was not needed'),
    request: async (url) => {
      assert.equal(url, 'http://127.0.0.1:11434/api/tags');
      return tags(model);
    },
    log: silent,
  });
});

test('started the runtime, waited for readiness, and pulled exactly the coach model', async () => {
  let probes = 0;
  let starts = 0;
  let pulls = 0;
  await prepareOllama({
    start: async () => {
      starts++;
    },
    pause: async () => {},
    log: silent,
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) {
        probes++;
        if (probes < 3) throw new Error('Connection refused');
        return pulls ? tags(model) : tags();
      }
      assert.equal(url, 'http://127.0.0.1:11434/api/pull');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), { model: model.name, stream: false });
      pulls++;
      return Response.json({ status: 'success' });
    },
  });
  assert.equal(starts, 1);
  assert.equal(pulls, 1);
});

test('reported a failed download without retrying it', async () => {
  let pulls = 0;
  await assert.rejects(
    prepareOllama({
      start: () => assert.fail('existing runtime was available'),
      log: silent,
      request: async (url) => {
        if (url.endsWith('/api/tags')) return tags();
        pulls++;
        return Response.json({ error: 'offline' }, { status: 503 });
      },
    }),
    /could not download/,
  );
  assert.equal(pulls, 1);
});
