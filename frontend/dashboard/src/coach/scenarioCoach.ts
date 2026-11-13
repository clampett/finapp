import helpTopics from '../../../server/coach/data/coach-topics.json';
import { activeGraph, API_BASE, assumptionsFor, money, totals } from '../common/finance';
import type { GraphData } from '../common/finance';

export type CoachModel = 'monte_carlo' | 'markov';
export const coachModels = { monte_carlo: 'Monte Carlo', markov: 'Markov regime' } as const;

// Shared the supported stress choices with the model gateway.
export { default as coachPresets } from '../../../server/coach/data/coach-options.json';
import coachPresets from '../../../server/coach/data/coach-options.json';
export interface CoachSettings {
  annualReturn: number;
  inflation: number;
  fee: number;
  target: number;
  investmentRate: number;
  intensity: number;
}
export const defaultCoachSettings: CoachSettings = {
  annualReturn: 0.07,
  inflation: 0.025,
  fee: 0,
  target: 500000,
  investmentRate: 100,
  intensity: 1,
};
export type CoachPreset = keyof typeof coachPresets;

// Supplied synthetic inputs so the coach opened without reading the user's graph.
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
  // Derived the readiness checks from the same budget totals used by the dashboard.
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
  options: Partial<CoachSettings> = {},
) {
  const settings = assumptionsFor(graph);
  const controls = { ...defaultCoachSettings, ...options };
  // Replaced workspace IDs and names with temporary labels before sending model inputs.
  const ids = new Map(graph.nodes.map(({ id }, index) => [id, `coach-node-${index + 1}`]));
  // Kept the scope to graph inputs. Excluded stock holdings, ledger records, and account identity.
  // Converted scenario percentages to fractions for the Python simulation API.
  const baseline = {
    sim_type: model,
    years,
    market_source: 'manual',
    annual_return: controls.annualReturn,
    annual_volatility: annualVolatility,
    annual_fee: controls.fee,
    inflation_rate: controls.inflation,
    target: controls.target,
    investment_rate: controls.investmentRate,
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
  const choice = coachPresets[preset];
  type StressField =
    | 'expense_growth'
    | 'annual_return'
    | 'annual_fee'
    | 'annual_volatility'
    | 'income_growth'
    | 'investment_rate'
    | 'inflation_rate';
  const field = choice.field as StressField;
  // Applied the selected intensity to exactly one input and respected Python's validation limits.
  // Rounded decimal stress inputs before comparing them with the baseline.
  const adjusted = Number(
    Math.min(
      choice.max,
      Math.max(choice.min, baseline[field] + choice.delta * controls.intensity),
    ).toFixed(8),
  );
  const percent = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 2 }).format(value);
  return {
    baseline,
    preset,
    stress: { ...baseline, [field]: adjusted },
    before: percent(field === 'investment_rate' ? baseline[field] / 100 : baseline[field]),
    after: percent(field === 'investment_rate' ? adjusted / 100 : adjusted),
    changed: baseline[field] !== adjusted,
  };
}

export interface CoachPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
}
interface Outcome {
  downside: number;
  median: number;
  targetChance: number;
  path?: CoachPoint[];
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
  // Kept the actual yearly percentile points for interactive comparison charts.
  const path = data[payload.sim_type].filter((point: CoachPoint) =>
    [point.year, point.p10, point.p50, point.p90].every(Number.isFinite),
  );
  return { downside: final.p10, median: final.p50, targetChance: chance, path };
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

// Excluded the internal experiment prompt because it has no searchable terms.
const topicIds = (Object.keys(helpTopics) as CoachTopic[]).filter((id) => helpTopics[id].terms);
const tokens = (text: string) => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
// Tokenized each topic into unique terms so repeated words did not inflate its score.
const termSets = topicIds.map((id) => new Set(tokens(helpTopics[id].terms)));
// Assigned one shared matrix column to each distinct term.
const vocabulary = [...new Set(termSets.flatMap((terms) => [...terms]))];
// Weighted rare terms more heavily using smoothed inverse document frequency.
const weights = vocabulary.map(
  (term) =>
    1 + Math.log((1 + topicIds.length) / (1 + termSets.filter((terms) => terms.has(term)).length)),
);

// Normalized each weighted row so cosine ranking did not favor longer help topics.
function unitRow(terms: Set<string>): number[] {
  // Encoded present terms with their weights and absent terms with zeros.
  const row = vocabulary.map((term, index) => (terms.has(term) ? weights[index] : 0));
  // Scaled each nonzero row to unit length and preserved the zero row for unknown text.
  const norm = Math.hypot(...row);
  return norm ? row.map((value) => value / norm) : row;
}
// Precomputed the normalized topic rows once per module load.
const topicMatrix = termSets.map(unitRow);

export function matchCoachTopic(question: string): CoachTopic | undefined {
  // Projected the question into the same weighted vocabulary as the topic rows.
  const query = unitRow(new Set(tokens(question)));
  // Multiplied the topic matrix by the normalized query vector and rejected weak matches.
  const scores = topicMatrix.map((row) =>
    row.reduce((score, value, index) => score + value * query[index], 0),
  );
  // Selected the strongest match only when its cosine score cleared the minimum.
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
  volatility:
    'Keep returns fixed and vary volatility to explore the spread between weaker and stronger outcomes.',
  income:
    'Keep expense growth fixed and vary income growth to explore how the monthly surplus changes.',
  contributions:
    'Vary the share of unallocated surplus invested while keeping the budget unchanged.',
  inflation: 'Compare purchasing power at different inflation rates using the same horizon.',
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
  // Answered interpretation questions from the current table even when Ollama was unavailable.
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

function asksAboutBuyingMoreStock(question: string): boolean {
  return /\b(?:buy(?:ing)?|add(?:ing)?)\s+(?:more|extra|additional)\s+(?:[\d,.]+\s+)?(?:stocks?|shares?)\b|\binvest(?:ing)?\s+more\s+in\s+stocks?\b/i.test(
    question,
  );
}

export function coachTopicForModel(question: string): CoachTopic | undefined {
  if (
    asksAboutComparison(question) ||
    asksForTradeAdvice(question) ||
    asksAboutBuyingMoreStock(question) ||
    asksForNextStep(question) ||
    isGreeting(question)
  )
    return undefined;
  const topic = matchCoachTopic(question);
  // Reserved exact product behavior and core financial definitions for verified answers.
  return topic && !('verifiedOnly' in helpTopics[topic]) ? topic : undefined;
}

type ComparisonContext = {
  preset: CoachPreset;
  years: number;
  downsideCrossedZero: boolean;
  targetChanceFell: boolean;
};

export interface CoachTurn {
  role: 'user' | 'assistant';
  content: string;
}
export interface CoachModelRequest {
  topic: 'conversation';
  question: string;
  context: {
    subject: CoachTopic;
    comparison?: ComparisonContext;
    settings?: { preset: CoachPreset; years: number };
    market?: boolean;
  };
  history?: CoachTurn[];
}
export interface CoachAnswer {
  answer: string;
  sources?: { title: string; url: string; published_at: string }[];
  marketStatus?: string;
}

function asksForClarification(question: string): boolean {
  return /^(?:i do(?:n['’]?t| not) understand(?: (?:this|that|it))?|(?:can you )?explain (?:this|that|it|more)(?: (?:again|in detail|in simpler terms))?|what does (?:this|that|it) mean|(?:can you )?give me an example)[?!. ]*$/i.test(
    question.trim(),
  );
}

export function coachConversationSubject(
  question: string,
  previousSubject?: CoachTopic,
  comparison: CoachComparison | null = null,
): CoachTopic | undefined {
  // Carried forward the last substantive topic without forwarding previous messages or answers.
  // Added bounded conversation history separately in useCoachChat without including dashboard result summaries.
  if (isGreeting(question)) return undefined;
  if (asksForClarification(question))
    return previousSubject ?? (comparison ? 'comparison' : undefined);
  if (asksAboutBuyingMoreStock(question)) return 'stockExposure';
  if (asksAboutComparison(question) || readsExistingResult(question)) return 'comparison';
  if (asksForNextStep(question)) return 'nextExperiment';
  return matchCoachTopic(question);
}

// Shared only qualitative result signals and the experiment settings with Ollama.
function comparisonContext(comparison: CoachComparison): ComparisonContext {
  return {
    preset: comparison.preset,
    years: comparison.years,
    downsideCrossedZero: comparison.baseline.downside >= 0 && comparison.stress.downside < 0,
    targetChanceFell: comparison.stress.targetChance < comparison.baseline.targetChance,
  };
}

export function coachRequestForQuestion(
  question: string,
  comparison: CoachComparison | null,
  previousSubject?: CoachTopic,
): CoachModelRequest {
  const subject = coachConversationSubject(question, previousSubject, comparison) ?? 'conversation';
  // Routed greetings, verified topics, and unmatched questions through local inference first.
  // Routed every question to free-form local generation while retaining a reviewed factual reference.
  return {
    topic: 'conversation',
    question,
    context: {
      subject,
      ...((subject === 'comparison' || subject === 'nextExperiment') && comparison
        ? { comparison: comparisonContext(comparison) }
        : {}),
    },
  };
}

export async function liveCoachReply(input: CoachModelRequest, signal: AbortSignal) {
  // Sent the selected question and limited context through the local gateway.
  const response = await fetch('/api/v1/coach/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (response.status === 429) {
    throw new Error('You’ve sent several questions quickly. Please wait a minute and try again.');
  }
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.answer === 'string' && body.answer ? (body as CoachAnswer) : null;
}

export function coachReply(
  question: string,
  comparison: CoachComparison | null,
  previousSubject?: CoachTopic,
): string {
  if (asksForTradeAdvice(question)) {
    return 'FinApp can help you compare scenarios and understand risk. It cannot recommend what to buy or sell or promise a return.';
  }
  if (asksForClarification(question)) {
    const subject = coachConversationSubject(question, previousSubject, comparison);
    if (subject === 'stockExposure') {
      return 'Say you have $100 in cash and use $20 to buy stock. You now have $80 in cash and $20 in stock. You still have $100 before fees. If the stock falls to $15, your total falls to $95. In FinApp, you can try that same $20 shift between cash and investments in Node Graph.';
    }
    if (subject === 'comparison') {
      if (!comparison) return coachReply('What changed in my comparison?', null);
      return `${coachReply('What changed in my comparison?', comparison)}\n\nP50 is the middle modeled result. P10 shows a weaker outcome, with about one in ten modeled paths ending below it. The target chance tells you how often each case reached the goal.`;
    }
    return subject ? helpTopics[subject].guide : 'Which part should I explain in more detail?';
  }
  // Explained the exposure change using the graph balances actually read by AI Coach.
  if (asksAboutBuyingMoreStock(question)) {
    return 'If you use cash to buy more stock, your starting net worth stays the same before fees, but more of your money moves with the market. Gains and losses can both get larger.\n\n**Try a what-if.** In Node Graph, move the same amount from a cash balance to an investment balance. Load a fresh scenario copy in AI Coach and rerun with the same settings. Compare the baseline P10 before and after the change to see what happened to the modeled downside. AI Coach uses the graph balances, so changing shares in Investments won’t update this comparison.';
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
    // Calculated exact differences locally from the validated baseline and stress results.
    const delta = comparison.stress.median - comparison.baseline.median;
    const points = (comparison.stress.targetChance - comparison.baseline.targetChance) * 100;
    const median =
      delta === 0
        ? 'stayed the same'
        : `was ${money(Math.abs(delta))} ${delta < 0 ? 'lower' : 'higher'}`;
    const target =
      points === 0
        ? 'stayed the same'
        : `${points < 0 ? 'fell' : 'rose'} by ${Math.abs(points).toFixed(1)} percentage points`;
    return `After ${comparison.years} years, median ending net worth ${median} under “${comparison.label}.” The stressed downside (P10) was ${money(comparison.stress.downside)}. The modeled target chance ${target}.`;
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
