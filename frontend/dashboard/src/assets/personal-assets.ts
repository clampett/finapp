import type { GraphData, GraphNode } from '../common/finance';
import { parseGraph } from '../common/finance';
import { placeNewNode } from '../workspace/graph-workspace';

// Validated reviewed balances through the same boundary used by imports and undo history.
export function savePersonalAsset(
  graph: GraphData,
  name: string,
  value: number,
  growth: number,
  id?: string,
): GraphData {
  if (
    !name.trim() ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1e12 ||
    !Number.isFinite(growth) ||
    growth < -100 ||
    growth > 100
  )
    throw new Error('Enter a name, a nonnegative USD value, and growth between −100% and 100%.');
  const existing = id
    ? graph.nodes.find((node) => node.id === id && node.nodeType === 'ASSET')
    : undefined;
  if (id && !existing) throw new Error('This asset no longer exists. Refresh the asset list.');
  // Revalued the same account instead of adding its previous and updated values together.
  const now = new Date().toISOString();
  const node: GraphNode = {
    ...existing,
    id: existing?.id ?? `asset-${crypto.randomUUID()}`,
    name: name.trim(),
    nodeType: 'ASSET',
    amountOrBalance: value,
    interestRateApr: 0,
    assetGrowthRate: growth,
    position: existing?.position ?? placeNewNode(graph.nodes, { x: 690, y: 0 }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return parseGraph({
    ...graph,
    nodes: existing ? graph.nodes.map((n) => (n.id === id ? node : n)) : [...graph.nodes, node],
  });
}
