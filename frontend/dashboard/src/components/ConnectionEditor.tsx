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
    <aside className="w-[285px] border border-[#334055] rounded-[11px] p-[19px] bg-[#151d2b] shrink-0 max-md:w-full">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2.5 max-md:mb-[5px]">MONTHLY ROUTE</div>
          <h3 className="text-[15px] font-semibold text-text m-0">{isNew ? 'New connection' : 'Edit connection'}</h3>
        </div>
        <button
          className="p-0 leading-none bg-[#1d2737] hover:bg-[#263346] border border-[#334057] rounded-[7px] grid place-items-center w-[30px] h-[30px] text-[20px] text-[#a5b5cd] hover:text-white shrink-0 cursor-pointer"
          aria-label="Close connection editor"
          title="Close"
          onClick={onClose}
        >
          <CanvasIcon name="close" />
        </button>
      </div>
      <form
        className="flex flex-col gap-[15px] mt-[22px] max-md:grid max-md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(draft);
        }}
      >
        <label className="flex flex-col gap-[7px] text-[11px] text-[#a9b6cc]">
          From
          <select
            className="w-full text-xs min-w-0 border border-border rounded-lg bg-[#101722] text-[#edf2fa] px-[11px] py-[10px] cursor-pointer"
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
        <label className="flex flex-col gap-[7px] text-[11px] text-[#a9b6cc]">
          To
          <select
            className="w-full text-xs min-w-0 border border-border rounded-lg bg-[#101722] text-[#edf2fa] px-[11px] py-[10px] cursor-pointer"
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
        <label className="flex flex-col gap-[7px] text-[11px] text-[#a9b6cc]">
          Flow type
          <select
            className="w-full text-xs min-w-0 border border-border rounded-lg bg-[#101722] text-[#edf2fa] px-[11px] py-[10px] cursor-pointer"
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
        <label className="flex flex-col gap-[7px] text-[11px] text-[#a9b6cc]">
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
        <p className="text-[#8b9ab1] text-[11px] leading-normal m-0">
          {target?.nodeType === 'EXPENSE'
            ? 'Incoming routes from income/checking replace this expense’s default amount. Percentages use household take-home income.'
            : target?.nodeType === 'DEBT'
              ? 'Incoming routes set the payment unless the debt node has an explicit override. Percentage payments use starting household take-home income; payments are capped at the amount owed.'
              : ['INVESTMENT', 'SAVINGS'].includes(target?.nodeType ?? '')
                ? 'Saving transfers are funded from after-bill surplus: fixed amounts first, then percentages of the remainder. They do not count as living expenses.'
                : 'This route describes the flow between accounts. It does not create extra income or change an account balance by itself.'}
        </p>
        {draft.sourceNodeId === draft.targetNodeId && (
          <p className="text-xs text-coral m-0" role="alert">Choose two different nodes.</p>
        )}
        <button className="inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[7px] px-[13px] py-[9px] text-[11px] font-medium min-h-[34px] cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-[#cbbafa] disabled:opacity-40 disabled:cursor-not-allowed" disabled={draft.sourceNodeId === draft.targetNodeId}>
          Apply connection
        </button>
        <button type="button" className="inline-flex items-center justify-center gap-[7px] whitespace-nowrap rounded-[7px] px-[13px] py-[9px] text-[11px] font-medium min-h-[34px] cursor-pointer text-coral border border-[#633246] bg-[#2b1b28] hover:bg-[#3d2034]" onClick={onDelete}>
          {isNew ? 'Discard connection' : 'Remove connection'}
        </button>
        <small className="text-[10px] text-[#7d91ac] leading-[1.6]">
          Changes update the graph and the next simulation. Undo restores a removed connection.
        </small>
      </form>
    </aside>
  );
}
