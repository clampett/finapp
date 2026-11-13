import { useCallback, useMemo, useState } from 'react';
import { ScenarioCoach } from './components/ScenarioCoach';
import { BudgetingTab } from './BudgetingTab';
import { scopeGraph } from './graph-workspace';
import { BudgetControls } from './components/BudgetControls';
import { DashboardTab } from './DashboardTab';
import { Investing } from './components/Investing';
import SettingsTab from './components/SettingsTab';
import { BalancePreferences, SimulationPreferences } from './components/FinancialPreferences';
import { loadSimulationDefaults, simulationSettingsKey } from './simulationPreferences';
import type { UserProfile } from './components/SettingsTab';
import { money, parseGraph, totals } from './finance';
import type { SimulationType, View } from './finance';
import { useScenarioGraph } from './workspace/useScenarioGraph';
import { useGraphEditing } from './workspace/useGraphEditing';
import { useWorkspacePortfolio } from './workspace/useWorkspacePortfolio';
import { WorkspaceCanvas } from './workspace/WorkspaceCanvas';
import { WorkspaceAccountTable } from './workspace/WorkspaceAccountTable';
import { WorkspaceConnections } from './workspace/WorkspaceConnections';
import { WorkspaceIntro } from './workspace/WorkspaceIntro';
import { WorkspaceForecastControls, WorkspaceForecastModal } from './workspace/WorkspaceForecasts';
import type { ForecastScope } from './workspace/WorkspaceForecasts';

export function GraphWorkspace({
  userId,
  demo,
  view,
  search,
  userProfile,
  profileStatus,
  onRetryProfile,
  onUpdateProfile,
  activeTheme,
  onSelectTheme,
  onNavigate,
}: {
  userId: number;
  demo: boolean;
  view: View;
  search: string;
  userProfile: UserProfile;
  profileStatus: 'loading' | 'ready' | 'error';
  onRetryProfile: () => void;
  onUpdateProfile: (updated: UserProfile) => void;
  activeTheme: 'light' | 'dark';
  onSelectTheme: (theme: 'light' | 'dark' | 'system') => void;
  onNavigate: (view: View) => void;
}) {
  // Composed the graph state, portfolio snapshot, and editor while keeping the active view here.
  const { portfolioValue, dividendFlows } = useWorkspacePortfolio(userId, demo);
  const scenario = useScenarioGraph(userId, demo);
  const {
    storageKey,
    graph,
    live,
    loaded,
    setLoaded,
    error,
    setError,
    storageStatus,
    setReload,
    update,
  } = scenario;
  const [connections, setConnections] = useState(false);
  const [simType, setSimType] = useState<SimulationType | null>(null);
  const editor = useGraphEditing(scenario, view, simType);
  const { importRef, setSelected, selectionIds, selectEdge } = editor;
  const [scope, setScope] = useState<ForecastScope>('all');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  // Scoped forecast inputs to the whole graph, the selection, or its connected nodes.
  const simulationGraph = useMemo(
    () => scopeGraph(graph, scope, scopeIds),
    [graph, scope, scopeIds],
  );
  // Loaded saved forecast defaults only for signed-in accounts.
  const [simulationDefaults, setSimulationDefaults] = useState(() =>
    demo ? undefined : loadSimulationDefaults(userId),
  );
  const t = totals(graph, portfolioValue);
  const filtered = live.nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) &&
      (view !== 'investing' || ['INVESTMENT', 'SAVINGS'].includes(n.nodeType)) &&
      (view !== 'cashflow' || ['INCOME', 'EXPENSE', 'DEBT'].includes(n.nodeType)),
  );
  // Kept the close callback stable while budget assumptions changed, preventing
  // the modal's focus trap from resetting the active tax input on every keystroke.
  const closeSimulation = useCallback(() => setSimType(null), []);
  return (
    <div
      className={`workspace-tab-content px-8 pb-4.5 max-[1100px]:px-5.5 max-[1100px]:pb-4.5 max-[760px]:px-4 max-[760px]:pb-4 2xl:px-11 fullscreen:bg-[var(--ui-surface-0c1018)] fullscreen:w-full fullscreen:h-full fullscreen:overflow-auto fullscreen:p-6 max-[650px]:fullscreen:p-3 ${view === 'settings' ? 'mx-auto w-full max-w-6xl' : ''}`}
    >
      {/* Used the coach’s own interactive heading instead of duplicating the tab introduction. */}
      {view !== 'ai' && (
        <WorkspaceIntro view={view} live={live} t={t} demo={demo} storageStatus={storageStatus} />
      )}
      {/* Kept scenario imports with the graph editor. */}
      {view === 'graph' && (
        <input
          ref={importRef}
          type="file"
          className="sr-only"
          accept=".json,application/json"
          aria-label="Import scenario JSON"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 2000000) throw new Error('Choose a JSON file smaller than 2 MB.');
              update(parseGraph(JSON.parse(await file.text())));
              setSelected(null);
            } catch (err) {
              setError((err as Error).message);
            }
            e.target.value = '';
          }}
        />
      )}
      {view !== 'ai' && error && (
        <div
          className="p-[12px_16px] text-xs rounded-lg mb-3.5 flex gap-3.5 items-center justify-between leading-[1.6] bg-(--ui-surface-331d2b) text-(--ui-text-fda4af) border border-(--ui-border-743247)"
          role="alert"
        >
          {error}
          <button
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-1.75 text-[11px] font-medium cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors"
            onClick={() => {
              setLoaded(false);
              setError('');
              setReload((n) => n + 1);
            }}
          >
            Retry loading
          </button>
        </div>
      )}
      {loaded && (view === 'cashflow' || view === 'graph') && (
        <BudgetControls
          graph={live}
          onChange={(assumptions) => update({ ...graph, assumptions })}
          compact
        />
      )}
      {(view === 'cashflow' || view === 'graph') && t.surplus < 0 && (
        <div className="p-[12px_16px] text-xs rounded-lg mb-3.5 flex gap-3.5 items-center justify-between leading-[1.6] bg-(--ui-surface-2b251b) border border-(--ui-border-614b2c) text-(--ui-text-e2c384)">
          Your monthly shortfall is {money(-t.surplus)}. Forecasts draw from reserves and
          investments before adding new borrowing.
        </div>
      )}
      {/* Mounted the sample coach and chat independently of account-graph availability. */}
      {view === 'ai' ? (
        <ScenarioCoach
          graph={loaded && !error ? graph : undefined}
          onOpenGraph={() => onNavigate('graph')}
        />
      ) : !loaded ? (
        <div className="py-17.5 px-6 text-center text-(--ui-text-8d9fba) text-xs" role="status">
          Loading your workspace…
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-stretch max-[1100px]:flex-col">
            <div className="min-w-0 flex-1">
              {view === 'investing' && (
                <Investing
                  key={`${demo}:${userId}`}
                  storageKey={`finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`}
                  userId={userId}
                  demo={demo}
                />
              )}
              {view === 'overview' ? (
                <DashboardTab
                  graph={live}
                  portfolioValue={portfolioValue}
                  goalsStorageKey={`${storageKey}:goals`}
                />
              ) : view === 'budgeting' ? (
                <BudgetingTab
                  graph={live}
                  rawGraph={graph}
                  userId={userId}
                  demo={demo}
                  portfolioValue={portfolioValue}
                  onUpdateGraph={update}
                />
              ) : view === 'settings' ? (
                <SettingsTab
                  userId={userId}
                  demo={demo}
                  profile={userProfile}
                  profileStatus={profileStatus}
                  onRetryProfile={onRetryProfile}
                  onUpdateProfile={onUpdateProfile}
                  activeTheme={activeTheme}
                  onSelectTheme={onSelectTheme}
                  simulationSettings={
                    !demo &&
                    simulationDefaults && (
                      <SimulationPreferences
                        defaults={simulationDefaults}
                        onSave={(value) => {
                          localStorage.setItem(
                            simulationSettingsKey(userId),
                            JSON.stringify(value),
                          );
                          setSimulationDefaults(value);
                        }}
                        graph={graph}
                        onUpdate={update}
                        ready={loaded && !error}
                      />
                    )
                  }
                  financialSettings={
                    !demo &&
                    (loaded && !error ? (
                      <BalancePreferences graph={graph} onUpdate={update} userId={userId} />
                    ) : (
                      <p role="status" className="text-sm text-muted">
                        Scenario balances are currently unavailable.
                      </p>
                    ))
                  }
                />
              ) : view === 'graph' ? (
                <WorkspaceCanvas
                  scenario={scenario}
                  editor={editor}
                  search={search}
                  scopeIds={scopeIds}
                  userId={userId}
                />
              ) : (
                <WorkspaceAccountTable
                  view={view}
                  filtered={filtered}
                  graph={graph}
                  live={live}
                  update={update}
                />
              )}
              {view === 'graph' && (
                <WorkspaceForecastControls
                  live={live}
                  simulationGraph={simulationGraph}
                  scope={scope}
                  setScope={setScope}
                  scopeIds={scopeIds}
                  setScopeIds={setScopeIds}
                  selectionIds={selectionIds}
                  setSimType={setSimType}
                />
              )}
            </div>
          </div>
          {view === 'graph' && (
            <WorkspaceConnections
              graph={graph}
              live={live}
              update={update}
              selectEdge={selectEdge}
              connections={connections}
              onToggle={() => setConnections((open) => !open)}
            />
          )}
        </>
      )}
      <footer className="flex justify-between gap-3 text-(--ui-text-5f728c) text-[9px] mt-6">
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-(--ui-surface-73d9af) mr-1 align-middle" />{' '}
          Scenario workspace
        </span>
        <span>Educational modeling · All amounts in USD</span>
      </footer>
      {view === 'graph' && simType && (
        <WorkspaceForecastModal
          onAssumptionsChange={(assumptions) => update({ ...graph, assumptions })}
          graphData={simulationGraph}
          scope={scope}
          scopeLabel={`${scope === 'all' ? 'All active nodes' : scope === 'connected' ? 'Connected selection' : 'Selected nodes only'} · ${simulationGraph.nodes.length} nodes · ${simulationGraph.edges.length} connections`}
          simulationType={simType}
          defaults={simulationDefaults}
          onClose={closeSimulation}
          onOpenCoach={() => {
            closeSimulation();
            onNavigate('ai');
          }}
          portfolioValue={portfolioValue}
          dividendFlows={dividendFlows}
          userId={userId}
          demo={demo}
        />
      )}
    </div>
  );
}
