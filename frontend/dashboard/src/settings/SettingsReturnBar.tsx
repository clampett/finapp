import { useEffect, useRef } from 'react';
import { FeatureIcon } from '../common/FeatureIcon';

// Exposed a persistent return control near the settings heading, including a labeled close action.
export function SettingsReturnBar({ label, onClose }: { label: string; onClose: () => void }) {
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus({ preventScroll: true });
  }, []);
  return (
    <nav
      aria-label="Settings navigation"
      className="sticky top-3 z-20 mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-base/95 px-3 py-2 shadow-sm backdrop-blur-sm"
    >
      <button
        ref={back}
        type="button"
        onClick={onClose}
        className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg px-2 text-xs font-medium text-muted transition-colors hover:bg-hover-bg hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5m6-6-6 6 6 6" />
        </svg>
        Back to {label}
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        title={`Close settings and return to ${label}`}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-muted transition-colors hover:bg-hover-bg hover:text-text focus-visible:outline-2 focus-visible:outline-primary"
      >
        <FeatureIcon name="close" />
      </button>
    </nav>
  );
}
