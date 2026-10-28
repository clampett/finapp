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
    <div>
      <h2 className="text-lg font-semibold tracking-[-0.35px] text-text m-0 mb-4">Financial Overview</h2>

      <div className="grid grid-cols-4 gap-3.5 mb-7 max-[760px]:grid-cols-2 max-[760px]:gap-2.5 max-[760px]:mb-[23px]">
        <div className="p-[18px_19px] bg-surface border border-[#283145] rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-[#9cacbf]">Net Worth</span>
          <strong className={`text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold ${t.netWorth < 0 ? 'negative text-coral' : 'text-text'}`}>{money(t.netWorth)}</strong>
          <small className="text-[10px] text-[#73839a]">Assets minus outstanding debt</small>
        </div>

        <div className="p-[18px_19px] bg-surface border border-[#283145] rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-[#9cacbf]">Take-home Income</span>
          <strong className="text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold text-text">{money(t.takeHome)}</strong>
          <small className="text-[10px] text-[#73839a]">After the selected tax estimate</small>
        </div>

        <div className="p-[18px_19px] bg-surface border border-[#283145] rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-[#9cacbf]">Monthly Commitments</span>
          <strong className="text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold text-text">{money(t.expenses + t.payments)}</strong>
          <small className="text-[10px] text-[#73839a]">Expenses and debt payments</small>
        </div>

        <div className="p-[18px_19px] bg-surface border border-[#283145] rounded-[11px] flex flex-col gap-2.5 max-[760px]:p-3.5">
          <span className="text-[11px] text-[#9cacbf]">Available Each Month</span>
          <strong className={`text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold ${t.surplus < 0 ? 'negative text-coral' : 'positive text-mint'}`}>{money(t.surplus)}</strong>
          <small className="text-[10px] text-[#73839a]">After bills; before savings transfers</small>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="min-h-[460px] grid place-items-center my-6 border border-[#2d4055] rounded-[18px] text-[#8ca8bf] bg-[#111b29]" role="status">
            Loading your financial picture…
          </div>
        }
      >
        <OverviewComposition graph={graph} />
      </Suspense>
    </div>
  );
}
