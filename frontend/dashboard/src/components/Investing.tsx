import { useEffect, useRef, useState } from 'react';
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

const STORAGE_KEY = 'finapp.holdings.v1';
const MAX_HOLDINGS = 25;

function loadHoldings(): Holding[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
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

async function fetchQuote(symbol: string): Promise<Quote> {
  const response = await fetch(`${API_BASE}/market/stocks/${encodeURIComponent(symbol)}`);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Could not load ${symbol} (${response.status}).`,
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

export function Investing() {
  const [holdings, setHoldings] = useState<Holding[]>(loadHoldings);
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [symbol, setSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const startup = useRef(holdings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
    } catch {
      /* Private browsing can block storage; holdings just won't persist. */
    }
  }, [holdings]);

  useEffect(() => {
    // Prices are not saved with the holdings, so reload them for each saved stock.
    for (const { symbol: sym } of startup.current) {
      setQuotes((current) => ({ ...current, [sym]: 'loading' }));
      fetchQuote(sym)
        .then((quote) => setQuotes((current) => ({ ...current, [sym]: quote })))
        .catch((err) =>
          setQuotes((current) => ({
            ...current,
            [sym]: { error: err instanceof Error ? err.message : `Could not load ${sym}.` },
          })),
        );
    }
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
    if (holdings.some((h) => h.symbol === sym)) {
      setMessage(`${sym} is already in your holdings.`);
      return;
    }
    if (holdings.length >= MAX_HOLDINGS) {
      setMessage(`You can track up to ${MAX_HOLDINGS} stocks.`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const quote = await fetchQuote(sym);
      setQuotes((current) => ({ ...current, [sym]: quote }));
      setHoldings((current) => [...current, { symbol: sym, shares: 1 }]);
      setSelected(sym);
      setSymbol('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : `Could not add ${sym}.`);
    } finally {
      setBusy(false);
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

  return (
    <section aria-label="Stock holdings">
      <div className="eyebrow">STOCKS</div>
      <h3>Your stock holdings</h3>
      <p>Search a ticker symbol, enter your shares, and see its price, value, and history.</p>
      <form
        className="button-row"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void addSymbol(symbol);
        }}
      >
        <input
          aria-label="Ticker symbol"
          placeholder="Ticker symbol, for example AAPL"
          value={symbol}
          maxLength={10}
          onChange={(event) => setSymbol(event.target.value)}
        />
        <button className="button primary" type="submit" disabled={busy || !symbol.trim()}>
          {busy ? 'Adding…' : 'Add stock'}
        </button>
      </form>
      {message && (
        <p className="negative" role="alert">
          {message}
        </p>
      )}
      {suggestions.length > 0 && (
        <div className="button-row">
          {suggestions
            .filter((s) => !holdings.some((h) => h.symbol === s.symbol))
            .map((s) => (
              <button
                key={s.symbol}
                type="button"
                className="button quiet"
                title={s.name}
                disabled={busy}
                onClick={() => void addSymbol(s.symbol)}
              >
                + {s.symbol}
              </button>
            ))}
        </div>
      )}
      <div className="metric-grid">
        <div className="metric-card">
          <span>Total stock value</span>
          <strong>{dollars(total)}</strong>
          <small>
            {holdings.length} {holdings.length === 1 ? 'stock' : 'stocks'}
          </small>
        </div>
      </div>
      {holdings.length === 0 ? (
        <div className="loading-panel">
          No stocks yet. Type a ticker symbol above or pick a suggestion.
        </div>
      ) : (
        <div className="account-table-wrap">
          <table className="account-table">
            <thead>
              <tr>
                <th>Stock</th>
                <th>Shares</th>
                <th>Price</th>
                <th>Value</th>
                <th>10-yr return</th>
                <th>Volatility</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ symbol: sym, shares, state }) => {
                const quote = isQuote(state) ? state : null;
                const problem = errorOf(state);
                return (
                  <tr key={sym}>
                    <td>
                      <strong>{sym}</strong>
                      {quote?.name && <small className="muted"> {quote.name}</small>}
                      {problem && <small className="negative"> {problem}</small>}
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Shares of ${sym}`}
                        defaultValue={shares}
                        style={{ width: '5.5rem' }}
                        onChange={(event) => setShares(sym, event.target.value)}
                      />
                    </td>
                    <td>{quote ? dollars(quote.latest_price) : problem ? '—' : 'Loading…'}</td>
                    <td>{quote ? dollars(quote.latest_price * shares) : '—'}</td>
                    <td
                      className={
                        quote && quote.cagr !== null
                          ? quote.cagr >= 0
                            ? 'positive'
                            : 'negative'
                          : ''
                      }
                    >
                      {percent(quote?.cagr)}
                    </td>
                    <td>{percent(quote?.annual_volatility)}</td>
                    <td>
                      <button
                        type="button"
                        className="button quiet"
                        onClick={() => setSelected(sym)}
                      >
                        Chart
                      </button>{' '}
                      <button
                        type="button"
                        className="button danger"
                        onClick={() =>
                          setHoldings((current) => current.filter((h) => h.symbol !== sym))
                        }
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
      {chartQuote && (
        <>
          <h4>
            {chartQuote.symbol} · last year of prices{' '}
            <small className="muted">as of {chartQuote.latest_date}</small>
          </h4>
          <div style={{ height: 260 }} role="img" aria-label={`${chartQuote.symbol} price history`}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartQuote.history}
                margin={{ top: 10, right: 20, bottom: 10, left: 2 }}
              >
                <CartesianGrid strokeDasharray="3 7" stroke="#29364a" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value: string) => value.slice(0, 7)}
                  tick={{ fill: '#91a3bd', fontSize: 11 }}
                  minTickGap={40}
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
                      <div className="chart-tooltip">
                        <strong>{point.date}</strong>
                        <div>
                          <span>Close</span>
                          <b>{dollars(point.close)}</b>
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke={colors.INVESTMENT}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <p className="muted">
        Prices come from Yahoo Finance and refresh about once a day. Past performance does not
        predict future results. Holdings are saved in this browser only.
      </p>
    </section>
  );
}
