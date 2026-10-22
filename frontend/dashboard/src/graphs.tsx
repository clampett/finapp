import { AccountEditor } from './components/AccountEditor';
import { Canvas } from './components/Canvas';
import { clearSession, sessionHeaders } from './session';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, colors, downloadJson, money, parseGraph, totals, typeLabel } from './finance';
import type { GraphData, GraphNode, SimulationType, View } from './finance';

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
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [original, setOriginal] = useState<GraphData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [storageStatus, setStorageStatus] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [simType, setSimType] = useState<SimulationType | null>(null);
  const [connections, setConnections] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
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
        setGraph(draft ?? source);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (draft) {
          setGraph(draft);
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
      setGraph(valid);
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
  const t = totals(graph);
  const filtered = graph.nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(search.toLowerCase()) &&
      (view !== 'investing' || ['INVESTMENT', 'SAVINGS'].includes(n.nodeType)),
  );
  const selectAccount = useCallback((n: GraphNode) => setSelected(n), []);
  const add = () =>
    setSelected({
      id: crypto.randomUUID(),
      name: '',
      nodeType: 'CHECKING',
      amountOrBalance: 0,
      interestRateApr: 0,
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
  return (
    <div className="workspace-content">
      <div className="metric-grid">
        {[
          [
            'Net worth',
            money(t.netWorth),
            'Assets minus outstanding debt',
            t.netWorth < 0 ? 'negative' : '',
          ],
          ['Monthly income', money(t.income), 'Recurring take-home income', ''],
          [
            'Monthly commitments',
            money(t.expenses + t.payments),
            `${money(t.payments)} in debt payments`,
            '',
          ],
          [
            'Available each month',
            money(t.surplus),
            t.surplus < 0 ? 'Expenses exceed your income' : 'After expenses and debt payments',
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
      <div className="section-heading workspace-toolbar">
        <div>
          <h2>
            {view === 'graph'
              ? 'Node Graph'
              : view === 'overview'
                ? 'Your financial snapshot'
                : view === 'budgeting'
                  ? 'Monthly cash flow'
                  : 'Savings & investments'}
          </h2>
          <p>
            {graph.nodes.length} nodes · {graph.edges.length} connections{' '}
            <span className="toolbar-note">
              · {storageStatus || 'Edits stay in this browser; export to share'}
            </span>
          </p>
        </div>
        <div className="button-row">
          <button className="button" onClick={() => importRef.current?.click()}>
            Import
          </button>
          <button
            className="button"
            onClick={() => downloadJson(graph, `finapp-scenario-${userId}.json`)}
          >
            Export
          </button>
          <button className="button" disabled={!original} onClick={reset}>
            Reset
          </button>
          <button className="button primary" onClick={add}>
            + Add node
          </button>
        </div>
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
              {view === 'graph' || view === 'overview' ? (
                <Canvas
                  graph={graph}
                  selected={selected?.id}
                  search={search}
                  onSelect={selectAccount}
                />
              ) : (
                <div className="account-table-wrap">
                  <table className="account-table">
                    <thead>
                      <tr>
                        <th>Account</th>
                        <th>Type</th>
                        <th>{view === 'budgeting' ? 'Monthly flow / Balance' : 'Balance'}</th>
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
                            {money(n.amountOrBalance)}
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
                <div className="button-row">
                  <button
                    className="button forecast-button"
                    disabled={!graph.nodes.length}
                    onClick={() => setSimType('monte_carlo')}
                  >
                    Wealth projection ↗
                  </button>
                  <button
                    className="button"
                    disabled={!graph.nodes.length}
                    onClick={() => setSimType('markov')}
                  >
                    Market regimes ↗
                  </button>
                  <button
                    className="button"
                    disabled={
                      !graph.nodes.some((n) => n.nodeType === 'DEBT' && n.amountOrBalance > 0)
                    }
                    onClick={() => setSimType('debt')}
                  >
                    Debt payoff ↗
                  </button>
                </div>
              </div>
            </div>
            {selected && (
              <AccountEditor
                key={selected.id}
                node={selected}
                graph={graph}
                onClose={() => setSelected(null)}
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
                    nodes: graph.nodes.filter((n) => n.id !== selected.id),
                    edges: graph.edges.filter(
                      (e) => e.sourceNodeId !== selected.id && e.targetNodeId !== selected.id,
                    ),
                  });
                  setSelected(null);
                }}
              />
            )}
          </div>
          <section className="connections-panel">
            <button
              className="connections-toggle"
              aria-expanded={connections}
              onClick={() => setConnections(!connections)}
            >
              <span>
                Connections & monthly allocations <small>{graph.edges.length} routes</small>
              </span>
              <span>{connections ? '−' : '+'}</span>
            </button>
            {connections && (
              <div className="connections-body">
                <p className="muted small">
                  Fixed connections into debts set their monthly payments. Other connections
                  describe your plan; the wealth forecast uses account totals and your
                  investment-rate control.
                </p>
                <div className="connection-list">
                  {graph.edges.map((edge) => (
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
                      {graph.nodes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    To
                    <select name="target" required defaultValue={graph.nodes[1]?.id}>
                      {graph.nodes.map((n) => (
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
                  <button className="button" disabled={graph.nodes.length < 2}>
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
            graphData={graph}
            simulationType={simType}
            onClose={() => setSimType(null)}
          />
        </Suspense>
      )}
    </div>
  );
}
