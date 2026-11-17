import { useRef, useState } from 'react';
import { FeatureIcon } from '../common/FeatureIcon';
import { modelName, saveRun } from './run-store';
import type { RunOwner } from './run-store';
import type { SimulationResult } from '../simulation/simulation-types';
import type { SimulationType } from '../common/finance';

export function SaveRunControl({
  forecast,
  kind,
  disabled,
  owner,
  onOpenHistory,
}: {
  forecast: SimulationResult | null;
  kind: SimulationType;
  disabled: boolean;
  owner: RunOwner;
  onOpenHistory?: () => void;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [saved, setSaved] = useState<SimulationResult | null>(null);
  const inFlight = useRef(false);
  if (kind === 'debt') return null;
  const suggested = `${modelName(kind)} · ${forecast?.inputs?.years ?? '—'} years`;
  return (
    <section
      className="rounded-xl border border-border bg-surface p-4 mb-5"
      aria-label="Save simulation run"
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-text">Keep this perspective.</h3>
          <p className="text-[11px] text-muted mt-1">
            Save this completed forecast with its original inputs.{' '}
            {owner.demo ? 'Demo runs stay in this browser.' : 'Saved runs stay with your account.'}
          </p>
        </div>
        <FeatureIcon name="history" className="text-primary shrink-0" />
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!forecast || disabled || inFlight.current || saved === forecast) return;
          inFlight.current = true;
          setBusy(true);
          setNotice('');
          const completed = forecast;
          try {
            await saveRun(owner, title || suggested, kind, completed);
            setSaved(completed);
            setNotice('Saved. Find this forecast in Simulation history.');
          } catch (reason) {
            setNotice(reason instanceof Error ? reason.message : 'This run could not be saved.');
          } finally {
            inFlight.current = false;
            setBusy(false);
          }
        }}
      >
        <label className="sr-only" htmlFor="saved-run-title">
          Run name
        </label>
        <input
          id="saved-run-title"
          className="min-w-0 flex-1 rounded-lg border border-border bg-raised px-3 py-2 text-xs text-text"
          value={title}
          maxLength={100}
          placeholder={suggested}
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="inline-flex gap-2 items-center rounded-lg bg-primary text-primary-fg px-3 py-2 text-xs cursor-pointer disabled:opacity-50"
          disabled={disabled || !forecast || busy || saved === forecast}
        >
          <FeatureIcon name={saved === forecast ? 'check' : 'save'} />
          {busy ? 'Saving…' : saved === forecast ? 'Saved' : 'Save run'}
        </button>
        {onOpenHistory && (
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-xs text-muted cursor-pointer"
            onClick={onOpenHistory}
          >
            View history
          </button>
        )}
      </form>
      <p className="text-[11px] text-primary mt-2 min-h-4" role="status">
        {notice}
      </p>
    </section>
  );
}
