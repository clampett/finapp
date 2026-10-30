import { NumberField } from './NumberField';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { debtPayment, expenseAmount, types } from '../finance';
import type { GraphData, GraphNode } from '../finance';

export function AccountEditor({
  node,
  graph,
  onSave,
  onDelete,
  onClose,
  onEditRoute,
}: {
  node: GraphNode;
  graph: GraphData;
  onSave: (n: GraphNode) => void;
  onDelete: () => void;
  onClose: () => void;
  onEditRoute: (id: string) => void;
}) {
  // Kept edits in a local draft until Apply was chosen, preventing partial form
  // input from recalculating the saved scenario before validation had passed.
  const [draft, setDraft] = useState(node);
  const expenseRoutes =
    draft.nodeType === 'EXPENSE'
      ? graph.edges.filter(
          (edge) =>
            edge.targetNodeId === draft.id &&
            graph.nodes.some(
              (source) =>
                source.id === edge.sourceNodeId && ['INCOME', 'CHECKING'].includes(source.nodeType),
            ),
        )
      : [];
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ ...draft, name: draft.name.trim() });
  };
  return (
    <aside className="w-71.25 border border-[color:var(--ui-border-334055)] rounded-[11px] p-4.75 bg-[var(--ui-surface-151d2b)] shrink-0 max-md:w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[9px] text-[color:var(--ui-text-a9b7ce)] tracking-[1.7px] font-semibold mb-2.5 max-md:mb-1.25">NODE DETAILS</div>
          <h3 className="text-[15px] font-semibold text-text m-0">{graph.nodes.some((n) => n.id === node.id) ? 'Edit node' : 'New node'}</h3>
        </div>
        <button className="p-0 leading-none bg-[var(--ui-surface-1d2737)] hover:bg-[var(--ui-surface-hover-263346)] border border-[color:var(--ui-border-334057)] rounded-[7px] grid place-items-center w-7.5 h-7.5 text-[20px] text-[color:var(--ui-text-a5b5cd)] hover:text-white shrink-0 cursor-pointer" aria-label="Close node editor" onClick={onClose}>
          <svg
            className="block"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3.75 mt-5.5 max-md:grid max-md:grid-cols-2">
        <label className="flex flex-col gap-1.75 text-[11px] text-[color:var(--ui-text-a9b6cc)]">
          Name
          <input
            className="w-full text-xs min-w-0 border border-border rounded-lg bg-[var(--ui-surface-101722)] text-[color:var(--ui-text-edf2fa)] px-2.75 py-2.5"
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1.75 text-[11px] text-[color:var(--ui-text-a9b6cc)]">
          Node type
          <select
            className="w-full text-xs min-w-0 border border-border rounded-lg bg-[var(--ui-surface-101722)] text-[color:var(--ui-text-edf2fa)] px-2.75 py-2.5 cursor-pointer"
            value={draft.nodeType}
            onChange={(e) =>
              setDraft({ ...draft, nodeType: e.target.value as GraphNode['nodeType'] })
            }
          >
            {types.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.75 text-[11px] text-[color:var(--ui-text-a9b6cc)]">
          {['INCOME', 'EXPENSE'].includes(draft.nodeType)
            ? 'Monthly amount ($)'
            : 'Current balance ($)'}
          <NumberField
            type="number"
            min={0}
            max={1e12}
            step="0.01"
            required
            value={expenseRoutes.length ? expenseAmount(draft, graph) : draft.amountOrBalance}
            disabled={expenseRoutes.length > 0}
            onChange={(e) => setDraft({ ...draft, amountOrBalance: Number(e.target.value) })}
          />
        </label>
        {expenseRoutes.length > 0 && (
          <div className="p-[12px_16px] text-xs rounded-lg mb-3.5 flex gap-3.5 items-center justify-between leading-relaxed bg-[var(--ui-surface-192332)] border border-[color:var(--ui-border-2e3e54)] text-[color:var(--ui-text-a9b8cc)]">
            <p className="m-0">
              This expense is controlled by {expenseRoutes.length} incoming route(s). Edit a route
              to change its monthly amount without keeping two conflicting values.
            </p>
            {expenseRoutes.map((edge) => (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap border border-[color:var(--ui-border-344056)] rounded-[7px] px-3.25 py-2.25 bg-[var(--ui-surface-182131)] hover:bg-[var(--ui-surface-hover-232f43)] hover:border-[color:var(--ui-border-65738c)] text-[11px] font-medium min-h-8.5 cursor-pointer text-text"
                key={edge.id}
                onClick={() => onEditRoute(edge.id)}
              >
                Edit expense route
              </button>
            ))}
          </div>
        )}
        {!['INCOME', 'EXPENSE'].includes(draft.nodeType) && (
          <label className="flex flex-col gap-1.75 text-[11px] text-[color:var(--ui-text-a9b6cc)]">
            {draft.nodeType === 'INVESTMENT'
              ? 'Reference return (%; model uses market settings)'
              : 'Annual cash yield / loan APR (%)'}
            <NumberField
              type="number"
              min={0}
              max={100}
              step="0.01"
              required
              value={draft.interestRateApr}
              onChange={(e) => setDraft({ ...draft, interestRateApr: Number(e.target.value) })}
            />
          </label>
        )}
        {draft.nodeType === 'DEBT' && (
          <label className="flex flex-col gap-1.75 text-[11px] text-[color:var(--ui-text-a9b6cc)]">
            Monthly payment override ($)
            <NumberField
              type="number"
              min={0}
              max={1e9}
              step="0.01"
              placeholder={String(debtPayment(node, graph))}
              value={draft.minPayment ?? ''}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  minPayment: e.target.value === '' ? undefined : Number(e.target.value),
                })
              }
            />
            <small className="text-[10px] text-[color:var(--ui-text-7d91ac)] leading-normal">
              Leave blank to use incoming payment routes, or 2% of the starting balance when no
              route is present.
            </small>
          </label>
        )}
        <p className="text-[color:var(--ui-text-8b9ab1)] text-[11px] leading-normal m-0">
          Income follows the scenario’s gross/net setting. Expenses are monthly flows; other nodes
          hold balances.
        </p>
        <button className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-[var(--ui-surface-hover-cbbafa)] disabled:opacity-40 disabled:cursor-not-allowed" disabled={!draft.name.trim()}>
          Apply to scenario
        </button>
        {graph.nodes.some((n) => n.id === node.id) && (
          <button type="button" className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-[color:var(--ui-border-633246)] bg-[var(--ui-surface-2b1b28)] hover:bg-[var(--ui-surface-hover-3d2034)]" onClick={onDelete}>
            Remove node
          </button>
        )}
      </form>
    </aside>
  );
}
