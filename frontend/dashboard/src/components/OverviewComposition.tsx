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
    <section className="my-6 p-[clamp(18px,3vw,30px)] border border-[#2d4055] rounded-[18px] bg-[radial-gradient(ellipse_at_top_left,#223b3a4a,transparent_65%),#111b29]" aria-labelledby="composition-title">
      <header className="flex items-center justify-between gap-5 flex-wrap">
        <div>
          <div className="text-[9px] text-[#a9b7ce] tracking-[1.7px] font-semibold mb-2.5">YOUR MONEY AT A GLANCE</div>
          <h3 id="composition-title" className="mt-2 text-[23px] tracking-[-0.5px] font-semibold text-text m-0">Your financial picture</h3>
          <p className="mt-[7px] text-[#91a6bf] text-xs m-0">Explore your monthly plan, assets, and debts separately.</p>
        </div>
        <div className="flex p-1 gap-[3px] bg-[#0d1622] border border-[#2e4157] rounded-[10px]" aria-label="Financial breakdown">
          {(['budget', 'assets', 'debt'] as const).map((value) => (
            <button
              key={value}
              className="p-[9px_13px] border-0 rounded-[7px] bg-transparent text-[#94aac1] text-xs cursor-pointer aria-pressed:bg-[#28433f] aria-pressed:text-[#a3e9d1] hover:text-[#edf2fa] transition-colors"
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
      <div className="grid grid-cols-[minmax(240px,0.9fr)_minmax(270px,1.1fr)] items-center gap-[30px] py-6 max-md:grid-cols-1 max-md:gap-[5px]">
        <div
          className="relative h-[320px] min-w-0 max-md:h-[290px]"
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
                      <div className="p-[13px_15px] bg-[#1c2638] border border-[#47536d] rounded-[9px] shadow-[0_10px_30px_#0005] min-w-[200px] text-[11px]">
                        <strong className="block text-[11px] text-[#d9e3f3] mb-3">{item.label}</strong>
                        <p className="m-0 text-text">
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
            <div className="w-[230px] h-[230px] border-[24px] border-[#233247] rounded-full absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          )}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[7px] pointer-events-none">
            <span className="text-xs text-[#9db1c9] max-w-[140px] text-center">{hovered?.label ?? labels[mode]}</span>
            <strong className="text-[clamp(26px,3vw,38px)] tracking-[-1px] font-semibold text-text">{money(hovered?.value ?? breakdown.total, true)}</strong>
            <small className="text-[10px] text-[#69839e]">{mode === 'budget' ? 'per month' : 'current balance'}</small>
          </div>
        </div>
        <div className="min-w-0">
          <div className="max-h-[275px] overflow-y-auto">
            {breakdown.items.map((item, index) => (
              <div
                key={item.label + index}
                className={`grid grid-cols-[9px_minmax(90px,1fr)_auto_44px] items-center gap-3 p-[11px_9px] rounded-lg text-xs cursor-pointer hover:bg-[#1a2838] transition-colors ${active === index ? 'highlighted bg-[#263b4d]' : ''}`}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
              >
                <i className="w-2 h-2 rounded-full inline-block" style={{ background: item.color }} />
                <span className="text-[#acbfd5]">{item.label}</span>
                <strong className="font-semibold tabular-nums text-text">{dollars(item.value)}</strong>
                <small className="text-[#7993ae] text-right text-[11px]">{((item.value / breakdown.total) * 100).toFixed(1)}%</small>
              </div>
            ))}
            {!breakdown.items.length && (
              <p className="text-[11px] leading-[1.8] text-[#839bb6]">
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
          <div className="flex justify-between gap-[15px] mt-3 p-[16px_9px] border-t border-[#304359] text-[13px]">
            <span>{labels[mode]}</span>
            <strong className="font-semibold text-text">{dollars(breakdown.total)}</strong>
          </div>
          <p className="text-[11px] leading-[1.8] text-[#839bb6] m-0 mt-3">
            {mode === 'budget'
              ? 'Taxes, bills, required loan payments, scheduled transfers, and unassigned cash reconcile your starting monthly plan. Saving transfers are allocations, not living expenses. Extra investing chosen inside a simulation is not included here.'
              : mode === 'assets'
                ? 'Checking, savings, and investment balances are shown here. Debts are shown separately; net worth subtracts debt from these assets.'
                : 'Each slice is a loan’s remaining principal, not its monthly payment. Monthly payments are shown under Monthly budget.'}
          </p>
          {breakdown.shortfall > 0 && (
            <p className="mt-3 p-3 bg-[#402832] text-[#f2b1be] rounded-lg text-xs leading-[1.7]">
              Monthly shortfall: <strong className="font-semibold">{dollars(breakdown.shortfall)}</strong>. Commitments exceed
              take-home pay. The chart shows allocations; it does not create income to cover the
              gap.
            </p>
          )}
        </div>
      </div>
      <footer className="border-t border-[#293b50] pt-[18px] flex justify-between flex-wrap gap-3 text-[11px] text-[#7e98b2]">
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
