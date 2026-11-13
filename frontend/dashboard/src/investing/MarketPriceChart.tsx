import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE, dollars } from '../common/finance';

type Period = '1d' | '1mo' | '1y' | '5y';
interface ChartData {
  symbol: string;
  period: Period;
  interval: string;
  stale: boolean;
  points: { date: string; close: number; time: number }[];
}
const cache = new Map<string, { at: number; data: ChartData }>();
const periods = { '1d': '1D', '1mo': '1M', '1y': '1Y', '5y': '5Y' } as const;
const button = 'cursor-pointer rounded-lg border px-3 py-1.5 text-xs transition-colors';

export function MarketPriceChart({
  symbol,
  onAsk,
  kind = 'benchmark',
  initialPeriod = '1mo',
}: {
  symbol: string;
  onAsk?: (question: string) => void;
  kind?: 'benchmark' | 'stock';
  initialPeriod?: Period;
}) {
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const key = `${kind}:${symbol}:${period}`;
    async function load() {
      setLoading(true);
      setError('');
      try {
        // Reused recent period results and aborted superseded requests before they could replace a newer selection.
        const saved = cache.get(key);
        if (saved && Date.now() - saved.at < (period === '1d' ? 300000 : 86400000)) {
          setData(saved.data);
          return;
        }
        const response = await fetch(
          `${API_BASE}/market/${kind === 'stock' ? 'stocks' : 'context'}/${encodeURIComponent(symbol)}/chart?period=${period}`,
          {
            signal: AbortSignal.any([controller.signal, AbortSignal.timeout(14000)]),
          },
        );
        if (!response.ok)
          throw Error(
            'This timeframe is unavailable right now. Try another range or check again later.',
          );
        const body = await response.json();
        if (
          body.symbol !== symbol ||
          body.period !== period ||
          !Array.isArray(body.points) ||
          !body.points.length ||
          body.points.length > 1500
        )
          throw Error('The chart data could not be read.');
        // Retained real timestamps for hover tracking and rejected invalid or out-of-order provider values.
        const points = body.points.map((point: { date: string; close: number }) => ({
          ...point,
          time: Date.parse(point.date.length === 10 ? `${point.date}T12:00:00Z` : point.date),
        }));
        if (
          points.some(
            (point: ChartData['points'][number], index: number) =>
              !Number.isFinite(point.time) ||
              !Number.isFinite(point.close) ||
              point.close <= 0 ||
              (index > 0 && point.time <= points[index - 1].time),
          )
        )
          throw Error('The chart data could not be read.');
        const next = { ...body, points } as ChartData;
        if (controller.signal.aborted) return;
        // Bounded browser memory as users added and removed different holdings.
        if (!cache.has(key) && cache.size >= 64) cache.delete(cache.keys().next().value!);
        cache.set(key, { at: Date.now(), data: next });
        setData(next);
      } catch (failure) {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : 'Chart unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [symbol, period, kind]);
  // Hid mismatched data immediately instead of briefly labeling the previous symbol or range as the new one.
  const points = data?.symbol === symbol && data.period === period ? data.points : [];
  const first = points[0];
  const last = points.at(-1);
  const change = first && last ? (last.close / first.close - 1) * 100 : 0;
  const color =
    change < 0 ? 'var(--color-coral)' : change > 0 ? 'var(--color-mint)' : 'var(--color-muted)';
  const date = (value: number, full = false) =>
    new Intl.DateTimeFormat(
      'en-US',
      period === '1d'
        ? {
            timeZone: 'America/New_York',
            ...(full ? ({ month: 'short', day: 'numeric', year: 'numeric' } as const) : {}),
            hour: 'numeric',
            minute: '2-digit',
          }
        : {
            timeZone: 'UTC',
            month: 'short',
            ...(full
              ? ({ day: 'numeric', year: 'numeric' } as const)
              : period === '5y'
                ? ({ year: '2-digit' } as const)
                : ({ day: 'numeric' } as const)),
          },
    ).format(value);
  return (
    <div className="my-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted">
          <strong className="text-lg text-text">{last ? dollars(last.close) : '—'}</strong>
          {last && (
            <span style={{ color }} className="ml-3 font-semibold">
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)}%
            </span>
          )}
          <span className="ml-2">in selected range</span>
        </div>
        <div className="flex gap-1" aria-label={`${symbol} chart timeframe`}>
          {Object.entries(periods).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              onClick={() => setPeriod(key as Period)}
              className={`${button} ${
                period === key
                  ? 'border-active-border bg-active-bg text-active-text'
                  : 'border-transparent text-muted hover:bg-hover-bg'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="m-0 text-xs leading-relaxed text-muted">
        {period === '1d'
          ? 'Latest available trading session · 5-minute bars · times in Eastern Time (ET).'
          : `${period === '1mo' ? 'Last calendar month' : period === '1y' ? 'Last year' : 'Last five years'} through the latest available close · daily adjusted closing prices.`}{' '}
        Adjusted prices account for splits and distributions. Data may be delayed; this is not a
        live quote.
      </p>
      <div
        className="relative h-64 overflow-hidden rounded-xl border border-border bg-surface [&_.recharts-surface]:outline-none focus-within:ring-2 focus-within:ring-active-border"
        aria-busy={loading}
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--color-border) 28%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-border) 28%, transparent) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      >
        {!!points.length && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 20, right: 16, left: 0, bottom: 6 }}>
              <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 6" />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                minTickGap={35}
                tickFormatter={(value) => date(value)}
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              />
              <YAxis
                domain={['auto', 'auto']}
                width={68}
                tickFormatter={(value) => dollars(Number(value))}
                tick={{ fill: 'var(--color-muted)', fontSize: 10 }}
              />
              {first && (
                <ReferenceLine y={first.close} stroke="var(--color-muted)" strokeDasharray="4 5" />
              )}
              <Tooltip
                cursor={{ stroke: 'var(--color-muted)', strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  const point = payload?.[0]?.payload as ChartData['points'][number] | undefined;
                  return active && point ? (
                    <div className="rounded-lg border border-border bg-surface p-3 text-xs text-text shadow-lg">
                      <strong>
                        {date(point.time, true)}
                        {period === '1d' ? ' ET' : ''}
                      </strong>
                      <p className="mb-0 mt-1">
                        {symbol} · {dollars(point.close)}
                      </p>
                    </div>
                  ) : null;
                }}
              />
              <Area
                dataKey="close"
                type="linear"
                stroke={color}
                fill={color}
                fillOpacity={0.08}
                strokeWidth={2.2}
                dot={points.length === 1}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        {(loading || error) && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-surface/90 p-6 text-center text-sm text-muted"
            role="status"
          >
            {loading ? 'Loading price history…' : error}
          </div>
        )}
      </div>
      {first && last && (
        <p className="m-0 text-[11px] text-muted">
          {date(first.time, true)} – {date(last.time, true)}
          {period === '1d' ? ' ET' : ''} · {points.length} observations. Change is measured from the
          first displayed price. Hover or tap the line for an exact date and price.
          {data?.stale ? ' Showing cached history while the provider is unavailable.' : ''}
        </p>
      )}
      {onAsk && first && last && !loading && !error && (
        <button
          type="button"
          className={`${button} border-border text-text hover:bg-hover-bg`}
          onClick={() =>
            onAsk(
              `Explain the ${periods[period]} ${symbol} price chart from ${date(first.time, true)} to ${date(last.time, true)}: ${change.toFixed(2)}% change between its first and last displayed prices. What scenario could I test?`,
            )
          }
        >
          Talk through this timeframe
        </button>
      )}
    </div>
  );
}
