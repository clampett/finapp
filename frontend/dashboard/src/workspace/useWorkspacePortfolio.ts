import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_DEMO_HOLDINGS,
  PORTFOLIO_UPDATED_EVENT,
  getStoredPortfolioValue,
  loadUnifiedHoldings,
  parseLocalHoldings,
  projectedDividendFlows,
} from '../investing/portfolio';
import type { Holding } from '../investing/portfolio';

export function useWorkspacePortfolio(userId: number, demo: boolean) {
  const holdingsKey = `finapp-holdings-v1:${demo ? 'demo' : 'user'}:${userId}`;
  const [portfolioValue, setPortfolioValue] = useState<number>(() =>
    getStoredPortfolioValue(holdingsKey),
  );

  const [dividendFlows, setDividendFlows] = useState<ReturnType<typeof projectedDividendFlows>>([]);
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    const local = parseLocalHoldings(holdingsKey);
    if (local.length > 0) return local;
    if (demo) return DEFAULT_DEMO_HOLDINGS[userId || 2] || DEFAULT_DEMO_HOLDINGS[2];
    return [];
  });

  // Derived portfolio value and projected dividends from the same holdings snapshot.
  const refreshPortfolio = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { holdings: freshHoldings } = await loadUnifiedHoldings(
          holdingsKey,
          userId,
          demo,
          signal,
        );
        if (signal?.aborted) return;
        const total = freshHoldings.reduce(
          (sum, h) => sum + (h.shares || 0) * (h.lastPrice || 0),
          0,
        );
        setPortfolioValue(total);
        setDividendFlows(projectedDividendFlows(freshHoldings));
        setHoldings(freshHoldings);
      } catch {
        /* Fall back to stored value */
        setPortfolioValue(getStoredPortfolioValue(holdingsKey));
        setHoldings(parseLocalHoldings(holdingsKey));
      }
    },
    [holdingsKey, userId, demo],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshPortfolio(controller.signal);

    const handlePortfolioChange = () => {
      setPortfolioValue(getStoredPortfolioValue(holdingsKey));
      setHoldings(parseLocalHoldings(holdingsKey));
      void refreshPortfolio();
    };
    window.addEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    return () => {
      controller.abort();
      window.removeEventListener(PORTFOLIO_UPDATED_EVENT, handlePortfolioChange);
    };
  }, [holdingsKey, refreshPortfolio]);
  return { portfolioValue, dividendFlows, holdings };
}
