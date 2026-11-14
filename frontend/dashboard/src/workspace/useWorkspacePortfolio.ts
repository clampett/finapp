import { useCallback, useEffect, useState } from 'react';
import {
  PORTFOLIO_UPDATED_EVENT,
  getStoredPortfolioValue,
  loadUnifiedHoldings,
  projectedDividendFlows,
} from '../investing/portfolio';

export function useWorkspacePortfolio(userId: number, demo: boolean) {
  const holdingsKey = `finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`;
  const [portfolioValue, setPortfolioValue] = useState<number>(() =>
    getStoredPortfolioValue(holdingsKey),
  );

  const [dividendFlows, setDividendFlows] = useState<ReturnType<typeof projectedDividendFlows>>([]);

  // Derived portfolio value and projected dividends from the same holdings snapshot.
  const refreshPortfolio = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { holdings } = await loadUnifiedHoldings(holdingsKey, userId, demo, signal);
        if (signal?.aborted) return;
        const total = holdings.reduce((sum, h) => sum + (h.shares || 0) * (h.lastPrice || 0), 0);
        setPortfolioValue(total);
        setDividendFlows(projectedDividendFlows(holdings));
      } catch {
        /* Fall back to stored value */
        setPortfolioValue(getStoredPortfolioValue(holdingsKey));
      }
    },
    [holdingsKey, userId, demo],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshPortfolio(controller.signal);

    const handlePortfolioChange = () => {
      setPortfolioValue(getStoredPortfolioValue(holdingsKey));
      void refreshPortfolio();
    };
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    return () => {
      controller.abort();
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    };
  }, [holdingsKey, refreshPortfolio]);
  return { portfolioValue, dividendFlows };
}
