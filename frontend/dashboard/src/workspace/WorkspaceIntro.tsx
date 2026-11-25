import { money, totals } from '../common/finance';
import type { GraphData, View } from '../common/finance';

export function WorkspaceIntro({
  view,
  live,
  t,
  demo,
  storageStatus,
}: {
  view: View;
  live: GraphData;
  t: ReturnType<typeof totals>;
  demo: boolean;
  storageStatus: string;
}) {
  // Kept tab descriptions and cash-flow summary cards together.
  return (
    <>
      <div className={'workspace-tab-intro workspace-tab-' + view}>
        <div>
          <h2 className="text-[clamp(18px,2vw,24px)] font-semibold tracking-[-0.5px] text-text m-0">
            {view === 'graph'
              ? 'Node Graph'
              : view === 'overview'
                ? 'Your financial snapshot'
                : view === 'cashflow'
                  ? 'Monthly cash flow'
                  : view === 'budgeting'
                    ? 'Budgeting & transactions'
                    : view === 'investing'
                      ? 'Savings & investments'
                      : view === 'ai'
                        ? 'AI Scenario Coach'
                        : demo
                          ? 'Demo settings'
                          : 'Account settings'}
          </h2>
          <p className="text-sm text-muted mt-2 mb-0 leading-relaxed">
            {view === 'graph'
              ? live.nodes.length +
                ' nodes · ' +
                live.edges.length +
                ' connections · ' +
                (storageStatus || 'Scenario edits stay in this browser')
              : view === 'overview'
                ? 'See your balances, monthly plan, and progress toward your goals.'
                : view === 'cashflow'
                  ? 'Review monthly inflows and commitments. Toggle individual flows to explore what changes.'
                  : view === 'budgeting'
                    ? 'Record what happened and manage the schedules that repeat.'
                    : view === 'investing'
                      ? 'Track stock holdings and review the savings and investments in your scenario.'
                      : view === 'ai'
                        ? 'Stress-test a scenario and ask questions about your results.'
                        : demo
                          ? 'Personalize this demo’s display name and appearance.'
                          : 'Manage your profile, appearance, balances, and simulation defaults.'}
          </p>
        </div>
      </div>
      {!demo && view === 'settings' && storageStatus && (
        <p role="status" className="mb-4 text-sm text-muted">
          {storageStatus}
        </p>
      )}
      {view === 'cashflow' && (
        <div className="grid grid-cols-4 max-[1100px]:grid-cols-2 max-[600px]:grid-cols-1 gap-3.5 mb-7">
          {[
            ['Gross income', money(t.income), 'Monthly income before estimated tax', 'text-text'],
            ['Take-home income', money(t.takeHome), 'After the selected tax estimate', 'text-text'],
            [
              'Monthly commitments',
              money(t.expenses + t.payments),
              `${money(t.payments)} in debt payments`,
              'text-text',
            ],
            [
              'Available each month',
              money(t.surplus),
              t.surplus < 0
                ? 'Bills exceed take-home pay'
                : 'After bills; before savings transfers',
              t.surplus < 0 ? 'negative text-coral' : 'positive text-mint',
            ],
          ].map(([label, value, hint, tone]) => (
            <div
              className="rounded-xl p-[18px_20px] max-[1100px]:p-[15px_13px] border border-border bg-linear-to-b from-(--ui-surface-161c28) to-(--ui-surface-111722) flex flex-col gap-2"
              key={label}
            >
              <span className="text-xs text-muted font-normal">{label}</span>
              <strong
                className={`text-[clamp(20px,2vw,28px)] tracking-[-0.7px] font-semibold tabular-nums ${tone}`}
              >
                {value}
              </strong>
              <small className="text-[11px] text-subtle leading-tight mt-auto">{hint}</small>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
