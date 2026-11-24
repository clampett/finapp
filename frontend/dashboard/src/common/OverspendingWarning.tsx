import { useState } from 'react';
import { money } from './finance';

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

  if (dismissed || expenses <= income) return null;

  const overBy = expenses - income;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overspending-warning-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl"
      >
        <div className="mb-4 flex items-start gap-3">
          <div
            className="grid size-10 shrink-0 place-items-center rounded-full bg-coral/15 text-xl text-coral"
            aria-hidden="true"
          >
            !
          </div>

          <div>
            <h2
              id="overspending-warning-title"
              className="m-0 text-lg font-semibold text-text"
            >
              Overspending warning
            </h2>

            <p className="mt-1 text-sm leading-relaxed text-muted">
              Your monthly expenses are currently higher than your monthly income.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-raised p-4 text-sm">
          <div className="flex justify-between gap-4 py-1">
            <span className="text-muted">Monthly income</span>
            <strong className="text-text">{money(income)}</strong>
          </div>

          <div className="flex justify-between gap-4 py-1">
            <span className="text-muted">Monthly expenses</span>
            <strong className="text-coral">{money(expenses)}</strong>
          </div>

          <div className="mt-2 flex justify-between gap-4 border-t border-border pt-3">
            <span className="text-muted">Over by</span>
            <strong className="text-coral">{money(overBy)}</strong>
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
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
    </div>
  );
}