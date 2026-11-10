import helpTopics from '../../coach-topics.json';
import { activeGraph, API_BASE, assumptionsFor, money, totals } from './finance';
import type { GraphData } from './finance';

export type CoachModel = 'monte_carlo' | 'markov';
export const coachModels = { monte_carlo: 'Monte Carlo', markov: 'Markov regime' } as const;

export const coachPresets = {
  expenses: {
    title: 'Higher expense growth',
    description: 'Raised annual expense growth by up to 2 percentage points.',
  },
  returns: {
    title: 'Lower market returns',
    description: 'Reduced the assumed annual return from 7% to 4%.',
  },
  fees: {
    title: 'Higher investment fees',
    description: 'Increased the annual investment fee from 0% to 1%.',
  },
} as const;
export type CoachPreset = keyof typeof coachPresets;

export const sampleScenario: GraphData = {
  nodes: [
    {
      id: 'pay',
      name: 'Monthly salary',
      nodeType: 'INCOME',
      amountOrBalance: 6000,
      interestRateApr: 0,
    },
    {
      id: 'bills',
      name: 'Living expenses',
      nodeType: 'EXPENSE',
      amountOrBalance: 3400,
      interestRateApr: 0,
    },
    {
      id: 'reserve',
      name: 'Cash reserve',
      nodeType: 'SAVINGS',
      amountOrBalance: 12000,
      interestRateApr: 2,
    },
    {
      id: 'investment',
      name: 'Investments',
      nodeType: 'INVESTMENT',
      amountOrBalance: 25000,
      interestRateApr: 0,
    },
  ],
  edges: [],
};

export function prepareCoachScenario(graph: GraphData): GraphData {
  // Excluded archived and disabled accounts together with their attached routes.
  return activeGraph({
    ...graph,
    nodes: graph.nodes.filter((node) => !node.disabled),
  });
}

export function coachChecks(graph: GraphData): string[] {
  const { income, surplus } = totals(graph);
  const checks: string[] = [];
  if (!income)
    checks.push(
      'No income is modeled. Add an income node if this scenario should include earnings.',
    );
  if (surplus <= 0) checks.push('The starting budget has no surplus for additional contributions.');
  if (
    graph.nodes.some(
      (node) => node.nodeType === 'DEBT' && node.amountOrBalance > 0 && !node.interestRateApr,
    )
  ) {
    checks.push('A debt has a zero APR. Check that this matches the loan terms.');
  }
  if (!graph.nodes.some((node) => node.nodeType === 'INVESTMENT')) {
    checks.push(
      'No starting investment account is modeled. The forecast can still invest future surplus.',
    );
  }
  return checks;
}

export function coachInputs(
  graph: GraphData,
  model: CoachModel,
  years: number,
  preset: CoachPreset,
  annualVolatility = 0.15,
) {
  const settings = assumptionsFor(graph);
  // Replaced workspace IDs and names with temporary labels before sending model inputs.
  const ids = new Map(graph.nodes.map(({ id }, index) => [id, `coach-node-${index + 1}`]));
  // Kept the scope to graph inputs. Excluded stock holdings, ledger records, and account identity.
  const baseline = {
    sim_type: model,
    years,
    market_source: 'manual',
    annual_return: 0.07,
    annual_volatility: annualVolatility,
    annual_fee: 0,
    inflation_rate: 0.025,
    target: 500000,
    investment_rate: 100,
    income_basis: settings.incomeBasis,
    tax_rate: settings.taxRate / 100,
    income_growth: settings.incomeGrowth / 100,
    expense_growth: settings.expenseGrowth / 100,
    nodes: graph.nodes.map((node) => ({
      id: ids.get(node.id),
      name: ids.get(node.id),
      type: node.nodeType,
      balance: node.amountOrBalance,
      apr: node.interestRateApr,
      frequency: node.frequency,
      interval_count: node.intervalCount,
      min_payment: node.minPayment,
    })),
    edges: graph.edges.map((edge) => ({
      source: ids.get(edge.sourceNodeId),
      target: ids.get(edge.targetNodeId),
      monthly_fixed_flow: edge.monthlyFixedFlow,
      percentage_flow: edge.percentageFlow,
    })),
  };
  // Held every input constant except the selected stress assumption.
  const field =
    preset === 'expenses'
      ? 'expense_growth'
      : preset === 'returns'
        ? 'annual_return'
        : 'annual_fee';
  const adjusted =
    preset === 'expenses'
      ? Math.min(0.25, baseline.expense_growth + 0.02)
      : preset === 'returns'
        ? 0.04
        : 0.01;
  const percent = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
  return {
    baseline,
    preset,
    stress: { ...baseline, [field]: adjusted },
    before: percent(baseline[field]),
    after: percent(adjusted),
    changed: baseline[field] !== adjusted,
  };
}

interface Outcome {
  downside: number;
  median: number;
  targetChance: number;
}
export interface CoachComparison {
  baseline: Outcome;
  stress: Outcome;
  label: string;
  preset: CoachPreset;
  years: number;
}

async function runForecast(
  payload: ReturnType<typeof coachInputs>['baseline'],
  signal: AbortSignal,
): Promise<Outcome> {
  const response = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok)
    throw new Error(
      'The forecast service could not run this scenario. Check that FinApp’s Python service is running.',
    );
  const data = await response.json();
  const final = data?.[payload.sim_type]?.at(-1);
  const chance = data?.summary?.probability_target;
  // Accepted only the selected horizon and finite metrics from the current model contract.
  if (
    data?.status !== 'success' ||
    data.model_version !== 3 ||
    final?.year !== payload.years ||
    ![final?.p10, final?.p50, chance].every(Number.isFinite) ||
    chance < 0 ||
    chance > 1
  ) {
    throw new Error('The forecast service returned an incomplete comparison.');
  }
  return { downside: final.p10, median: final.p50, targetChance: chance };
}

export async function runCoachComparison(
  inputs: ReturnType<typeof coachInputs>,
  label: string,
  signal: AbortSignal,
): Promise<CoachComparison> {
  // Matched the model and its fixed random seed across both runs.
  const [baseline, stress] = await Promise.all([
    runForecast(inputs.baseline, signal),
    runForecast(inputs.stress, signal),
  ]);
  return { baseline, stress, label, preset: inputs.preset, years: inputs.baseline.years };
}

export type CoachTopic = keyof typeof helpTopics;

const topicIds = Object.keys(helpTopics) as CoachTopic[];
const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const termSets = topicIds.map((id) => new Set(tokens(helpTopics[id].terms)));
const vocabulary = [...new Set(termSets.flatMap((terms) => [...terms]))];
const weights = vocabulary.map(
  (term) =>
    1 + Math.log((1 + topicIds.length) / (1 + termSets.filter((terms) => terms.has(term)).length)),
);

// Normalized each weighted row so cosine ranking did not favor longer help topics.
function unitRow(terms: Set<string>): number[] {
  const row = vocabulary.map((term, index) => (terms.has(term) ? weights[index] : 0));
  const norm = Math.hypot(...row);
  return norm ? row.map((value) => value / norm) : row;
}
const topicMatrix = termSets.map(unitRow);

export function matchCoachTopic(question: string): CoachTopic | undefined {
  const query = unitRow(new Set(tokens(question)));
  // Multiplied the topic matrix by the normalized query vector and rejected weak matches.
  const scores = topicMatrix.map((row) =>
    row.reduce((score, value, index) => score + value * query[index], 0),
  );
  const best = Math.max(...scores);
  return best >= 0.24 ? topicIds[scores.indexOf(best)] : undefined;
}

export function asksAboutComparison(question: string): boolean {
  // Required a reference to a run or an explicit follow-up before reading scenario results.
  return (
    /\b(my|our|this|these|the) (comparison|results|forecast results|stress test results)\b/i.test(
      question,
    ) ||
    /^what changed[?!. ]*$/i.test(question.trim()) ||
    /\b(compare|difference between) (the )?(baseline and (the )?stress case|two forecasts)\b/i.test(
      question,
    )
  );
}

function asksForNextStep(question: string): boolean {
  return /\b(what (?:should|can) i (?:do|try) next|next steps?|how (?:do|can|should|will) i (?:use|interpret|apply|act on)|how (?:do|can|should|will) i know how to use|how (?:is|are) (?:this|these results|the comparison) useful|what (?:can|should) i do with|(?:useful|meaningful|actionable))\b/i.test(
    question,
  );
}

function isGreeting(question: string): boolean {
  return /^(?:(?:hel+o+|hiya|hi|hey)(?:[ ,!]+how are you)?|how are you)[?.! ]*$/i.test(
    question.trim(),
  );
}

const experimentByPreset: Record<CoachPreset, string> = {
  expenses:
    'Try a smaller expense-growth increase in the simulator, or use a shorter horizon to see when higher expenses start to matter.',
  returns:
    'Try an annual return between the baseline and stress values, keeping volatility fixed, to see how sensitive the result is to the return assumption.',
  fees: 'Try a fee between the baseline and stress values, keeping the return assumption fixed, to isolate how fees compound.',
};

function readsExistingResult(question: string): boolean {
  return /\b(interpret (?:this|the|my|our|these) (?:comparison|results|forecast)|which (?:downside )?metric|what metric|pick (?:one |a )?metric|metric to watch|read (?:this|the|my) (?:comparison|results))\b/i.test(
    question,
  );
}

function comparisonGuidance(comparison: CoachComparison | null, question: string): string {
  if (!comparison) {
    return 'Start with a question you want the forecast to answer, like “Would my plan still reach its target if expenses grew faster?” Pick a horizon that matches the goal and run one stress test. Then check whether the median, downside (P10), or target chance changed enough to matter to that goal.';
  }
  const { baseline, stress, label, preset, years } = comparison;
  if (readsExistingResult(question)) {
    if (
      /\b(downside|p10|weaker outcome)\b/i.test(question) ||
      (baseline.downside >= 0 && stress.downside < 0)
    ) {
      return `**Watch this metric.** Compare Downside ending net worth (P10), from ${money(baseline.downside)} to ${money(stress.downside)}. About one in ten modeled outcomes falls below P10 at the selected horizon.`;
    }
    return `**Watch this metric.** Compare Chance of reaching the target, from ${(baseline.targetChance * 100).toFixed(1)}% to ${(stress.targetChance * 100).toFixed(1)}%. It shows how often modeled paths reached the same target in each case.`;
  }
  // Turned the results into a next experiment while keeping forecasts conditional on their inputs.
  const finding =
    stress.downside < 0 && baseline.downside >= 0
      ? `Under “${label},” the downside (P10) crosses below zero, from ${money(baseline.downside)} to ${money(stress.downside)}. That’s a useful signal to check when the shortfall appears.`
      : `Use “${label}” to check how much the plan depends on that assumption. Compare the target chance (${(baseline.targetChance * 100).toFixed(1)}% → ${(stress.targetChance * 100).toFixed(1)}%) and P10 (${money(baseline.downside)} → ${money(stress.downside)}) against the risk you want to explore.`;
  const horizon =
    years >= 30
      ? `\n\n**Check the time frame.** A ${years}-year result compounds changes for a long time. Rerun at 10 or 20 years and see whether the same issue shows up sooner.`
      : '';
  const next =
    experimentByPreset[preset] ??
    'Change one assumption and rerun over the same horizon to see what drove the result.';
  return `**What to look at.** ${finding}${horizon}\n\n**Next experiment.** ${next}`;
}

function asksForTradeAdvice(question: string): boolean {
  return (
    /\bguaranteed? (profit|returns?)\b/i.test(question) ||
    /\b(which|what) (stock|fund|etf|stocks|funds|etfs) should i (buy|sell)\b/i.test(question)
  );
}

export function coachTopicForModel(question: string): CoachTopic | undefined {
  if (
    asksAboutComparison(question) ||
    asksForTradeAdvice(question) ||
    asksForNextStep(question) ||
    isGreeting(question)
  )
    return undefined;
  const topic = matchCoachTopic(question);
  // Reserved exact product behavior and core financial definitions for verified answers.
  return topic && !('verifiedOnly' in helpTopics[topic]) ? topic : undefined;
}

interface CoachModelRequest {
  topic: CoachTopic;
  question: string;
  context?: {
    preset: CoachPreset;
    years: number;
    downsideCrossedZero: boolean;
    targetChanceFell: boolean;
  };
}

export function coachRequestForQuestion(
  question: string,
  comparison: CoachComparison | null,
): CoachModelRequest | undefined {
  if (asksForTradeAdvice(question) || isGreeting(question)) return undefined;
  if (asksForNextStep(question) || readsExistingResult(question)) {
    // Shared only qualitative result signals and the experiment settings with Ollama.
    return {
      topic: 'nextExperiment',
      question,
      context: comparison
        ? {
            preset: comparison.preset,
            years: comparison.years,
            downsideCrossedZero:
              comparison.baseline.downside >= 0 && comparison.stress.downside < 0,
            targetChanceFell: comparison.stress.targetChance < comparison.baseline.targetChance,
          }
        : undefined,
    };
  }
  const topic = coachTopicForModel(question);
  return topic ? { topic, question } : undefined;
}

export async function liveCoachReply(input: CoachModelRequest, signal: AbortSignal) {
  // Sent the selected question and limited context through the local gateway.
  const response = await fetch('/api/v1/coach/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.answer === 'string' && body.answer ? body.answer : null;
}

export function coachReply(question: string, comparison: CoachComparison | null): string {
  if (asksForTradeAdvice(question)) {
    return 'FinApp can help you compare scenarios and understand risk. It cannot recommend what to buy or sell or promise a return.';
  }
  if (isGreeting(question)) {
    return 'Hey! I’m here to help you make sense of your FinApp forecasts. Want to pick a stress test or figure out what to do with a result?';
  }
  if (asksForNextStep(question) || readsExistingResult(question))
    return comparisonGuidance(comparison, question);
  // Routed supported questions to FinApp explanations and read only the current comparison metrics.
  if (asksAboutComparison(question)) {
    if (!comparison)
      return 'Run a comparison first. Then ask what changed to see the effect on the median and downside outcomes.';
    const delta = comparison.stress.median - comparison.baseline.median;
    const points = (comparison.stress.targetChance - comparison.baseline.targetChance) * 100;
    const median =
      delta === 0
        ? 'stayed the same'
        : `was ${money(Math.abs(delta))} ${delta < 0 ? 'lower' : 'higher'}`;
    return `After ${comparison.years} years, median ending net worth ${median} under “${comparison.label}.” The stressed downside (P10) was ${money(comparison.stress.downside)}. The modeled target chance changed by ${points.toFixed(1)} percentage points.`;
  }
  const topic = matchCoachTopic(question);
  if (topic === 'percentiles') {
    // Answered a single percentile directly when the question named only one.
    const named = new Set(question.toLowerCase().match(/\bp(?:10|50|90)\b/g));
    if (named.size === 1) {
      if (named.has('p10'))
        return 'P10 is the 10th percentile. About one in ten modeled outcomes falls below it at that forecast year.';
      if (named.has('p50'))
        return 'P50 is the median. About half of modeled outcomes fall below it and half above it at that forecast year.';
      if (named.has('p90'))
        return 'P90 is the 90th percentile. About nine in ten modeled outcomes fall below it at that forecast year.';
    }
  }
  return (
    (topic && helpTopics[topic].guide) ||
    'I can help with FinApp forecasts, percentiles, cash flow, debt strategies, inflation, and privacy. Try “What is P10?” or “What changed in my comparison?”'
  );
}
