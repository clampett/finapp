import { dollars, money, totals, activeGraph } from '../common/finance';
import type { GraphData, View } from '../common/finance';
import type { Holding } from '../investing/portfolio';
import type { SavedRun } from '../history/run-store';

export type Tone = 'positive' | 'negative' | 'neutral';
export type PulsePoint = { value: number; label: string };
export type PulseChart =
  | { kind: 'line'; points: PulsePoint[] }
  | { kind: 'allocation'; segments: { label: string; value: number }[] }
  | { kind: 'nodes'; nodes: { id: string; type: string }[]; edges: { from: string; to: string }[] };
export interface PulseCard {
  id: string;
  kicker: string;
  title: string;
  value: string;
  detail: string;
  footnote: string;
  tone: Tone;
  view: View;
  chart?: PulseChart;
}
export interface PulseMarket {
  symbol: string;
  points: { date: string; close: number }[];
  stale: boolean;
}
export interface PulseContext {
  cashflow: 'surplus' | 'shortfall' | 'balanced' | 'unknown';
  concentration: 'high' | 'spread' | 'unknown';
  forecast: 'none' | 'downside_negative' | 'available';
}
const tone = (value: number): Tone => (value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral');
export const pulseDate = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(date.length === 10 ? date + 'T12:00:00Z' : date),
  );

// Combined repeated lots before ranking exposure; excluded missing prices rather than inventing valuations.
export function pulsePositions(holdings: Holding[]) {
  const lots = new Map<string, number>();
  for (const h of holdings) {
    const value = h.shares * (h.lastPrice ?? 0);
    if (
      /^[A-Z][A-Z0-9.-]{0,14}$/.test(h.symbol) &&
      h.shares > 0 &&
      Number.isFinite(value) &&
      value > 0
    )
      lots.set(h.symbol, (lots.get(h.symbol) ?? 0) + value);
  }
  return [...lots].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Rejected mismatched symbols, impossible quotes, and unordered provider history before charting.
export function readPulseMarket(body: unknown, symbol: string): PulseMarket | null {
  const b = body as {
    symbol?: string;
    period?: string;
    points?: { date: string; close: number }[];
    stale?: boolean;
  };
  if (
    !b ||
    b.symbol !== symbol ||
    b.period !== '1mo' ||
    !Array.isArray(b.points) ||
    b.points.length < 2 ||
    b.points.length > 1500
  )
    return null;
  if (
    b.points.some(
      (p, i) =>
        typeof p?.date !== 'string' ||
        !Number.isFinite(Date.parse(p.date)) ||
        !Number.isFinite(p.close) ||
        p.close <= 0 ||
        (i > 0 && Date.parse(p.date) <= Date.parse(b.points![i - 1].date)),
    )
  )
    return null;
  return { symbol, points: b.points, stale: b.stale === true };
}

// Derived qualitative AI context locally; omitted names, balances, share counts, and exact simulation results.
export function pulseContext(
  graph: GraphData | null,
  holdings: Holding[],
  run: SavedRun | null,
): PulseContext {
  const positions = pulsePositions(holdings),
    total = positions.reduce((s, p) => s + p.value, 0);
  const surplus = graph ? totals(graph).surplus : null;
  return {
    cashflow:
      surplus === null
        ? 'unknown'
        : surplus > 0
          ? 'surplus'
          : surplus < 0
            ? 'shortfall'
            : 'balanced',
    concentration: !total ? 'unknown' : positions[0].value / total >= 0.5 ? 'high' : 'spread',
    forecast: !run ? 'none' : run.summary.p10 < 0 ? 'downside_negative' : 'available',
  };
}

// Built every numeric signal from observed prices or an actual scenario snapshot; kept those sources distinct.
export function buildPulseCards(
  graph: GraphData | null,
  holdings: Holding[],
  markets: PulseMarket[],
  run: SavedRun | null,
): PulseCard[] {
  const cards: PulseCard[] = [];
  const positions = pulsePositions(holdings),
    total = positions.reduce((s, p) => s + p.value, 0);
  for (const market of markets) {
    if (!positions.some((p) => p.label === market.symbol)) continue;
    const first = market.points[0],
      last = market.points.at(-1)!,
      change = (last.close / first.close - 1) * 100;
    cards.push({
      id: `stock-${market.symbol}`,
      kicker: 'Your holdings · 1M',
      title: market.symbol,
      value: `${change > 0 ? '+' : ''}${change.toFixed(2)}%`,
      detail: `${change > 0 ? 'Up' : change < 0 ? 'Down' : 'Unchanged'} · ${dollars(last.close)} adjusted close`,
      footnote: `${pulseDate(first.date)}–${pulseDate(last.date)} · ${market.stale ? 'Cached' : 'Delayed prices'}`,
      tone: tone(change),
      view: 'investing',
      chart: {
        kind: 'line',
        points: market.points.map((p) => ({ value: p.close, label: p.date })),
      },
    });
  }
  if (total)
    cards.push({
      id: 'portfolio',
      kicker: 'Portfolio mix',
      title: 'Priced holdings',
      value: money(total, true),
      detail: `${Math.round((positions[0].value / total) * 100)}% in ${positions[0].label}`,
      footnote: `${positions.length} priced ${positions.length === 1 ? 'position' : 'positions'} · cached quotes`,
      tone: 'neutral',
      view: 'investing',
      chart: {
        kind: 'allocation',
        segments: [
          ...positions.slice(0, 3),
          ...(positions.length > 3
            ? [{ label: 'Other', value: positions.slice(3).reduce((s, p) => s + p.value, 0) }]
            : []),
        ],
      },
    });
  if (graph) {
    const live = activeGraph(graph),
      nodes = live.nodes.filter((n) => !n.disabled),
      ids = new Set(nodes.map((n) => n.id)),
      t = totals(graph);
    // Preserved actual connections in the mini-map instead of drawing fictitious cash-flow routes.
    const shown = nodes.slice(0, 5),
      shownIds = new Set(shown.map((n) => n.id));
    cards.push({
      id: 'scenario',
      kicker: 'Scenario signal',
      title: 'Monthly surplus',
      value: money(t.surplus, true),
      detail:
        t.surplus < 0
          ? 'Test how a smaller expense affects the gap.'
          : 'Try an expense-growth stress test.',
      footnote: `${nodes.length} active nodes · ${live.edges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)).length} routes`,
      tone: tone(t.surplus),
      view: 'graph',
      chart: {
        kind: 'nodes',
        nodes: shown.map((n) => ({ id: n.id, type: n.nodeType })),
        edges: live.edges
          .filter((e) => shownIds.has(e.sourceNodeId) && shownIds.has(e.targetNodeId))
          .map((e) => ({ from: e.sourceNodeId, to: e.targetNodeId })),
      },
    });
  }
  if (run) {
    const s = run.summary,
      points = run.result[s.kind] ?? [];
    cards.push({
      id: 'forecast',
      kicker: 'Saved forecast',
      title: `Median at ${s.years} years`,
      value: money(s.p50, true),
      detail: `Downside ${money(s.p10, true)} · Upside ${money(s.p90, true)}`,
      footnote: `Hypothetical · saved ${pulseDate(s.createdAt)}`,
      tone: 'neutral',
      view: 'history',
      chart: {
        kind: 'line',
        points: points.map((p) => ({ value: p.p50, label: `Year ${p.year}` })),
      },
    });
  }
  if (!cards.length)
    cards.push({
      id: 'start',
      kicker: 'Your next signal',
      title: 'Make it your own',
      value: 'Start exploring',
      detail: 'Add a holding or build a scenario to see your signals here.',
      footnote: 'Open Node Graph to begin',
      tone: 'neutral',
      view: 'graph',
    });
  return cards;
}
