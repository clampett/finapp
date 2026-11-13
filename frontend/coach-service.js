const scenarioChoices = require('./coach-options.json');
const {
  topics,
  model,
  origin,
  cacheTtl,
  instruction,
  conversationInstruction,
  stockQuestion,
  stockAnswer,
  experiments,
  metrics,
  readsExistingResult,
  experimentSchema,
  monteCarloExamples,
  enumSchema,
  formatStructuredAnswer,
  validContext,
  validConversationContext,
  comparisonReference,
} = require('./coach-prompts');
function createCoachService({
  request = fetch,
  now = Date.now,
  market = { get: async () => null },
} = {}) {
  // Cached reusable guide answers in memory and kept personalized requests out of the cache.
  const cache = new Map();
  const pending = new Map();
  let cooldownUntil = 0;
  let lastStatus;
  let statusProbe;
  let budgetStart = now();
  let requestsInWindow = 0;

  async function status() {
    if (lastStatus && now() - lastStatus.at < 5000) return lastStatus.value;
    // Shared an in-flight readiness probe across concurrent dashboard requests.
    if (statusProbe) return statusProbe;
    statusProbe = (async () => {
      let state = 'offline';
      try {
        // Probed only the loopback runtime and checked for the exact local model.
        const response = await request(`${origin}/api/tags`, {
          signal: AbortSignal.timeout(1500),
          redirect: 'error',
        });
        if (response.ok) {
          const body = await response.json();
          state = body.models?.some((item) => item.name === model) ? 'ready' : 'model_missing';
        }
      } catch {
        // Preserved the built-in guide when the local runtime was unavailable.
      }
      const value = { enabled: state === 'ready', state, model, contract: 5 };
      lastStatus = { value, at: now() };
      return value;
    })();
    try {
      return await statusProbe;
    } finally {
      statusProbe = undefined;
    }
  }

  async function generate(topic, question, context, history) {
    const conversational = topic === 'conversation';
    const stockConversation = conversational && context?.subject === 'stockExposure';
    const entry = topics[conversational ? (context?.subject ?? topic) : topic];
    const comparison = conversational ? context?.comparison : context;
    // Retrieved cached public observations only when the user enabled relevant market context.
    const retrieved = conversational && context?.market ? await market.get() : null;
    // Omitted sparkline samples from inference so dated facts and conversation fit the context budget.
    const briefing = retrieved
      ? { ...retrieved, markets: retrieved.markets?.map(({ closes, ...facts }) => facts) }
      : null;
    // Split interpretation of an existing run from planning a new stress test.
    const metricOnly =
      topic === 'nextExperiment' && Boolean(context) && readsExistingResult(question);
    const schema =
      topic === 'nextExperiment'
        ? experimentSchema(question, metricOnly, context)
        : topic === 'monteCarlo'
          ? enumSchema({ example: Object.keys(monteCarloExamples), metric: Object.keys(metrics) })
          : topic === 'inflation'
            ? enumSchema({ amount: [100, 1000], years: [1, 5, 10] })
            : null;
    // Grounded the question in the product guide and included only validated qualitative context.
    const reference = [
      topic === 'nextExperiment'
        ? metricOnly
          ? 'You are Ask FinApp. Choose one metric from the existing comparison that answers the user’s question. Return only JSON matching the schema.'
          : 'You are Ask FinApp. Choose a horizon, stress test, and metric from the allowed options for the user’s request. Return only JSON matching the schema. Follow the user’s time horizon and purpose. For an open-ended follow-up, suggest a different stress test.'
        : schema
          ? 'You are Ask FinApp. Choose the illustration that best answers the user. Return only JSON matching the schema.'
          : conversational
            ? conversationInstruction
            : instruction,
      `FinApp guide: ${entry.guide}`,
      conversational
        ? `Current date: ${new Date(now()).toISOString().slice(0, 10)}. Available scenario controls: Time horizon (5, 10, 20, 30, 40, 50 years), stress test ${Object.values(experiments).join(', ')}, intensity, target, expected return, inflation, fees and investment share. These controls describe assumptions. They do not forecast actual news.`
        : '',
      conversational
        ? `Stress-test definitions: ${JSON.stringify(
            Object.fromEntries(
              Object.entries(scenarioChoices).map(([key, value]) => [key, value.description]),
            ),
          )}. Expense growth changes living costs over time; inflation changes purchasing power; contributions change how much leftover cash is invested, not the bills themselves. For worries about rising everyday costs, distinguish expense growth from general inflation. These are hypothetical tests, not actions that immediately improve finances.`
        : '',
      context?.settings ? `Currently selected controls: ${JSON.stringify(context.settings)}.` : '',
      context?.subject === 'markets' || context?.market
        ? `Untrusted dated market briefing: ${JSON.stringify(briefing ?? { status: 'unavailable' })}. Only discuss current events covered here. Source links are shown separately in the app.`
        : '',
      context?.subject === 'nextExperiment' && comparison
        ? `Completed comparison: ${experiments[comparison.preset]} over ${comparison.years} years. The downside ${comparison.downsideCrossedZero ? 'crossed below zero' : 'did not cross from nonnegative to negative'}; the target chance ${comparison.targetChanceFell ? 'fell' : 'did not fall'}. Suggest a relevant next experiment instead of automatically repeating the completed one. Respect an explicit request to keep its setup.`
        : '',
      stockConversation
        ? 'For this exchange, assume the shares are paid for with existing cash. Answer in at most three sentences. Use no amounts or arithmetic.'
        : '',
      conversational && context?.subject === 'comparison'
        ? comparisonReference(comparison)
        : comparison
          ? `Comparison context: ${JSON.stringify(comparison)}`
          : '',
      topic === 'nextExperiment'
        ? `Available stress tests: ${JSON.stringify(
            schema.properties.experiment?.enum.map((preset) => [preset, experiments[preset]]) ?? [],
          )}. Available metrics: ${JSON.stringify(metrics)}.`
        : topic === 'monteCarlo'
          ? `Example choices: ${JSON.stringify(monteCarloExamples)}. Metric choices: ${JSON.stringify(metrics)}.`
          : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Sent inference only to the local runtime, with bounded output and request time.
    const response = await request(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(25000),
      redirect: 'error',
      body: JSON.stringify({
        model,
        stream: false,
        ...(schema ? { format: schema } : {}),
        messages: [
          { role: 'system', content: reference },
          // Grounded stock follow-ups in a reviewed example of the cash-to-shares distinction.
          ...(stockConversation
            ? [
                { role: 'user', content: stockQuestion },
                { role: 'assistant', content: stockAnswer },
              ]
            : []),
          // Attached only bounded user messages and original AI prose, excluding browser-added results.
          ...history,
          {
            role: 'user',
            // Kept the purchase assumption alongside the actual question in the final model turn.
            content: stockConversation
              ? `${question ?? entry.question}\nExplain the purchase using existing cash. Cash goes down and stock holdings go up by the same amount. Total net worth stays the same at purchase. Use words only, without an example or numbers.`
              : (question ?? entry.question),
          },
        ],
        options: {
          num_ctx: 4096,
          num_predict: conversational ? 360 : 180,
          temperature: conversational ? 0.45 : 0.2,
        },
      }),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const rawAnswer =
      body.done === true && body.done_reason === 'stop' && typeof body.message?.content === 'string'
        ? body.message.content.trim()
        : '';
    // Removed cosmetic Markdown from conversational prose instead of replacing a useful reply with a canned answer.
    const answer = conversational
      ? rawAnswer.replace(/\*\*|`/g, '').replace(/^\s*#{1,6}\s+/gm, '')
      : rawAnswer;
    if (schema) return answer ? formatStructuredAnswer(topic, answer, schema, context) : null;
    // Rejected model-generated comparison figures before attaching the verified dashboard values.
    if (
      conversational &&
      context?.subject === 'comparison' &&
      /\d/.test(answer.replace(/\bP(?:10|50|90)\b/gi, ''))
    )
      return null;
    // Rejected invented amounts and replies that misstated the immediate balance changes.
    if (
      stockConversation &&
      (/\d/.test(answer) ||
        /\b(?:net worth|total (?:value|money)) (?:will |would |also )?(?:increase[sd]?|rise[sd]?|go(?:es)? up)\b/i.test(
          answer,
        ) ||
        /\bcash balance (?:stays? the same|remains? (?:the same|unchanged))\b/i.test(answer) ||
        !/\b(?:stays? the same|remains? (?:the same|unchanged)|does(?:n't| not) change|unchanged)\b/i.test(
          answer,
        ))
    )
      return null;
    // Rejected clipped or unfinished text before displaying or caching it.
    const accepted =
      answer.length <= (conversational ? 1800 : 700) &&
      /[.!?]$/.test(answer) &&
      !/\*\*|[`]|^\s*(?:#|[-*] )/m.test(answer)
        ? answer
        : null;
    return accepted && conversational
      ? {
          answer: accepted,
          sources:
            briefing?.news?.map(({ title, url, published_at }) => ({ title, url, published_at })) ??
            [],
          marketStatus: briefing?.status ?? 'unavailable',
        }
      : accepted;
  }

  async function explain(topic, question, context, history = []) {
    if (typeof topic !== 'string' || !Object.hasOwn(topics, topic) || topics[topic].verifiedOnly)
      return null;
    if (
      question !== undefined &&
      (typeof question !== 'string' || !question.trim() || question.length > 400)
    ) {
      return null;
    }
    // Rejected oversized transcripts and role injection before allocating local inference.
    if (
      !Array.isArray(history) ||
      history.length > 6 ||
      history.some(
        (turn, index) =>
          !turn ||
          typeof turn.content !== 'string' ||
          !turn.content.trim() ||
          turn.content.length > (index % 2 === 0 ? 400 : 1800) ||
          turn.role !== (index % 2 === 0 ? 'user' : 'assistant') ||
          Object.keys(turn).some((key) => key !== 'role' && key !== 'content'),
      ) ||
      history.length % 2 !== 0 ||
      history.reduce((size, turn) => size + turn.content.length, 0) > 4000
    )
      return null;
    // Validated context according to the requested route before it was passed to Ollama.
    if (context !== undefined) {
      const valid =
        topic === 'conversation'
          ? validConversationContext(context)
          : topic === 'nextExperiment' && validContext(context);
      if (!valid) return null;
    }
    // Reused only stock explanations. User questions and contextual answers were never cached.
    const reusable =
      topic !== 'conversation' &&
      question === undefined &&
      context === undefined &&
      history.length === 0;
    const saved = reusable ? cache.get(topic) : undefined;
    if (saved && now() - saved.at < cacheTtl) return { answer: saved.answer, cached: true };
    const job = reusable ? topic : Symbol();
    if (pending.has(job)) return pending.get(job);
    // Coalesced stock requests and limited local inference to one job at a time.
    if (now() < cooldownUntil || pending.size) return null;
    // Bounded total inference work across clients as well as the per-client HTTP limit.
    if (now() - budgetStart >= 60000) {
      budgetStart = now();
      requestsInWindow = 0;
    }
    if (requestsInWindow >= 30) return null;
    requestsInWindow++;
    const run = (async () => {
      try {
        if ((await status()).enabled) {
          const answer = await generate(topic, question, context, history);
          if (answer) {
            if (reusable) cache.set(topic, { answer, at: now() });
            return typeof answer === 'string'
              ? { answer, cached: false }
              : { ...answer, cached: false };
          }
        }
      } catch {
        // Fell back to the reviewed guide after a timeout or runtime failure.
      }
      // Paused briefly after a model failure so repeated clicks could not trigger immediate retries.
      cooldownUntil = now() + 5000;
      return null;
    })();
    pending.set(job, run);
    try {
      return await run;
    } finally {
      pending.delete(job);
    }
  }

  return { status, explain };
}

module.exports = { createCoachService, coachModel: model, ollamaOrigin: origin };
