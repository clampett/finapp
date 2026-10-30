import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
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
    <section className="my-6 p-[clamp(18px,3vw,30px)] border border-[color:var(--ui-border-2d4055)] rounded-[18px] bg-[radial-gradient(ellipse_at_top_left,var(--ui-surface-223b3a4a),transparent_65%),var(--ui-surface-111b29)]" aria-labelledby="composition-title">
      <header className="flex items-center justify-between gap-5 flex-wrap">
        <div>
          <div className="text-[9px] text-[color:var(--ui-text-a9b7ce)] tracking-[1.7px] font-semibold mb-2.5">YOUR MONEY AT A GLANCE</div>
          <h3 id="composition-title" className="mt-2 text-[23px] tracking-[-0.5px] font-semibold text-text m-0">Your financial picture</h3>
          <p className="mt-1.75 text-[color:var(--ui-text-91a6bf)] text-xs m-0">Explore your monthly plan, assets, and debts separately.</p>
        </div>
        <div className="flex p-1 gap-0.75 bg-[var(--ui-surface-0d1622)] border border-[color:var(--ui-border-2e4157)] rounded-[10px]" aria-label="Financial breakdown">
          {(['budget', 'assets', 'debt'] as const).map((value) => (
            <button
              key={value}
              className="p-[9px_13px] border-0 rounded-[7px] bg-transparent text-[color:var(--ui-text-94aac1)] text-xs cursor-pointer aria-pressed:bg-[var(--ui-surface-28433f)] aria-pressed:text-[color:var(--ui-text-a3e9d1)] hover:text-[color:var(--ui-text-edf2fa)] transition-colors"
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
      <div className="grid grid-cols-[minmax(240px,0.9fr)_minmax(270px,1.1fr)] items-center gap-7.5 py-6 max-md:grid-cols-1 max-md:gap-1.25">
        <div
          className="relative h-80 min-w-0 max-md:h-72.5"
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
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-57.5 h-57.5 border-24 border-[color:var(--ui-border-233247)] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          )}
          {/* Kept hover details inside the donut's reserved center, avoiding a
              second floating tooltip covering the same label and amount. */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] max-w-40 flex flex-col items-center justify-center gap-1.75 pointer-events-none text-center">
            <span className="text-xs text-[color:var(--ui-text-9db1c9)] min-h-8 flex items-center justify-center leading-4">{hovered?.label ?? labels[mode]}</span>
            <strong className="text-[clamp(26px,3vw,38px)] tracking-[-1px] font-semibold text-text">{money(hovered?.value ?? breakdown.total, true)}</strong>
            <small className="text-[10px] text-[color:var(--ui-text-69839e)]">
              {hovered ? `${((hovered.value / breakdown.total) * 100).toFixed(1)}% of ${mode === 'budget' ? 'budget' : mode === 'assets' ? 'assets' : 'debt'}` : mode === 'budget' ? 'per month' : 'current balance'}
            </small>
          </div>
        </div>
        <div className="min-w-0">
          <div className="max-h-68.75 overflow-y-auto">
            {breakdown.items.map((item, index) => (
              <div
                key={item.label + index}
                className={`grid grid-cols-[9px_minmax(90px,1fr)_auto_44px] items-center gap-3 p-[11px_9px] rounded-lg text-xs cursor-pointer hover:bg-[var(--ui-surface-hover-1a2838)] transition-colors ${active === index ? 'highlighted bg-[var(--ui-surface-263b4d)]' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                tabIndex={0}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
              >
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: item.color }} />
                <span className="text-[color:var(--ui-text-acbfd5)]">{item.label}</span>
                <strong className="font-semibold tabular-nums text-text">{dollars(item.value)}</strong>
                <small className="text-[color:var(--ui-text-7993ae)] text-right text-[11px]">{((item.value / breakdown.total) * 100).toFixed(1)}%</small>
              </div>
            ))}
            {!breakdown.items.length && (
              <p className="text-[11px] leading-[1.8] text-[color:var(--ui-text-839bb6)]">
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
          <div className="flex justify-between gap-3.75 mt-3 p-[16px_9px] border-t border-[color:var(--ui-border-304359)] text-[13px]">
            <span>{labels[mode]}</span>
            <strong className="font-semibold text-text">{dollars(breakdown.total)}</strong>
          </div>
          <p className="text-[11px] leading-[1.8] text-[color:var(--ui-text-839bb6)] m-0 mt-3">
            {mode === 'budget'
              ? 'Taxes, bills, required loan payments, scheduled transfers, and unassigned cash reconcile your starting monthly plan. Saving transfers are allocations, not living expenses. Extra investing chosen inside a simulation is not included here.'
              : mode === 'assets'
                ? 'Checking, savings, and investment balances are shown here. Debts are shown separately; net worth subtracts debt from these assets.'
                : 'Each slice is a loan’s remaining principal, not its monthly payment. Monthly payments are shown under Monthly budget.'}
          </p>
          {breakdown.shortfall > 0 && (
            <p className="mt-3 p-3 bg-[var(--ui-surface-402832)] text-[color:var(--ui-text-f2b1be)] rounded-lg text-xs leading-[1.7]">
              Monthly shortfall: <strong className="font-semibold">{dollars(breakdown.shortfall)}</strong>. Commitments exceed
              take-home pay. The chart shows allocations; it does not create income to cover the
              gap.
            </p>
          )}
        </div>
      </div>
      <footer className="border-t border-[color:var(--ui-border-293b50)] pt-4.5 flex justify-between flex-wrap gap-3 text-[11px] text-[color:var(--ui-text-7e98b2)]">
        <span>
          Net worth{' '}
          <strong className={`ml-2.5 text-sm font-semibold ${t.netWorth < 0 ? 'negative text-coral' : 'positive text-mint'}`}>
            {dollars(t.netWorth)}
          </strong>
        </span>
        <span>Active nodes only · Updates with your scenario</span>
      </footer>
    </section>
  );
}
