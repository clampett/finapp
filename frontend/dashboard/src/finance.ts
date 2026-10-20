export const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8081/api/v1`;
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
}
export const money = (value: number, compact = false) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: compact ? 1 : 0, notation: compact ? 'compact' : 'standard' }).format(value);
export const types: NodeType[] = ['INCOME', 'CHECKING', 'SAVINGS', 'INVESTMENT', 'DEBT', 'EXPENSE'];
export const colors: Record<NodeType, string> = { INCOME: '#34d399', CHECKING: '#60a5fa', SAVINGS: '#22d3ee', INVESTMENT: '#a78bfa', DEBT: '#fb7185', EXPENSE: '#fbbf24' };
export const typeLabel = (type: NodeType) => type.charAt(0) + type.slice(1).toLowerCase();
export function debtPayment(node: GraphNode, graph: GraphData): number {
    if (node.amountOrBalance <= 0)
        return 0;
    if (node.minPayment != null)
        return node.minPayment;
    const edges = graph.edges.filter(e => e.targetNodeId === node.id && e.monthlyFixedFlow != null);
    return edges.length ? edges.reduce((sum, e) => sum + e.monthlyFixedFlow!, 0) : node.amountOrBalance * .02;
}
export function totals(graph: GraphData) {
    const sum = (types: NodeType[]) => graph.nodes.filter(n => types.includes(n.nodeType)).reduce((s, n) => s + n.amountOrBalance, 0);
    const income = sum(['INCOME']), expenses = sum(['EXPENSE']), debt = sum(['DEBT']);
    const assets = sum(['CHECKING', 'SAVINGS', 'INVESTMENT']);
    const payments = graph.nodes.filter(n => n.nodeType === 'DEBT').reduce((s, n) => s + debtPayment(n, graph), 0);
    return { income, expenses, debt, assets, payments, netWorth: assets - debt, surplus: income - expenses - payments };
}
// Validate database responses and imported drafts before rendering or calculating.
export function parseGraph(value: unknown): GraphData {
    const data = value as GraphData;
    if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges) || data.nodes.length > 200 || data.edges.length > 500)
        throw new Error('Use a FinApp JSON file with up to 200 accounts and 500 connections.');
    const number = (v: unknown, max: number) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > max)
        throw new Error('Amounts must be finite, nonnegative numbers within the supported range.'); return n; };
    const nodes = data.nodes.map(n => {
        if (['month', 'freed_cash_flow'].includes(String(n.id)) || n.id == null || !String(n.id) || String(n.id).length > 100 || !types.includes(n.nodeType) || typeof n.name !== 'string' || !n.name.trim() || n.name.length > 100)
            throw new Error('Each account needs a unique ID, name and supported type.');
        return { id: String(n.id), name: n.name.trim(), nodeType: n.nodeType, amountOrBalance: number(n.amountOrBalance, 1e12), interestRateApr: number(n.interestRateApr ?? 0, 100), ...(n.minPayment != null ? { minPayment: number(n.minPayment, 1e9) } : {}) };
    });
    const ids = new Set(nodes.map(n => n.id));
    if (ids.size !== nodes.length)
        throw new Error('Account IDs must be unique.');
    const edges = data.edges.map((e, i) => {
        const source = String(e.sourceNodeId), target = String(e.targetNodeId);
        if (!ids.has(source) || !ids.has(target) || source === target || (e.monthlyFixedFlow == null) === (e.percentageFlow == null))
            throw new Error('Each connection must join different existing accounts with an amount or percentage.');
        return { id: String(e.id ?? `edge-${i}`), sourceNodeId: source, targetNodeId: target, monthlyFixedFlow: e.monthlyFixedFlow == null ? null : number(e.monthlyFixedFlow, 1e9), percentageFlow: e.percentageFlow == null ? null : number(e.percentageFlow, 100) };
    });
    if (new Set(edges.map(e => e.id)).size !== edges.length)
        throw new Error('Connection IDs must be unique.');
    return { nodes, edges };
}
export function downloadJson(value: unknown, name: string) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
