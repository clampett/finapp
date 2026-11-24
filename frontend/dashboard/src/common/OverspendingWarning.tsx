import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { dollars } from './finance';

interface OverspendingWarningProps {
  income: number;
  expenses: number;
  onReviewBudget: () => void;
}

export function OverspendingWarning({
  income,
  expenses,
  onReviewBudget,
}: OverspendingWarningProps) {
  const [dismissed, setDismissed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const overBy = Math.round((expenses - income) * 100) / 100;
  const visible = !dismissed && Number.isFinite(overBy) && overBy > 0;

  useEffect(() => {
    const element = dialog.current;
    if (!visible || !element) return;
    // Native modality traps focus, makes the background inert, supports Escape,
    // and restores focus when closed. The portal avoids clipping by workspace panels.
    element.showModal();
    return () => element.close();
  }, [visible]);

  if (!visible) return null;

  return createPortal(
    <dialog
      ref={dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="overspending-warning-title"
      aria-describedby="overspending-warning-description"
      onCancel={(event) => {
        event.preventDefault();
        setDismissed(true);
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl border border-border bg-surface p-0 text-text shadow-2xl backdrop:bg-black/60"
    >
      <div className="p-6">
        <div className="mb-4 flex items-start gap-3">
          <div
            className="grid size-10 shrink-0 place-items-center rounded-full bg-coral/15 text-xl text-coral"
            aria-hidden="true"
          >
            !
          </div>

          <div>
            <h2 id="overspending-warning-title" className="m-0 text-lg font-semibold text-text">
              Overspending warning
            </h2>

            <p
              id="overspending-warning-description"
              className="mt-1 text-sm leading-relaxed text-muted"
            >
              Your monthly expenses and loan payments exceed your take-home income.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-raised p-4 text-sm">
          <div className="flex justify-between gap-4 py-1">
            <span className="text-muted">Monthly take-home income</span>
            <strong className="text-text">{dollars(income)}</strong>
          </div>

          <div className="flex justify-between gap-4 py-1">
            <span className="text-muted">Expenses &amp; loan payments</span>
            <strong className="text-coral">{dollars(expenses)}</strong>
          </div>

          <div className="mt-2 flex justify-between gap-4 border-t border-border pt-3">
            <span className="text-muted">Over by</span>
            <strong className="text-coral">{dollars(overBy)}</strong>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            className="cursor-pointer rounded-lg border border-border bg-transparent px-4 py-2 text-sm text-muted hover:bg-hover-bg hover:text-text"
            onClick={() => setDismissed(true)}
          >
            Dismiss
          </button>

          <button
            type="button"
            className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
            onClick={() => {
              setDismissed(true);
              onReviewBudget();
            }}
          >
            Review budget
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}
