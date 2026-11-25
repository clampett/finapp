import { FeatureIcon } from './FeatureIcon';

// Kept the two resource destinations separate and preserved the open dashboard session.
export function WorkspaceSupport() {
  return (
    <section className="workspace-support" aria-label="Help and learning resources">
      <a
        className="workspace-support-primary"
        href="/faq"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Help center, opens in a new tab"
      >
        <svg
          className="workspace-support-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2 1-1.2 1.8m0 3h.01" />
        </svg>
        <strong>Help center</strong>
        <FeatureIcon name="external" className="workspace-support-external" />
      </a>
      <p className="workspace-support-description">Understand your graphs and forecasts.</p>
      <a
        className="workspace-support-guide"
        href="/how-it-works"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="How FinApp works, opens in a new tab"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Zm0 0v15" />
        </svg>
        <span>How it works</span>
        <FeatureIcon name="arrow" className="workspace-support-external" />
      </a>
    </section>
  );
}
