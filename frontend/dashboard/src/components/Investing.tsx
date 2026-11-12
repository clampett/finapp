import { memo, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { MarketPriceChart } from './MarketPriceChart';
import { API_BASE, dollars } from '../finance';
import {
  PORTFOLIO_UPDATED_EVENT,
  addStockUnified,
  loadUnifiedHoldings,
  parseLocalHoldings,
  saveLocalHoldings,
  removeStockUnified,
  updateSharesUnified,
  saveStoredPortfolioValue,
  notifyPortfolioUpdated,
} from '../portfolio';
import type { Holding } from '../portfolio';
import { MarketPrices } from './MarketPrices';

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
  pays_dividend?: boolean;
  dividend_frequency?: string | null;
  dividend_per_share?: number | null;
  history: { date: string; close: number }[];
}

interface Suggestion {
  symbol: string;
  name: string;
}

type QuoteState = Quote | { error: string } | 'loading';

const MAX_HOLDINGS = 25;

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
    throw new Error('A verified USD price is unavailable for this stock. Try another symbol.');
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
// Replaced fixed monthly ticks with range-aware date ticks in the shared price chart.
type InvestingProps = {
  storageKey: string;
  userId?: number;
  demo?: boolean;
};

export function Investing(props: InvestingProps) {
  // Mounted the market panels with Investing so both dashboard layouts used the same view.
  return (
    <>
      <StockHoldings {...props} />
      <MarketPrices />
    </>
  );
}

function StockHoldings({ storageKey, userId, demo }: InvestingProps) {
  const [holdings, setHoldings] = useState<Holding[]>(() => parseLocalHoldings(storageKey));
  const [quotes, setQuotes] = useState<Record<string, QuoteState>>({});
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [symbol, setSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const reserved = useRef(new Set(holdings.map((holding) => holding.symbol)));
  const requests = useRef(new Map<string, AbortController>());
  const selectionIntent = useRef(0);

  // Initial unified portfolio load
  useEffect(() => {
    const controller = new AbortController();
    loadUnifiedHoldings(storageKey, userId, demo, controller.signal)
      .then(({ holdings: unified }) => {
        if (controller.signal.aborted) return;
        setHoldings(unified);
        unified.forEach((h) => reserved.current.add(h.symbol));
        for (const { symbol: sym } of unified) {
          if (!requests.current.has(sym)) {
            const reqCtrl = new AbortController();
            requests.current.set(sym, reqCtrl);
            setQuotes((cur) => ({ ...cur, [sym]: 'loading' }));
            fetchQuote(sym, reqCtrl.signal)
              .then((quote) => {
                if (!reqCtrl.signal.aborted) {
                  setQuotes((cur) => ({ ...cur, [sym]: quote }));
                  setHoldings((curHoldings) => {
                    const updated = curHoldings.map((h) =>
                      h.symbol === sym
                        ? {
                            ...h,
                            lastPrice: quote.latest_price,
                            companyName: quote.name || h.companyName,
                          }
                        : h,
                    );
                    saveLocalHoldings(storageKey, updated);
                    return updated;
                  });
                }
              })
              .catch((err) => {
                if (!reqCtrl.signal.aborted)
                  setQuotes((cur) => ({
                    ...cur,
                    [sym]: { error: err instanceof Error ? err.message : `Could not load ${sym}.` },
                  }));
              })
              .finally(() => {
                if (requests.current.get(sym) === reqCtrl) requests.current.delete(sym);
              });
          }
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [storageKey, userId, demo]);

  // Synchronize when another tab updates stocks (e.g. Budgeting)
  useEffect(() => {
    const handlePortfolioUpdated = () => {
      loadUnifiedHoldings(storageKey, userId, demo)
        .then(({ holdings: unified }) => {
          setHoldings(unified);
          unified.forEach((h) => reserved.current.add(h.symbol));
          for (const { symbol: sym } of unified) {
            if (!quotes[sym] && !requests.current.has(sym)) {
              const reqCtrl = new AbortController();
              requests.current.set(sym, reqCtrl);
              setQuotes((cur) => ({ ...cur, [sym]: 'loading' }));
              fetchQuote(sym, reqCtrl.signal)
                .then((quote) => {
                  if (!reqCtrl.signal.aborted) {
                    setQuotes((cur) => ({ ...cur, [sym]: quote }));
                    setHoldings((curHoldings) => {
                      const updated = curHoldings.map((h) =>
                        h.symbol === sym
                          ? {
                              ...h,
                              lastPrice: quote.latest_price,
                              companyName: quote.name || h.companyName,
                            }
                          : h,
                      );
                      saveLocalHoldings(storageKey, updated);
                      return updated;
                    });
                  }
                })
                .catch(() => {})
                .finally(() => {
                  if (requests.current.get(sym) === reqCtrl) requests.current.delete(sym);
                });
            }
          }
        })
        .catch(() => {});
    };

    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdated);
    return () => window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioUpdated);
  }, [storageKey, userId, demo, quotes]);

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
    if (requests.current.has(sym)) {
      setMessage(`${sym} is already being loaded.`);
      return;
    }
    if (holdings.length >= MAX_HOLDINGS) {
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
      const savedQuote = quotes[sym];
      const quote = isQuote(savedQuote) ? savedQuote : await fetchQuote(sym, controller.signal);
      if (controller.signal.aborted) return;
      setQuotes((current) => ({ ...current, [sym]: quote }));
      const newHolding = await addStockUnified({
        storageKey,
        userId,
        demo,
        symbol: sym,
        companyName: quote.name,
        price: quote.latest_price,
        shares: 1,
        // Retained detected dividend metadata for the portfolio forecast.
        paysDividend: quote.pays_dividend,
        dividendFrequency: quote.dividend_frequency,
        dividendPerShare: quote.dividend_per_share,
      });
      setHoldings((current) => [...current, newHolding]);
      if (intent === selectionIntent.current) setSelected(sym);
    } catch (err) {
      if (!holdings.some((h) => h.symbol === sym)) {
        reserved.current.delete(sym);
      }
      if (controller.signal.aborted) return;
      setMessage(err instanceof Error ? err.message : `Could not add ${sym}.`);
    } finally {
      if (requests.current.get(sym) === controller) requests.current.delete(sym);
      if (!controller.signal.aborted)
        setPending((current) => current.filter((item) => item !== sym));
    }
  }

  async function setShares(sym: string, raw: string, stockId?: number) {
    const value = Number(raw);
    if (!raw.trim() || !Number.isFinite(value) || value < 0) return;
    const newShares = value;
    const currentHolding =
      stockId !== undefined
        ? holdings.find((h) => h.stockId === stockId)
        : holdings.find((h) => h.symbol === sym);
    const currentShares = currentHolding?.shares ?? 0;
    if (currentShares === newShares) return;
    const quote = quotes[sym];
    const price = isQuote(quote) ? quote.latest_price : currentHolding?.lastPrice;
    if (!price || !Number.isFinite(price) || price <= 0) {
      setMessage('A price is needed before shares can be updated.');
      return;
    }
    const previousHoldings = holdings;

    setHoldings((current) =>
      current.map((h) =>
        (stockId !== undefined ? h.stockId === stockId : h.symbol === sym)
          ? { ...h, shares: newShares }
          : h,
      ),
    );
    try {
      await updateSharesUnified({
        storageKey,
        userId,
        demo,
        symbol: sym,
        currentShares,
        newShares,
        price,
        stockId: currentHolding?.stockId ?? stockId,
      });
    } catch (err) {
      setHoldings(previousHoldings);
      setMessage(err instanceof Error ? err.message : `Could not update shares for ${sym}.`);
    }
  }

  async function removeHolding(sym: string, stockId?: number) {
    const target =
      stockId !== undefined
        ? holdings.find((h) => h.stockId === stockId)
        : holdings.find((h) => h.symbol === sym);
    const otherLotsForSym = holdings.filter(
      (h) => h.symbol === sym && (stockId !== undefined ? h.stockId !== stockId : false),
    );
    if (otherLotsForSym.length === 0) {
      reserved.current.delete(sym);
      requests.current.get(sym)?.abort();
      requests.current.delete(sym);
    }
    const previousHoldings = holdings;
    setHoldings((current) =>
      stockId !== undefined
        ? current.filter((h) => h.stockId !== stockId)
        : current.filter((h) => h.symbol !== sym),
    );
    try {
      await removeStockUnified({
        storageKey,
        userId,
        demo,
        symbol: sym,
        stockId: target?.stockId ?? stockId,
      });
    } catch (err) {
      setHoldings(previousHoldings);
      setMessage(err instanceof Error ? err.message : `Could not remove ${sym}.`);
    }
  }

  const rows = holdings.map((h) => ({
    ...h,
    state: quotes[h.symbol] as QuoteState | undefined,
  }));
  const total = rows.reduce((sum, { shares, state, lastPrice }) => {
    const price = isQuote(state) ? state.latest_price : Number(lastPrice || 0);
    return sum + price * shares;
  }, 0);

  useEffect(() => {
    if (total > 0 || holdings.length === 0) {
      if (saveStoredPortfolioValue(storageKey, total)) {
        notifyPortfolioUpdated();
      }
    }
  }, [total, storageKey, holdings.length]);
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
        <div className="text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold mb-2">
          STOCKS
        </div>
        <h3 className="text-[17px] font-semibold tracking-[-0.2px] text-text m-0">
          Your stock holdings
        </h3>
        <p className="text-xs text-(--ui-text-8998b0) m-0 mt-1.5">
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
          className="w-65 max-w-full text-xs min-w-0 border border-border rounded-lg bg-(--ui-surface-101722) text-(--ui-text-edf2fa) px-2.75 py-2.5"
          aria-label="Ticker symbol"
          placeholder="Ticker symbol (for example AAPL)"
          value={symbol}
          maxLength={10}
          onChange={(event) => setSymbol(event.target.value)}
        />
        <button
          className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-(--ui-surface-hover-cbbafa) disabled:opacity-40 disabled:cursor-not-allowed"
          type="submit"
          disabled={!symbol.trim()}
        >
          Add stock
        </button>
      </form>
      <div
        className="min-h-[1.4em] flex items-center gap-2 text-(--ui-text-91a3bd) text-[13px]"
        role="status"
        aria-live="polite"
      >
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
          <div className="text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold mb-2">
            POPULAR STOCKS
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((s) => (
              <button
                key={s.symbol}
                type="button"
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-7 px-2.75 py-1 rounded-full border border-(--ui-border-344056) hover:not-disabled:border-(--ui-border-51607a) hover:not-disabled:text-(--ui-text-e5ecf7) text-[11px] font-medium text-(--ui-text-a4b2c9) bg-transparent cursor-pointer aria-busy:cursor-progress aria-busy:border-(--ui-border-51607a)"
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
        <div className="p-[18px_19px] bg-surface border border-(--ui-border-283145) rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-(--ui-text-9cacbf)">Total stock value (USD)</span>
          <strong className="text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold text-text">
            {dollars(total)}
          </strong>
          <small className="text-[10px] text-(--ui-text-73839a)">
            {holdings.length} {holdings.length === 1 ? 'stock' : 'stocks'}
          </small>
        </div>
      </div>
      {holdings.length === 0 ? (
        <div className="py-17.5 px-6 text-center text-(--ui-text-8d9fba)">
          No stocks yet. Type a ticker symbol above or pick a suggestion.
        </div>
      ) : (
        <div className="border border-(--ui-border-2a3549) rounded-[11px] bg-(--ui-surface-121a27) overflow-auto min-h-0">
          <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
            <thead>
              <tr>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Stock
                </th>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Shares
                </th>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Price
                </th>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Value
                </th>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Annualized return
                </th>
                <th className="text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]">
                  Annualized volatility
                </th>
                <th className="p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ symbol: sym, shares, state, lastPrice, stockId }, index) => {
                const quote = isQuote(state) ? state : null;
                const problem = errorOf(state);
                return (
                  <tr key={stockId ?? `${sym}-${index}`}>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      <strong>{sym}</strong>
                      {quote?.name && (
                        <small className="text-(--ui-text-8b9ab1)"> {quote.name}</small>
                      )}
                      {problem && <small className="text-coral negative"> {problem}</small>}
                    </td>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      <input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Shares of ${sym}`}
                        key={shares}
                        defaultValue={shares}
                        className="text-xs min-w-0 border border-border rounded-lg bg-(--ui-surface-101722) text-(--ui-text-edf2fa) px-2.75 py-1.5"
                        style={{ width: '5.5rem' }}
                        onChange={(event) => setShares(sym, event.target.value, stockId)}
                        onBlur={(event) => {
                          const value = event.currentTarget.value;
                          event.currentTarget.value = String(shares);
                          void setShares(sym, value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                      />
                    </td>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      {quote
                        ? dollars(quote.latest_price)
                        : lastPrice
                          ? dollars(lastPrice)
                          : problem
                            ? '—'
                            : 'Loading…'}
                    </td>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      {quote
                        ? dollars(quote.latest_price * shares)
                        : lastPrice
                          ? dollars(lastPrice * shares)
                          : '—'}
                    </td>
                    <td
                      className={`p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px] ${
                        quote && quote.cagr !== null
                          ? quote.cagr >= 0
                            ? 'positive text-mint'
                            : 'negative text-coral'
                          : ''
                      }`}
                    >
                      {percent(quote?.cagr)}
                      {quote?.stats_start_date && quote.stats_end_date && (
                        <small className="text-(--ui-text-8b9ab1)" style={{ display: 'block' }}>
                          {quote.stats_start_date} to {quote.stats_end_date}
                        </small>
                      )}
                    </td>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      {percent(quote?.annual_volatility)}
                    </td>
                    <td className="p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]">
                      <button
                        type="button"
                        className={`inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer ${sym === activeSymbol ? 'bg-primary text-primary-fg border border-primary' : 'bg-transparent border border-transparent text-(--ui-text-a4b2c9) hover:bg-(--ui-surface-hover-232f43) hover:text-text'}`}
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
                        className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034)"
                        onClick={() => {
                          void removeHolding(sym, stockId);
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
      <p className="text-[11px] text-(--ui-text-73839a) leading-relaxed m-0 mt-3">
        Daily prices come from Yahoo Finance and refresh about once a day; the 1D chart uses cached
        five-minute bars from the latest available trading session. Past performance does not
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
  // Reused the coach's grid, tracking cursor and timeframe controls for every supported USD holding.
  return (
    <div className="mt-5 rounded-xl border border-border bg-raised p-4">
      <h4 className="m-0 text-base font-semibold text-text">
        {chartQuote.symbol} price history{' '}
        <span className="font-normal text-xs text-muted">· USD · adjusted prices</span>
      </h4>
      <MarketPriceChart symbol={chartQuote.symbol} kind="stock" initialPeriod="1y" />
    </div>
  );
});
