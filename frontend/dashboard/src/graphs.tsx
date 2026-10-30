import { AccountEditor } from './components/AccountEditor';
import { Canvas } from './components/Canvas';
import { CanvasToolbar } from './components/CanvasToolbar';
import { CanvasIcon } from './components/CanvasIcon';
import { ConnectionEditor } from './components/ConnectionEditor';
import { BudgetingTab } from './BudgetingTab';
import {
  newHistory,
  placeNewNode,
  recordGraph,
  removeSelection,
  scopeGraph,
  travelGraph,
} from './graph-workspace';
import type { CanvasTool } from './graph-workspace';
import { historyShortcut } from './ui-platform';
import { BudgetControls } from './components/BudgetControls';
import { DashboardTab } from './DashboardTab';
import { Investing } from './components/Investing';
import { clearSession, sessionHeaders } from './session';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  API_BASE,
  activeGraph,
  colors,
  downloadJson,
  expenseAmount,
  money,
  parseGraph,
  totals,
  typeLabel,
} from './finance';
import type { GraphData, GraphEdge, GraphNode, SimulationType, View } from './finance';

const SimulationModal = lazy(() =>
  import('./SimulationModal').then((module) => ({ default: module.SimulationModal })),
);

export function ArchetypeGraph({
  userId,
  demo,
  view,
  search,
}: {
  userId: number;
  demo: boolean;
  view: View;
  search: string;
}) {
  const storageKey = `finapp-scenario-v2:${demo ? 'demo' : 'user'}:${userId}`;
  // Partitioned browser drafts by demo/user and profile ID so editing one
  // example never overwrote a different account's local scenario.
  const [history, setHistory] = useState(() => newHistory({ nodes: [], edges: [] }));
  const graph = history.present;
  const live = useMemo(() => activeGraph(graph), [graph]);
  const [scope, setScope] = useState<'all' | 'selected' | 'connected'>('all');
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const simulationGraph = useMemo(
    () => scopeGraph(graph, scope, scopeIds),
    [graph, scope, scopeIds],
  );
  const [editingEdge, setEditingEdge] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [tool, setTool] = useState<CanvasTool>('select');
  const connecting = tool === 'connect';
  const [selectionIds, setSelectionIds] = useState<string[]>([]);
  const [edgeSelectionIds, setEdgeSelectionIds] = useState<string[]>([]);
  const [pendingEdge, setPendingEdge] = useState<GraphEdge | null>(null);
  const [compact, setCompact] = useState(false);
  const spawnCenter = useRef({ x: 345, y: 0 });
  const reportCenter = useCallback((center: { x: number; y: number }) => {
    spawnCenter.current = center;
  }, []);
  const [original, setOriginal] = useState<GraphData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [storageStatus, setStorageStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [simType, setSimType] = useState<SimulationType | null>(null);
  const [connections, setConnections] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const routesRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (connections) routesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [connections]);
  useEffect(() => {
    const controller = new AbortController();
    let draft: GraphData | null = null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) draft = parseGraph(JSON.parse(saved));
    } catch {
      /* Ignore an unreadable draft and load the server profile. */
    }
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/graph/${userId}`, {
          signal: controller.signal,
          headers: sessionHeaders(),
        });
        if (!demo && (response.status === 401 || response.status === 403)) {
          clearSession();
          location.replace('/login');
          return;
        }
        if (!response.ok)
          throw new Error(
            `Could not load accounts (${response.status}). Check that the Java backend is running.`,
          );
        const body = await response.json();
        if (!body.success)
          throw new Error(body.message || 'Could not load this financial profile.');
        const source = parseGraph(body.data);
        // Retained the server scenario as Reset's reference, while an
        // existing browser draft took precedence for normal editing.
        setOriginal(source);
        setHistory(newHistory(draft ?? source));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (draft) {
          setHistory(newHistory(draft));
          setStorageStatus('Using your local scenario. The server is unavailable.');
        } else setError(err instanceof Error ? err.message : 'Unable to load financial data.');
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [demo, userId, storageKey, reload]);
  const update = (next: GraphData) => {
    // Revalidated every change before updating React or localStorage; the
    // same constraints were therefore applied to editing and JSON imports.
    try {
      const valid = parseGraph(next);
      setHistory((current) => recordGraph(current, valid));
      setError('');
      try {
        localStorage.setItem(storageKey, JSON.stringify(valid));
        setStorageStatus('Scenario saved on this device');
      } catch {
        setStorageStatus('Browser storage unavailable. Export your scenario to keep changes.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };
  // Persisted the current snapshot after undo/redo as well as normal edits;
  // kept native text-field undo untouched while a form or simulation was active.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(graph));
    } catch {
      /* Retained the in-memory history when browser persistence failed. */
    }
  }, [graph, loaded, storageKey]);
  const travel = useCallback((direction: 'undo' | 'redo') => {
    setHistory((current) => travelGraph(current, direction));
    setSelected(null);
    setEditingEdge(null);
    setPendingEdge(null);
    setSelectionIds([]);
    setEdgeSelectionIds([]);
    setError('');
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (
        simType ||
        event.altKey ||
        (event.target instanceof Element &&
          event.target.closest('input,textarea,select,[contenteditable="true"]'))
      )
        return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && view === 'graph') {
        if (selectionIds.length || edgeSelectionIds.length) {
          event.preventDefault();
          setHistory((current) =>
            recordGraph(current, removeSelection(current.present, selectionIds, edgeSelectionIds)),
          );
          setSelected(null);
          setEditingEdge(null);
          setPendingEdge(null);
          setSelectionIds([]);
          setEdgeSelectionIds([]);
          setStorageStatus('Selection removed. Undo to restore.');
        }
        return;
      }
      const action = historyShortcut(event);
      if (action) {
        event.preventDefault();
        travel(action);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [travel, simType, view, selectionIds, edgeSelectionIds]);
  const t = totals(graph);
  const filtered = live.nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) &&
      (view !== 'investing' || ['INVESTMENT', 'SAVINGS'].includes(n.nodeType)),
  );
  const selectAccount = useCallback((n: GraphNode) => {
    setSelectionIds([n.id]);
    setEdgeSelectionIds([]);
    setSelected(n);
    setEditingEdge(null);
    setPendingEdge(null);
    setShowArchive(false);
  }, []);
  const selectEdge = useCallback((id: string, additive = false) => {
    setEdgeSelectionIds((ids) =>
      additive ? (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]) : [id],
    );
    if (!additive) setSelectionIds([]);
    setEditingEdge(additive ? null : id);
    setPendingEdge(null);
    setShowArchive(false);
    setSelected(null);
  }, []);
  const toggleSelection = useCallback((id: string) => {
    setSelectionIds((ids) =>
      ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id],
    );
    setSelected(null);
    setEditingEdge(null);
    setPendingEdge(null);
  }, []);
  const selectGroup = useCallback((ids: string[]) => {
    setSelectionIds(ids);
    setEdgeSelectionIds([]);
    setSelected(null);
    setEditingEdge(null);
    setPendingEdge(null);
    setShowArchive(false);
    setTool('select');
  }, []);
  // Kept the close callback stable while budget assumptions changed, preventing
  // the modal's focus trap from resetting the active tax input on every keystroke.
  const closeSimulation = useCallback(() => setSimType(null), []);
  const add = () =>
    setSelected({
      id: crypto.randomUUID(),
      name: '',
      nodeType: 'CHECKING',
      amountOrBalance: 0,
      interestRateApr: 0,
      position: placeNewNode(live.nodes, spawnCenter.current),
    });
  const reset = () => {
    if (
      original &&
      window.confirm(
        'Reset this scenario to the server profile? Your local edits will be replaced.',
      )
    ) {
      update(structuredClone(original));
      setSelected(null);
      setSelectionIds([]);
      setEdgeSelectionIds([]);
      setEditingEdge(null);
      setPendingEdge(null);
    }
  };
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
  const arrange = () => {
    const columns = [['INCOME'], ['CHECKING', 'SAVINGS'], ['EXPENSE', 'DEBT', 'INVESTMENT']];
    update({
      ...graph,
      nodes: graph.nodes.map((node) => {
        if (node.archived) return node;
        const col = columns.findIndex((types) => types.includes(node.nodeType));
        const group = live.nodes.filter((item) => columns[col].includes(item.nodeType));
        return {
          ...node,
          position: {
            x: col * 345,
            y: group.findIndex((item) => item.id === node.id) * 130 - (group.length - 1) * 65,
          },
        };
      }),
    });
  };
  // Prepared a draft route on drop; committed its amount only after Apply so
  // a cancelled gesture could not silently change the household budget.
  const connectNodes = useCallback((source: string, target: string) => {
    if (source === target) return;
    setSelected(null);
    setShowArchive(false);
    setEditingEdge(null);
    setTool('select');
    setPendingEdge({
      id: crypto.randomUUID(),
      sourceNodeId: source,
      targetNodeId: target,
      monthlyFixedFlow: 0,
      percentageFlow: null,
    });
  }, []);
  const activeEdge = pendingEdge ?? live.edges.find((edge) => edge.id === editingEdge);
  const toolbar = (
    <CanvasToolbar
      canvasAvailable={view === 'graph'}
      canUndo={!!history.past.length}
      canRedo={!!history.future.length}
      compact={compact}
      connecting={connecting}
      tool={tool}
      onToolChange={(value) => {
        setTool(value);
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
        setShowArchive(false);
      }}
      removed={graph.nodes.filter((node) => node.archived).length}
      canReset={!!original}
      onUndo={() => travel('undo')}
      onRedo={() => travel('redo')}
      onDensity={() => setCompact(!compact)}
      onConnect={() => {
        setTool(connecting ? 'select' : 'connect');
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
        setShowArchive(false);
      }}
      onArrange={arrange}
      onRestore={() => {
        setSelectionIds([]);
        setEdgeSelectionIds([]);
        setShowArchive(!showArchive);
        setSelected(null);
        setEditingEdge(null);
        setPendingEdge(null);
      }}
      onImport={() => importRef.current?.click()}
      onExport={() => downloadJson(graph, `finapp-scenario-${userId}.json`)}
      onReset={reset}
      onAdd={() => {
        setSelectionIds([]);
        setEdgeSelectionIds([]);
        setTool('select');
        setShowArchive(false);
        setEditingEdge(null);
        setPendingEdge(null);
        add();
      }}
    />
  );
  const archivePanel = (
    <>
      {showArchive && (
        <section className="border border-[color:var(--ui-border-33445b)] rounded-xl bg-[var(--ui-surface-121d2c)] p-5 mb-5">
          <div className="flex items-center justify-between gap-3 mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:m-0">
            <h3>Recently removed nodes</h3>
            <button
              className="inline-flex items-center justify-center border border-[color:var(--ui-border-303c54)] bg-[var(--ui-surface-1a2538)] hover:bg-[var(--ui-surface-hover-25354e)] text-[color:var(--ui-text-d6e2f5)] rounded-[7px] w-8 h-8 shrink-0 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ui-border-a78bfa)] focus-visible:outline-offset-2"
              aria-label="Close restore panel"
              title="Close"
              onClick={() => setShowArchive(false)}
            >
              <CanvasIcon name="close" />
            </button>
          </div>
          <p className="text-xs leading-[1.7] text-[color:var(--ui-text-99aec6)] my-2">
            Restored nodes recover their saved values, position, and connections when both endpoints
            are active.
          </p>
          {graph.nodes
            .filter((node) => node.archived)
            .map((node) => (
              <div key={node.id} className="flex justify-between gap-3 items-center py-2 border-b border-[color:var(--ui-border-243247)] last:border-b-0 text-xs text-text">
                <span>
                  {node.name} · {typeLabel(node.nodeType)}
                </span>
                <button
                  className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-xs font-medium cursor-pointer bg-[var(--ui-surface-20293a)] text-text border border-[color:var(--ui-border-37445c)] hover:bg-[var(--ui-surface-hover-28354c)] transition-colors"
                  onClick={() =>
                    update({
                      ...graph,
                      nodes: graph.nodes.map((item) =>
                        item.id === node.id ? { ...item, archived: false } : item,
                      ),
                    })
                  }
                >
                  Restore {node.name}
                </button>
              </div>
            ))}
          {!graph.nodes.some((node) => node.archived) && (
            <p className="text-xs leading-[1.7] text-[color:var(--ui-text-99aec6)] my-2">No removed nodes. Undo also restores recent edits.</p>
          )}
        </section>
      )}
    </>
  );
  const inspector = (
    <>
      {selected && (
        <AccountEditor
          key={selected.id}
          node={selected}
          graph={live}
          onClose={() => setSelected(null)}
          onEditRoute={selectEdge}
          onSave={(n) => {
            update({
              ...graph,
              nodes: graph.nodes.some((a) => a.id === n.id)
                ? graph.nodes.map((a) => (a.id === n.id ? n : a))
                : [...graph.nodes, n],
            });
            setSelected(null);
          }}
          onDelete={() => {
            update({
              ...graph,
              nodes: graph.nodes.map((node) =>
                node.id === selected.id ? { ...node, archived: true } : node,
              ),
            });
            setSelected(null);
            setSelectionIds([]);
            setEdgeSelectionIds([]);
          }}
        />
      )}
      {activeEdge && (
        <ConnectionEditor
          key={activeEdge.id}
          graph={live}
          edge={activeEdge}
          isNew={!!pendingEdge}
          onClose={() => {
            setEditingEdge(null);
            setPendingEdge(null);
          }}
          onSave={(edge) => {
            update({
              ...graph,
              edges: graph.edges.some((item) => item.id === edge.id)
                ? graph.edges.map((item) => (item.id === edge.id ? edge : item))
                : [...graph.edges, edge],
            });
            setEditingEdge(null);
            setPendingEdge(null);
          }}
          onDelete={() => {
            if (!pendingEdge)
              update({ ...graph, edges: graph.edges.filter((edge) => edge.id !== editingEdge) });
            setEditingEdge(null);
            setEdgeSelectionIds([]);
            setPendingEdge(null);
          }}
        />
      )}
    </>
  );
  return (
    <div className="px-8 pb-4.5 max-[1100px]:px-5.5 max-[1100px]:pb-4.5 max-[760px]:px-4 max-[760px]:pb-4 2xl:px-11 fullscreen:bg-[var(--ui-surface-0c1018)] fullscreen:w-full fullscreen:h-full fullscreen:overflow-auto fullscreen:p-6 max-[650px]:fullscreen:p-3">
      {view !== 'overview' && (
        <div className="grid grid-cols-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1 gap-3.5 mb-7">
          {[
            [
              'Net worth',
              money(t.netWorth),
              'Assets minus outstanding debt',
              t.netWorth < 0 ? 'negative text-coral' : 'text-text',
            ],
            ['Take-home income', money(t.takeHome), 'After the selected tax estimate', 'text-text'],
            [
              'Monthly commitments',
              money(t.expenses + t.payments),
              `${money(t.payments)} in debt payments`,
              'text-text',
            ],
            [
              'Available each month',
              money(t.surplus),
              t.surplus < 0
                ? 'Bills exceed take-home pay'
                : 'After bills; before savings transfers',
              t.surplus < 0 ? 'negative text-coral' : 'positive text-mint',
            ],
          ].map(([label, value, hint, tone]) => (
            <div className="rounded-xl p-[18px_20px] max-[1100px]:p-[15px_13px] border border-border bg-linear-to-b from-[var(--ui-surface-161c28)] to-[var(--ui-surface-111722)] flex flex-col gap-2" key={label}>
              <span className="text-xs text-muted font-normal">{label}</span>
              <strong className={`text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold tabular-nums ${tone}`}>{value}</strong>
              <small className="text-[11px] text-subtle leading-tight mt-auto">{hint}</small>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-4.5 flex-wrap mb-5">
        <div>
          <h2 className="text-[clamp(18px,2vw,24px)] font-semibold tracking-[-0.5px] text-text m-0">
            {view === 'graph'
              ? 'Node Graph'
              : view === 'overview'
                ? 'Your financial snapshot'
                : view === 'cashflow'
                  ? 'Monthly cash flow'
                  : view === 'budgeting'
                    ? 'Budgeting & transactions'
                    : 'Savings & investments'}
          </h2>
          <p className="text-xs text-muted mt-1.5 mb-0">
            {live.nodes.length} nodes · {live.edges.length} connections{' '}
            <span className="max-[1100px]:hidden">
              · {storageStatus || 'Edits stay in this browser; export to share'}
            </span>
          </p>
        </div>
        {view !== 'graph' && toolbar}
      </div>
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
      {view !== 'graph' && archivePanel}
      {error && (
        <div className="p-[12px_16px] text-xs rounded-lg mb-3.5 flex gap-3.5 items-center justify-between leading-[1.6] bg-[var(--ui-surface-331d2b)] text-[color:var(--ui-text-fda4af)] border border-[color:var(--ui-border-743247)]" role="alert">
          {error}
          <button
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-1.75 text-[11px] font-medium cursor-pointer bg-[var(--ui-surface-20293a)] text-text border border-[color:var(--ui-border-37445c)] hover:bg-[var(--ui-surface-hover-28354c)] transition-colors"
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
      {loaded && (
        <BudgetControls
          graph={live}
          onChange={(assumptions) => update({ ...graph, assumptions })}
          compact
        />
      )}
      {t.surplus < 0 && (
        <div className="p-[12px_16px] text-xs rounded-lg mb-3.5 flex gap-3.5 items-center justify-between leading-[1.6] bg-[var(--ui-surface-2b251b)] border border-[color:var(--ui-border-614b2c)] text-[color:var(--ui-text-e2c384)]">
          Your monthly shortfall is {money(-t.surplus)}. Forecasts draw from reserves and
          investments before adding new borrowing.
        </div>
      )}
      {!loaded ? (
        <div className="py-17.5 px-6 text-center text-[color:var(--ui-text-8d9fba)] text-xs" role="status">
          Loading your node graph…
        </div>
      ) : (
        <>
          <div className="flex gap-4 items-stretch max-[1100px]:flex-col">
            <div className="min-w-0 flex-1">
              {view === 'investing' && (
                <Investing
                  key={`${demo}:${userId}`}
                  storageKey={`finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`}
                />
              )}
              {view === 'overview' ? (
                <DashboardTab
                graph={live}
                goalsStorageKey={`${storageKey}:goals`}
              />
              ) : view === 'budgeting' ? (
                <BudgetingTab graph={live} />
              ) : view === 'graph' ? (
                <Canvas
                  toolbar={toolbar}
                  feedback={error}
                  panel={showArchive ? archivePanel : selected || activeEdge ? inspector : null}
                  connecting={connecting}
                  tool={tool}
                  selectionIds={selectionIds}
                  edgeSelectionIds={edgeSelectionIds}
                  onGroupSelect={selectGroup}
                  onConnect={connectNodes}
                  onViewportCenter={reportCenter}
                  graph={live}
                  selected={selected?.id}
                  search={search}
                  onSelect={selectAccount}
                  scopeIds={scopeIds}
                  onToggleScope={toggleSelection}
                  onEdgeSelect={selectEdge}
                  compact={compact}
                  onMove={(positions) => {
                    setSelectionIds(Object.keys(positions));
                    setEdgeSelectionIds([]);
                    setSelected(null);
                    setEditingEdge(null);
                    update({
                      ...graph,
                      nodes: graph.nodes.map((node) =>
                        positions[node.id] ? { ...node, position: positions[node.id] } : node,
                      ),
                    });
                  }}
                />
              ) : (
                <div className="border border-[color:var(--ui-border-2a3549)] rounded-[11px] bg-[var(--ui-surface-121a27)] overflow-auto min-h-87.5">
                  <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr>
                        <th className="text-[color:var(--ui-text-8192ad)] text-[10px] font-medium p-[16px_20px] bg-[var(--ui-surface-161f2e)]">Account</th>
                        <th className="text-[color:var(--ui-text-8192ad)] text-[10px] font-medium p-[16px_20px] bg-[var(--ui-surface-161f2e)]">Type</th>
                        <th className="text-[color:var(--ui-text-8192ad)] text-[10px] font-medium p-[16px_20px] bg-[var(--ui-surface-161f2e)]">{view === 'cashflow' ? 'Monthly flow / Balance' : 'Balance'}</th>
                        <th className="text-[color:var(--ui-text-8192ad)] text-[10px] font-medium p-[16px_20px] bg-[var(--ui-surface-161f2e)]">APR</th>
                        <th className="p-[16px_20px] bg-[var(--ui-surface-161f2e)]" />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((n) => (
                        <tr key={n.id}>
                          <td className="p-[13px_20px] border-t border-[color:var(--ui-border-263147)]">
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-2.5 shrink-0 align-middle" style={{ background: colors[n.nodeType] }} />
                            {n.name}
                          </td>
                          <td className="p-[13px_20px] border-t border-[color:var(--ui-border-263147)]">{typeLabel(n.nodeType)}</td>
                          <td className="p-[13px_20px] border-t border-[color:var(--ui-border-263147)]">
                            {money(
                              n.nodeType === 'EXPENSE' ? expenseAmount(n, live) : n.amountOrBalance,
                            )}
                            {['INCOME', 'EXPENSE'].includes(n.nodeType) ? '/mo' : ''}
                          </td>
                          <td className="p-[13px_20px] border-t border-[color:var(--ui-border-263147)]">{n.interestRateApr}%</td>
                          <td className="p-[13px_20px] border-t border-[color:var(--ui-border-263147)]">
                            <button className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[11px] font-medium cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors" onClick={() => setSelected(n)}>
                              Edit ↗
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="py-17.5 px-6 text-center text-[color:var(--ui-text-8d9fba)] text-xs">
                      No matching nodes. Add a node or adjust your search.
                    </div>
                  )}
                </div>
              )}
              <div className="border border-[color:var(--ui-border-30384e)] rounded-[11px] bg-linear-to-r from-[var(--ui-surface-1a1b2c)] to-[var(--ui-surface-151b29)] mt-3.75 p-[21px_22px] flex flex-col items-stretch gap-4.5">
                <div>
                  <div className="text-[8px] text-[color:var(--ui-text-b5a4e3)] mb-1.75 font-semibold tracking-wider">LOOK AHEAD</div>
                  <h3 className="text-sm font-semibold text-text m-0">What could your next chapter look like?</h3>
                  <p className="text-[11px] text-[color:var(--ui-text-8c9cb4)] mt-1.25 mb-0">Explore a range of outcomes from your current scenario.</p>
                </div>
                <section className="p-4 border border-[color:var(--ui-border-30465a)] rounded-xl bg-[var(--ui-surface-101c29)]">
                  <label className="flex items-center max-[650px]:items-stretch max-[650px]:flex-col gap-3.5 text-xs text-[color:var(--ui-text-b9c5d9)]">
                    Simulation scope
                    <select
                      className="bg-[var(--ui-surface-182536)] text-[color:var(--ui-text-e2edf9)] p-2.5 border border-[color:var(--ui-border-3a516c)] rounded-[7px] max-w-full text-xs"
                      value={scope}
                      onChange={(event) => setScope(event.target.value as typeof scope)}
                    >
                      <option value="all">All active nodes</option>
                      <option value="selected">Only selected nodes</option>
                      <option value="connected">Selected nodes and everything connected</option>
                    </select>
                  </label>
                  <strong className="block mt-3 text-xs text-[color:var(--ui-text-7de0bc)] font-medium">
                    {simulationGraph.nodes.length} of {live.nodes.length} nodes included
                  </strong>
                  {!!selectionIds.length && (
                    <button
                      className="mt-2.5 inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[11px] font-medium cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-[color:var(--ui-border-30465a)] hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors"
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
                      <p className="text-xs leading-[1.7] text-[color:var(--ui-text-99aec6)] my-3">
                        Select one or several nodes below. Canvas selections are used for editing
                        unless you choose “Use canvas selection for simulation.” Only included
                        income, expenses, balances, and internal connections are modeled. An
                        isolated account has no household income or bills unless you include them.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-3 max-h-55 overflow-auto">
                        {live.nodes.map((node) => (
                          <label key={node.id} className="flex items-center gap-1.75 border border-[color:var(--ui-border-2a3f56)] px-2.75 py-2 rounded-full text-xs bg-[var(--ui-surface-182738)] cursor-pointer text-text">
                            <input
                              type="checkbox"
                              className="accent-brand w-3.5 h-3.5"
                              checked={scopeIds.includes(node.id)}
                              onChange={() =>
                                setScopeIds((ids) =>
                                  ids.includes(node.id)
                                    ? ids.filter((id) => id !== node.id)
                                    : [...ids, node.id],
                                )
                              }
                            />
                            {node.name}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </section>
                <div className="flex flex-wrap gap-2.5">
                  <button
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-[color:var(--ui-text-d2c4ff)] border border-[color:var(--ui-border-51496e)] bg-[var(--ui-surface-30283f)] hover:bg-[var(--ui-surface-hover-3d3350)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    disabled={!simulationGraph.nodes.length}
                    onClick={() => setSimType('monte_carlo')}
                  >
                    Monte Carlo Simulation ↗
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-[var(--ui-surface-20293a)] text-text border border-[color:var(--ui-border-37445c)] hover:bg-[var(--ui-surface-hover-28354c)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    disabled={!simulationGraph.nodes.length}
                    onClick={() => setSimType('markov')}
                  >
                    Markov Regime Simulation ↗
                  </button>
                  <button
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-[var(--ui-surface-20293a)] text-text border border-[color:var(--ui-border-37445c)] hover:bg-[var(--ui-surface-hover-28354c)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
                    disabled={
                      !simulationGraph.nodes.some(
                        (n) => n.nodeType === 'DEBT' && n.amountOrBalance > 0,
                      )
                    }
                    onClick={() => setSimType('debt')}
                  >
                    Debt payoff ↗
                  </button>
                </div>
              </div>
            </div>
            {view !== 'graph' && inspector}
          </div>
          <section className="border border-[color:var(--ui-border-293449)] rounded-[10px] mt-5 bg-[var(--ui-surface-111925)]" ref={routesRef}>
            <button
              className="w-full p-[16px_19px] bg-transparent border-0 cursor-pointer flex justify-between items-center text-xs font-medium text-text hover:text-white transition-colors"
              aria-expanded={connections}
              onClick={() => setConnections(!connections)}
            >
              <span>
                Connections & monthly allocations <small className="text-[10px] text-[color:var(--ui-text-7e8da6)] ml-2.5 font-normal">{live.edges.length} routes</small>
              </span>
              <span>{connections ? '−' : '+'}</span>
            </button>
            {connections && (
              <div className="px-4.75 pb-4.5">
                <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] my-2 leading-[1.6]">
                  Incoming debt routes set payments unless the node has an override. Expense routes
                  from income/checking set monthly costs; percentages use starting take-home income.
                  Simulations fund fixed saving/investment routes first, then percentage routes,
                  then your extra-investment allocation.
                </p>
                <div className="my-3 max-h-60 overflow-auto">
                  {live.edges.map((edge) => (
                    <div key={edge.id} className="grid grid-cols-[minmax(120px,1fr)_auto_auto_auto] max-[650px]:grid-cols-[1fr_auto] items-center gap-3 border-b border-[color:var(--ui-border-263047)] py-2.5 text-[11px] text-text">
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
                      <button className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 py-1 text-[11px] font-medium cursor-pointer bg-transparent text-[color:var(--ui-text-97a7c2)] border border-transparent hover:bg-[var(--ui-surface-hover-1a2536)] hover:text-text transition-colors" onClick={() => selectEdge(edge.id)}>
                        Edit connection
                      </button>
                      <button
                        className="inline-flex items-center justify-center border border-[color:var(--ui-border-303c54)] bg-[var(--ui-surface-1a2538)] hover:bg-[var(--ui-surface-hover-25354e)] text-[color:var(--ui-text-d6e2f5)] rounded-[7px] w-6 h-6 shrink-0 cursor-pointer text-sm transition-colors"
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
                <form className="grid grid-cols-[1fr_1fr_1fr_1fr_auto] max-[760px]:grid-cols-2 max-[500px]:grid-cols-1 gap-2.5 items-end mt-4 [&_label]:flex [&_label]:flex-col [&_label]:gap-1.5 [&_label]:text-[11px] [&_label]:text-[color:var(--ui-text-a9b6cc)] [&_select]:w-full [&_select]:text-xs [&_select]:px-2.5 [&_select]:py-1.5 [&_select]:rounded-[7px] [&_select]:border [&_select]:border-border [&_select]:bg-base [&_select]:text-text [&_input]:w-full [&_input]:text-xs [&_input]:px-2.5 [&_input]:py-1.5 [&_input]:rounded-[7px] [&_input]:border [&_input]:border-border [&_input]:bg-base [&_input]:text-text" onSubmit={addConnection}>
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
                  <button className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-1.75 text-[11px] font-medium min-h-8.5 cursor-pointer bg-[var(--ui-surface-20293a)] text-text border border-[color:var(--ui-border-37445c)] hover:bg-[var(--ui-surface-hover-28354c)] transition-colors disabled:opacity-45 disabled:cursor-not-allowed" disabled={live.nodes.length < 2}>
                    + Connect
                  </button>
                </form>
              </div>
            )}
          </section>
        </>
      )}
      <footer className="flex justify-between gap-3 text-[color:var(--ui-text-5f728c)] text-[9px] mt-6">
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--ui-surface-73d9af)] mr-1 align-middle" /> Scenario workspace
        </span>
        <span>Educational modeling · All amounts in USD</span>
      </footer>
      {simType && (
        <Suspense
          fallback={
            <div className="fixed inset-0 z-100 bg-[var(--ui-surface-04070dbd)] backdrop-blur-md flex items-center justify-center p-[clamp(12px,3vw,40px)]">
              <div className="py-17.5 px-6 text-center text-[color:var(--ui-text-8d9fba)] text-xs" role="status">
                Opening scenario lab…
              </div>
            </div>
          }
        >
          <SimulationModal
            onAssumptionsChange={(assumptions) => update({ ...graph, assumptions })}
            graphData={simulationGraph}
            scopeLabel={`${scope === 'all' ? 'All active nodes' : scope === 'connected' ? 'Connected selection' : 'Selected nodes only'} · ${simulationGraph.nodes.length} nodes · ${simulationGraph.edges.length} connections`}
            simulationType={simType}
            onClose={closeSimulation}
          />
        </Suspense>
      )}
    </div>
  );
}
