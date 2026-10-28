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
        <section className="node-archive">
          <div className="section-heading">
            <h3>Recently removed nodes</h3>
            <button
              className="icon-button"
              aria-label="Close restore panel"
              title="Close"
              onClick={() => setShowArchive(false)}
            >
              <CanvasIcon name="close" />
            </button>
          </div>
          <p>
            Restored nodes recover their saved values, position, and connections when both endpoints
            are active.
          </p>
          {graph.nodes
            .filter((node) => node.archived)
            .map((node) => (
              <div key={node.id}>
                <span>
                  {node.name} · {typeLabel(node.nodeType)}
                </span>
                <button
                  className="button"
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
            <p>No removed nodes. Undo also restores recent edits.</p>
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
    <div className={`workspace-content node-workspace${compact ? ' compact-nodes' : ''}`}>
      {view !== 'overview' && (
        <div className="metric-grid">
          {[
            [
              'Net worth',
              money(t.netWorth),
              'Assets minus outstanding debt',
              t.netWorth < 0 ? 'negative' : '',
            ],
            ['Take-home income', money(t.takeHome), 'After the selected tax estimate', ''],
            [
              'Monthly commitments',
              money(t.expenses + t.payments),
              `${money(t.payments)} in debt payments`,
              '',
            ],
            [
              'Available each month',
              money(t.surplus),
              t.surplus < 0
                ? 'Bills exceed take-home pay'
                : 'After bills; before savings transfers',
              t.surplus < 0 ? 'negative' : 'positive',
            ],
          ].map(([label, value, hint, tone]) => (
            <div className="metric-card" key={label}>
              <span>{label}</span>
              <strong className={tone}>{value}</strong>
              <small>{hint}</small>
            </div>
          ))}
        </div>
      )}
      <div className="section-heading workspace-toolbar">
        <div>
          <h2>
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
          <p>
            {live.nodes.length} nodes · {live.edges.length} connections{' '}
            <span className="toolbar-note">
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
        <div className="notice error" role="alert">
          {error}
          <button
            className="button"
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
        <div className="notice warning">
          Your monthly shortfall is {money(-t.surplus)}. Forecasts draw from reserves and
          investments before adding new borrowing.
        </div>
      )}
      {!loaded ? (
        <div className="loading-panel" role="status">
          Loading your node graph…
        </div>
      ) : (
        <>
          <div className="scenario-layout">
            <div className="scenario-main">
              {view === 'investing' && (
                <Investing
                  key={`${demo}:${userId}`}
                  storageKey={`finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`}
                />
              )}
              {view === 'overview' ? (
                <DashboardTab graph={live} />
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
                <div className="account-table-wrap">
                  <table className="account-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th>{view === 'cashflow' ? 'Monthly flow / Balance' : 'Balance'}</th>
                        <th>APR</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((n) => (
                        <tr key={n.id}>
                          <td>
                            <span className="type-dot" style={{ background: colors[n.nodeType] }} />
                            {n.name}
                          </td>
                          <td>{typeLabel(n.nodeType)}</td>
                          <td>
                            {money(
                              n.nodeType === 'EXPENSE' ? expenseAmount(n, live) : n.amountOrBalance,
                            )}
                            {['INCOME', 'EXPENSE'].includes(n.nodeType) ? '/mo' : ''}
                          </td>
                          <td>{n.interestRateApr}%</td>
                          <td>
                            <button className="button quiet" onClick={() => setSelected(n)}>
                              Edit ↗
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filtered.length && (
                    <div className="loading-panel">
                      No matching nodes. Add a node or adjust your search.
                    </div>
                  )}
                </div>
              )}
              <div className="simulation-launcher">
                <div>
                  <div className="eyebrow">LOOK AHEAD</div>
                  <h3>What could your next chapter look like?</h3>
                  <p>Explore a range of outcomes from your current scenario.</p>
                </div>
                <section className="simulation-scope">
                  <label>
                    Simulation scope
                    <select
                      value={scope}
                      onChange={(event) => setScope(event.target.value as typeof scope)}
                    >
                      <option value="all">All active nodes</option>
                      <option value="selected">Only selected nodes</option>
                      <option value="connected">Selected nodes and everything connected</option>
                    </select>
                  </label>
                  <strong>
                    {simulationGraph.nodes.length} of {live.nodes.length} nodes included
                  </strong>
                  {!!selectionIds.length && (
                    <button
                      className="button quiet"
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
                      <p>
                        Select one or several nodes below. Canvas selections are used for editing
                        unless you choose “Use canvas selection for simulation.” Only included
                        income, expenses, balances, and internal connections are modeled. An
                        isolated account has no household income or bills unless you include them.
                      </p>
                      <div className="scope-node-list">
                        {live.nodes.map((node) => (
                          <label key={node.id}>
                            <input
                              type="checkbox"
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
                <div className="button-row">
                  <button
                    className="button forecast-button"
                    disabled={!simulationGraph.nodes.length}
                    onClick={() => setSimType('monte_carlo')}
                  >
                    Monte Carlo Simulation ↗
                  </button>
                  <button
                    className="button"
                    disabled={!simulationGraph.nodes.length}
                    onClick={() => setSimType('markov')}
                  >
                    Markov Regime Simulation ↗
                  </button>
                  <button
                    className="button"
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
          <section className="connections-panel" ref={routesRef}>
            <button
              className="connections-toggle"
              aria-expanded={connections}
              onClick={() => setConnections(!connections)}
            >
              <span>
                Connections & monthly allocations <small>{live.edges.length} routes</small>
              </span>
              <span>{connections ? '−' : '+'}</span>
            </button>
            {connections && (
              <div className="connections-body">
                <p className="muted small">
                  Incoming debt routes set payments unless the node has an override. Expense routes
                  from income/checking set monthly costs; percentages use starting take-home income.
                  Simulations fund fixed saving/investment routes first, then percentage routes,
                  then your extra-investment allocation.
                </p>
                <div className="connection-list">
                  {live.edges.map((edge) => (
                    <div key={edge.id}>
                      <span>
                        {graph.nodes.find((n) => n.id === edge.sourceNodeId)?.name}{' '}
                        <span className="muted">→</span>{' '}
                        {graph.nodes.find((n) => n.id === edge.targetNodeId)?.name}
                      </span>
                      <strong>
                        {edge.monthlyFixedFlow != null
                          ? `${money(edge.monthlyFixedFlow)}/mo`
                          : `${edge.percentageFlow}%`}
                      </strong>
                      <button className="button quiet" onClick={() => selectEdge(edge.id)}>
                        Edit connection
                      </button>
                      <button
                        className="icon-button"
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
                <form className="connection-form" onSubmit={addConnection}>
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
                  <button className="button" disabled={live.nodes.length < 2}>
                    + Connect
                  </button>
                </form>
              </div>
            )}
          </section>
        </>
      )}
      <footer className="workspace-footer">
        <span>
          <span className="status-dot" /> Scenario workspace
        </span>
        <span>Educational modeling · All amounts in USD</span>
      </footer>
      {simType && (
        <Suspense
          fallback={
            <div className="modal-backdrop">
              <div className="loading-panel" role="status">
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
