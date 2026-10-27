import { NumberField } from './NumberField';
import { useState } from 'react';
import { CanvasIcon } from './CanvasIcon';
import type { GraphData, GraphEdge } from '../finance';

export function ConnectionEditor({
  edge,
  graph,
  onSave,
  onDelete,
  onClose,
  isNew = false,
}: {
  edge: GraphEdge;
  graph: GraphData;
  onSave: (edge: GraphEdge) => void;
  onDelete: () => void;
  onClose: () => void;
  isNew?: boolean;
}) {
  const [draft, setDraft] = useState(edge);
  const percent = draft.percentageFlow != null;
  const target = graph.nodes.find((node) => node.id === draft.targetNodeId);
  return (
    <aside className="inspector connection-inspector">
      <div className="section-heading">
        <div>
          <div className="eyebrow">MONTHLY ROUTE</div>
          <h3>{isNew ? 'New connection' : 'Edit connection'}</h3>
        </div>
        <button
          className="icon-button"
          aria-label="Close connection editor"
          title="Close"
          onClick={onClose}
        >
          <CanvasIcon name="close" />
        </button>
      </div>
      <form
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <label>
          From
          <select
            value={draft.sourceNodeId}
            onChange={(event) => setDraft({ ...draft, sourceNodeId: event.target.value })}
          >
            {graph.nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select
            value={draft.targetNodeId}
            onChange={(event) => setDraft({ ...draft, targetNodeId: event.target.value })}
          >
            {graph.nodes.map((node) => (
              <option key={node.id} value={node.id} disabled={node.id === draft.sourceNodeId}>
                {node.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Flow type
          <select
            value={percent ? 'percent' : 'fixed'}
            onChange={(event) =>
              setDraft({
                ...draft,
                monthlyFixedFlow: event.target.value === 'fixed' ? 0 : null,
                percentageFlow: event.target.value === 'percent' ? 0 : null,
              })
            }
          >
            <option value="fixed">Dollars per month</option>
            <option value="percent">Percentage</option>
          </select>
        </label>
        <label>
          {percent ? 'Percentage (%)' : 'Monthly amount ($)'}
          <NumberField
            type="number"
            required
            min={0}
            max={percent ? 100 : 1e9}
            step="0.01"
            value={draft.monthlyFixedFlow ?? draft.percentageFlow ?? 0}
            onChange={(event) =>
              setDraft({
                ...draft,
                ...(percent
                  ? { percentageFlow: Number(event.target.value) }
                  : { monthlyFixedFlow: Number(event.target.value) }),
              })
            }
          />
        </label>
        <p className="muted small">
          {target?.nodeType === 'EXPENSE'
            ? 'Incoming routes from income/checking replace this expense’s default amount. Percentages use household take-home income.'
            : target?.nodeType === 'DEBT'
              ? 'Incoming routes set the payment unless the debt node has an explicit override. Percentage payments use starting household take-home income; payments are capped at the amount owed.'
              : ['INVESTMENT', 'SAVINGS'].includes(target?.nodeType ?? '')
                ? 'Saving transfers are funded from after-bill surplus: fixed amounts first, then percentages of the remainder. They do not count as living expenses.'
                : 'This route describes the flow between accounts. It does not create extra income or change an account balance by itself.'}
        </p>
        {draft.sourceNodeId === draft.targetNodeId && (
          <p role="alert">Choose two different nodes.</p>
        )}
        <button className="button primary" disabled={draft.sourceNodeId === draft.targetNodeId}>
          Apply connection
        </button>
        <button type="button" className="button danger" onClick={onDelete}>
          {isNew ? 'Discard connection' : 'Remove connection'}
        </button>
        <small>
          Changes update the graph and the next simulation. Undo restores a removed connection.
        </small>
      </form>
    </aside>
  );
}
