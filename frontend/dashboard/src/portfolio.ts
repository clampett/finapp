import { API_BASE } from './finance';
import { sessionHeaders } from './session';

export interface Holding {
  symbol: string;
  shares: number;
  stockId?: number;
  companyName?: string | null;
  lastPrice?: number;
}

export interface Stock {
  id?: number;
  userId?: number;
  ticker: string;
  companyName?: string | null;
  exchange?: string | null;
  paysDividend?: boolean;
  dividendFrequency?: string | null;
  dividendPerShare?: number | null;
  purchasePrice?: number;
  lastPrice: number;
  sharesOwned?: number;
}

export interface StockPosition {
  stockId: number;
  userId: number;
  ticker: string;
  companyName?: string | null;
  sharesOwned: number;
  costBasis: number;
  avgCostPerShare?: number | null;
  totalDividends?: number;
  totalSaleProceeds?: number;
  lastPrice: number;
  marketValue: number;
}

export const PORTFOLIO_UPDATED_EVENT = 'finapp-portfolio-updated';

export function notifyPortfolioUpdated() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PORTFOLIO_UPDATED_EVENT));
  }
}

export const DEFAULT_DEMO_HOLDINGS: Record<number, Holding[]> = {
  1: [
    { symbol: 'SPY', shares: 2, companyName: 'SPDR S&P 500 ETF Trust', lastPrice: 580 },
    { symbol: 'AAPL', shares: 3, companyName: 'Apple Inc.', lastPrice: 230 },
  ],
  2: [
    { symbol: 'VTI', shares: 150, companyName: 'Vanguard Total Stock Market ETF', lastPrice: 280 },
    { symbol: 'MSFT', shares: 40, companyName: 'Microsoft Corporation', lastPrice: 425 },
    { symbol: 'AAPL', shares: 50, companyName: 'Apple Inc.', lastPrice: 230 },
  ],
  3: [
    { symbol: 'VOO', shares: 200, companyName: 'Vanguard S&P 500 ETF', lastPrice: 530 },
    { symbol: 'QQQ', shares: 80, companyName: 'Invesco QQQ Trust', lastPrice: 490 },
    { symbol: 'NVDA', shares: 40, companyName: 'NVIDIA Corporation', lastPrice: 140 },
  ],
};

export function parseLocalHoldings(storageKey: string, maxHoldings = 25): Holding[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is Holding =>
          typeof item?.symbol === 'string' &&
          typeof item?.shares === 'number' &&
          Number.isFinite(item.shares) &&
          item.shares >= 0,
      )
      .slice(0, maxHoldings);
  } catch {
    return [];
  }
}

export function saveLocalHoldings(storageKey: string, holdings: Holding[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(holdings));
    const total = holdings.reduce((sum, h) => sum + (h.shares || 0) * (h.lastPrice || 0), 0);
    localStorage.setItem('finapp-portfolio-val:' + storageKey, String(total));
  } catch {
    /* Ignore private browsing quota errors */
  }
}

export function getStoredPortfolioValue(storageKey: string): number {
  try {
    const rawVal = localStorage.getItem('finapp-portfolio-val:' + storageKey);
    if (rawVal !== null && !isNaN(Number(rawVal))) {
      return Number(rawVal);
    }
    const holdings = parseLocalHoldings(storageKey);
    return holdings.reduce((sum, h) => sum + (h.shares || 0) * (h.lastPrice || 0), 0);
  } catch {
    return 0;
  }
}

export function saveStoredPortfolioValue(storageKey: string, value: number): boolean {
  try {
    const prev = getStoredPortfolioValue(storageKey);
    if (Math.abs(prev - value) > 0.001) {
      localStorage.setItem('finapp-portfolio-val:' + storageKey, String(value));
      return true;
    }
  } catch {
    /* Ignore private browsing quota errors */
  }
  return false;
}

export function holdingsToSynthetic(
  holdings: Holding[],
  userId = 1,
): { stocks: Stock[]; positions: StockPosition[] } {
  const stocks: Stock[] = holdings.map((h, idx) => ({
    id: h.stockId ?? idx + 1,
    userId,
    ticker: h.symbol,
    companyName: h.companyName ?? null,
    lastPrice: h.lastPrice ?? 100,
    sharesOwned: h.shares,
    purchasePrice: h.lastPrice ?? 100,
    paysDividend: false,
  }));

  const positions: StockPosition[] = holdings.map((h, idx) => {
    const price = h.lastPrice ?? 100;
    return {
      stockId: h.stockId ?? idx + 1,
      userId,
      ticker: h.symbol,
      companyName: h.companyName ?? null,
      sharesOwned: h.shares,
      costBasis: Number((h.shares * price).toFixed(2)),
      avgCostPerShare: price,
      lastPrice: price,
      marketValue: Number((h.shares * price).toFixed(2)),
    };
  });

  return { stocks, positions };
}

export async function loadUnifiedHoldings(
  storageKey: string,
  userId?: number,
  demo?: boolean,
  signal?: AbortSignal,
): Promise<{ holdings: Holding[]; stocks: Stock[]; positions: StockPosition[] }> {
  // 1. Signed-in users: Attempt backend fetch from PostgreSQL
  if (!demo && userId && userId > 0) {
    try {
      const headers = { ...sessionHeaders() };
      const [stocksRes, positionsRes] = await Promise.all([
        fetch(`${API_BASE}/stocks`, { headers, credentials: 'include', signal }),
        fetch(`${API_BASE}/positions`, { headers, credentials: 'include', signal }),
      ]);

      if (stocksRes.ok) {
        const stocksJson = await stocksRes.json();
        const positionsJson = positionsRes.ok ? await positionsRes.json() : { data: [] };
        const stocks: Stock[] = Array.isArray(stocksJson.data) ? stocksJson.data : [];
        const positions: StockPosition[] = Array.isArray(positionsJson.data)
          ? positionsJson.data
          : [];

        const holdings: Holding[] = stocks.map((s) => {
          const sym = s.ticker.toUpperCase();
          const match = positions.find(
            (p) => p.stockId === s.id || p.ticker?.toUpperCase() === sym,
          );
          const shares = match ? Number(match.sharesOwned || 0) : Number(s.sharesOwned || 0);
          return {
            symbol: sym,
            shares: Number.isFinite(shares) ? shares : 0,
            stockId: s.id,
            companyName: s.companyName,
            lastPrice: Number(match?.lastPrice ?? s.lastPrice ?? 0),
          };
        });

        saveLocalHoldings(storageKey, holdings);
        return { holdings, stocks, positions };
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') throw err;
      // Fallback to local storage on server error
    }
  }

  // 2. Demo mode or offline fallback: Load from localStorage or defaults
  const rawStorage = typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : null;
  let localHoldings: Holding[];
  if (rawStorage === null && demo) {
    localHoldings = DEFAULT_DEMO_HOLDINGS[userId || 2] || DEFAULT_DEMO_HOLDINGS[2];
    saveLocalHoldings(storageKey, localHoldings);
  } else {
    localHoldings = parseLocalHoldings(storageKey);
  }

  const { stocks, positions } = holdingsToSynthetic(localHoldings, userId || 1);
  return { holdings: localHoldings, stocks, positions };
}

export async function addStockUnified({
  storageKey,
  userId,
  demo,
  symbol,
  companyName,
  price,
  shares = 1,
}: {
  storageKey: string;
  userId?: number;
  demo?: boolean;
  symbol: string;
  companyName?: string | null;
  price: number;
  shares?: number;
}): Promise<Holding> {
  const sym = symbol.trim().toUpperCase();
  const current = parseLocalHoldings(storageKey);
  let newStockId: number | undefined;

  if (!demo && userId && userId > 0) {
    const res = await fetch(`${API_BASE}/stocks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        ticker: sym,
        companyName: companyName || sym,
        lastPrice: price,
        purchasePrice: price,
        sharesOwned: shares,
        paysDividend: false,
      }),
    });
    if (!res.ok) {
      let msg = `Server rejected stock creation (HTTP ${res.status})`;
      try {
        const json = await res.json();
        if (json?.message) msg = json.message;
      } catch {}
      throw new Error(msg);
    }
    const json = await res.json().catch(() => ({}));
    newStockId = json?.data?.id;
  }

  const updated: Holding[] = [
    ...current.filter((h) => h.symbol !== sym),
    {
      symbol: sym,
      shares,
      stockId: newStockId,
      companyName: companyName || sym,
      lastPrice: price,
    },
  ];
  saveLocalHoldings(storageKey, updated);
  notifyPortfolioUpdated();
  return updated[updated.length - 1];
}

export async function updateSharesUnified({
  storageKey,
  userId,
  demo,
  symbol,
  currentShares,
  newShares,
  price,
  stockId,
}: {
  storageKey: string;
  userId?: number;
  demo?: boolean;
  symbol: string;
  currentShares: number;
  newShares: number;
  price: number;
  stockId?: number;
}) {
  const sym = symbol.trim().toUpperCase();
  const delta = newShares - currentShares;

  if (!demo && userId && userId > 0 && stockId && delta !== 0) {
    const res = await fetch(`${API_BASE}/stock-transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
      credentials: 'include',
      body: JSON.stringify({
        userId,
        stockId,
        type: delta > 0 ? 'buy' : 'sell',
        quantity: Math.abs(delta),
        pricePerShare: price,
        transactionDate: new Date().toISOString().split('T')[0],
        notes: 'Position adjustment from portfolio',
      }),
    });
    if (!res.ok) {
      let msg = `Server rejected stock transaction (HTTP ${res.status})`;
      try {
        const json = await res.json();
        if (json?.message) msg = json.message;
      } catch {}
      throw new Error(msg);
    }
  }

  const current = parseLocalHoldings(storageKey);
  const updated = current.map((h) => (h.symbol === sym ? { ...h, shares: newShares } : h));
  saveLocalHoldings(storageKey, updated);
  notifyPortfolioUpdated();
}

export async function removeStockUnified({
  storageKey,
  userId,
  demo,
  symbol,
  stockId,
}: {
  storageKey: string;
  userId?: number;
  demo?: boolean;
  symbol: string;
  stockId?: number;
}) {
  const sym = symbol.trim().toUpperCase();

  if (!demo && userId && userId > 0 && stockId) {
    const res = await fetch(`${API_BASE}/stocks/${stockId}`, {
      method: 'DELETE',
      headers: sessionHeaders(),
      credentials: 'include',
    });
    if (!res.ok) {
      let msg = `Server rejected stock deletion (HTTP ${res.status})`;
      try {
        const json = await res.json();
        if (json?.message) msg = json.message;
      } catch {}
      throw new Error(msg);
    }
  }

  const current = parseLocalHoldings(storageKey);
  const updated = current.filter((h) => h.symbol !== sym);
  saveLocalHoldings(storageKey, updated);
  notifyPortfolioUpdated();
}

