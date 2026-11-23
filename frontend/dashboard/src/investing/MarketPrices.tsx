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
      (item): item is string => typeof item
