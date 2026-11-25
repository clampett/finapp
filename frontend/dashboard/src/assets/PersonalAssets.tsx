import { useMemo, useState } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { AiAssetModal } from '../budgeting/AiAssetModal';
import { filterPersonalAssets, normalizeSearchQuery } from '../budgeting/budgeting-filters';
import { savePersonalAsset } from './personal-assets';

// Reused the scenario update pipeline so balances participated in persistence, undo, and forecasts.
export function PersonalAssets({
  graph,
  onUpdate,
  searchQuery = '',
  startDate = '',
  endDate = '',
}: {
  graph: GraphData;
  onUpdate?: (graph: GraphData) => void;
  searchQuery?: string;
  startDate?: string;
  endDate?: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [estimate, setEstimate] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [growth, setGrowth] = useState('0');
  const [message, setMessage] = useState('');
  const normalizedQuery = normalizeSearchQuery(searchQuery);
  const hasDateFilter = Boolean(startDate || endDate);

  const assets = useMemo(
    () => filterPersonalAssets(graph.nodes, searchQuery, startDate, endDate),
    [graph.nodes, searchQuery, startDate, endDate],
  );
  const button =
    'rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text cursor-pointer hover:bg-hover-bg disabled:opacity-50';
  const field = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text mt-2';
  function save(assetName: string, amount: number, rate: number, id?: string) {
    if (!onUpdate) return;
    try {
      // Applied a reviewed point-in-time valuation without writing income or changing cash.
      onUpdate(savePersonalAsset(graph, assetName, amount, rate, id));
      setOpen(false);
      setEstimate(false);
      setMessage('Asset balance saved to your scenario.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save asset.');
    }
  }
  function edit(node?: GraphNode) {
    setEditing(node?.id ?? null);
    setName(node?.name ?? '');
    setValue(node ? String(node.amountOrBalance) : '');
    setGrowth(String(node?.assetGrowthRate ?? 0));
    setEstimate(false);
    setMessage('');
    setOpen(true);
  }
  function update(node: GraphNode, changes: Partial<GraphNode>) {
    // Archived rather than discarded assets so restoration recovered their original assumptions.
    const now = new Date().toISOString();
    onUpdate?.({
      ...graph,
      nodes: graph.nodes.map((n) =>
        n.id === node.id ? { ...n, ...changes, createdAt: n.createdAt ?? now, updatedAt: now } : n,
      ),
    });
  }
  return (
    <section aria-labelledby="personal-assets-heading">
      <header className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div>
          <h3 id="personal-assets-heading" className="text-base font-semibold text-text">
            Your personal assets
          </h3>
          <p className="text-xs text-muted leading-relaxed mt-2 max-w-2xl">
            Track property, vehicles, and valuables you already own. Their full value counts toward
            net worth; record any related loan separately as debt.
          </p>
        </div>
        <div className="flex gap-2">
          <button className={button} disabled={!onUpdate} onClick={() => edit()}>
            Add asset
          </button>
          <button
            className={button}
            disabled={!onUpdate}
            onClick={() => {
              setOpen(false);
              setEstimate(!estimate);
            }}
          >
            Estimate asset value
          </button>
        </div>
      </header>
      <div className="rounded-xl border border-border bg-raised p-4 text-xs text-muted leading-relaxed mb-5">
        Included in Overview, Node Graph, and wealth simulations. Annual growth defaults to 0%;
        negative rates model depreciation. These assets are never automatically sold to pay bills.
        Balances are saved with this scenario on this browser; export the scenario to keep a
        portable copy. Avoid listing the same asset twice.
      </div>
      {estimate && (
        <AiAssetModal
          isOpen
          onCancel={() => setEstimate(false)}
          onSaveAsset={(assetName, amount) => save(assetName, amount, 0)}
        />
      )}
      {open && (
        <form
          className="rounded-xl border border-border bg-surface p-5 grid sm:grid-cols-3 gap-4 mb-5"
          onSubmit={(event) => {
            event.preventDefault();
            // Rejected empty drafts before converting text to numeric balances.
            if (!value.trim() || !growth.trim()) {
              setMessage('Enter a value and an annual growth rate.');
              return;
            }
            save(name, Number(value), Number(growth), editing ?? undefined);
          }}
        >
          <label className="text-xs text-muted">
            Asset name
            <input
              autoFocus
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-xs text-muted">
            Current value (USD)
            <NumberField
              required
              min={0}
              max={1e12}
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={field}
            />
          </label>
          <label className="text-xs text-muted">
            Annual growth / depreciation (%)
            <NumberField
              required
              min={-100}
              max={100}
              step="0.01"
              value={growth}
              onChange={(e) => setGrowth(e.target.value)}
              className={field}
            />
          </label>
          <div className="flex gap-2 sm:col-span-3">
            <button className={button}>Save asset</button>
            <button type="button" className={button} onClick={() => setOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {assets.map((node) => (
          <article key={node.id} className="rounded-xl border border-border bg-surface p-5">
            <div className="flex gap-3 justify-between">
              <h4 className="text-sm font-semibold text-text break-words min-w-0">{node.name}</h4>
              <span className="text-xs text-muted shrink-0">
                {node.archived ? 'Archived' : node.disabled ? 'Excluded' : 'Included'}
              </span>
            </div>
            <p className="text-xl text-text font-semibold mt-4">{dollars(node.amountOrBalance)}</p>
            <p className="text-xs text-muted mt-2">
              {node.assetGrowthRate ?? 0}% annual growth · Illiquid asset
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              {node.archived ? (
                <button className={button} onClick={() => update(node, { archived: false })}>
                  Restore
                </button>
              ) : (
                <>
                  <button className={button} onClick={() => edit(node)}>
                    Revalue / edit
                  </button>
                  <button
                    className={button}
                    onClick={() => update(node, { disabled: !node.disabled })}
                  >
                    {node.disabled ? 'Include' : 'Exclude'}
                  </button>
                  <button className={button} onClick={() => update(node, { archived: true })}>
                    Archive
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {!assets.length && (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted">
          {normalizedQuery || hasDateFilter
            ? 'No assets match your search or date filter.'
            : 'Add an owned asset or review an estimate to start tracking its value.'}
        </div>
      )}
      <p role="status" className="min-h-5 text-xs text-primary mt-4">
        {message}
      </p>
    </section>
  );
}
