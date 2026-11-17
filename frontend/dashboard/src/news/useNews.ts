import { useEffect, useState } from 'react';
import { API_BASE } from '../common/finance';
import { validArticle } from './news-model';
import type { Article, NewsFeed } from './news-model';

export function useNews() {
  const [feed, setFeed] = useState<NewsFeed | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let poll: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/market/news`, { signal: controller.signal });
        if (!res.ok) throw new Error('The news desk is temporarily unavailable. Please try again.');
        const body = await res.json();
        if (!Array.isArray(body.articles) || !Array.isArray(body.sources))
          throw new Error('News could not be loaded.');
        if (controller.signal.aborted) return;
        const articles = body.articles.filter(validArticle);
        setFeed({
          ...body,
          articles,
          sources: body.sources.slice(0, 4),
        });
        setError('');
        // Polled during background refresh, retried quickly on empty/unavailable feed,
        // and refreshed periodically once articles loaded without bypassing cache.
        const delay =
          body.pending && ++attempts < 10
            ? 3000
            : articles.length === 0
              ? Math.max(3000, Math.min((body.refresh_after_seconds || 10) * 1000, 15000))
              : Math.max(30000, (body.refresh_after_seconds ?? 300) * 1000);
        poll = setTimeout(load, delay);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'News could not be loaded.');
          poll = setTimeout(load, 10000);
        }
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(poll);
    };
  }, [refresh]);
  return {
    feed,
    busy,
    error,
    reload: () => {
      setBusy(true);
      setRefresh((value) => value + 1);
    },
  };
}

export function useReadingList(key: string) {
  const [saved, setSaved] = useState<Article[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value.filter(validArticle).slice(0, 50) : [];
    } catch {
      return [];
    }
  });
  const [notice, setNotice] = useState('');
  const toggle = (article: Article) => {
    const exists = saved.some((item) => item.id === article.id);
    if (!exists && saved.length >= 50) {
      setNotice('Your reading list holds 50 articles. Remove one to save another.');
      return;
    }
    const next = exists ? saved.filter((item) => item.id !== article.id) : [article, ...saved];
    // Saved public article metadata locally without transferring reading preferences to a server.
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setSaved(next);
      setNotice(exists ? 'Removed from your reading list.' : 'Added to your reading list.');
    } catch {
      setNotice('Browser storage is unavailable. This article could not be saved.');
    }
  };
  return { saved, toggle, notice };
}
