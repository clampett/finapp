import { useEffect, useRef } from 'react';

export function SettingsExitDialog({
  open,
  onDecision,
}: {
  open: boolean;
  onDecision: (allowed: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    keep = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    // Used the native modal focus trap and returned Escape to the safe keep-editing action.
    if (open && !node.open) {
      node.showModal();
      keep.current?.focus();
    }
    if (!open && node.open) node.close();
    return () => {
      if (node.open) node.close();
    };
  }, [open]);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="settings-exit-title"
      aria-describedby="settings-exit-description"
      onCancel={(e) => {
        e.preventDefault();
        onDecision(false);
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-border bg-surface p-6 text-text shadow-xl backdrop:bg-black/50"
    >
      <h2 id="settings-exit-title" className="text-lg font-semibold">
        Leave without saving?
      </h2>
      <p id="settings-exit-description" className="mt-2 text-sm leading-relaxed text-muted">
        Your unsaved settings will be discarded. Changes you already saved will be kept.
      </p>
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => onDecision(true)}
          className="min-h-10 cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-muted hover:bg-hover-bg hover:text-text"
        >
          Discard and leave
        </button>
        <button
          ref={keep}
          type="button"
          onClick={() => onDecision(false)}
          className="min-h-10 cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg"
        >
          Keep editing
        </button>
      </div>
    </dialog>
  );
}
