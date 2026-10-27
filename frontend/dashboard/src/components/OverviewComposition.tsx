import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { dollars, money, overviewBreakdown, totals } from '../finance';
import type { GraphData, OverviewMode } from '../finance';
export default function OverviewComposition({ graph }: { graph: GraphData }) {
  const t = totals(graph);
  const [mode, setMode] = useState<OverviewMode>('budget');
  const [active, setActive] = useState<number | null>(null);
  const breakdown = overviewBreakdown(graph, mode);
  const hovered = active === null ? null : breakdown.items[active];
  const labels = { budget: 'Monthly allocation', assets: 'Total assets', debt: 'Outstanding debt' };
  return (
    <section className="overview-composition" aria-labelledby="composition-title">
      <header className="composition-heading">
        <div>
          <div className="eyebrow">YOUR MONEY AT A GLANCE</div>
          <h3 id="composition-title">Your financial picture</h3>
          <p>Explore your monthly plan, assets, and debts separately.</p>
        </div>
        <div className="composition-tabs" aria-label="Financial breakdown">
          {(['budget', 'assets', 'debt'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={mode === value}
              onClick={() => {
                setMode(value);
                setActive(null);
              }}
            >
              {value === 'budget' ? 'Monthly budget' : value === 'assets' ? 'Assets' : 'Debts'}
            </button>
          ))}
        </div>
      </header>
      <div className="composition-content">
        <div
          className="composition-visual"
          role="img"
          aria-label={`${labels[mode]}: ${dollars(breakdown.total)}. ${breakdown.items.map((item) => `${item.label}: ${dollars(item.value)}`).join('. ')}`}
        >
          {breakdown.total > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown.items}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="68%"
                  outerRadius="88%"
                  paddingAngle={breakdown.items.length > 1 ? 3 : 0}
                  cornerRadius={4}
                  stroke="none"
                  isAnimationActive={false}
                  onMouseEnter={(_entry, index) => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                >
                  {breakdown.items.map((item, index) => (
                    <Cell
                      key={item.label + index}
                      fill={item.color}
                      fillOpacity={active === null || active === index ? 1 : 0.35}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active: visible, payload }) => {
                    if (!visible || !payload?.length) return null;
                    const item = payload[0].payload as { label: string; value: number };
                    return (
                      <div className="chart-tooltip">
                        <strong>{item.label}</strong>
                        <p>
                          {dollars(item.value)} ·{' '}
                          {((item.value / breakdown.total) * 100).toFixed(1)}%
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="composition-empty-ring" />
          )}
          <div className="composition-center">
            <span>{hovered?.label ?? labels[mode]}</span>
            <strong>{money(hovered?.value ?? breakdown.total, true)}</strong>
            <small>{mode === 'budget' ? 'per month' : 'current balance'}</small>
          </div>
        </div>
        <div className="composition-details">
          <div className="composition-legend">
            {breakdown.items.map((item, index) => (
              <div
                key={item.label + index}
                className={active === index ? 'highlighted' : ''}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                <i style={{ background: item.color }} />
                <span>{item.label}</span>
                <strong>{dollars(item.value)}</strong>
                <small>{((item.value / breakdown.total) * 100).toFixed(1)}%</small>
              </div>
            ))}
            {!breakdown.items.length && (
              <p>
                No{' '}
                {mode === 'debt'
                  ? 'debt balances'
                  : mode === 'assets'
                    ? 'asset balances'
                    : 'monthly amounts'}{' '}
                to display. Add or edit your nodes to build this view.
              </p>
            )}
          </div>
          <div className="composition-total">
            <span>{labels[mode]}</span>
            <strong>{dollars(breakdown.total)}</strong>
          </div>
          <p className="composition-explanation">
            {mode === 'budget'
              ? 'Taxes, bills, required loan payments, scheduled transfers, and unassigned cash reconcile your starting monthly plan. Saving transfers are allocations, not living expenses. Extra investing chosen inside a simulation is not included here.'
              : mode === 'assets'
                ? 'Checking, savings, and investment balances are shown here. Debts are shown separately; net worth subtracts debt from these assets.'
                : 'Each slice is a loan’s remaining principal, not its monthly payment. Monthly payments are shown under Monthly budget.'}
          </p>
          {breakdown.shortfall > 0 && (
            <p className="composition-shortfall">
              Monthly shortfall: <strong>{dollars(breakdown.shortfall)}</strong>. Commitments exceed
              take-home pay. The chart shows allocations; it does not create income to cover the
              gap.
            </p>
          )}
        </div>
      </div>
      <footer className="composition-footer">
        <span>
          Net worth{' '}
          <strong className={t.netWorth < 0 ? 'negative' : 'positive'}>
            {dollars(t.netWorth)}
          </strong>
        </span>
        <span>Active nodes only · Updates with your scenario</span>
      </footer>
    </section>
  );
}
