import { FeatureIcon } from '../common/FeatureIcon';
import { relativeDate, topicLabel } from './news-model';
import type { Article } from './news-model';

export function NewsCard({
  article,
  saved,
  onSave,
  featured = false,
  index = 0,
}: {
  article: Article;
  saved: boolean;
  onSave: () => void;
  featured?: boolean;
  index?: number;
}) {
  return (
    <article
      className={`news-card ${featured ? 'news-featured' : ''}`}
      style={{ animationDelay: `${Math.min(index, 7) * 35}ms` }}
    >
      <div className="news-card-meta">
        <span className={`news-topic news-topic-${article.topic}`}>
          {topicLabel(article.topic)}
        </span>
        <button
          className="news-icon-button"
          type="button"
          aria-label={`${saved ? 'Unsave' : 'Save'} article: ${article.title}`}
          aria-pressed={saved}
          onClick={onSave}
          title={saved ? 'Remove from reading list' : 'Save to reading list'}
        >
          <FeatureIcon name={saved ? 'check' : 'bookmark'} />
        </button>
      </div>
      {featured && <span className="news-eyebrow">LATEST HEADLINE</span>}
      <h3>
        <a href={article.url} target="_blank" rel="noopener noreferrer">
          {article.title}
          <span className="sr-only"> (opens publisher in a new tab)</span>
        </a>
      </h3>
      {featured && (
        <p className="news-featured-note">
          The story behind the headline, straight from the publisher.
        </p>
      )}
      <div className="news-card-footer">
        <span>
          <strong>{article.source}</strong>
          <time
            dateTime={article.published_at}
            title={new Date(article.published_at).toLocaleString()}
          >
            {relativeDate(article.published_at)}
          </time>
        </span>
        <a
          className="news-read"
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Read ${article.title} at ${article.source}`}
        >
          <span>Read story</span>
          <FeatureIcon name="external" />
        </a>
      </div>
    </article>
  );
}
