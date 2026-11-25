import { useEffect, useState } from 'react';
import { API_BASE, dollars } from '../common/finance';
const panel = 'min-w-0 rounded-xl border border-border bg-surface p-5 sm:p-6';
const field = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text';
const secondary =
  'cursor-pointer rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text hover:bg-hover-bg disabled:opacity-50';
const probability = (value: number) => `${(value * 100).toFixed(1)}%`;
const benchmarks = {
  VOO: 'U.S. stocks',
  BND: 'U.S. bonds',
  VXUS: 'International stocks',
  VNQ: 'U.S. real estate',
};
type MarketAssumption = { symbol: string; volatility: number; date: string };

export function CoachMarket({
  disabled,
  selected,
  onSelect,
}: {
  disabled: boolean;
  selected: MarketAssumption | null;
  onSelect: (value: MarketAssumption | null) => void;
}) {
  const [benchmark, setBenchmark] = useState<keyof typeof benchmarks>('VOO');
  const [market, setMarket] = useState<{
    symbol: string;
    price: number;
    date: string;
    closes: number[];
    volatility: number | null;
    historyStart: string | null;
    historyEnd: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Reused the Investments quote cache for a fixed list of benchmark funds.
    const controller = new AbortController();
    fetch(`${API_BASE}/market/stocks/${benchmark}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (
          !controller.signal.aborted &&
          data.currency === 'USD' &&
          Number.isFinite(data.latest_price) &&
          data.latest_price > 0 &&
          typeof data.latest_date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.latest_date)
        ) {
          // Used the last 21 trading closes for a 20-session change and a compact trend line.
          const closes: unknown[] = Array.isArray(data.history)
            ? data.history.slice(-21).map((point: { close?: unknown } | null) => point?.close)
            : [];
          // Accepted volatility only within the simulator's supported range of 0% to 100%.
          setMarket({
            symbol: benchmark,
            price: data.latest_price,
            volatility:
              typeof data.annual_volatility === 'number' &&
              data.annual_volatility >= 0 &&
              data.annual_volatility <= 1
                ? data.annual_volatility
                : null,
            historyStart: typeof data.stats_start_date === 'string' ? data.stats_start_date : null,
            historyEnd: typeof data.stats_end_date === 'string' ? data.stats_end_date : null,
            date: data.latest_date,
            closes: closes.every(
              (close): close is number =>
                typeof close === 'number' && Number.isFinite(close) && close > 0,
            )
              ? closes
              : [],
          });
        }
      })
      .catch(() => {
        /* Kept the coach usable if the quote service was unavailable. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [benchmark]);
  const closes = market?.closes ?? [];
  // Calculated the 20-session change from 21 closes, including the starting observation.
  const change = closes.length === 21 ? (closes[20] / closes[0] - 1) * 100 : null;
  const low = Math.min(...closes);
  const spread = Math.max(...closes) - low || 1;
  // Scaled the closes into SVG coordinates without changing the displayed market values.
  const line = closes
    .map(
      (close, index) =>
        `${(index * 160) / Math.max(1, closes.length - 1)},${42 - (36 * (close - low)) / spread}`,
    )
    .join(' ');
  return (
    <section className={panel} aria-labelledby="coach-market">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-active-text">
        Market context
      </p>
      <h3 id="coach-market" className="m-0 text-base font-semibold text-text">
        Compare market benchmarks
      </h3>
      <label className="mt-3 block space-y-1 text-sm text-muted">
        Benchmark
        <select
          className={field}
          value={benchmark}
          onChange={(event) => {
            setMarket(null);
            setLoading(true);
            setBenchmark(event.target.value as keyof typeof benchmarks);
          }}
        >
          {Object.entries(benchmarks).map(([symbol, label]) => (
            <option key={symbol} value={symbol}>
              {label} · {symbol}
            </option>
          ))}
        </select>
      </label>
      {market ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <strong className="text-xl tabular-nums text-text">{dollars(market.price)}</strong>
          <span className="text-xs text-muted">
            Latest adjusted close · <time dateTime={market.date}>{market.date}</time>
          </span>
        </div>
      ) : (
        <p role="status" className="mt-3 text-sm text-muted">
          {loading ? 'Loading market context…' : 'The market quote is currently unavailable.'}
        </p>
      )}
      {change !== null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-raised px-3 py-2">
          <div>
            <p className="m-0 text-xs text-muted">20-session change</p>
            <strong className={change < 0 ? 'text-coral' : 'text-mint'}>
              {change > 0 ? '+' : ''}
              {change.toFixed(2)}%
            </strong>
          </div>
          <svg
            className={`h-10 w-36 ${change < 0 ? 'text-coral' : 'text-mint'}`}
            viewBox="-2 0 164 46"
            aria-hidden="true"
          >
            <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      )}
      {market && market.volatility !== null && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-muted">
          <p className="m-0">
            Historical annualized volatility{' '}
            <strong className="text-text">{probability(market.volatility)}</strong>
          </p>
          {market.historyStart && market.historyEnd && (
            <p className="m-0 text-xs">
              {market.historyStart} to {market.historyEnd}
            </p>
          )}
          <button
            type="button"
            className={secondary}
            disabled={disabled}
            onClick={() => {
              if (market.volatility !== null)
                onSelect({
                  symbol: market.symbol,
                  volatility: market.volatility,
                  date: market.historyEnd ?? market.date,
                });
            }}
          >
            Use volatility in both forecasts
          </button>
        </div>
      )}
      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{selected.symbol} volatility applied</span>
          <button
            type="button"
            className={secondary}
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            Reset to FinApp default
          </button>
        </div>
      )}
      <p className="mb-0 mt-2 text-xs text-muted">
        Yahoo Finance via FinApp’s shared cache. Historical volatility is an optional modeling
        input. Expected returns stay separate.
      </p>
    </section>
  );
}
