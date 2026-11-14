import { useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { money } from '../common/finance';
import type { GraphData } from '../common/finance';

export function WorkspaceConnections({
  graph,
  live,
  update,
  selectEdge,
  connections,
  onToggle,
}: {
  graph: GraphData;
  live: GraphData;
  update: (graph: GraphData) => void;
  selectEdge: (id: string) => void;
  connections: boolean;
  onToggle: () => void;
}) {
  const justOpened = useRef(false);
  const routesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (connections && justOpened.current) {
      routesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    justOpened.current = false;
  }, [connections]);
  const addConnection = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const percentage = form.get('mode') === 'percent';
    update({
      ...graph,
      edges: [
        ...graph.edges,
        {
          id: crypto.randomUUID(),
          sourceNodeId: String(form.get('source')),
          targetNodeId: String(form.get('target')),
          monthlyFixedFlow: percentage ? null : Number(form.get('amount')),
          percentageFlow: percentage ? Number(form.get('amount')) : null,
        },
      ],
    });
  };
  return (
    <section
      className="border border-(--ui-border-293449) rounded-[10px] mt-5 bg-(--ui-surface-111925)"
      ref={routesRef}
    >
      <button
        className="w-full p-[16px_19px] bg-transparent border-0 cursor-pointer flex justify-between items-center text-xs font-medium text-text hover:text-primary transition-colors"
        aria-expanded={connections}
        onClick={() => {
          justOpened.current = !connections;
          onToggle();
        }}
      >
        <span>
          Connections & monthly allocations{' '}
          <small className="text-[10px] text-(--ui-text-7e8da6) ml-2.5 font-normal">
            {live.edges.length} routes
          </small>
        </span>
        <span>{connections ? '−' : '+'}</span>
      </button>
      {connections && (
        <div className="px-4.75 pb-4.5">
          <p className="text-(--ui-text-8b9ab1) text-[11px] my-2 leading-[1.6]">
            Incoming debt routes set payments unless the node has an override. Expense routes from
            income/checking set monthly costs; percentages use starting take-home income.
            Simulations fund fixed saving/investment routes first, then percentage routes, then your
            extra-investment allocation.
          </p>
          <div className="my-3 max-h-60 overflow-auto">
            {live.edges.map((edge) => (
              <div
                key={edge.id}
                className="grid grid-cols-[minmax(120px,1fr)_auto_auto_auto] max-[650px]:grid-cols-[1fr_auto] items-center gap-3 border-b border-(--ui-border-263047) py-2.5 text-[11px] text-text"
              >
                <span className="truncate">
                  {graph.nodes.find((n) => n.id === edge.sourceNodeId)?.name}{' '}
                  <span className="text-muted">→</span>{' '}
                  {graph.nodes.find((n) => n.id === edge.targetNodeId)?.name}
                </span>
                <strong className="font-medium tabular-nums">
                  {edge.monthlyFixedFlow != null
                    ? `${money(edge.monthlyFixedFlow)}/mo`
                    : `${edge.percentageFlow}%`}
                </strong>
                <button
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[11px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
                  onClick={() => selectEdge(edge.id)}
                >
                  Edit connection
                </button>
                <button
                  className="inline-flex items-center justify-center border border-(--ui-border-303c54) bg-(--ui-surface-1a2538) hover:bg-(--ui-surface-hover-25354e) text-(--ui-text-d6e2f5) rounded-[7px] w-6 h-6 shrink-0 cursor-pointer text-sm transition-colors"
                  aria-label="Remove connection"
                  onClick={() =>
                    update({ ...graph, edges: graph.edges.filter((e) => e.id !== edge.id) })
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <form
            className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] max-[760px]:grid-cols-2 max-[500px]:grid-cols-1 gap-2.5 items-end mt-4 [&_label]:flex [&_label]:flex-col [&_label]:gap-1.5 [&_label]:text-[11px] [&_label]:text-(--ui-text-a9b6cc) [&_select]:w-full [&_select]:text-xs [&_select]:px-2.5 [&_select]:py-1.5 [&_select]:rounded-[7px] [&_select]:border [&_select]:border-border [&_select]:bg-base [&_select]:text-text [&_input]:w-full [&_input]:text-xs [&_input]:px-2.5 [&_input]:py-1.5 [&_input]:rounded-[7px] [&_input]:border [&_input]:border-border [&_input]:bg-base [&_input]:text-text"
            onSubmit={addConnection}
          >
            <label>
              From
              <select name="source" required>
                {live.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              To
              <select name="target" required defaultValue={live.nodes[1]?.id}>
                {live.nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Flow
              <select name="mode">
                <option value="fixed">Dollars / month</option>
                <option value="percent">Percentage</option>
              </select>
            </label>
            <label>
              Amount
              <input name="amount" type="number" min={0} max={1e9} step="0.01" required />
            </label>
            <button
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-1.75 text-[11px] font-medium min-h-8.5 cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
              disabled={live.nodes.length < 2}
            >
              + Connect
            </button>
          </form>
        </div>
      )}
    </section>
  );
}
