import { FeatureIcon } from '../common/FeatureIcon';
import type { NewsFeed } from './news-model';

// Kept publisher health separate from editorial stories so partial outages remained visible.
export function NewsSidebar({ feed }: { feed: NewsFeed | null }) {
  const publishers = feed?.sources ?? [];
  return (
    <aside className="news-sidebar">
      <section>
        <span className="news-eyebrow">YOUR NEWS DESK</span>
        <h2>
          Different sources.
          <br />A wider lens.
        </h2>
        <p>Editorial reporting and policy releases, together in one place.</p>
        {publishers.map((item) => (
          <div className="news-source" key={item.id}>
            <span
              className={`news-source-dot ${item.status === 'ready' ? 'news-source-ready' : ''}`}
            />
            <div>
              <strong>{item.name}</strong>
              <small>
                {item.status === 'ready'
                  ? 'Feed available'
                  : item.updated_at
                    ? 'Using cached headlines'
                    : item.status === 'pending'
                      ? 'Checking feed'
                      : 'Temporarily unavailable'}
              </small>
            </div>
            <span>
              {feed?.articles.filter((article) => article.source_id === item.id).length ?? 0}
            </span>
          </div>
        ))}
        {feed?.status === 'partial' && (
          <p className="news-small">
            Some feeds are unavailable. Dates identify when each story was published.
          </p>
        )}
      </section>
      <section className="news-reading-tip">
        <FeatureIcon name="spark" />
        <h3>Read beyond the headline.</h3>
        <p>
          A market move can have many explanations. Check the source, publication date, and full
          article before drawing conclusions.
        </p>
      </section>
      <details className="news-source-notes">
        <summary>About this briefing</summary>
        <p>
          Headlines come from public publisher feeds and are refreshed on a shared five-minute
          schedule. Topic tags use headline keywords. Coverage may be delayed or incomplete.
          Publisher subscriptions may be required. Saved articles stay in this browser; full
          articles are read on their original sites.
        </p>
      </details>
    </aside>
  );
}
