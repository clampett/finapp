import { useEffect, useState } from 'react';
import { API_BASE, dollars } from '../finance';

interface CryptoQuote {
  symbol: string;
  name: string;
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

const LABEL = 'text-[9px] text-(--ui-text-a9b7ce) tracking-[1.7px] font-semibold mb-2';
const HEADING = 'text-[17px] font-semibold tracking-[-0.2px] text-text m-0';
const COPY = 'text-xs text-(--ui-text-8998b0) m-0 mt-1.5';
const TABLE_WRAP =
  'border border-(--ui-border-2a3549) rounded-[11px] bg-(--ui-surface-121a27) overflow-auto min-h-0';
const TH =
  'text-(--ui-text-8192ad) text-[10px] font-medium p-[16px_20px] bg-(--ui-surface-161f2e) max-[760px]:p-[11px_14px]';
const TD =
  'p-[13px_20px] border-t border-(--ui-border-263147) text-text max-[760px]:p-[11px_14px]';

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

export function MarketPrices() {
  const crypto = usePrices<CryptoQuote>('crypto');
  const currencies = usePrices<CurrencyQuote>('currencies');

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
        <Status items={crypto.items} error={crypto.error} />
        {crypto.items && (
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
                {crypto.items.map((coin) => (
                  <tr key={coin.symbol}>
                    <td className={TD}>
                      <strong>{coin.symbol}</strong>
                      <small className="text-(--ui-text-8b9ab1)"> {coin.name}</small>
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
        )}
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
