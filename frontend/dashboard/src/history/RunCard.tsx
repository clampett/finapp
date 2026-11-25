import { dollars } from '../common/finance';
import { FeatureIcon } from '../common/FeatureIcon';
import { modelName } from './run-store';
import type { RunSummary } from './run-store';

// Kept selection and deletion controls with each summary while details were loaded separately.
export function RunCard({
  run,
  selected,
  selectionFull,
  busy,
  confirming,
  onToggle,
  onOpen,
  onConfirm,
  onCancel,
  onDelete,
}: {
  run: RunSummary;
  selected: boolean;
  selectionFull: boolean;
  busy: boolean;
  confirming: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  return (
    <article className={`history-run ${selected ? 'history-selected' : ''}`}>
      <div className="history-run-top">
        <span>{modelName(run.kind)}</span>
        <label className="history-pick">
          <input
            type="checkbox"
            aria-label={`Select ${run.title} for comparison`}
            checked={selected}
            disabled={!selected && selectionFull}
            onChange={onToggle}
          />
          Compare
        </label>
      </div>
      <h3>
        <button disabled={busy} onClick={onOpen}>
          {run.title}
        </button>
      </h3>
      <p>
        {new Date(run.createdAt).toLocaleString()} · {run.years}-year horizon
      </p>
      <div className="history-run-value">
        <span>Median ending net worth</span>
        <strong>{dollars(run.p50)}</strong>
      </div>
      <div className="history-run-range">
        <span>
          P10 <strong>{dollars(run.p10)}</strong>
        </span>
        <span>
          P90 <strong>{dollars(run.p90)}</strong>
        </span>
      </div>
      {confirming ? (
        <div className="history-delete-confirm">
          <span>Delete this saved run permanently?</span>
          <button disabled={busy} onClick={onDelete}>
            Delete
          </button>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="history-run-actions">
          <button disabled={busy} onClick={onOpen}>
            Open saved run <FeatureIcon name="arrow" />
          </button>
          <button disabled={busy} aria-label={`Delete ${run.title}`} onClick={onConfirm}>
            <FeatureIcon name="trash" />
          </button>
        </div>
      )}
    </article>
  );
}
