import type { GraphData } from './finance';
import { money, totals } from './finance';

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
                    <span>Monthly Income</span>
                    <strong>{money(t.income)}</strong>
                    <small>Recurring take-home income</small>
                </div>

                <div className="metric-card">
                    <span>Monthly Commitments</span>
                    <strong>{money(t.expenses + t.payments)}</strong>
                    <small>Expenses and debt payments</small>
                </div>

                <div className="metric-card">
                    <span>Available Each Month</span>
                    <strong className={t.surplus < 0 ? 'negative' : 'positive'}>{money(t.surplus)}</strong>
                    <small>After expenses and debt payments</small>
                </div>
            </div>
        </div>
    );
}