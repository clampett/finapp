export const topics = [
  ['all', 'All stories'],
  ['markets', 'Markets'],
  ['economy', 'Economy'],
  ['personal-finance', 'Personal finance'],
  ['technology', 'Technology'],
] as const;
export interface Article {
  id: string;
  title: string;
  url: string;
  published_at: string;
  source_id: string;
  source: string;
  topic: string;
}
export interface NewsFeed {
  status: string;
  pending: boolean;
  fetched_at: string | null;
  refresh_after_seconds: number;
  articles: Article[];
  sources: { id: string; name: string; status: string; updated_at: string | null }[];
}
const hosts: Record<string, string[]> = {
  yahoo: ['finance.yahoo.com', 'www.finance.yahoo.com'],
  cnbc: ['cnbc.com', 'www.cnbc.com'],
  bbc: ['www.bbc.com', 'bbc.com', 'www.bbc.co.uk', 'bbc.co.uk'],
  fed: ['federalreserve.gov', 'www.federalreserve.gov'],
};

export function validArticle(value: unknown): value is Article {
  if (!value || typeof value !== 'object') return false;
  const item = value as Article;
  try {
    const url = new URL(item.url);
    // Revalidated cached article links before rendering them as outbound navigation.
    return (
      typeof item.id === 'string' &&
      /^[a-f0-9]{24}$/.test(item.id) &&
      typeof item.title === 'string' &&
      item.title.length > 0 &&
      item.title.length <= 240 &&
      typeof item.source === 'string' &&
      typeof item.topic === 'string' &&
      Number.isFinite(Date.parse(item.published_at)) &&
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      Boolean(hosts[item.source_id]?.includes(url.hostname))
    );
  } catch {
    return false;
  }
}

export function relativeDate(date: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - Date.parse(date)) / 60000));
  return minutes < 1
    ? 'Just published'
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : `${Math.floor(minutes / 1440)}d ago`;
}

export function topicLabel(id: string) {
  return topics.find(([key]) => key === id)?.[1] ?? 'Markets';
}
