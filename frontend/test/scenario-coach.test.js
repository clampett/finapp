const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { buildSync } = require('../landing/node_modules/esbuild/lib/main');

const compiled = buildSync({
  entryPoints: [path.join(__dirname, '../dashboard/src/scenarioCoach.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  define: { 'import.meta.env.VITE_API_URL': '""' },
}).outputFiles[0].text;

function loadCoach(fetch) {
  const module = { exports: {} };
  vm.runInNewContext(compiled, { module, fetch, AbortSignal });
  return module.exports;
}

test('coach isolated the active scenario, redacted account labels, and changed only one assumption', () => {
  const coach = loadCoach();
  const graph = {
    nodes: [
      { ...coach.sampleScenario.nodes[0], id: 'private-id', name: 'Private employer' },
      { ...coach.sampleScenario.nodes[1], disabled: true },
      coach.sampleScenario.nodes[2],
    ],
    edges: [{ sourceNodeId: 'private-id', targetNodeId: 'bills', monthlyFixedFlow: 100 }],
  };
  const inputs = coach.coachInputs(coach.prepareCoachScenario(graph), 'markov', 20, 'expenses');
  assert.equal(graph.nodes.length, 3);
  assert.equal(inputs.baseline.nodes.length, 2);
  assert.equal(inputs.baseline.edges.length, 0);
  assert.doesNotMatch(JSON.stringify(inputs), /private-id|Private employer/);
  assert.equal(inputs.baseline.market_source, 'manual');
  assert.equal(inputs.before, '2.5%');
  assert.equal(inputs.after, '4.5%');
  assert.deepEqual(
    Object.keys(inputs.baseline).filter((field) => inputs.baseline[field] !== inputs.stress[field]),
    ['expense_growth'],
  );
});

test('coach bounded stress inputs at the Python contract limit', () => {
  const coach = loadCoach();
  const graph = { ...coach.sampleScenario, assumptions: { expenseGrowth: 25 } };
  const inputs = coach.coachInputs(graph, 'monte_carlo', 10, 'expenses');
  assert.equal(inputs.changed, false);
  assert.equal(inputs.stress.expense_growth, 0.25);
});

test('coach compared two forecasts and answered locally using only those metrics', async () => {
  const payloads = [];
  const coach = loadCoach(async (url, options) => {
    assert.equal(url, '/api/v1/simulate');
    const payload = JSON.parse(options.body);
    payloads.push(payload);
    const stressed = payload.annual_fee > 0;
    return {
      ok: true,
      json: async () => ({
        status: 'success',
        model_version: 3,
        [payload.sim_type]: [{ year: payload.years, p10: 200, p50: stressed ? 400 : 500 }],
        summary: { probability_target: stressed ? 0.5 : 0.75 },
      }),
    };
  });
  const inputs = coach.coachInputs(coach.sampleScenario, 'monte_carlo', 20, 'fees');
  const result = await coach.runCoachComparison(
    inputs,
    'Higher fees',
    new AbortController().signal,
  );
  assert.equal(payloads.length, 2);
  assert.match(coach.coachReply('What changed?', result), /\$100 lower/);
  assert.match(coach.coachReply('What is P10?', null), /one in ten/);
  assert.equal(payloads.length, 2);
});

test('coach rejected an incomplete or wrong-horizon forecast', async () => {
  const coach = loadCoach(async () => ({
    ok: true,
    json: async () => ({
      status: 'success',
      model_version: 3,
      monte_carlo: [{ year: 2, p10: 200, p50: 500 }],
      summary: { probability_target: 0.5 },
    }),
  }));
  const inputs = coach.coachInputs(coach.sampleScenario, 'monte_carlo', 20, 'returns');
  await assert.rejects(
    coach.runCoachComparison(inputs, 'Lower returns', new AbortController().signal),
    /incomplete comparison/,
  );
});

test('matrix retrieval selected a grounded topic and sent the actual eligible question', async () => {
  let sent;
  const coach = loadCoach(async (url, options) => {
    assert.equal(url, '/api/v1/coach/explain');
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ answer: 'Generated answer.' }) };
  });
  assert.equal(coach.matchCoachTopic('How do I read the downside percentile?'), 'percentiles');
  assert.equal(coach.matchCoachTopic('How much does the snowball debt payoff prioritize?'), 'debt');
  assert.equal(coach.matchCoachTopic('banana sandwich'), undefined);
  assert.equal(coach.asksAboutComparison('What changed in my comparison?'), true);
  assert.equal(
    await coach.liveCoachReply(
      { topic: 'monteCarlo', question: 'How does Monte Carlo work?' },
      new AbortController().signal,
    ),
    'Generated answer.',
  );
  assert.deepEqual(sent, { topic: 'monteCarlo', question: 'How does Monte Carlo work?' });
});

test('benchmark volatility was held constant across both scenario runs', () => {
  const coach = loadCoach();
  const inputs = coach.coachInputs(coach.sampleScenario, 'markov', 20, 'returns', 0.22);
  assert.equal(inputs.baseline.annual_volatility, 0.22);
  assert.equal(inputs.stress.annual_volatility, 0.22);
  assert.equal(inputs.baseline.market_source, 'manual');
  assert.equal(inputs.stress.annual_return, 0.04);
});

test('reported prompts used verified facts while comparison follow-ups stayed local', () => {
  const coach = loadCoach();
  const comparison = {
    baseline: { median: 300, downside: 150, targetChance: 0.6 },
    stress: { median: 250, downside: 120, targetChance: 0.4 },
    label: 'Higher fees',
    years: 10,
  };
  const cases = [
    [
      'What is the difference between the debt snowball and avalanche?',
      /highest APR.*smallest balance/,
    ],
    [
      'Does applying VOO volatility also change my expected return?',
      /expected return assumptions unchanged/,
    ],
    [
      'Does FinApp deduct estimated taxes again if I enter take-home income?',
      /does not deduct estimated taxes again/,
    ],
    ['What do P10, P50, and P90 mean?', /middle 80%/],
    ['What is P10?', /one in ten/],
    [
      'Why do bull and bear markets cluster in the Markov model?',
      /illustrates possible market behavior/,
    ],
    ['Which stock should I buy tomorrow for a guaranteed profit?', /cannot recommend/],
    ['What changed in my comparison?', /\$50 lower/],
  ];
  for (const [question, expected] of cases) {
    assert.match(coach.coachReply(question, comparison), expected, question);
    assert.equal(coach.coachTopicForModel(question), undefined, question);
  }
  assert.equal(coach.coachTopicForModel('What does Monte Carlo simulation show?'), 'monteCarlo');
});

test('a practical follow-up used the result to suggest another experiment', () => {
  const coach = loadCoach();
  const question = 'how will i know how to use this comparison for something meaningful';
  const result = {
    baseline: { median: 300, downside: 150, targetChance: 0.6 },
    stress: { median: 250, downside: -120, targetChance: 0.4 },
    label: 'Higher expense growth',
    preset: 'expenses',
    years: 50,
  };

  assert.match(coach.coachReply(question, result), /P10.*crosses below zero/);
  assert.match(coach.coachReply(question, result), /Rerun at 10 or 20 years/);
  assert.match(coach.coachReply(question, result), /smaller expense-growth increase/);
  assert.match(coach.coachReply(question, null), /Start with a question/);
  for (const greeting of ['hello how are you', 'hiya', 'how are you']) {
    assert.match(coach.coachReply(greeting, null), /^Hey!/);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(coach.coachRequestForQuestion(question, result))), {
    topic: 'nextExperiment',
    question,
    context: { preset: 'expenses', years: 50, downsideCrossedZero: true, targetChanceFell: true },
  });
  assert.equal(coach.coachRequestForQuestion('What changed in my comparison?', result), undefined);
});
