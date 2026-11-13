import type { GraphData, GraphNode } from '../common/finance';
import { dollars, debtPayment, expenseAmount, colors } from '../common/finance';
import type {
  getScenarioSalary,
  getScenarioDebts,
  getScenarioBudgetComparison,
} from './budgeting-bridge';

export interface BudgetSummaryCardsProps {
  currentNetWorth: number;
  currentTotals: { assets: number; debt: number; netWorth: number };
  totalIncome: number;
  totalExpense: number;
  netCashFlow: number;
  totalPortfolioValue: number;
  totalPurchasedValue: number;
  scenarioSalary: ReturnType<typeof getScenarioSalary>;
  scenarioDebts: ReturnType<typeof getScenarioDebts>;
  budgetComparison: ReturnType<typeof getScenarioBudgetComparison>;
  activeNodes: GraphNode[];
  graph: GraphData;
  onNavigateRecurring: () => void;
  onImportScenarioSalary: () => void;
  onImportScenarioDebts: () => void;
}

export function BudgetSummaryCards({
  currentNetWorth,
  currentTotals,
  totalIncome,
  totalExpense,
  netCashFlow,
  totalPortfolioValue,
  totalPurchasedValue,
  scenarioSalary,
  scenarioDebts,
  budgetComparison,
  activeNodes,
  graph,
  onNavigateRecurring,
  onImportScenarioSalary,
  onImportScenarioDebts,
}: BudgetSummaryCardsProps) {
  return (
    <>
      {/* Summary KPI Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Overall Net Worth
          </span>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: currentNetWorth < 0 ? 'var(--ui-paint-f87171)' : 'var(--ui-paint-4ade80)',
              marginTop: '4px',
            }}
          >
            {dollars(currentNetWorth)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Assets: <strong style={{ color: 'var(--color-text)' }}>{dollars(currentTotals.assets)}</strong> • Debt:{' '}
            <strong style={{ color: 'var(--color-text)' }}>{dollars(currentTotals.debt)}</strong>
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Total Income
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-4ade80)', marginTop: '4px' }}>
            {dollars(totalIncome)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Scenario Salary:{' '}
            <strong style={{ color: 'var(--color-text)' }}>{dollars(scenarioSalary.totalMonthly)}/mo</strong>
            {scenarioSalary.totalMonthly > 0 && (
              <span
                style={{
                  marginLeft: '6px',
                  color: totalIncome >= scenarioSalary.totalMonthly ? 'var(--color-mint)' : 'var(--ui-paint-fbbf24)',
                }}
              >
                {totalIncome >= scenarioSalary.totalMonthly
                  ? '✓ Target Met'
                  : `${dollars(scenarioSalary.totalMonthly - totalIncome)} remaining`}
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Total Expenses
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-f87171)', marginTop: '4px' }}>
            {dollars(totalExpense)}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Commitments:{' '}
            <strong style={{ color: 'var(--color-text)' }}>
              {dollars(budgetComparison.plannedTotalCommitments)}/mo
            </strong>
            {scenarioDebts.totalMonthlyPayment > 0 && (
              <span style={{ marginLeft: '4px', color: 'var(--color-coral)' }}>
                ({dollars(scenarioDebts.totalMonthlyPayment)} debt)
              </span>
            )}
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Net Cash Flow
          </span>
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 600,
              color: netCashFlow >= 0 ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
              marginTop: '4px',
            }}
          >
            {netCashFlow >= 0 ? `+${dollars(netCashFlow)}` : `-${dollars(Math.abs(netCashFlow))}`}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
            Scenario Surplus Target:{' '}
            <strong style={{ color: 'var(--color-text)' }}>{dollars(budgetComparison.plannedSurplus)}/mo</strong>
          </div>
        </div>

        <div
          style={{
            background: 'var(--ui-paint-161d2b)',
            border: '1px solid var(--ui-paint-283347)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <span style={{ fontSize: '12px', color: 'var(--ui-paint-8f9db3)', textTransform: 'uppercase' }}>
            Tracked holdings
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ui-paint-38bdf8)', marginTop: '4px' }}>
            {dollars(totalPortfolioValue)}
          </div>
          {totalPurchasedValue > 0 && (
            <div
              style={{
                fontSize: '12px',
                marginTop: '4px',
                color: totalPortfolioValue >= totalPurchasedValue ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
              }}
            >
              {totalPortfolioValue >= totalPurchasedValue ? '+' : ''}
              {dollars(totalPortfolioValue - totalPurchasedValue)} (
              {(((totalPortfolioValue - totalPurchasedValue) / totalPurchasedValue) * 100).toFixed(
                2,
              )}
              %)
            </div>
          )}
        </div>
      </div>

      {/* Scenario & Budget Alignment Card */}
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '1rem',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text)' }}>
              Scenario and budget
            </span>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'var(--color-float)',
                color: 'var(--color-blue)',
                border: '1px solid var(--color-blue)',
              }}
            >
              {scenarioSalary.nodes.length} Income • {scenarioDebts.nodes.length} Debt Accounts
            </span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '6px', lineHeight: 1.5 }}>
            Scenario Monthly Salary:{' '}
            <strong style={{ color: 'var(--color-mint)' }}>
              {dollars(scenarioSalary.totalMonthly)}/mo
            </strong>
            {' • '}Debt Commitments:{' '}
            <strong style={{ color: 'var(--color-coral)' }}>
              {dollars(scenarioDebts.totalMonthlyPayment)}/mo
            </strong>{' '}
            across {scenarioDebts.nodes.length} loans ({dollars(scenarioDebts.totalBalance)} total balance)
            {scenarioDebts.nodes.length > 0 && (
              <span style={{ color: 'var(--color-muted)', marginLeft: '6px' }}>
                ({scenarioDebts.nodes.map((n) => `${n.name}: ${dollars(n.monthlyPayment)}/mo`).join(', ')})
              </span>
            )}
          </div>

          {/* Active Nodes Display Chips */}
          {activeNodes.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
              <span style={{ fontSize: '11px', color: 'var(--color-subtle)', alignSelf: 'center', marginRight: '4px' }}>
                Linked plan:
              </span>
              {activeNodes.map((n) => {
                const isIncome = n.nodeType === 'INCOME';
                const isExpense = n.nodeType === 'EXPENSE';
                const isDebt = n.nodeType === 'DEBT';
                const amount = isExpense
                  ? expenseAmount(n, graph)
                  : isDebt
                    ? debtPayment(n, graph)
                    : n.amountOrBalance;

                return (
                  <button
                    type="button"
                    key={n.id}
                    onClick={onNavigateRecurring}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      background: 'var(--color-raised)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text)',
                      cursor: 'pointer',
                    }}
                    title="Open recurring transactions"
                  >
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        backgroundColor: colors[n.nodeType] || 'var(--color-muted)',
                      }}
                    />
                    <span>{n.name}</span>
                    <strong
                      style={{
                        color: isIncome
                          ? 'var(--color-mint)'
                          : isExpense || isDebt
                            ? 'var(--color-coral)'
                            : 'var(--color-blue)',
                      }}
                    >
                      {dollars(amount)}
                      /mo
                    </strong>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {scenarioSalary.nodes.length > 0 && (
            <button
              type="button"
              onClick={onImportScenarioSalary}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--color-mint)',
                background: 'rgba(34, 197, 94, 0.12)',
                color: 'var(--color-mint)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Import salary
            </button>
          )}
          {scenarioDebts.nodes.length > 0 && (
            <button
              type="button"
              onClick={onImportScenarioDebts}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                borderRadius: '6px',
                border: '1px solid var(--color-coral)',
                background: 'rgba(244, 63, 94, 0.12)',
                color: 'var(--color-coral)',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Import loan payments
            </button>
          )}
        </div>
      </div>
    </>
  );
}
