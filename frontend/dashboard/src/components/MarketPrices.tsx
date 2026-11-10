import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, dollars } from '../finance';

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

const REFRESH_MS = 60_000;

const LABEL_BASE = 'text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold';
const LABEL = `${LABEL_BASE} mb-2`;
const HEADING = 'text-[17px] font-semibold tracking-[-0.2px] text-text m-0';
const COPY = 'text-xs text-(--ui-text-8998b0) m-0 mt-1.5';
const TABLE_WRAP =
  'border border-(--ui-border-2a3549) rounded-[11px] bg-(--ui-surface-121a27) overflow-auto min-h-0';
const TH =
  'text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]';
const TD =
  'p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]';
const INPUT =
  'w-65 max-w-full text-xs min-w-0 border border-border rounded-lg bg-(--ui-surface-101722) text-(--ui-text-edf2fa) px-2.75 py-2.5';
const BUTTON =
  'inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg border border-primary hover:bg-(--ui-surface-hover-cbbafa) disabled:opacity-40 disabled:cursor-not-allowed';
const CHIP =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap min-h-7 px-2.75 py-1 rounded-full border border-(--ui-border-344056) hover:not-disabled:border-(--ui-border-51607a) hover:not-disabled:text-(--ui-text-e5ecf7) text-[11px] font-medium text-(--ui-text-a4b2c9) bg-transparent cursor-pointer';

// Loads a price list now, then again every minute while the page is visible.
function usePrices<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`${API_BASE}/market/${path}`, { signal: controller.signal });
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            typeof body?.detail === 'string'
              ? body.detail
              : `Could not load prices (${response.status}).`,
          );
        }
        setItems(body as T[]);
        setError('');
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Could not load prices.');
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [path]);

  return { items, error };
}

const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
const tone = (value: number) => (value >= 0 ? 'positive text-mint' : 'negative text-coral');
const updatedAt = (items: { as_of: string }[] | null) => {
  if (!items?.length) return '';
  const newest = Math.max(...items.map((item) => new Date(item.as_of).getTime()));
  return Number.isFinite(newest) ? new Date(newest).toLocaleTimeString() : '';
};

function Status({ items, error }: { items: unknown[] | null; error: string }) {
  if (error && !items) {
    return (
      <p className="text-xs text-coral m-0 negative" role="alert">
        {error}
      </p>
    );
  }
  if (!items) {
    return (
      <div
        className="flex items-center gap-2 text-(--ui-text-91a3bd) text-[13px]"
        role="status"
      >
        <span className="stock-loading-spinner" aria-hidden="true" />
        Loading prices…
      </div>
    );
  }
  return null;
}

function CryptoTable({ coins }: { coins: CryptoQuote[] }) {
  return (
    <div className={TABLE_WRAP}>
      <table className="w-full border-collapse text-left text-xs whitespace-nowrap">
        <thead>
          <tr>
            <th className={TH}>Coin</th>
            <th className={TH}>Price (USD)</th>
            <th className={TH}>Change since previous close</th>
          </tr>
        </thead>
        <tbody>
          {coins.map((coin) => (
            <tr key={coin.symbol}>
              <td className={TD}>
                <strong>{coin.symbol}</strong>
                {coin.name && <small className="text-(--ui-text-8b9ab1)"> {coin.name}</small>}
              </td>
              <td className={TD}>
                {coin.price >= 1 ? dollars(coin.price) : `$${coin.price.toFixed(4)}`}
              </td>
              <td className={`${TD} ${tone(coin.change_percent)}`}>
                {signed(coin.change_percent)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MarketPrices() {
  const crypto = usePrices<CryptoQuote>('crypto');
  const currencies = usePrices<CurrencyQuote>('currencies');
  const [symbol, setSymbol] = useState('');
  const [found, setFound] = useState<CryptoQuote | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const lookup = useRef<AbortController | null>(null);

  async function lookUpCoin(raw: string) {
    const sym = raw.trim().toUpperCase();
    if (!sym) return;
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`${API_BASE}/market/crypto/${encodeURIComponent(sym)}`, {
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          typeof body?.detail === 'string'
            ? body.detail
            : `Could not look up ${sym} (${response.status}).`,
        );
      }
      setFound(body as CryptoQuote);
      setSymbol('');
    } catch (err) {
      if (controller.signal.aborted) return;
      setFound(null);
      setMessage(err instanceof Error ? err.message : `Could not look up ${sym}.`);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>
      <section className="flex flex-col gap-4 mb-6" aria-label="Crypto prices">
        <div>
          <div className={LABEL}>CRYPTO</div>
          <h3 className={HEADING}>Current crypto prices</h3>
          <p className={COPY}>
            Latest prices in US dollars, refreshed every minute.
            {updatedAt(crypto.items) && ` Updated ${updatedAt(crypto.items)}.`}
          </p>
        </div>
        <form
          className="flex gap-2 flex-wrap items-center"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void lookUpCoin(symbol);
          }}
        >
          <input
            className={INPUT}
            aria-label="Coin symbol"
            placeholder="Coin symbol (for example SOL)"
            value={symbol}
            maxLength={20}
            onChange={(event) => setSymbol(event.target.value)}
          />
          <button className={BUTTON} type="submit" disabled={busy || !symbol.trim()}>
            {busy ? 'Looking up…' : 'Look up coin'}
          </button>
        </form>
        {message && (
          <p className="text-xs text-coral m-0 negative" role="alert">
            {message}
          </p>
        )}
        {found && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className={LABEL_BASE}>LOOKUP RESULT</div>
              <button type="button" className={CHIP} onClick={() => setFound(null)}>
                Clear
              </button>
            </div>
            <CryptoTable coins={[found]} />
          </div>
        )}
        <Status items={crypto.items} error={crypto.error} />
        {crypto.items && <CryptoTable coins={crypto.items} />}
      </section>
      <section className="flex flex-col gap-4 mb-6" aria-label="Foreign currency prices">
        <div>
          <div className={LABEL}>CURRENCIES</div>
          <h3 className={HEADING}>Foreign currency prices</h3>
          <p className={COPY}>
            Exchange rates against the US dollar, refreshed every minute.
            {updatedAt(currencies.items) && ` Updated ${updatedAt(currencies.items)}.`}
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
                    <td className={TD}>${currency.usd_per_unit.toPrecision(4)}</td>
                    <td className={`${TD} ${tone(currency.change_percent)}`}>
                      {signed(currency.change_percent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
