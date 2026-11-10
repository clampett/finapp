const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoachService } = require('../coach-service');

const ready = () => Response.json({ models: [{ name: 'qwen2.5:1.5b' }] });
const success = () =>
  Response.json({
    done: true,
    done_reason: 'stop',
    message: { content: 'Explanation from Ollama.' },
  });

test('local coach rejected arbitrary topics, grounded its prompts, and shared cached answers', async () => {
  let calls = 0;
  const service = createCoachService({
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      calls++;
      assert.equal(url, 'http://127.0.0.1:11434/api/chat');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers.Authorization, undefined);
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, 'qwen2.5:1.5b');
      assert.match(payload.messages[0].content, /Ask FinApp/);
      assert.match(payload.messages[0].content, /FinApp guide: The coach changes/);
      return success();
    },
  });
  assert.equal(await service.explain('arbitrary question'), null);
  assert.equal(await service.explain('__proto__'), null);
  assert.equal(await service.explain('debt'), null);
  assert.equal(await service.explain('percentiles'), null);
  const answers = await Promise.all([service.explain('stress'), service.explain('stress')]);
  assert.equal(answers[0].answer, 'Explanation from Ollama.');
  assert.deepEqual(answers[0], answers[1]);
  assert.equal((await service.explain('stress')).cached, true);
  assert.equal(calls, 1);
});

test('local coach distinguished a missing model from an unreachable runtime', async () => {
  const missing = createCoachService({
    request: async (url) => {
      assert.match(url, /\/api\/tags$/);
      return Response.json({ models: [{ name: 'a-cloud-model' }] });
    },
  });
  assert.equal((await missing.status()).state, 'model_missing');
  assert.equal(await missing.explain('stress'), null);
  const offline = createCoachService({
    request: async () => {
      throw new Error('Connection refused');
    },
  });
  assert.equal((await offline.status()).state, 'offline');
  assert.equal(await offline.explain('stress'), null);
});

test('local coach bounded inference to one job and cooled down on failure', async () => {
  let calls = 0;
  let time = 0;
  let finish;
  const response = new Promise((resolve) => {
    finish = resolve;
  });
  const service = createCoachService({
    now: () => time,
    request: async (url) => {
      if (url.endsWith('/api/tags')) return ready();
      return ++calls === 1 ? response : success();
    },
  });
  const pending = service.explain('stress');
  assert.equal(await service.explain('cashFlow'), null);
  finish(new Response(null, { status: 503 }));
  assert.equal(await pending, null);
  assert.equal(await service.explain('cashFlow'), null);
  time = 5000;
  assert.ok(await service.explain('cashFlow'));
  assert.equal(calls, 2);
});

test('local coach discarded truncated and unfinished answers before caching', async () => {
  let time = 0;
  let calls = 0;
  const responses = [
    { done_reason: 'length', message: { content: 'This looks complete.' } },
    { done_reason: 'stop', message: { content: 'This ends in the middle of' } },
    { done_reason: 'stop', message: { content: 'An accepted answer.' } },
  ];
  const service = createCoachService({
    now: () => time,
    request: async (url) => {
      if (url.endsWith('/api/tags')) return ready();
      return Response.json({ done: true, ...responses[calls++] });
    },
  });
  assert.equal(await service.explain('graph'), null);
  time += 5000;
  assert.equal(await service.explain('graph'), null);
  time += 5000;
  assert.deepEqual(await service.explain('graph'), {
    answer: 'An accepted answer.',
    cached: false,
  });
  assert.equal((await service.explain('graph')).cached, true);
  assert.equal(calls, 3);
});

test('Ollama generated separate answers from actual questions and limited comparison context', async () => {
  const received = [];
  const service = createCoachService({
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      const payload = JSON.parse(options.body);
      received.push(payload);
      return Response.json({
        done: true,
        done_reason: 'stop',
        message: {
          content: JSON.stringify(
            received.length === 1
              ? { horizon: 10, experiment: 'expenses', metric: 'target' }
              : { metric: 'downside' },
          ),
        },
      });
    },
  });
  const context = {
    preset: 'expenses',
    years: 50,
    downsideCrossedZero: true,
    targetChanceFell: true,
  };
  assert.equal(
    await service.explain('nextExperiment', 'What should I try?', { ...context, balance: 123 }),
    null,
  );
  const first = await service.explain(
    'nextExperiment',
    'What should I try for the next 10 years?',
    context,
  );
  const second = await service.explain(
    'nextExperiment',
    'Which downside metric should I inspect?',
    context,
  );
  assert.notEqual(first.answer, second.answer);
  assert.equal(received[0].messages[1].content, 'What should I try for the next 10 years?');
  assert.deepEqual(received[0].format.properties.horizon.enum, [10]);
  assert.match(first.answer, /Time horizon to 10 years.*Higher expense growth/);
  assert.match(first.answer, /Chance of reaching the target/);
  assert.equal(received[1].messages[1].content, 'Which downside metric should I inspect?');
  assert.deepEqual(received[1].format.properties.metric.enum, ['downside']);
  assert.match(second.answer, /Downside ending net worth \(P10\)/);
  assert.match(second.answer, /took P10 below zero/);
  assert.doesNotMatch(second.answer, /run the comparison/);
  assert.deepEqual(received[1].format.required, ['metric']);
  assert.match(received[0].messages[0].content, /"downsideCrossedZero":true/);
  assert.equal(first.cached, false);
  assert.equal(second.cached, false);
});

test('rejected recommendations with invented metrics or a conflicting horizon', async () => {
  let time = 0;
  const selections = [
    { horizon: 10, experiment: 'fees', metric: 'totalFees' },
    { horizon: 50, experiment: 'fees', metric: 'target' },
  ];
  const service = createCoachService({
    now: () => time,
    request: async (url) => {
      if (url.endsWith('/api/tags')) return ready();
      return Response.json({
        done: true,
        done_reason: 'stop',
        message: {
          content: JSON.stringify(selections.shift()),
        },
      });
    },
  });
  const question = 'What should I try next for 10 years?';
  assert.equal(await service.explain('nextExperiment', question), null);
  time += 5000;
  assert.equal(await service.explain('nextExperiment', question), null);
  assert.equal(selections.length, 0);
});

test('rendered model-selected illustrations with verified Monte Carlo and inflation facts', async () => {
  const choices = [
    { example: 'timing', metric: 'downside' },
    { amount: 100, years: 1 },
  ];
  const service = createCoachService({
    request: async (url, options) => {
      if (url.endsWith('/api/tags')) return ready();
      assert.ok(JSON.parse(options.body).format);
      return Response.json({
        done: true,
        done_reason: 'stop',
        message: {
          content: JSON.stringify(choices.shift()),
        },
      });
    },
  });
  assert.equal((await service.status()).contract, 3);
  const monteCarlo = await service.explain(
    'monteCarlo',
    'Explain two households with the same budget.',
  );
  assert.match(monteCarlo.answer, /same budget, savings, and investing plan/);
  assert.match(monteCarlo.answer, /downturn early/);
  assert.match(monteCarlo.answer, /Downside ending net worth \(P10\)/);
  assert.doesNotMatch(monteCarlo.answer, /10,000|worst.case/);
  const inflation = await service.explain('inflation', 'Give me a hypothetical example.');
  assert.match(inflation.answer, /\$100\.00 received in 1 year/);
  assert.match(inflation.answer, /\$97\.56/);
});
