import { useEffect, useState } from 'react';
import { API_BASE } from '../common/finance';
import type { MarketAssumption } from './CoachLab';
import { CoachPriceChart } from './CoachPriceChart';

interface Briefing {
  status: string;
  pending: boolean;
  fetched_at: string | null;
  markets: {
    symbol: string;
    name: string;
    date: string;
    price: number;
    closes: number[];
    change_percent: number | null;
    volatility: number | null;
    history_end: string | null;
  }[];
  news: { title: string; summary: string; publisher: string; url: string; published_at: string }[];
}
const button =
  'cursor-pointer rounded-lg border border-border bg-raised px-3 py-2 text-xs text-text hover:bg-hover-bg disabled:opacity-40';

export function CoachBriefing({
  onAsk,
  onApply,
}: {
  onAsk: (question: string) => void;
  onApply: (value: MarketAssumption) => void;
}) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState('VOO');
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let polls = 0;
    async function load() {
      try {
        const response = await fetch(`${API_BASE}/market/context`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12000)]),
        });
        if (!response.ok) throw new Error('The public briefing is temporarily unavailable.');
        const data = await response.json();
        if (!Array.isArray(data.markets) || !Array.isArray(data.news))
          throw new Error('The briefing could not be read.');
        if (controller.signal.aborted) return;
        setBriefing(data);
        setError('');
        // Polled only an already-running background refresh and stopped after one bounded window.
        if (data.pending && polls++ < 15) timer = setTimeout(load, 3000);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'The briefing is unavailable.');
      }
    }
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [attempt]);
  const market = briefing?.markets.find((item) => item.symbol === selected) ?? briefing?.markets[0];
  return (
    <section className="space-y-5" aria-label="Market briefing">
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h3 className="m-0 text-xl font-semibold text-text">
              A little context for your what-if
            </h3>
            <p className="mt-2 mb-0 text-sm text-muted">
              Public benchmarks and recent headlines from Yahoo Finance.
            </p>
          </div>
          <button className={button} onClick={() => setAttempt((value) => value + 1)}>
            Check briefing
          </button>
        </div>
        <p className="text-xs text-muted" role="status">
          {briefing?.status === 'stale'
            ? `Cached briefing. ${briefing.pending ? 'Refreshing in the background. ' : ''}`
            : ''}
          {briefing?.fetched_at
            ? `Retrieved ${new Date(briefing.fetched_at).toLocaleString()}. Prices show dated adjusted closes.`
            : briefing?.pending
              ? 'Preparing the first briefing…'
              : 'Waiting for market context.'}
        </p>
        {error && (
          <p role="alert" className="text-xs text-coral">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {briefing?.markets.map((item) => (
            <button
              key={item.symbol}
              type="button"
              aria-pressed={selected === item.symbol}
              onClick={() => setSelected(item.symbol)}
              className={`cursor-pointer rounded-xl border p-3 text-left ${
                selected === item.symbol
                  ? 'border-active-border bg-active-bg'
                  : 'border-border bg-raised hover:bg-hover-bg'
              }`}
            >
              <strong className="text-sm text-text">{item.symbol}</strong>
              <span className="block text-[11px] text-muted">{item.name}</span>
              <span
                className={`mt-2 block text-sm font-semibold ${(item.change_percent ?? 0) < 0 ? 'text-coral' : 'text-mint'}`}
              >
                {item.change_percent === null
                  ? '—'
                  : `${item.change_percent > 0 ? '+' : ''}${item.change_percent.toFixed(1)}%`}
              </span>
              <span className="text-[10px] text-muted">20 trading sessions</span>
            </button>
          ))}
        </div>
        {market && (
          <div className="mt-5 rounded-xl border border-border bg-raised p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <strong className="text-lg text-text">{market.symbol} price history</strong>
              <span className="text-xs text-muted">USD · adjusted prices</span>
            </div>
            {/* Scaled the source closes without inventing intermediate observations. */}
            {/* Replaced the compact preview with dated, selectable history and a tracking cursor. */}
            <CoachPriceChart symbol={market.symbol} onAsk={onAsk} />
            <div className="flex flex-wrap gap-2">
              {market.volatility !== null &&
                Number.isFinite(market.volatility) &&
                market.volatility >= 0 &&
                market.volatility <= 1 && (
                  <button
                    className={button}
                    onClick={() =>
                      onApply({
                        symbol: market.symbol,
                        volatility: market.volatility!,
                        date: market.history_end ?? market.date,
                      })
                    }
                  >
                    Test with this historical volatility
                  </button>
                )}
            </div>
          </div>
        )}
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <h3 className="m-0 text-lg font-semibold text-text">Headlines to explore</h3>
        <p className="mt-1 text-xs text-muted">
          Stories published within the last seven days. Select a headline to discuss its possible
          implications.
        </p>
        {!briefing?.news.length && (
          <p className="text-sm text-muted">
            {briefing?.pending
              ? 'Looking for recent stories…'
              : 'No recent headlines are available. You can still explore scenarios and ask general questions.'}
          </p>
        )}
        <div className="divide-y divide-border">
          {briefing?.news.map((item) => (
            <article key={item.url} className="py-4 first:pt-2">
              <p className="mb-1 mt-0 text-[11px] text-muted">
                {item.publisher} ·{' '}
                <time dateTime={item.published_at}>
                  {new Date(item.published_at).toLocaleDateString()}
                </time>
              </p>
              <button
                className="cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-semibold text-text hover:text-active-text"
                onClick={() =>
                  onAsk(
                    `In the recent briefing, explain this headline in plain language: ${item.title}`,
                  )
                }
              >
                {item.title}
              </button>
              <div className="mt-2 flex gap-4 text-xs">
                <a
                  className="text-active-text underline"
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Read source ↗
                </a>
                <button
                  className="cursor-pointer border-0 bg-transparent p-0 text-active-text"
                  onClick={() =>
                    onAsk(`What scenario could I test after reading this headline: ${item.title}`)
                  }
                >
                  Explore a what-if →
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
