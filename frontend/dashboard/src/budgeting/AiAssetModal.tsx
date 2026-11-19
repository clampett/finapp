import { useEffect, useRef, useState } from 'react';
import { dollars, downloadJson } from '../common/finance';
import { FeatureIcon } from '../common/FeatureIcon';
import { NumberField } from '../common/NumberField';
import { isAssetEstimate } from './asset-estimate';
import type { AssetEstimate } from './asset-estimate';

export interface AiAssetModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onSaveAsset?: (name: string, amount: number) => void;
}

// Kept reviewed property balances separate from income and spendable cash.
export function AiAssetModal({ isOpen, onCancel, onSaveAsset }: AiAssetModalProps) {
  const [description, setDescription] = useState('');
  const [estimate, setEstimate] = useState<AssetEstimate | null>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  const prompt = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    if (isOpen) prompt.current?.focus();
    // Cancelled abandoned requests before a closed panel could publish stale model results.
    return () => {
      active.current?.abort();
      active.current = null;
      if (previous?.isConnected) previous.focus();
    };
  }, [isOpen]);
  if (!isOpen) return null;
  const reviewed = Number(amount);
  const valid =
    amount.trim() !== '' && Number.isFinite(reviewed) && reviewed > 0 && reviewed <= 1e9;
  const action =
    'inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs text-text cursor-pointer hover:bg-hover-bg disabled:opacity-50';
  return (
    <section
      aria-labelledby="asset-estimator-title"
      className="rounded-xl border border-border bg-surface p-5 sm:p-6 mb-6"
    >
      <header className="flex items-start justify-between gap-4 mb-5">
        <div>
          <span className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest text-primary">
            <FeatureIcon name="spark" />
            PLANNING TOOLS
          </span>
          <h4 id="asset-estimator-title" className="text-base font-semibold text-text mt-3">
            Asset value estimate
          </h4>
          <p className="text-xs text-muted leading-relaxed mt-2 max-w-2xl">
            Describe an item to request an illustrative local AI estimate. For a reliable value,
            compare recent listings or obtain an appraisal. This tool has no live resale prices.
          </p>
        </div>
        <button
          type="button"
          className={action}
          aria-label="Close asset estimator"
          onClick={onCancel}
        >
          <FeatureIcon name="close" />
        </button>
      </header>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (active.current || !description.trim()) return;
          const controller = new AbortController();
          active.current = controller;
          setBusy(true);
          setMessage('');
          setEstimate(null);
          setAmount('');
          const timeout = setTimeout(
            () => controller.abort(new Error('Estimate timed out.')),
            20000,
          );
          try {
            const res = await fetch('/api/v1/coach/value-asset', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ description: description.trim() }),
              signal: controller.signal,
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.message || `Estimate unavailable (${res.status}).`);
            if (!isAssetEstimate(body.data))
              throw new Error(
                'The estimate response was invalid. Try a more specific description.',
              );
            if (controller.signal.aborted) return;
            // Retained the estimate only as a reviewable reference; no transaction action was invoked.
            setEstimate(body.data);
            setAmount(body.data.amount === null ? '' : String(body.data.amount));
          } catch (error) {
            if (active.current === controller)
              setMessage(
                controller.signal.aborted
                  ? 'Estimation stopped or timed out. Please try again.'
                  : error instanceof Error
                    ? error.message
                    : 'The estimate is unavailable.',
              );
          } finally {
            clearTimeout(timeout);
            if (active.current === controller) {
              active.current = null;
              setBusy(false);
            }
          }
        }}
      >
        <label
          htmlFor="ai-asset-description-prompt"
          className="block text-xs font-medium text-text mb-2"
        >
          Describe your asset
        </label>
        <textarea
          ref={prompt}
          id="ai-asset-description-prompt"
          className="w-full min-h-24 rounded-lg border border-border bg-raised p-3 text-xs leading-relaxed text-text"
          required
          maxLength={500}
          disabled={busy}
          value={description}
          placeholder="Include brand/model, year, condition, mileage or specifications, and an optional USD reference price."
          onChange={(event) => {
            setDescription(event.target.value);
            setEstimate(null);
            setAmount('');
            setMessage('');
          }}
        />
        <div className="flex justify-between gap-4 flex-wrap items-center mt-3">
          <p className="text-[11px] text-muted">
            Only this description is sent to the local model. Avoid personal or identifying details.{' '}
            <span>{description.length}/500</span>
          </p>
          <button
            className="inline-flex gap-2 items-center rounded-lg bg-primary text-primary-fg px-4 py-2 text-xs cursor-pointer disabled:opacity-50"
            disabled={busy || !description.trim()}
          >
            <FeatureIcon name={busy ? 'clock' : 'spark'} />
            {busy ? 'Estimating…' : 'Estimate value'}
          </button>
        </div>
      </form>
      {estimate && (
        <div className="mt-5 rounded-xl border border-border bg-raised p-4 sm:p-5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            {estimate.source === 'local_ai'
              ? 'Illustrative AI estimate'
              : estimate.source === 'provided'
                ? 'Your reference amount'
                : 'More detail needed'}
          </span>
          <h5 className="font-semibold text-text mt-2 text-sm">{estimate.description}</h5>
          <p className="text-xs text-muted mt-1">
            {estimate.categoryName} · USD · Not market verified
          </p>
          {estimate.amount !== null && (
            <p className="text-2xl font-semibold text-text my-4">{dollars(estimate.amount)}</p>
          )}
          <p className="text-xs leading-relaxed text-muted mt-3">{estimate.notes}</p>
          <label className="block text-xs text-text mt-4" htmlFor="reviewed-asset-value">
            Reviewed reference value (USD)
          </label>
          <NumberField
            id="reviewed-asset-value"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            min="0.01"
            max="1000000000"
            step="0.01"
            placeholder="Enter your own value if needed"
            className="w-full max-w-sm rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text mt-2"
          />
          <div className="flex gap-2 flex-wrap mt-4">
            {/* Required explicit review before adding an illiquid balance to the scenario. */}
            {onSaveAsset && (
              <button
                type="button"
                className={action}
                disabled={!valid}
                onClick={() => onSaveAsset(estimate.description, reviewed)}
              >
                Add asset balance
              </button>
            )}
            <button
              type="button"
              className={action}
              disabled={!valid}
              onClick={() =>
                downloadJson(
                  {
                    ...estimate,
                    amount: reviewed,
                    source: reviewed === estimate.amount ? estimate.source : 'manual',
                    verified: false,
                    createdAt: new Date().toISOString(),
                  },
                  'finapp-asset-estimate.json',
                )
              }
            >
              <FeatureIcon name="download" />
              Export estimate
            </button>
            <button
              type="button"
              className={action}
              disabled={!valid}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(reviewed.toFixed(2));
                  setMessage('Reference value copied.');
                } catch {
                  setMessage('Copy is unavailable. Export the estimate instead.');
                }
              }}
            >
              Copy value
            </button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted mt-4">
            An estimated asset value is not cash income. Record a transaction separately only when
            money actually changes hands. Add a reviewed balance to include it in net worth and
            simulations; growth starts at 0% and can be edited in Assets.
          </p>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-xs text-primary min-h-5 mt-3">
        {message}
      </p>
    </section>
  );
}
