import { API_BASE } from '../common/finance';
import { sessionHeaders } from '../common/session';

export interface Holding {
  symbol: string;
  shares: number;
  stockId?: number;
  companyName?: string | null;
  lastPrice?: number;
  purchasePrice?: number;
  paysDividend?: boolean;
  dividendFrequency?: string | null;
  dividendPerShare?: number | null;
}

// Derived forecast income from current lots, so trades never left a saved schedule stale.
export function projectedDividendFlows(holdings: Holding[]) {
  return holdings.flatMap((holding) => {
    const amount = holding.shares * Number(holding.dividendPerShare);
    const cadence = holding.dividendFrequency;
    if (!holding.paysDividend || !Number.isFinite(amount) || amount <= 0) return [];
    // Excluded irregular distributions because no reliable cadence was available.
    if (
      cadence !== 'monthly' &&
      cadence !== 'quarterly' &&
      cadence !== 'semiannual' &&
      cadence !== 'annual'
    )
      return [];
    return [{ kind: 'income', amount, frequency: cadence, interval_count: 1 }];
  });
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
    {
      symbol: 'SPY',
      shares: 2,
      companyName: 'SPDR S&P 500 ETF Trust',
      lastPrice: 580,
      purchasePrice: 580,
      stockId: 1,
    },
    {
      symbol: 'AAPL',
      shares: 3,
      companyName: 'Apple Inc.',
      lastPrice: 230,
      purchasePrice: 230,
      stockId: 2,
    },
  ],
  2: [
    {
      symbol: 'VTI',
      shares: 150,
      companyName: 'Vanguard Total Stock Market ETF',
      lastPrice: 280,
      purchasePrice: 280,
      stockId: 1,
    },
    {
      symbol: 'MSFT',
      shares: 40,
      companyName: 'Microsoft Corporation',
      lastPrice: 425,
      purchasePrice: 425,
      stockId: 2,
    },
    {
      symbol: 'AAPL',
      shares: 50,
      companyName: 'Apple Inc.',
      lastPrice: 230,
      purchasePrice: 230,
      stockId: 3,
    },
  ],
  3: [
    {
      symbol: 'VOO',
      shares: 200,
      companyName: 'Vanguard S&P 500 ETF',
      lastPrice: 530,
      purchasePrice: 530,
      stockId: 1,
    },
    {
      symbol: 'QQQ',
      shares: 80,
      companyName: 'Invesco QQQ Trust',
      lastPrice: 490,
      purchasePrice: 490,
      stockId: 2,
    },
    {
      symbol: 'NVDA',
      shares: 40,
      companyName: 'NVIDIA Corporation',
      lastPrice: 140,
      purchasePrice: 140,
      stockId: 3,
    },
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
    lastPrice: h.lastPrice ?? 0,
    sharesOwned: h.shares,
    purchasePrice: h.purchasePrice ?? h.lastPrice ?? 0,
    paysDividend: Boolean(h.paysDividend),
    dividendFrequency: h.dividendFrequency ?? null,
    dividendPerShare: h.dividendPerShare ?? null,
  }));

  const positions: StockPosition[] = holdings.map((h, idx) => {
    const price = h.lastPrice ?? 0;
    const purchased = h.purchasePrice ?? price;
    return {
      stockId: h.stockId ?? idx + 1,
      userId,
      ticker: h.symbol,
      companyName: h.companyName ?? null,
      sharesOwned: h.shares,
      costBasis: Number((h.shares * purchased).toFixed(2)),
      avgCostPerShare: purchased,
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

        const holdings: Holding[] = stocks.map((s, idx) => {
          const sym = s.ticker.toUpperCase();
          const match =
            positions.find((p) => p.stockId === s.id) ||
            (s.id == null ? positions.find((p) => p.ticker?.toUpperCase() === sym) : undefined);
          const shares = match ? Number(match.sharesOwned || 0) : Number(s.sharesOwned || 0);
          const purchasePrice =
            match?.avgCostPerShare != null && Number(match.avgCostPerShare) > 0
              ? Number(match.avgCostPerShare)
              : Number(s.purchasePrice ?? s.lastPrice ?? 0);
          return {
            symbol: sym,
            shares: Number.isFinite(shares) ? shares : 0,
            stockId: s.id ?? idx + 1,
            companyName: s.companyName,
            lastPrice: Number(match?.lastPrice ?? s.lastPrice ?? 0),
            purchasePrice,
            paysDividend: Boolean(s.paysDividend),
            dividendFrequency: s.dividendFrequency ?? null,
            dividendPerShare: s.dividendPerShare ?? null,
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
    if (demo) {
      // Filled missing demo quotes from matching samples while retaining saved prices.
      const seeded = DEFAULT_DEMO_HOLDINGS[userId || 2] ?? DEFAULT_DEMO_HOLDINGS[2];
      localHoldings = localHoldings.map((holding) => ({
        ...holding,
        lastPrice:
          holding.lastPrice ?? seeded.find((sample) => sample.symbol === holding.symbol)?.lastPrice,
      }));
    }
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
  purchasePrice,
  shares = 1,
  paysDividend = false,
  dividendFrequency = null,
  dividendPerShare = null,
  stockId,
}: {
  storageKey: string;
  userId?: number;
  demo?: boolean;
  symbol: string;
  companyName?: string | null;
  price: number;
  purchasePrice?: number;
  shares?: number;
  paysDividend?: boolean;
  dividendFrequency?: string | null;
  dividendPerShare?: number | null;
  stockId?: number;
}): Promise<Holding> {
  const sym = symbol.trim().toUpperCase();
  const current = parseLocalHoldings(storageKey);
  let newStockId: number | undefined = stockId;
  const finalPurchasePrice = purchasePrice ?? price;

  if (!demo && userId && userId > 0) {
    if (stockId) {
      const res = await fetch(`${API_BASE}/stocks/${stockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          ticker: sym,
          companyName: companyName || sym,
          lastPrice: price,
          paysDividend,
          dividendFrequency: paysDividend ? dividendFrequency : null,
          dividendPerShare: paysDividend ? dividendPerShare : null,
        }),
      });
      if (!res.ok) {
        let msg = `Server rejected stock update (HTTP ${res.status})`;
        try {
          const json = await res.json();
          if (json?.message) msg = json.message;
        } catch {}
        throw new Error(msg);
      }
    } else {
      const res = await fetch(`${API_BASE}/stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        credentials: 'include',
        body: JSON.stringify({
          userId,
          ticker: sym,
          companyName: companyName || sym,
          lastPrice: price,
          purchasePrice: finalPurchasePrice,
          sharesOwned: shares,
          paysDividend,
          dividendFrequency: paysDividend ? dividendFrequency : null,
          dividendPerShare: paysDividend ? dividendPerShare : null,
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
  }

  let updated: Holding[];
  if (stockId) {
    const hasExplicitId = current.some((h) => h.stockId === stockId);
    updated = current.map((h, idx) =>
      (hasExplicitId ? h.stockId === stockId : (h.stockId ?? idx + 1) === stockId)
        ? {
            ...h,
            symbol: sym,
            shares,
            stockId: h.stockId ?? stockId,
            companyName: companyName || sym,
            lastPrice: price,
            purchasePrice: finalPurchasePrice,
            paysDividend,
            dividendFrequency: paysDividend ? dividendFrequency : null,
            dividendPerShare: paysDividend ? dividendPerShare : null,
          }
        : h,
    );
  } else {
    if (!newStockId) {
      newStockId = Math.max(0, ...current.map((h) => h.stockId || 0)) + 1;
    }
    const newHolding: Holding = {
      symbol: sym,
      shares,
      stockId: newStockId,
      companyName: companyName || sym,
      lastPrice: price,
      purchasePrice: finalPurchasePrice,
      paysDividend,
      dividendFrequency: paysDividend ? dividendFrequency : null,
      dividendPerShare: paysDividend ? dividendPerShare : null,
    };
    updated = [...current, newHolding];
  }

  saveLocalHoldings(storageKey, updated);
  notifyPortfolioUpdated();
  return updated.find((h) => h.stockId === newStockId) || updated[updated.length - 1];
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
  const updated = current.map((h) =>
    (stockId !== undefined ? h.stockId === stockId : h.symbol === sym)
      ? { ...h, shares: newShares }
      : h,
  );
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
  const updated =
    stockId !== undefined
      ? current.filter((h) => h.stockId !== stockId)
      : current.filter((h) => h.symbol !== sym);
  saveLocalHoldings(storageKey, updated);
  notifyPortfolioUpdated();
}
