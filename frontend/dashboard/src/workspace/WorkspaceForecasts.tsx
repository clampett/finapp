import { lazy, Suspense } from 'react';
import type { ComponentProps, Dispatch, SetStateAction } from 'react';
import type { GraphData, SimulationType } from '../common/finance';

// Deferred loading of the simulation interface until a forecast was opened.
const SimulationModal = lazy(() =>
  import('../simulation/SimulationModal').then((module) => ({ default: module.SimulationModal })),
);

export type ForecastScope = 'all' | 'selected' | 'connected';

export function WorkspaceForecastControls({
  live,
  simulationGraph,
  scope,
  setScope,
  scopeIds,
  setScopeIds,
  selectionIds,
  setSimType,
}: {
  live: GraphData;
  simulationGraph: GraphData;
  scope: ForecastScope;
  setScope: (scope: ForecastScope) => void;
  scopeIds: string[];
  setScopeIds: Dispatch<SetStateAction<string[]>>;
  selectionIds: string[];
  setSimType: (type: SimulationType) => void;
}) {
  // Kept forecast scope separate from canvas selection until it was explicitly copied.
  return (
    <div className="border border-(--ui-border-30384e) rounded-[11px] bg-linear-to-r from-(--ui-surface-1a1b2c) to-(--ui-surface-151b29) mt-3.75 p-[21px_22px] flex flex-col items-stretch gap-4.5">
      <div>
        <div className="text-[8px] text-(--ui-text-b5a4e3) mb-1.75 font-semibold tracking-wider">
          LOOK AHEAD
        </div>
        <h3 className="text-sm font-semibold text-text m-0">
          What could your next chapter look like?
        </h3>
        <p className="text-[11px] text-(--ui-text-8c9cb4) mt-1.25 mb-0">
          Explore a range of outcomes from your current scenario.
        </p>
      </div>
      <section className="p-4 border border-(--ui-border-30465a) rounded-xl bg-(--ui-surface-101c29)">
        <label className="flex items-center max-[650px]:items-stretch max-[650px]:flex-col gap-3.5 text-xs text-(--ui-text-b9c5d9)">
          Simulation scope
          <select
            className="bg-(--ui-surface-182536) text-(--ui-text-e2edf9) p-2.5 border border-(--ui-border-3a516c) rounded-[7px] max-w-full text-xs"
            value={scope}
            onChange={(event) => setScope(event.target.value as typeof scope)}
          >
            <option value="all">All active nodes</option>
            <option value="selected">Only selected nodes</option>
            <option value="connected">Selected nodes and everything connected</option>
          </select>
        </label>
        <strong className="block mt-3 text-xs text-(--ui-text-7de0bc) font-medium">
          {simulationGraph.nodes.length} of {live.nodes.filter((n) => !n.disabled).length} active
          nodes included
        </strong>
        {!!selectionIds.length && (
          <button
            className="mt-2.5 inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[11px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-(--ui-border-30465a) hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            onClick={() => {
              setScope('selected');
              setScopeIds(selectionIds);
            }}
          >
            Use canvas selection for simulation
          </button>
        )}
        {scope !== 'all' && (
          <>
            <p className="text-xs leading-[1.7] text-(--ui-text-99aec6) my-3">
              Select one or several nodes below. Canvas selections are used for editing unless you
              choose “Use canvas selection for simulation.” Only included income, expenses,
              balances, and internal connections are modeled. An isolated account has no household
              income or bills unless you include them.
            </p>
            <div className="flex flex-wrap gap-2 mt-3 max-h-55 overflow-auto">
              {live.nodes.map((node) => (
                <label
                  key={node.id}
                  className={`flex items-center gap-1.75 border border-(--ui-border-2a3f56) px-2.75 py-2 rounded-full text-xs bg-(--ui-surface-182738) text-text ${
                    node.disabled ? 'opacity-45 cursor-not-allowed' : 'cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="accent-brand w-3.5 h-3.5"
                    checked={scopeIds.includes(node.id)}
                    disabled={node.disabled}
                    onChange={() =>
                      setScopeIds((ids) =>
                        ids.includes(node.id)
                          ? ids.filter((id) => id !== node.id)
                          : [...ids, node.id],
                      )
                    }
                  />
                  <span className={node.disabled ? 'line-through text-muted' : ''}>
                    {node.name}
                  </span>
                  {node.disabled && <span className="text-[10px] text-coral">(off)</span>}
                </label>
              ))}
            </div>
          </>
        )}
      </section>
      <div className="flex flex-wrap gap-2.5">
        <button
          className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-(--ui-text-d2c4ff) border border-(--ui-border-51496e) bg-(--ui-surface-30283f) hover:bg-(--ui-surface-hover-3d3350) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          disabled={!simulationGraph.nodes.length}
          onClick={() => setSimType('monte_carlo')}
        >
          Monte Carlo Simulation ↗
        </button>
        <button
          className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          disabled={!simulationGraph.nodes.length}
          onClick={() => setSimType('markov')}
        >
          Markov Regime Simulation ↗
        </button>
        <button
          className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          disabled={
            !simulationGraph.nodes.some((n) => n.nodeType === 'DEBT' && n.amountOrBalance > 0)
          }
          onClick={() => setSimType('debt')}
        >
          Debt payoff ↗
        </button>
      </div>
    </div>
  );
}

export function WorkspaceForecastModal(props: ComponentProps<typeof SimulationModal>) {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 z-100 bg-(--ui-surface-04070dbd) backdrop-blur-md flex items-center justify-center p-[clamp(12px,3vw,40px)]">
          <div className="py-17.5 px-6 text-center text-(--ui-text-8d9fba) text-xs" role="status">
            Opening scenario lab…
          </div>
        </div>
      }
    >
      <SimulationModal {...props} />
    </Suspense>
  );
}
