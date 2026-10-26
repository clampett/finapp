import { activeGraph } from './finance';
import type { GraphData, GraphNode } from './finance';
export type CanvasTool = 'select' | 'pan' | 'box' | 'connect';

export function removeSelection(graph: GraphData, nodeIds: string[], edgeIds: string[]): GraphData {
  // Archived selected accounts in one action; retained their attached routes
  // for restoration unless a route had also been explicitly selected for deletion.
  const nodes = new Set(nodeIds),
    edges = new Set(edgeIds);
  return {
    ...graph,
    nodes: graph.nodes.map((node) => (nodes.has(node.id) ? { ...node, archived: true } : node)),
    edges: graph.edges.filter((edge) => !edges.has(edge.id)),
  };
}

export function placeNewNode(nodes: GraphNode[], center: { x: number; y: number }) {
  // Searched outward from the visible center without moving existing accounts;
  // reserved roomy-card dimensions plus clearance even in the compact view.
  const width = 230,
    height = 104,
    gap = 28;
  const origin = {
    x: Math.max(-99000, Math.min(99000, center.x)) - width / 2,
    y: Math.max(-99000, Math.min(99000, center.y)) - height / 2,
  };
  for (let ring = 0; ring <= nodes.length + 1; ring++) {
    const offsets: { x: number; y: number }[] = [];
    for (let x = -ring; x <= ring; x++)
      for (let y = -ring; y <= ring; y++)
        if (Math.max(Math.abs(x), Math.abs(y)) === ring) offsets.push({ x, y });
    offsets.sort(
      (a, b) =>
        Math.hypot(a.x * (width + gap), a.y * (height + gap)) -
        Math.hypot(b.x * (width + gap), b.y * (height + gap)),
    );
    for (const offset of offsets) {
      const position = {
        x: origin.x + offset.x * (width + gap),
        y: origin.y + offset.y * (height + gap),
      };
      if (
        nodes.every(
          (node) =>
            node.archived ||
            !node.position ||
            position.x + width + gap <= node.position.x ||
            node.position.x + width + gap <= position.x ||
            position.y + height + gap <= node.position.y ||
            node.position.y + height + gap <= position.y,
        )
      )
        return position;
    }
  }
  return origin;
}

export type GraphHistory = { past: GraphData[]; present: GraphData; future: GraphData[] };
export const newHistory = (graph: GraphData): GraphHistory => ({
  past: [],
  present: graph,
  future: [],
});
export function recordGraph(history: GraphHistory, graph: GraphData): GraphHistory {
  if (JSON.stringify(history.present) === JSON.stringify(graph)) return history;
  // Bounded full-scenario snapshots to 100 actions; discarded redo only after
  // a new edit so amounts, routes, layout, and recoverable removals traveled together.
  return { past: [...history.past, history.present].slice(-100), present: graph, future: [] };
}
export function travelGraph(history: GraphHistory, direction: 'undo' | 'redo'): GraphHistory {
  if (direction === 'undo') {
    const previous = history.past.at(-1);
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: previous,
          future: [history.present, ...history.future],
        }
      : history;
  }
  const next = history.future[0];
  return next
    ? {
        past: [...history.past, history.present].slice(-100),
        present: next,
        future: history.future.slice(1),
      }
    : history;
}
export function scopeGraph(
  graph: GraphData,
  mode: 'all' | 'selected' | 'connected',
  selected: string[],
): GraphData {
  const live = activeGraph(graph);
  if (mode === 'all') return live;
  const ids = new Set(selected.filter((id) => live.nodes.some((node) => node.id === id)));
  // Followed links in both directions for a connected scenario; restricted
  // custom selections to internal edges so excluded accounts could not leak in.
  if (mode === 'connected') {
    let changed = true;
    while (changed) {
      changed = false;
      for (const edge of live.edges) {
        if (ids.has(edge.sourceNodeId) || ids.has(edge.targetNodeId)) {
          if (!ids.has(edge.sourceNodeId) || !ids.has(edge.targetNodeId)) changed = true;
          ids.add(edge.sourceNodeId);
          ids.add(edge.targetNodeId);
        }
      }
    }
  }
  return {
    ...live,
    nodes: live.nodes.filter((node) => ids.has(node.id)),
    edges: live.edges.filter((edge) => ids.has(edge.sourceNodeId) && ids.has(edge.targetNodeId)),
  };
}
