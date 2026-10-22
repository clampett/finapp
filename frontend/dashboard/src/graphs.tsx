import * as d3 from 'd3';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { DashboardTab } from './DashboardTab';
const SimulationModal = lazy(() => import('./SimulationModal').then(module => ({ default: module.SimulationModal })));
import { API_BASE, colors, debtPayment, downloadJson, money, parseGraph, totals, typeLabel, types } from './finance';
import type { GraphData, GraphNode, SimulationType, View } from './finance';
function AccountEditor({ node, graph, onSave, onDelete, onClose }: {
    node: GraphNode;
    graph: GraphData;
    onSave: (n: GraphNode) => void;
    onDelete: () => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState(node);
    const submit = (e: FormEvent) => { e.preventDefault(); onSave({ ...draft, name: draft.name.trim() }); };
    return <aside className="inspector"><div className="section-heading"><div><div className="eyebrow">NODE DETAILS</div><h3>{graph.nodes.some(n => n.id === node.id) ? 'Edit node' : 'New node'}</h3></div><button className="icon-button" aria-label="Close node editor" onClick={onClose}>×</button></div>
    <form onSubmit={submit} className="editor-form"><label>Name<input required maxLength={100} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })}/></label>
      <label>Node type<select value={draft.nodeType} onChange={e => setDraft({ ...draft, nodeType: e.target.value as GraphNode['nodeType'] })}>{types.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>{['INCOME', 'EXPENSE'].includes(draft.nodeType) ? 'Monthly amount ($)' : 'Current balance ($)'}<input type="number" min={0} max={1e12} step="0.01" required value={draft.amountOrBalance} onChange={e => setDraft({ ...draft, amountOrBalance: Number(e.target.value) })}/></label>
      {!['INCOME', 'EXPENSE'].includes(draft.nodeType) && <label>Annual rate / APR (%)<input type="number" min={0} max={100} step="0.01" required value={draft.interestRateApr} onChange={e => setDraft({ ...draft, interestRateApr: Number(e.target.value) })}/></label>}
      {draft.nodeType === 'DEBT' && <label>Monthly payment override ($)<input type="number" min={0} max={1e9} step="0.01" placeholder={String(debtPayment(node, graph))} value={draft.minPayment ?? ''} onChange={e => setDraft({ ...draft, minPayment: e.target.value === '' ? undefined : Number(e.target.value) })}/><small>Leave blank to use a fixed incoming connection, or 2% of the starting balance.</small></label>}
      <p className="muted small">Use take-home monthly income. Balances and monthly flows are different quantities.</p>
      <button className="button primary" disabled={!draft.name.trim()}>Apply to scenario</button>
      {graph.nodes.some(n => n.id === node.id) && <button type="button" className="button danger" onClick={onDelete}>Remove node</button>}
    </form>
  </aside>;
}
function Canvas({ graph, selected, search, onSelect }: {
    graph: GraphData;
    selected?: string;
    search: string;
    onSelect: (n: GraphNode) => void;
}) {
    const ref = useRef<SVGSVGElement>(null);
    const host = useRef<HTMLDivElement>(null);
    const fitRef = useRef<() => void>(() => { });
    const zoomRef = useRef<(factor: number) => void>(() => { });
    useEffect(() => {
        if (!ref.current || !host.current)
            return;
        const svg = d3.select(ref.current);
        svg.selectAll('*').remove();
        const defs = svg.append('defs');
        defs.append('marker').attr('id', 'flow-arrow').attr('viewBox', '0 -5 10 10').attr('refX', 10).attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto').append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#52637a');
        const g = svg.append('g');
        const groups = [graph.nodes.filter(n => n.nodeType === 'INCOME'), graph.nodes.filter(n => ['CHECKING', 'SAVINGS'].includes(n.nodeType)), graph.nodes.filter(n => ['EXPENSE', 'DEBT', 'INVESTMENT'].includes(n.nodeType))];
        const positions = new Map<string, {
            x: number;
            y: number;
        }>();
        const cardWidth = 184, cardHeight = 76;
        groups.forEach((group, col) => group.forEach((n, i) => positions.set(n.id, { x: col * 310, y: i * 110 - (group.length - 1) * 55 })));
        const paths = g.append('g').selectAll('path').data(graph.edges).join('path').attr('fill', 'none').attr('stroke', '#39465b').attr('stroke-width', 1.5).attr('marker-end', 'url(#flow-arrow)');
        const labels = g.append('g').selectAll('text').data(graph.edges).join('text').attr('fill', '#91a0b7').attr('font-size', 10).attr('text-anchor', 'middle').attr('paint-order', 'stroke').attr('stroke', '#0e131d').attr('stroke-width', 5).text(e => e.monthlyFixedFlow != null ? `${money(e.monthlyFixedFlow)}/mo` : `${e.percentageFlow}%`);
        const cards = g.append('g').selectAll<SVGGElement, GraphNode>('g').data(graph.nodes).join('g').attr('class', 'canvas-node').attr('tabindex', 0).attr('role', 'button').attr('aria-label', n => `Edit ${n.name}, ${money(n.amountOrBalance)}`).attr('opacity', n => !search || n.name.toLowerCase().includes(search.toLowerCase()) ? 1 : .2).on('click', (_, n) => onSelect(n)).on('keydown', (e, n) => { if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(n);
        } });
        cards.append('rect').attr('width', cardWidth).attr('height', cardHeight).attr('rx', 12).attr('fill', '#171f2e').attr('stroke', n => n.id === selected ? '#e0e7ff' : colors[n.nodeType]).attr('stroke-opacity', n => n.id === selected ? 1 : .45).attr('stroke-width', n => n.id === selected ? 2 : 1);
        cards.append('circle').attr('cx', 15).attr('cy', 17).attr('r', 3).attr('fill', n => colors[n.nodeType]);
        cards.append('text').attr('x', 25).attr('y', 21).attr('fill', '#9caec7').attr('font-size', 9).attr('letter-spacing', '1px').text(n => n.nodeType);
        cards.append('text').attr('x', 14).attr('y', 40).attr('fill', '#e7edf8').attr('font-size', 12).text(n => n.name.length > 23 ? `${n.name.slice(0, 22)}…` : n.name);
        cards.append('text').attr('x', 14).attr('y', 62).attr('fill', n => colors[n.nodeType]).attr('font-size', 16).attr('font-weight', 650).text(n => `${money(n.amountOrBalance)}${['INCOME', 'EXPENSE'].includes(n.nodeType) ? ' /mo' : ''}`);
        cards.append('title').text(n => `${n.name}\n${typeLabel(n.nodeType)} · ${money(n.amountOrBalance)}\nClick to edit`);
        function draw() {
            cards.attr('transform', n => { const p = positions.get(n.id)!; return `translate(${p.x},${p.y})`; });
            paths.attr('d', e => { const a = positions.get(e.sourceNodeId)!, b = positions.get(e.targetNodeId)!; const forward = b.x >= a.x; const x1 = a.x + (forward ? cardWidth : 0), x2 = b.x + (forward ? 0 : cardWidth), y1 = a.y + cardHeight / 2, y2 = b.y + cardHeight / 2; return `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`; });
            labels.attr('x', e => (positions.get(e.sourceNodeId)!.x + positions.get(e.targetNodeId)!.x + cardWidth) / 2).attr('y', e => (positions.get(e.sourceNodeId)!.y + positions.get(e.targetNodeId)!.y) / 2 + 29);
        }
        cards.call(d3.drag<SVGGElement, GraphNode>().on('drag', (event, n) => { const p = positions.get(n.id)!; p.x += event.dx; p.y += event.dy; draw(); }));
        draw();
        const zoom = d3.zoom<SVGSVGElement, unknown>().scaleExtent([.15, 2.5]).on('zoom', event => g.attr('transform', event.transform));
        svg.call(zoom).on('dblclick.zoom', null);
        function fit() {
            const bounds = g.node()?.getBBox();
            if (!bounds || !bounds.width)
                return;
            const w = host.current!.clientWidth, h = host.current!.clientHeight;
            const scale = Math.min(1.15, (w - 56) / bounds.width, (h - 70) / bounds.height);
            svg.call(zoom.transform, d3.zoomIdentity.translate(w / 2, h / 2).scale(Math.max(.15, scale)).translate(-bounds.x - bounds.width / 2, -bounds.y - bounds.height / 2));
        }
        fitRef.current = fit;
        zoomRef.current = factor => svg.transition().duration(180).call(zoom.scaleBy, factor);
        const observer = new ResizeObserver(fit);
        observer.observe(host.current);
        fit();
        return () => { observer.disconnect(); svg.on('.zoom', null); svg.interrupt(); };
    }, [graph, selected, search, onSelect]);
    return <div className="canvas-host" ref={host}><div className="canvas-caption"><span className="status-dot"/> NODE CASH FLOW MAP <span>Drag to arrange · scroll to zoom · click to edit</span></div><svg ref={ref} aria-label="Financial account connections" className="financial-canvas"/>
    {!graph.nodes.length && <div className="canvas-empty"><h3>Start with your first node</h3><p>Add nodes for income, accounts, debts, and expenses to build your scenario.</p></div>}
    <div className="canvas-controls"><button aria-label="Zoom in" onClick={() => zoomRef.current(1.25)}>+</button><button aria-label="Zoom out" onClick={() => zoomRef.current(.8)}>−</button><button onClick={() => fitRef.current()}>Fit view</button></div>
    <div className="canvas-legend">{types.map(t => <span key={t}><i style={{ background: colors[t] }}/>{typeLabel(t)}</span>)}</div>
  </div>;
}
export function ArchetypeGraph({ userId, demo, view, search }: {
    userId: number;
    demo: boolean;
    view: View;
    search: string;
}) {
    const storageKey = `finapp-scenario-v2:${demo ? 'demo' : 'user'}:${userId}`;
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
            if (saved)
                draft = parseGraph(JSON.parse(saved));
        }
        catch { /* Ignore an unreadable draft and load the server profile. */ }
        (async () => {
            try {
                const response = await fetch(`${API_BASE}/graph/${userId}`, { signal: controller.signal });
                if (!response.ok)
                    throw new Error(`Could not load accounts (${response.status}). Check that the Java backend is running.`);
                const body = await response.json();
                if (!body.success)
                    throw new Error(body.message || 'Could not load this financial profile.');
                const source = parseGraph(body.data);
                setOriginal(source);
                setGraph(draft ?? source);
            }
            catch (err) {
                if (controller.signal.aborted)
                    return;
                if (draft) {
                    setGraph(draft);
                    setStorageStatus('Using your local scenario. The server is unavailable.');
                }
                else
                    setError(err instanceof Error ? err.message : 'Unable to load financial data.');
            }
            finally {
                if (!controller.signal.aborted)
                    setLoaded(true);
            }
        })();
        return () => controller.abort();
    }, [userId, storageKey, reload]);
    const update = (next: GraphData) => {
        try {
            const valid = parseGraph(next);
            setGraph(valid);
            setError('');
            try {
                localStorage.setItem(storageKey, JSON.stringify(valid));
                setStorageStatus('Scenario saved on this device');
            }
            catch {
                setStorageStatus('Browser storage unavailable. Export your scenario to keep changes.');
            }
        }
        catch (err) {
            setError((err as Error).message);
        }
    };
    const t = totals(graph);
    const filtered = graph.nodes.filter(n => n.name.toLowerCase().includes(search.toLowerCase()) && (view !== 'investing' || ['INVESTMENT', 'SAVINGS'].includes(n.nodeType)));
    const selectAccount = useCallback((n: GraphNode) => setSelected(n), []);
    const add = () => setSelected({ id: crypto.randomUUID(), name: '', nodeType: 'CHECKING', amountOrBalance: 0, interestRateApr: 0 });
    const reset = () => { if (original && window.confirm('Reset this scenario to the server profile? Your local edits will be replaced.')) {
        update(structuredClone(original));
        setSelected(null);
    } };
    const addConnection = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const percentage = form.get('mode') === 'percent';
        update({ ...graph, edges: [...graph.edges, { id: crypto.randomUUID(), sourceNodeId: String(form.get('source')), targetNodeId: String(form.get('target')), monthlyFixedFlow: percentage ? null : Number(form.get('amount')), percentageFlow: percentage ? Number(form.get('amount')) : null }] });
    };
    return <div className="workspace-content">
    {view !== 'overview' && (
    <div className="metric-grid">{[
            ['Net worth', money(t.netWorth), 'Assets minus outstanding debt', t.netWorth < 0 ? 'negative' : ''],
            ['Monthly income', money(t.income), 'Recurring take-home income', ''],
            ['Monthly commitments', money(t.expenses + t.payments), `${money(t.payments)} in debt payments`, ''],
            ['Available each month', money(t.surplus), t.surplus < 0 ? 'Expenses exceed your income' : 'After expenses and debt payments', t.surplus < 0 ? 'negative' : 'positive'],
        ].map(([label, value, hint, tone]) => <div className="metric-card" key={label}><span>{label}</span><strong className={tone}>{value}</strong><small>{hint}</small></div>)}</div>
)}
    <div className="section-heading workspace-toolbar"><div><h2>{view === 'graph' ? 'Node Graph' : view === 'overview' ? 'Your financial snapshot' : view === 'budgeting' ? 'Monthly cash flow' : 'Savings & investments'}</h2><p>{graph.nodes.length} nodes · {graph.edges.length} connections <span className="toolbar-note">· {storageStatus || 'Edits stay in this browser; export to share'}</span></p></div><div className="button-row"><button className="button" onClick={() => importRef.current?.click()}>Import</button><button className="button" onClick={() => downloadJson(graph, `finapp-scenario-${userId}.json`)}>Export</button><button className="button" disabled={!original} onClick={reset}>Reset</button><button className="button primary" onClick={add}>+ Add node</button></div></div>
    <input ref={importRef} type="file" className="sr-only" accept=".json,application/json" aria-label="Import scenario JSON" onChange={async (e) => { const file = e.target.files?.[0]; if (!file)
        return; try {
        if (file.size > 2000000)
            throw new Error('Choose a JSON file smaller than 2 MB.');
        update(parseGraph(JSON.parse(await file.text())));
        setSelected(null);
    }
    catch (err) {
        setError((err as Error).message);
    } e.target.value = ''; }}/>
    {error && <div className="notice error" role="alert">{error}<button className="button" onClick={() => { setLoaded(false); setError(''); setReload(n => n + 1); }}>Retry loading</button></div>}
    {t.surplus < 0 && <div className="notice warning">Your monthly shortfall is {money(-t.surplus)}. Forecasts draw from reserves and investments before adding new borrowing.</div>}
    {!loaded ? <div className="loading-panel" role="status">Loading your node graph…</div> : <>
               <div className="scenario-layout"><div className="scenario-main">
        {view === 'overview' ? <DashboardTab graph={graph}/> : view === 'graph' ? <Canvas graph={graph} selected={selected?.id} search={search} onSelect={selectAccount}/> : <div className="account-table-wrap"><table className="account-table"><thead><tr><th>Account</th><th>Type</th><th>{view === 'budgeting' ? 'Monthly flow / Balance' : 'Balance'}</th><th>APR</th><th /></tr></thead><tbody>{filtered.map(n => <tr key={n.id}><td><span className="type-dot" style={{ background: colors[n.nodeType] }}/>{n.name}</td><td>{typeLabel(n.nodeType)}</td><td>{money(n.amountOrBalance)}{['INCOME', 'EXPENSE'].includes(n.nodeType) ? '/mo' : ''}</td><td>{n.interestRateApr}%</td><td><button className="button quiet" onClick={() => setSelected(n)}>Edit ↗</button></td></tr>)}</tbody></table>{!filtered.length && <div className="loading-panel">No matching nodes. Add a node or adjust your search.</div>}</div>}
        <div className="simulation-launcher"><div><div className="eyebrow">LOOK AHEAD</div><h3>What could your next chapter look like?</h3><p>Explore a range of outcomes from your current scenario.</p></div><div className="button-row"><button className="button forecast-button" disabled={!graph.nodes.length} onClick={() => setSimType('monte_carlo')}>Wealth projection ↗</button><button className="button" disabled={!graph.nodes.length} onClick={() => setSimType('markov')}>Market regimes ↗</button><button className="button" disabled={!graph.nodes.some(n => n.nodeType === 'DEBT' && n.amountOrBalance > 0)} onClick={() => setSimType('debt')}>Debt payoff ↗</button></div></div>
      </div>{selected && <AccountEditor key={selected.id} node={selected} graph={graph} onClose={() => setSelected(null)} onSave={n => { update({ ...graph, nodes: graph.nodes.some(a => a.id === n.id) ? graph.nodes.map(a => a.id === n.id ? n : a) : [...graph.nodes, n] }); setSelected(null); }} onDelete={() => { update({ nodes: graph.nodes.filter(n => n.id !== selected.id), edges: graph.edges.filter(e => e.sourceNodeId !== selected.id && e.targetNodeId !== selected.id) }); setSelected(null); }}/>}</div>
      <section className="connections-panel"><button className="connections-toggle" aria-expanded={connections} onClick={() => setConnections(!connections)}><span>Connections & monthly allocations <small>{graph.edges.length} routes</small></span><span>{connections ? '−' : '+'}</span></button>{connections && <div className="connections-body"><p className="muted small">Fixed connections into debts set their monthly payments. Other connections describe your plan; the wealth forecast uses account totals and your investment-rate control.</p><div className="connection-list">{graph.edges.map(edge => <div key={edge.id}><span>{graph.nodes.find(n => n.id === edge.sourceNodeId)?.name} <span className="muted">→</span> {graph.nodes.find(n => n.id === edge.targetNodeId)?.name}</span><strong>{edge.monthlyFixedFlow != null ? `${money(edge.monthlyFixedFlow)}/mo` : `${edge.percentageFlow}%`}</strong><button className="icon-button" aria-label="Remove connection" onClick={() => update({ ...graph, edges: graph.edges.filter(e => e.id !== edge.id) })}>×</button></div>)}</div>
        <form className="connection-form" onSubmit={addConnection}><label>From<select name="source" required>{graph.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>To<select name="target" required defaultValue={graph.nodes[1]?.id}>{graph.nodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></label><label>Flow<select name="mode"><option value="fixed">Dollars / month</option><option value="percent">Percentage</option></select></label><label>Amount<input name="amount" type="number" min={0} max={1e9} step="0.01" required/></label><button className="button" disabled={graph.nodes.length < 2}>+ Connect</button></form></div>}</section>
    </>}
    <footer className="workspace-footer"><span><span className="status-dot"/> Scenario workspace</span><span>Educational modeling · All amounts in USD</span></footer>
    {simType && <Suspense fallback={<div className="modal-backdrop"><div className="loading-panel" role="status">Opening scenario lab…</div></div>}><SimulationModal graphData={graph} simulationType={simType} onClose={() => setSimType(null)}/></Suspense>}
  </div>;
}
