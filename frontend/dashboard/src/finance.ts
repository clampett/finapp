export const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';
export type NodeType = 'INCOME' | 'CHECKING' | 'SAVINGS' | 'INVESTMENT' | 'DEBT' | 'EXPENSE';
export type SimulationType = 'monte_carlo' | 'markov' | 'debt';
export type View = 'overview' | 'graph' | 'budgeting' | 'investing';
export interface GraphNode {
  id: string;
  name: string;
  nodeType: NodeType;
  amountOrBalance: number;
  interestRateApr: number;
  minPayment?: number;
}
export interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  monthlyFixedFlow: number | null;
  percentageFlow: number | null;
}
export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  assumptions?: ScenarioAssumptions;
}
export interface ScenarioAssumptions {
  incomeBasis: 'gross' | 'net';
  taxRate: number;
  incomeGrowth: number;
  expenseGrowth: number;
}
export const defaultAssumptions: ScenarioAssumptions = {
  incomeBasis: 'gross',
  taxRate: 20,
  incomeGrowth: 2.5,
  expenseGrowth: 2.5,
};
export const assumptionsFor = (graph: GraphData): ScenarioAssumptions => ({
  ...defaultAssumptions,
  ...graph.assumptions,
});
export const dollars = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export function allocations(graph: GraphData, surplus: number, rate = 0) {
  let fixedInvestment = 0,
    fixedSavings = 0,
    percentInvestment = 0,
    percentSavings = 0;
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  // Mirrored Python's allocation order so the visible budget and the forecast
  // funded fixed transfers before percentages and discretionary investing.
  for (const edge of graph.edges) {
    const source = nodes.get(edge.sourceNodeId),
      target = nodes.get(edge.targetNodeId);
    if (!source || !target || !['INCOME', 'CHECKING'].includes(source.nodeType)) continue;
    if (target.nodeType === 'INVESTMENT') {
      fixedInvestment += edge.monthlyFixedFlow ?? 0;
      percentInvestment += edge.percentageFlow ?? 0;
    } else if (target.nodeType === 'SAVINGS') {
      fixedSavings += edge.monthlyFixedFlow ?? 0;
      percentSavings += edge.percentageFlow ?? 0;
    }
  }
  const available = Math.max(0, surplus),
    fixed = fixedInvestment + fixedSavings;
  const fixedScale = fixed ? Math.min(1, available / fixed) : 0;
  const afterFixed = Math.max(0, available - fixed * fixedScale);
  const percentScale = 1 / Math.max(100, percentInvestment + percentSavings);
  const plannedInvestment =
    fixedInvestment * fixedScale + afterFixed * percentInvestment * percentScale;
  const plannedSavings = fixedSavings * fixedScale + afterFixed * percentSavings * percentScale;
  const unassigned = Math.max(0, available - plannedInvestment - plannedSavings);
  return {
    plannedInvestment,
    plannedSavings,
    unassigned,
    investment: plannedInvestment + (unassigned * rate) / 100,
    cash: plannedSavings + unassigned * (1 - rate / 100),
    overcommitted: fixed > available || percentInvestment + percentSavings > 100,
  };
}
export const money = (value: number, compact = false) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value);
export const types: NodeType[] = ['INCOME', 'CHECKING', 'SAVINGS', 'INVESTMENT', 'DEBT', 'EXPENSE'];
export const colors: Record<NodeType, string> = {
  INCOME: '#34d399',
  CHECKING: '#60a5fa',
  SAVINGS: '#22d3ee',
  INVESTMENT: '#a78bfa',
  DEBT: '#fb7185',
  EXPENSE: '#fbbf24',
};
export const typeLabel = (type: NodeType) => type.charAt(0) + type.slice(1).toLowerCase();
export function debtPayment(node: GraphNode, graph: GraphData): number {
  // Matched Python's payment precedence: node override, fixed incoming flows,
  // then 2% of principal. Explicit zero payments were retained as valid choices.
  if (node.amountOrBalance <= 0) return 0;
  const payoff = node.amountOrBalance * (1 + node.interestRateApr / 1200);
  if (node.minPayment != null) return Math.min(node.minPayment, payoff);
  const edges = graph.edges.filter((e) => e.targetNodeId === node.id && e.monthlyFixedFlow != null);
  return Math.min(
    payoff,
    edges.length
      ? edges.reduce((sum, e) => sum + e.monthlyFixedFlow!, 0)
      : node.amountOrBalance * 0.02,
  );
}
export function totals(graph: GraphData) {
  // Kept monthly flows separate from point-in-time balances. Loan minimums were
  // deducted once from surplus, while total debt reduced net worth separately.
  const sum = (types: NodeType[]) =>
    graph.nodes
      .filter((n) => types.includes(n.nodeType))
      .reduce((s, n) => s + n.amountOrBalance, 0);
  const income = sum(['INCOME']),
    expenses = sum(['EXPENSE']),
    debt = sum(['DEBT']);
  const assets = sum(['CHECKING', 'SAVINGS', 'INVESTMENT']);
  const payments = graph.nodes
    .filter((n) => n.nodeType === 'DEBT')
    .reduce((s, n) => s + debtPayment(n, graph), 0);
  // Applied the saved gross/net choice everywhere rather than silently giving
  // the overview and simulation different disposable-income formulas.
  const settings = assumptionsFor(graph);
  const taxes = settings.incomeBasis === 'gross' ? (income * settings.taxRate) / 100 : 0;
  const takeHome = income - taxes;
  const surplus = takeHome - expenses - payments;
  return {
    income,
    expenses,
    debt,
    assets,
    payments,
    netWorth: assets - debt,
    taxes,
    takeHome,
    surplus,
    ...allocations(graph, surplus),
  };
}
// Validate database responses and imported drafts before rendering or calculating.
export function parseGraph(value: unknown): GraphData {
  // Treated imported JSON and server data as untrusted input before either was
  // passed to the canvas, financial summaries, or Python simulation payload.
  const data = value as GraphData;
  if (
    !data ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    data.nodes.length > 200 ||
    data.edges.length > 500
  )
    throw new Error('Use a FinApp JSON file with up to 200 accounts and 500 connections.');
  const number = (v: unknown, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max)
      throw new Error('Amounts must be finite, nonnegative numbers within the supported range.');
    return n;
  };
  const nodes = data.nodes.map((n) => {
    if (
      ['month', 'freed_cash_flow'].includes(String(n.id)) ||
      n.id == null ||
      !String(n.id) ||
      String(n.id).length > 100 ||
      !types.includes(n.nodeType) ||
      typeof n.name !== 'string' ||
      !n.name.trim() ||
      n.name.length > 100
    )
      throw new Error('Each account needs a unique ID, name and supported type.');
    return {
      id: String(n.id),
      name: n.name.trim(),
      nodeType: n.nodeType,
      amountOrBalance: number(n.amountOrBalance, 1e12),
      interestRateApr: number(n.interestRateApr ?? 0, 100),
      ...(n.minPayment != null ? { minPayment: number(n.minPayment, 1e9) } : {}),
    };
  });
  const ids = new Set(nodes.map((n) => n.id));
  if (ids.size !== nodes.length) throw new Error('Account IDs must be unique.');
  const edges = data.edges.map((e, i) => {
    const source = String(e.sourceNodeId),
      target = String(e.targetNodeId);
    if (
      !ids.has(source) ||
      !ids.has(target) ||
      source === target ||
      (e.monthlyFixedFlow == null) === (e.percentageFlow == null)
    )
      throw new Error(
        'Each connection must join different existing accounts with an amount or percentage.',
      );
    return {
      id: String(e.id ?? `edge-${i}`),
      sourceNodeId: source,
      targetNodeId: target,
      monthlyFixedFlow: e.monthlyFixedFlow == null ? null : number(e.monthlyFixedFlow, 1e9),
      percentageFlow: e.percentageFlow == null ? null : number(e.percentageFlow, 100),
    };
  });
  if (new Set(edges.map((e) => e.id)).size !== edges.length)
    throw new Error('Connection IDs must be unique.');
  const assumptions = assumptionsFor(data);
  if (
    !['gross', 'net'].includes(assumptions.incomeBasis) ||
    !Number.isFinite(assumptions.taxRate) ||
    assumptions.taxRate < 0 ||
    assumptions.taxRate > 60 ||
    !Number.isFinite(assumptions.incomeGrowth) ||
    assumptions.incomeGrowth < -50 ||
    assumptions.incomeGrowth > 25 ||
    !Number.isFinite(assumptions.expenseGrowth) ||
    assumptions.expenseGrowth < -25 ||
    assumptions.expenseGrowth > 25
  ) {
    throw new Error('Use a valid income basis and supported tax and growth percentages.');
  }
  return { nodes, edges, assumptions };
}
export function downloadJson(value: unknown, name: string) {
  // Released the temporary download URL after the browser had started reading
  // it, avoiding retained Blob memory after repeated scenario exports.
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
