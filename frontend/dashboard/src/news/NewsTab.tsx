import { useEffect, useRef, useState } from 'react';
import { FeatureIcon } from '../common/FeatureIcon';
import { NewsCard } from './NewsCard';
import { NewsSidebar } from './NewsSidebar';
import { relativeDate, topics } from './news-model';
import { useNews, useReadingList } from './useNews';
import './news.css';

export default function NewsTab({ storageKey }: { storageKey: string }) {
  const { feed, busy, error, reload } = useNews();
  const { saved, toggle, notice } = useReadingList(storageKey);
  const [topic, setTopic] = useState('all');
  const [source, setSource] = useState('all');
  const [query, setQuery] = useState('');
  const [onlySaved, setOnlySaved] = useState(false);
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [sort, setSort] = useState('latest');
  const [limit, setLimit] = useState(12);
  const [cooldown, setCooldown] = useState(false);
  const cooldownTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(cooldownTimer.current), []);
  const articles = onlySaved ? saved : (feed?.articles ?? []);
  const filtered = (() => {
    const search = query.trim().toLocaleLowerCase();
    // Applied all filters to the same publisher snapshot and kept saved articles available offline.
    return articles
      .filter(
        (article) =>
          (topic === 'all' || article.topic === topic) &&
          (source === 'all' || article.source_id === source) &&
          (!search || `${article.title} ${article.source}`.toLocaleLowerCase().includes(search)),
      )
      .sort(
        (a, b) =>
          (sort === 'latest' ? 1 : -1) * (Date.parse(b.published_at) - Date.parse(a.published_at)),
      );
  })();
  const publishers = feed?.sources ?? [];
  const savedIds = new Set(saved.map((article) => article.id));
  const reset = () => {
    setQuery('');
    setTopic('all');
    setSource('all');
    setLimit(12);
  };

  return (
    <div className="news-tab">
      <header className="news-masthead">
        <div>
          <span className="news-eyebrow">
            <FeatureIcon name="news" />
            THE FINAPP BRIEFING
          </span>
          <h1>
            A little perspective.
            <br />
            <em>A clearer picture.</em>
          </h1>
          <p>
            Markets move. Stay curious. Read the latest financial headlines from trusted publishers
            and follow the stories that matter to you.
          </p>
          <div className="news-live-note">
            <span />
            {feed?.fetched_at
              ? `Feeds checked ${relativeDate(feed.fetched_at).replace('Just published', 'just now')}`
              : 'Public headlines · Direct publisher links'}
            <span className="news-note-separator">/</span>No generated stories
          </div>
        </div>
        <div className="news-desk-art" aria-hidden="true">
          <div className="news-art-grid" />
          <FeatureIcon name="news" />
          <span>
            THE WORLD
            <br />
            IN CONTEXT.
          </span>
          <div className="news-art-orbit" />
        </div>
      </header>

      <div className="news-toolbar">
        <div className="news-segment" role="group" aria-label="News collection">
          <button
            aria-pressed={!onlySaved}
            onClick={() => {
              setOnlySaved(false);
              setLimit(12);
            }}
          >
            Headlines <span>{feed?.articles.length ?? '—'}</span>
          </button>
          <button
            aria-pressed={onlySaved}
            onClick={() => {
              setOnlySaved(true);
              setLimit(12);
            }}
          >
            <FeatureIcon name="bookmark" />
            Reading list <span>{saved.length}</span>
          </button>
        </div>
        <button
          className="news-btn"
          disabled={busy || cooldown}
          onClick={() => {
            // Throttled repeated clicks while the service reused its shared publisher cooldown.
            setCooldown(true);
            reload();
            cooldownTimer.current = setTimeout(() => setCooldown(false), 10000);
          }}
        >
          <FeatureIcon name="refresh" className={busy ? 'news-refreshing' : ''} />
          {busy ? 'Checking feeds' : cooldown ? 'Checked recently' : 'Refresh'}
        </button>
      </div>
      <div className="news-topics" role="group" aria-label="News topic">
        {topics.map(([id, label]) => (
          <button
            key={id}
            aria-pressed={topic === id}
            onClick={() => {
              setTopic(id);
              setLimit(12);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="news-content-layout">
        <section className="min-w-0" aria-label="News headlines">
          <div className="news-filter-row">
            <label className="news-search">
              <FeatureIcon name="search" />
              <span className="sr-only">Search headlines</span>
              <input
                placeholder="Search the headlines…"
                value={query}
                maxLength={120}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(12);
                }}
              />
              {query && (
                <button aria-label="Clear headline search" onClick={() => setQuery('')}>
                  <FeatureIcon name="close" />
                </button>
              )}
            </label>
            <label className="sr-only" htmlFor="news-publisher">
              Publisher
            </label>
            <select
              id="news-publisher"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setLimit(12);
              }}
            >
              <option value="all">All publishers</option>
              {publishers.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="news-sort">
              Sort headlines
            </label>
            <select id="news-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="latest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
            <div className="news-segment news-layout" role="group" aria-label="Article layout">
              {(['grid', 'list'] as const).map((value) => (
                <button
                  key={value}
                  aria-label={`${value} view`}
                  aria-pressed={layout === value}
                  onClick={() => setLayout(value)}
                >
                  <FeatureIcon name={value} />
                </button>
              ))}
            </div>
          </div>
          <div className="news-results-label">
            <h2>
              {onlySaved
                ? 'Saved for a quieter moment'
                : topic === 'all'
                  ? 'The latest, in perspective'
                  : topics.find(([id]) => id === topic)?.[1]}
            </h2>
            <span aria-live="polite">
              {filtered.length} {filtered.length === 1 ? 'story' : 'stories'}
            </span>
          </div>
          {error && (
            <p role="alert" className="news-notice">
              {error}
              {feed?.articles.length ? ' Previously fetched headlines remain available.' : ''}
            </p>
          )}
          {!onlySaved && (busy || feed?.pending) && !feed?.articles.length ? (
            <div className="news-grid" role="status" aria-label="Loading financial headlines">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="news-skeleton">
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : filtered.length ? (
            <div className={`news-grid ${layout === 'list' ? 'news-list' : ''}`}>
              {filtered.slice(0, limit).map((article, index) => (
                <NewsCard
                  key={article.id}
                  article={article}
                  saved={savedIds.has(article.id)}
                  onSave={() => toggle(article)}
                  index={index}
                  featured={
                    layout === 'grid' &&
                    index === 0 &&
                    !onlySaved &&
                    !query &&
                    topic === 'all' &&
                    source === 'all' &&
                    sort === 'latest'
                  }
                />
              ))}
            </div>
          ) : (
            <div className="news-empty">
              <FeatureIcon name={onlySaved ? 'bookmark' : 'search'} />
              <h3>
                {onlySaved && !saved.length
                  ? 'Your reading list starts here'
                  : !feed?.articles.length && !onlySaved
                    ? 'The news desk is catching up'
                    : 'No matching headlines'}
              </h3>
              <p>
                {onlySaved && !saved.length
                  ? 'Save a headline with the bookmark icon to find it here later.'
                  : !feed?.articles.length && !onlySaved
                    ? 'Feeds may be temporarily unavailable. Refresh in a moment; no headlines have been invented.'
                    : 'Try another topic, publisher, or search term.'}
              </p>
              <button className="news-btn" onClick={reset}>
                Clear filters
              </button>
            </div>
          )}
          {filtered.length > limit && (
            <button className="news-btn news-more" onClick={() => setLimit((value) => value + 12)}>
              More headlines <FeatureIcon name="arrow" />
            </button>
          )}
          <p className="news-reading-notice" role="status">
            {notice}
          </p>
        </section>
        <NewsSidebar feed={feed} />
      </div>
      <footer className="news-footer">
        Independent sources. Your own perspective.
        <span>Informational content · Not investment advice</span>
      </footer>
    </div>
  );
}
