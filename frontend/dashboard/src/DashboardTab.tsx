import type { GraphData } from './finance';
import { money, totals } from './finance';
import { lazy, Suspense } from 'react';
const OverviewComposition = lazy(() => import('./components/OverviewComposition'));

interface DashboardTabProps {
  graph: GraphData;
}

export function DashboardTab({ graph }: DashboardTabProps) {
  const t = totals(graph);

  return (
    <div className="dashboard-tab">
      <h2>Financial Overview</h2>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Net Worth</span>
          <strong className={t.netWorth < 0 ? 'negative' : ''}>{money(t.netWorth)}</strong>
          <small>Assets minus outstanding debt</small>
        </div>

        <div className="metric-card">
          <span>Take-home Income</span>
          <strong>{money(t.takeHome)}</strong>
          <small>After the selected tax estimate</small>
        </div>

        <div className="metric-card">
          <span>Monthly Commitments</span>
          <strong>{money(t.expenses + t.payments)}</strong>
          <small>Expenses and debt payments</small>
        </div>

        <div className="metric-card">
          <span>Available Each Month</span>
          <strong className={t.surplus < 0 ? 'negative' : 'positive'}>{money(t.surplus)}</strong>
          <small>After bills; before savings transfers</small>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="overview-chart-loading" role="status">
            Loading your financial picture…
          </div>
        }
      >
        <OverviewComposition graph={graph} />
      </Suspense>
    </div>
  );
}
