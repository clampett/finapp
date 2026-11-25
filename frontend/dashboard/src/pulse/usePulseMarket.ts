import { useEffect, useState } from 'react';
import { API_BASE } from '../common/finance';
import { readPulseMarket } from './pulse-models';
import type { PulseMarket } from './pulse-models';
const cache = new Map<string, { at: number; data: PulseMarket | null }>();

export function usePulseMarket(symbols: string[]) {
  const key = symbols.join('|');
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<{ key: string; items: PulseMarket[] }>({
    key,
    items: [],
  });
  useEffect(() => {
    if (!key) return;
    // Refreshed at most every five visible minutes; stopped network work in background tabs.
    const refresh = () => {
      if (!document.hidden) setRevision((value) => value + 1);
    };
    const timer = setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [key]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const items: PulseMarket[] = [];
      // Limited the widget to three symbols, fetched sequentially, and reused successes and failures for five minutes.
      for (const symbol of key.split('|').filter(Boolean).slice(0, 3)) {
        if (controller.signal.aborted) return;
        const saved = cache.get(symbol);
        let data = saved && Date.now() - saved.at < 300000 ? saved.data : undefined;
        if (data === undefined) {
          try {
            const res = await fetch(
              `${API_BASE}/market/stocks/${encodeURIComponent(symbol)}/chart?period=1mo`,
              { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) },
            );
            data = res.ok ? readPulseMarket(await res.json(), symbol) : null;
          } catch {
            data = null;
          }
          if (controller.signal.aborted) return;
          // Retained expired public history only with an explicit cached-data label when a refresh failed.
          if (!data && saved?.data) data = { ...saved.data, stale: true };
          if (cache.size >= 64 && !cache.has(symbol)) cache.delete(cache.keys().next().value!);
          cache.set(symbol, { at: Date.now(), data });
        }
        if (data) items.push(data);
      }
      if (!controller.signal.aborted) setSnapshot({ key, items });
    })();
    return () => controller.abort();
  }, [key, revision]);
  return snapshot.key === key ? snapshot.items : [];
}
