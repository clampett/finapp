import { useEffect, useState } from 'react';
import {
  PORTFOLIO_UPDATED_EVENT,
  getStoredPortfolioValue,
  loadUnifiedHoldings,
  parseLocalHoldings,
  projectedDividendFlows,
} from '../investing/portfolio';

// Restored holdings, valuation, and dividend estimates from the same scoped browser cache.
function storedSnapshot(key: string) {
  const holdings = parseLocalHoldings(key);
  const storedValue = getStoredPortfolioValue(key);
  // Restored cached values without inventing demo holdings after an intentional empty portfolio.
  return {
    key,
    holdings,
    portfolioValue: Number.isFinite(storedValue) && storedValue > 0 ? storedValue : 0,
    dividendFlows: projectedDividendFlows(holdings),
  };
}

// Synchronized portfolio state while isolating demo profiles and authenticated accounts.
export function useWorkspacePortfolio(userId: number, demo: boolean) {
  // Partitioned cached holdings by account identity and demo status.
  const holdingsKey = `finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`;
  const [snapshot, setSnapshot] = useState(() => storedSnapshot(holdingsKey));

  useEffect(() => {
    let disposed = false;
    let activeRequest: AbortController | undefined;
    const refresh = async () => {
      // Cancelled superseded loads so a slower response could not restore outdated positions.
      activeRequest?.abort();
      const controller = new AbortController();
      activeRequest = controller;
      try {
        const { holdings } = await loadUnifiedHoldings(
          holdingsKey,
          userId,
          demo,
          controller.signal,
        );
        if (disposed || controller.signal.aborted) return;
        // Valued positions from shares and latest prices while excluding invalid or negative totals.
        const portfolioValue = holdings.reduce((sum, holding) => {
          const value = holding.shares * (holding.lastPrice ?? 0);
          return sum + (holding.shares > 0 && Number.isFinite(value) && value > 0 ? value : 0);
        }, 0);
        // Published balances, holding slices, and dividends from one coherent snapshot.
        setSnapshot({
          key: holdingsKey,
          portfolioValue,
          holdings,
          dividendFlows: projectedDividendFlows(holdings),
        });
      } catch {
        if (disposed || controller.signal.aborted) return;
        setSnapshot(storedSnapshot(holdingsKey));
      }
    };
    // Applied cached edits immediately before refreshing server-backed holdings in the background.
    const handlePortfolioChange = () => {
      setSnapshot(storedSnapshot(holdingsKey));
      void refresh();
    };
    void refresh();
    // Subscribed to portfolio edits made by the Budgeting and Investments tabs.
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    return () => {
      // Prevented late completions from updating an unmounted or different user's workspace.
      disposed = true;
      activeRequest?.abort();
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    };
  }, [holdingsKey, userId, demo]);

  // Scoped the visible snapshot immediately, before a new profile's effect was run.
  return snapshot.key === holdingsKey ? snapshot : storedSnapshot(holdingsKey);
}
