import { useState } from 'react';
import type { FormEvent } from 'react';
import { debtPayment, types } from '../finance';
import type { GraphData, GraphNode } from '../finance';

export function AccountEditor({
  node,
  graph,
  onSave,
  onDelete,
  onClose,
}: {
  node: GraphNode;
  graph: GraphData;
  onSave: (n: GraphNode) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // Kept edits in a local draft until Apply was chosen, preventing partial form
  // input from recalculating the saved scenario before validation had passed.
  const [draft, setDraft] = useState(node);
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
          ×
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
          <input
            type="number"
            min={0}
            max={1e12}
            step="0.01"
            required
            value={draft.amountOrBalance}
            onChange={(e) => setDraft({ ...draft, amountOrBalance: Number(e.target.value) })}
          />
        </label>
        {!['INCOME', 'EXPENSE'].includes(draft.nodeType) && (
          <label>
            Annual rate / APR (%)
            <input
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
            <input
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
              Leave blank to use a fixed incoming connection, or 2% of the starting balance.
            </small>
          </label>
        )}
        <p className="muted small">
          Use take-home monthly income. Balances and monthly flows are different quantities.
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
