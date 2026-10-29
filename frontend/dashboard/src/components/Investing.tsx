import { memo, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_BASE, colors, dollars, money } from '../finance';

interface Holding {
  symbol: string;
  shares: number;
}

interface Quote {
  symbol: string;
  name: string | null;
  latest_price: number;
  latest_date: string;
  currency: 'USD';
  stats_start_date: string | null;
  stats_end_date: string | null;
  cagr: number | null;
  expected_annual_return: number | null;
  annual_volatility: number | null;
  history: { date: string; close: number }[];
}

interface Suggestion {
  symbol: string;
  name: string;
}

type QuoteState = Quote | { error: string } | 'loading';

const MAX_HOLDINGS = 25;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function loadHoldings(storageKey: string): Holding[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Holding =>
          typeof item?.symbol === 'string' &&
          typeof item?.shares === 'number' &&
          Number.isFinite(item.shares) &&
          item.shares >= 0,
      )
      .slice(0, MAX_HOLDINGS);
  } catch {
    return [];
  }
}

async function fetchQuote(symbol: string, signal?: AbortSignal): Promise<Quote> {
  const response = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(symbol)}`, {
    signal,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Could not load ${symbol} (${response.status}).`,
    );
  }
  // Rejected unverified currencies, including responses from an outdated backend.
  if (body?.currency !== 'USD') {
    throw new Error(
      'This stock needs a verified USD quote. Update the Python backend and try again.',
    );
  }
  return body as Quote;
}

const isQuote = (state: QuoteState | undefined): state is Quote =>
  typeof state === 'object' && 'latest_price' in state;

const errorOf = (state: QuoteState | undefined) =>
  typeof state === 'object' && 'error' in state ? state.error : null;

const percent = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

// One tick per month, so the same month label never repeats along the axis.
const monthTicks = (history: { date: string }[]) =>
  history
    .filter((point, i) => i === 0 || point.date.slice(0, 7) !== history[i - 1].date.slice(0, 7))
    .map((point) => point.date);

const monthLabel = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ’${date.slice(2, 4)}`;

export function Investing({ storageKey }: { storageKey: string }) {
  const [holdings, setHoldings] = useState<Holding[]>(() => loadHoldings(storageKey));
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [symbol, setSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const startup = useRef(holdings);
  // Reserved symbols immediately so rapid clicks could not add duplicates or exceed the limit.
  const reserved = useRef(new Set(holdings.map((holding) => holding.symbol)));
  const requests = useRef(new Map<string, AbortController>());
  const selectionIntent = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(holdings));
    } catch {
      /* Private browsing can block storage; holdings just won't persist. */
    }
  }, [holdings, storageKey]);

  useEffect(() => {
    // Prices are not saved with the holdings, so reload them for each saved stock.
    for (const { symbol: sym } of startup.current) {
      const controller = new AbortController();
      requests.current.set(sym, controller);
      setQuotes((current) => ({ ...current, [sym]: 'loading' }));
      fetchQuote(sym, controller.signal)
        .then((quote) => {
          if (!controller.signal.aborted) setQuotes((current) => ({ ...current, [sym]: quote }));
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          setQuotes((current) => ({
            ...current,
            [sym]: { error: err instanceof Error ? err.message : `Could not load ${sym}.` },
          }));
        })
        .finally(() => {
          if (requests.current.get(sym) === controller) requests.current.delete(sym);
        });
    }
    const activeRequests = requests.current;
    // Cancelled outstanding quotes when leaving the tab, preventing stale results from returning.
    return () => {
      for (const controller of activeRequests.values()) controller.abort();
      activeRequests.clear();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_BASE}/market/stocks`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((list) => setSuggestions(Array.isArray(list) ? list : []))
      .catch(() => {
        /* Suggestions are optional; the search box still works. */
      });
    return () => controller.abort();
  }, []);

  async function addSymbol(raw: string) {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    if (requests.current.has(sym)) return;
    if (reserved.current.has(sym)) {
      setMessage(`${sym} is already in your holdings or is being loaded.`);
      return;
    }
    if (reserved.current.size >= MAX_HOLDINGS) {
      setMessage(`You can track up to ${MAX_HOLDINGS} stocks.`);
      return;
    }
    reserved.current.add(sym);
    const controller = new AbortController();
    requests.current.set(sym, controller);
    const intent = ++selectionIntent.current;
    setPending((current) => [...current, sym]);
    setMessage('');
    setSymbol('');
    try {
      // Reused an already loaded quote when a removed stock was added again during this visit.
      const savedQuote = quotes[sym];
      const quote = isQuote(savedQuote) ? savedQuote : await fetchQuote(sym, controller.signal);
      if (controller.signal.aborted) return;
      setQuotes((current) => ({ ...current, [sym]: quote }));
      setHoldings((current) => [...current, { symbol: sym, shares: 1 }]);
      // Preserved a newer chart choice if this request finished after another user action.
      if (intent === selectionIntent.current) setSelected(sym);
    } catch (err) {
      reserved.current.delete(sym);
      if (controller.signal.aborted) return;
      setMessage(err instanceof Error ? err.message : `Could not add ${sym}.`);
    } finally {
      if (requests.current.get(sym) === controller) requests.current.delete(sym);
      if (!controller.signal.aborted)
        setPending((current) => current.filter((item) => item !== sym));
    }
  }

  function setShares(sym: string, raw: string) {
    const value = Number(raw);
    setHoldings((current) =>
      current.map((h) =>
        h.symbol === sym ? { ...h, shares: Number.isFinite(value) && value >= 0 ? value : 0 } : h,
      ),
    );
  }

  const rows = holdings.map((h) => ({
    ...h,
    state: quotes[h.symbol] as QuoteState | undefined,
  }));
  const total = rows.reduce(
    (sum, { shares, state }) => sum + (isQuote(state) ? state.latest_price * shares : 0),
    0,
  );
  const activeSymbol =
    selected && holdings.some((h) => h.symbol === selected)
      ? selected
      : (holdings[0]?.symbol ?? null);
  const activeState = activeSymbol ? quotes[activeSymbol] : undefined;
  const chartQuote = isQuote(activeState) ? activeState : null;
  const available = suggestions.filter((s) => !holdings.some((h) => h.symbol === s.symbol));

  return (
    <section className="flex flex-col gap-4 mb-6" aria-label="Stock holdings">
      <div>
        <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2">STOCKS</div>
        <h3 className="text-[17px] font-semibold tracking-[-0.2px] text-text m-0">Your stock holdings</h3>
        <p className="text-xs text-[#8998b0] m-0 mt-1.5">
          Search a USD-priced ticker symbol, enter your shares, and see its price, value, and
          history.
        </p>
      </div>
      <form
        className="flex gap-2 flex-wrap items-center"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void addSymbol(symbol);
        }}
      >
        <input
          className="w-65 max-w-full text-xs min-w-0 border border-border rounded-lg bg-[#101722] text-[#edf2fa] px-2.75 py-2.5"
          aria-label="Ticker symbol"
          placeholder="Ticker symbol (for example AAPL)"
          value={symbol}
          maxLength={10}
          onChange={(event) => setSymbol(event.target.value)}
        />
        <button className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-[#cbbafa] disabled:opacity-40 disabled:cursor-not-allowed" type="submit" disabled={!symbol.trim()}>
          Add stock
        </button>
      </form>
      <div className="min-h-[1.4em] flex items-center gap-2 text-[#91a3bd] text-[13px]" role="status" aria-live="polite">
        {pending.length > 0 && (
          <>
            <span className="stock-loading-spinner" aria-hidden="true" />
            Loading {pending.join(', ')}… You can keep browsing.
          </>
        )}
      </div>
      {message && (
        <p className="text-xs text-coral m-0 negative" role="alert">
          {message}
        </p>
      )}
      {available.length > 0 && (
        <div>
          <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2">POPULAR STOCKS</div>
          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button
                key={s.symbol}
                type="button"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-7 px-2.75 py-1 rounded-full border border-[#344056] hover:not-disabled:border-[#51607a] hover:not-disabled:text-[#e5ecf7] text-[11px] font-medium text-[#a4b2c9] bg-transparent cursor-pointer aria-busy:cursor-progress aria-busy:border-[#51607a]"
                title={s.name}
                aria-busy={pending.includes(s.symbol)}
                aria-disabled={pending.includes(s.symbol)}
                onClick={() => void addSymbol(s.symbol)}
              >
                {pending.includes(s.symbol) ? (
                  <span className="stock-loading-spinner" aria-hidden="true" />
                ) : (
                  '+'
                )}{' '}
                {s.symbol}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,260px))] gap-3.5 mb-0">
        <div className="p-[18px_19px] bg-surface border border-[#283145] rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-[#9cacbf]">Total stock value (USD)</span>
          <strong className="text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold text-text">{dollars(total)}</strong>
          <small className="text-[10px] text-[#73839a]">
            {holdings.length} {holdings.length === 1 ? 'stock' : 'stocks'}
          </small>
        </div>
      </div>
      {holdings.length === 0 ? (
        <div className="py-17.5 px-6 text-center text-[#8d9fba]">
          No stocks yet. Type a ticker symbol above or pick a suggestion.
        </div>
      ) : (
        <div className="border border-[#2a3549] rounded-[11px] bg-[#121a27] overflow-auto min-h-0">
          <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
            <thead>
              <tr>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Stock</th>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Shares</th>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Price</th>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Value</th>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Annualized return</th>
                <th className="text-[#8192ad] text-[10px] font-medium p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]">Annualized volatility</th>
                <th className="p-[16px_20px] bg-[#161f2e] max-[760px]:p-[11px_14px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ symbol: sym, shares, state }) => {
                const quote = isQuote(state) ? state : null;
                const problem = errorOf(state);
                return (
                  <tr key={sym}>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">
                      <strong>{sym}</strong>
                      {quote?.name && <small className="text-[#8b9ab1]"> {quote.name}</small>}
                      {problem && <small className="text-coral negative"> {problem}</small>}
                    </td>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Shares of ${sym}`}
                        defaultValue={shares}
                        className="text-xs min-w-0 border border-border rounded-lg bg-[#101722] text-[#edf2fa] px-2.75 py-1.5"
                        style={{ width: '5.5rem' }}
                        onChange={(event) => setShares(sym, event.target.value)}
                      />
                    </td>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">{quote ? dollars(quote.latest_price) : problem ? '—' : 'Loading…'}</td>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">{quote ? dollars(quote.latest_price * shares) : '—'}</td>
                    <td
                      className={`p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px] ${
                        quote && quote.cagr !== null
                          ? quote.cagr >= 0
                            ? 'positive text-mint'
                            : 'negative text-coral'
                          : ''
                      }`}
                    >
                      {percent(quote?.cagr)}
                      {quote?.stats_start_date && quote.stats_end_date && (
                        <small className="text-[#8b9ab1]" style={{ display: 'block' }}>
                          {quote.stats_start_date} to {quote.stats_end_date}
                        </small>
                      )}
                    </td>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">{percent(quote?.annual_volatility)}</td>
                    <td className="p-[13px_20px] border-t border-[#263147] text-text max-[760px]:p-[11px_14px]">
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer ${sym === activeSymbol ? 'bg-primary text-primary-fg border border-primary' : 'bg-transparent border border-transparent text-[#a4b2c9] hover:bg-[#232f43] hover:text-text'}`}
                        aria-pressed={sym === activeSymbol}
                        onClick={() => {
                          selectionIntent.current++;
                          setSelected(sym);
                        }}
                      >
                        Chart
                      </button>{' '}
                      <button
                        type="button"
                        className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-[#633246] bg-[#2b1b28] hover:bg-[#3d2034]"
                        onClick={() => {
                          reserved.current.delete(sym);
                          requests.current.get(sym)?.abort();
                          requests.current.delete(sym);
                          setHoldings((current) => current.filter((h) => h.symbol !== sym));
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {chartQuote && <StockPriceChart quote={chartQuote} />}
      <p className="text-[11px] text-[#73839a] leading-relaxed m-0 mt-3">
        Prices come from Yahoo Finance and refresh about once a day. Past performance does not
        predict future results. Only verified USD-priced securities are supported; no currency
        conversion is performed. Annualized return is compounded yearly growth over the dates shown,
        using up to ten years of history. Volatility measures annualized daily price variation over
        that same period. Both require at least one year of history. Charts use adjusted closing
        prices, which account for splits and dividends. Holdings are saved in this browser only.
      </p>
    </section>
  );
}

// Isolated the chart from form edits and loading updates so an unchanged quote was not redrawn.
const StockPriceChart = memo(function StockPriceChart({ quote: chartQuote }: { quote: Quote }) {
  // Matched the line color to the net price change across the displayed history.
  const chartHistory = chartQuote.history;
  const chartChange =
    chartHistory.length > 1
      ? chartHistory[chartHistory.length - 1].close - chartHistory[0].close
      : 0;
  const chartColor = chartChange > 0 ? colors.INCOME : chartChange < 0 ? colors.DEBT : '#91a3bd';
  return (
    <div>
      <h4 className="text-[13px] font-semibold text-text m-0 mb-2">
        {chartQuote.symbol} · recent adjusted prices (USD){' '}
        <small className="text-[#8b9ab1]">as of {chartQuote.latest_date}</small>
      </h4>
      <div className="h-65 mt-2.5" role="img" aria-label={`${chartQuote.symbol} price history`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            accessibilityLayer={false}
            data={chartQuote.history}
            margin={{ top: 10, right: 28, bottom: 10, left: 2 }}
          >
            <CartesianGrid strokeDasharray="3 7" stroke="#29364a" vertical={false} />
            <XAxis
              dataKey="date"
              ticks={monthTicks(chartQuote.history)}
              tickFormatter={monthLabel}
              tick={{ fill: '#91a3bd', fontSize: 11 }}
              minTickGap={16}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              domain={['auto', 'auto']}
              tickFormatter={(value: number) => money(value)}
              width={70}
              tick={{ fill: '#91a3bd', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const point = payload[0]?.payload as { date: string; close: number };
                return (
                  <div className="p-[13px_15px] bg-[#1c2638] border border-[#47536d] rounded-[9px] shadow-[0_10px_30px_#0005] min-w-50 text-[11px]">
                    <strong className="block text-[11px] text-[#d9e3f3] mb-3">{point.date}</strong>
                    <div className="flex justify-between gap-5.5 mt-2.5">
                      <span>Close</span>
                      <b className="font-semibold text-text">{dollars(point.close)}</b>
                    </div>
                  </div>
                );
              }}
            />
            <Line
              type="monotone"
              dataKey="close"
              stroke={chartColor}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});
