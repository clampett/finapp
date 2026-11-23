import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, dollars } from '../common/finance';

interface CryptoQuote {
  symbol: string;
  name: string | null;
  price: number;
  change_percent: number;
  as_of: string;
}

interface CurrencyQuote {
  code: string;
  name: string;
  per_usd: number;
  usd_per_unit: number;
  change_percent: number;
  as_of: string;
}

function isCryptoQuote(value: unknown): value is CryptoQuote {
  const quote = value as Partial<CryptoQuote> | null;
  return (
    typeof quote?.symbol === 'string' &&
    Number.isFinite(quote.price) &&
    Number.isFinite(quote.change_percent) &&
    typeof quote.as_of === 'string'
  );
}

function isCurrencyQuote(value: unknown): value is CurrencyQuote {
  const quote = value as Partial<CurrencyQuote> | null;
  return (
    typeof quote?.code === 'string' &&
    typeof quote.name === 'string' &&
    Number.isFinite(quote.per_usd) &&
    Number.isFinite(quote.usd_per_unit) &&
    Number.isFinite(quote.change_percent) &&
    typeof quote.as_of === 'string'
  );
}

const REFRESH_MS = 60_000;

const LABEL_BASE = 'text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold';
const LABEL = `${LABEL_BASE} mb-2`;
const HEADING = 'text-[17px] font-semibold tracking-[-0.2px] text-text m-0';
const COPY = 'text-xs text-(--ui-text-8998b0) m-0 mt-1.5';
const TABLE_WRAP =
  'border border-(--ui-border-2a3549) rounded-[11px] bg-(--ui-surface-121a27) overflow-auto min-h-0';
const TH =
  'text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]';
const TD = 'p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]';
const INPUT =
  'w-65 max-w-full text-xs min-w-0 border border-border rounded-lg bg-(--ui-surface-101722) text-(--ui-text-edf2fa) px-2.75 py-2.5';
const BUTTON =
  'inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-(--ui-surface-hover-cbbafa) disabled:opacity-40 disabled:cursor-not-allowed';
const CHIP =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-7 px-2.75 py-1 rounded-full border border-(--ui-border-344056) hover:not-disabled:border-(--ui-border-51607a) hover:not-disabled:text-(--ui-text-e5ecf7) text-[11px] font-medium text-(--ui-text-a4b2c9) bg-transparent cursor-pointer';

// Refreshed quotes while visible and kept the previous list available during transient failures.
function usePrices<T>(path: string, isQuote: (value: unknown) => value is T) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    let lastAttempt = -Infinity;
    const load = async () => {
      if (running || document.hidden || Date.now() - lastAttempt < REFRESH_MS) return;
      lastAttempt = Date.now();
      running = true;
      try {
        const response = await fetch(`${API_BASE}/market/${path}`, {
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]),
        });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof body?.detail === 'string'
              ? body.detail
              : `Could not load prices (${response.status}).`,
          );
        }
        // Validated responses before formatting numeric values in the table.
        if (!Array.isArray(body) || !body.every(isQuote))
          throw new Error('Market data returned an invalid price list.');
        if (controller.signal.aborted) return;
        setItems(body);
        setError('');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error && err.name !== 'TimeoutError'
            ? err.message
            : 'Could not load prices in time.',
        );
      } finally {
        running = false;
      }
    };
    void load();
    // Refreshed overdue quotes when a backgrounded tab became visible again.
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [path, isQuote]);

  return { items, error };
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (value: number) =>
  value > 0 ? 'positive text-mint' : value < 0 ? 'negative text-coral' : 'text-muted';
const preciseDollar = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 6,
});
const quotePrice = (value: number) => (value >= 1 ? dollars(value) : preciseDollar.format(value));
const quoteTime = (asOf: string) => {
  const fetchedAt = new Date(asOf);
  return Number.isFinite(fetchedAt.getTime()) ? fetchedAt.toLocaleString() : 'Unavailable';
};

function Status({ items, error }: { items: unknown[] | null; error: string }) {
  if (error) {
    return (
      <p className="text-xs text-coral m-0 negative" role="alert">
        {items ? `Refresh failed. Showing last available prices. ${error}` : error}
      </p>
    );
  }
  if (!items) {
    return (
      <div className="flex items-center gap-2 text-(--ui-text-91a3bd) text-[13px]" role="status">
        <span className="stock-loading-spinner" aria-hidden="true" />
        Loading prices…
      </div>
    );
  }
  return null;
}

const DEFAULT_COINS = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'LTC', 'BNB'];
const MAX_COINS = 25;
const COIN_PATTERN = /^[A-Z0-9]{1,15}$/;

// Loaded the user's saved coin list, falling back to the default coins the first time.
function readCoins(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return DEFAULT_COINS;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_COINS;
    const coins = parsed.filter(
      (item): item is string => typeof item === 'string' && COIN_PATTERN.test(item),
    );
    return [...new Set(coins)].slice(0, MAX_COINS);
  } catch {
    return DEFAULT_COINS;
  }
}

function saveCoins(key: string, coins: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(coins));
  } catch {
    /* Ignore private browsing quota errors */
  }
}

async function fetchCoin(symbol: string, signal: AbortSignal): Promise<CryptoQuote> {
  const response = await fetch(`${API_BASE}/market/crypto/${encodeURIComponent(symbol)}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : `Could not look up ${symbol} (${response.status}).`,
    );
  }
  if (!isCryptoQuote(body)) throw new Error('Market data returned an invalid quote.');
  return body;
}

// Refreshed every coin in the user's list while visible and kept old prices during failures.
function useCoinQuotes(coins: string[]) {
  const [quotes, setQuotes] = useState<Record<string, CryptoQuote>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const listKey = coins.join(',');

  useEffect(() => {
    const list = listKey ? listKey.split(',') : [];
    const controller = new AbortController();
    let running = false;
    let lastAttempt = -Infinity;
    const load = async () => {
      if (running || document.hidden || list.length === 0) return;
      if (Date.now() - lastAttempt < REFRESH_MS) return;
      lastAttempt = Date.now();
      running = true;
      try {
        const results = await Promise.allSettled(
          list.map((sym) => fetchCoin(sym, controller.signal)),
        );
        if (controller.signal.aborted) return;
        const nextQuotes: Record<string, CryptoQuote> = {};
        const nextErrors: Record<string, string> = {};
        results.forEach((result, index) => {
          const sym = list[index];
          if (result.status === 'fulfilled') {
            nextQuotes[sym] = result.value;
          } else {
            const reason = result.reason;
            nextErrors[sym] =
              reason instanceof Error && reason.name !== 'TimeoutError'
                ? reason.message
                : `Could not load ${sym} in time.`;
          }
        });
        setQuotes((cur) => ({ ...cur, ...nextQuotes }));
        setErrors(nextErrors);
      } finally {
        running = false;
      }
    };
    void load();
    // Refreshed overdue quotes when a backgrounded tab became visible again.
    const timer = window.setInterval(load, REFRESH_MS);
    document.addEventListener('visibilitychange', load);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', load);
    };
  }, [listKey]);

  return { quotes, errors, setQuotes };
}

function CryptoTable({
  coins,
  quotes,
  errors,
  onRemove,
}: {
  coins: string[];
  quotes: Record<string, CryptoQuote>;
  errors: Record<string, string>;
  onRemove: (symbol: string) => void;
}) {
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
        <thead>
          <tr>
            <th className={TH}>Coin</th>
            <th className={TH}>Price (USD)</th>
            <th className={TH}>Change since previous close</th>
            <th className={TH}>Fetched</th>
            <th className={TH}></th>
          </tr>
        </thead>
        <tbody>
          {coins.map((sym) => {
            const coin = quotes[sym];
            return (
              <tr key={sym}>
                <td className={TD}>
                  <strong>{sym}</strong>
                  {coin?.name && <small className="text-(--ui-text-8b9ab1)"> {coin.name}</small>}
                </td>
                {coin ? (
                  <>
                    <td className={TD}>{quotePrice(coin.price)}</td>
                    <td className={`${TD} ${tone(coin.change_percent)}`}>
                      {signed(coin.change_percent)}
                    </td>
                    <td className={TD}>{quoteTime(coin.as_of)}</td>
                  </>
                ) : (
                  <td className={`${TD} text-(--ui-text-91a3bd)`} colSpan={3}>
                    {errors[sym] ?? 'Loading…'}
                  </td>
                )}
                <td className={TD}>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034)"
                    aria-label={`Remove ${sym}`}
                    onClick={() => onRemove(sym)}
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
  );
}

export function MarketPrices({ storageKey }: { storageKey: string }) {
  const coinsKey = `${storageKey}:crypto-list`;
  const [coins, setCoins] = useState<string[]>(() => readCoins(coinsKey));
  const { quotes, errors, setQuotes } = useCoinQuotes(coins);
  const currencies = usePrices('currencies', isCurrencyQuote);
  const [symbol, setSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lookup = useRef<AbortController | null>(null);
  useEffect(() => () => lookup.current?.abort(), []);

  function updateCoins(next: string[]) {
    setCoins(next);
    saveCoins(coinsKey, next);
  }

  function removeCoin(coin: string) {
    updateCoins(coins.filter((item) => item !== coin));
  }

  // Looked the coin up first so a typo is never added to the list.
  async function addCoin(raw: string) {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const quote = await fetchCoin(sym, controller.signal);
      if (controller.signal.aborted) return;
      if (coins.includes(quote.symbol)) {
        setMessage(`${quote.symbol} is already in your list.`);
        return;
      }
      if (coins.length >= MAX_COINS) {
        setMessage(`Your list is full (${MAX_COINS} coins). Remove one to add another.`);
        return;
      }
      setQuotes((cur) => ({ ...cur, [quote.symbol]: quote }));
      updateCoins([...coins, quote.symbol]);
      setSymbol('');
    } catch (err) {
      if (controller.signal.aborted) return;
      setMessage(
        err instanceof Error && err.name !== 'TimeoutError'
          ? err.message
          : `Could not look up ${sym} in time.`,
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const missingDefaults = DEFAULT_COINS.filter((coin) => !coins.includes(coin));

  return (
    <>
      <section className="flex flex-col gap-4 mb-6" aria-label="Crypto prices">
        <div>
          <div className={LABEL}>CRYPTO</div>
          <h3 className={HEADING}>Your crypto list</h3>
          <p className={COPY}>
            Yahoo Finance prices in US dollars, checked about once a minute. Add any coin by its
            symbol and remove the ones you do not want.
          </p>
        </div>
        <form
          className="flex gap-2 flex-wrap items-center"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void addCoin(symbol);
          }}
        >
          <input
            className={INPUT}
            aria-label="Coin symbol"
            placeholder="Coin symbol (for example AVAX)"
            value={symbol}
            maxLength={20}
            onChange={(event) => setSymbol(event.target.value)}
          />
          <button className={BUTTON} type="submit" disabled={busy || !symbol.trim()}>
            {busy ? 'Adding…' : 'Add coin'}
          </button>
        </form>
        {message && (
          <p className="text-xs text-coral m-0 negative" role="alert">
            {message}
          </p>
        )}
        {coins.length > 0 ? (
          <CryptoTable coins={coins} quotes={quotes} errors={errors} onRemove={removeCoin} />
        ) : (
          <p className={COPY}>Your list is empty. Add a coin above.</p>
        )}
        {missingDefaults.length > 0 && (
          <div>
            <button
              type="button"
              className={CHIP}
              onClick={() => updateCoins([...coins, ...missingDefaults].slice(0, MAX_COINS))}
            >
              Restore default coins
            </button>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-4 mb-6" aria-label="Foreign currency prices">
        <div>
          <div className={LABEL}>CURRENCIES</div>
          <h3 className={HEADING}>Foreign currency prices</h3>
          <p className={COPY}>
            Yahoo Finance rates against the US dollar. FinApp checks for updates about once a
            minute.
          </p>
        </div>
        <Status items={currencies.items} error={currencies.error} />
        {currencies.items && (
          <div className={TABLE_WRAP}>
            <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
              <thead>
                <tr>
                  <th className={TH}>Currency</th>
                  <th className={TH}>Per 1 USD</th>
                  <th className={TH}>Value in USD</th>
                  <th className={TH}>Change since previous close</th>
                  <th className={TH}>Fetched</th>
                </tr>
              </thead>
              <tbody>
                {currencies.items.map((currency) => (
                  <tr key={currency.code}>
                    <td className={TD}>
                      <strong>{currency.code}</strong>
                      <small className="text-(--ui-text-8b9ab1)"> {currency.name}</small>
                    </td>
                    <td className={TD}>
                      {currency.per_usd >= 100
                        ? currency.per_usd.toFixed(2)
                        : currency.per_usd.toFixed(4)}{' '}
                      {currency.code}
                    </td>
                    <td className={TD}>{preciseDollar.format(currency.usd_per_unit)}</td>
                    <td className={`${TD} ${tone(currency.change_percent)}`}>
                      {signed(currency.change_percent)}
                    </td>
                    <td className={TD}>{quoteTime(currency.as_of)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}m
