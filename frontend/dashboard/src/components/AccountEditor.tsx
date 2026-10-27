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
    <aside className="inspector">
      <div className="section-heading">
        <div>
          <div className="eyebrow">NODE DETAILS</div>
          <h3>{graph.nodes.some((n) => n.id === node.id) ? 'Edit node' : 'New node'}</h3>
        </div>
        <button className="icon-button" aria-label="Close node editor" onClick={onClose}>
          <svg
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
      <form onSubmit={submit} className="editor-form">
        <label>
          Name
          <input
            required
            maxLength={100}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Node type
          <select
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
        <label>
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
          <div className="notice">
            <p>
              This expense is controlled by {expenseRoutes.length} incoming route(s). Edit a route
              to change its monthly amount without keeping two conflicting values.
            </p>
            {expenseRoutes.map((edge) => (
              <button
                type="button"
                className="button"
                key={edge.id}
                onClick={() => onEditRoute(edge.id)}
              >
                Edit expense route
              </button>
            ))}
          </div>
        )}
        {!['INCOME', 'EXPENSE'].includes(draft.nodeType) && (
          <label>
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
          <label>
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
            <small>
              Leave blank to use incoming payment routes, or 2% of the starting balance when no
              route is present.
            </small>
          </label>
        )}
        <p className="muted small">
          Income follows the scenario’s gross/net setting. Expenses are monthly flows; other nodes
          hold balances.
        </p>
        <button className="button primary" disabled={!draft.name.trim()}>
          Apply to scenario
        </button>
        {graph.nodes.some((n) => n.id === node.id) && (
          <button type="button" className="button danger" onClick={onDelete}>
            Remove node
          </button>
        )}
      </form>
    </aside>
  );
}
