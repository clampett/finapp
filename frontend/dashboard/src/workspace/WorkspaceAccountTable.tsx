import { colors, debtPayment, expenseAmount, money, typeLabel } from '../finance';
import type { GraphData, GraphNode, View } from '../finance';

export function WorkspaceAccountTable({
  view,
  filtered,
  graph,
  live,
  update,
}: {
  view: View;
  filtered: GraphNode[];
  graph: GraphData;
  live: GraphData;
  update: (graph: GraphData) => void;
}) {
  // Rendered scenario balances separately from the tracked stock portfolio.
  if (!filtered.length && view === 'investing') return null;
  return (
    <section className="workspace-ledger border border-(--ui-border-2a3549) rounded-[11px] bg-(--ui-surface-121a27) overflow-hidden mt-4">
      <div className="p-5 border-b border-border">
        <h3 className="m-0 font-semibold text-text">
          {view === 'cashflow' ? 'Scenario flows' : 'Scenario accounts'}
        </h3>
        <p className="mt-1 mb-0 text-xs text-muted">
          {view === 'cashflow'
            ? 'These switches affect the plan and forecasts.'
            : 'Balances entered in Node Graph, separate from your tracked holdings.'}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
          <thead>
            <tr>
              <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e)">
                Account
              </th>
              <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e)">
                Type
              </th>
              <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e)">
                {view === 'cashflow' ? 'Monthly amount' : 'Balance'}
              </th>
              <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e)">
                APR
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((n) => (
              <tr
                key={n.id}
                className={`transition-colors ${n.disabled ? 'opacity-65 bg-base' : 'hover:bg-hover-bg'}`}
              >
                <td className="p-[13px_20px] border-t border-(--ui-border-263147)">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                    {view === 'cashflow' && (
                      <input
                        type="checkbox"
                        checked={!n.disabled}
                        onChange={() => {
                          update({
                            ...graph,
                            nodes: graph.nodes.map((node) =>
                              node.id === n.id ? { ...node, disabled: !node.disabled } : node,
                            ),
                          });
                        }}
                        className="accent-brand w-4 h-4 rounded cursor-pointer shrink-0"
                        aria-label={`Toggle ${n.name}`}
                      />
                    )}
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full shrink-0 align-middle transition-opacity"
                      style={{
                        background: colors[n.nodeType],
                        opacity: n.disabled ? 0.35 : 1,
                      }}
                    />
                    <span
                      className={n.disabled ? 'line-through text-muted' : 'text-text font-medium'}
                    >
                      {n.name}
                    </span>
                  </label>
                </td>
                <td className="p-[13px_20px] border-t border-(--ui-border-263147)">
                  {typeLabel(n.nodeType)}
                </td>
                <td className="p-[13px_20px] border-t border-(--ui-border-263147)">
                  {money(
                    n.nodeType === 'EXPENSE'
                      ? expenseAmount(n, live, true)
                      : n.nodeType === 'DEBT'
                        ? debtPayment(n, live, true)
                        : n.amountOrBalance,
                  )}
                  {view === 'cashflow' ? '/mo' : ''}
                </td>
                <td className="p-[13px_20px] border-t border-(--ui-border-263147)">
                  {n.interestRateApr}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <div className="py-17.5 px-6 text-center text-(--ui-text-8d9fba) text-xs">
          No matching flows. Adjust your search or add a flow in Node Graph.
        </div>
      )}
    </section>
  );
}
