import { NumberField } from './NumberField';
import { assumptionsFor, dollars, totals } from '../finance';
import type { GraphData, ScenarioAssumptions } from '../finance';

export function BudgetControls({
  graph,
  onChange,
  compact = false,
}: {
  graph: GraphData;
  onChange: (settings: ScenarioAssumptions) => void;
  compact?: boolean;
}) {
  const settings = assumptionsFor(graph),
    budget = totals(graph);
  const change = (patch: Partial<ScenarioAssumptions>) => onChange({ ...settings, ...patch });
  return (
    <details className={`border border-[color:var(--ui-border-304253)] rounded-xl bg-linear-to-r from-[var(--ui-surface-14232b)] to-[var(--ui-surface-151d2b)] mb-4.5 text-xs group ${compact ? 'compact' : ''}`} open={!compact}>
      <summary className={`cursor-pointer flex justify-between gap-3.5 items-center list-none select-none after:content-['+'] group-open:after:content-['−'] after:text-[color:var(--ui-text-85d8bd)] after:text-lg [&::-webkit-details-marker]:hidden ${compact ? 'flex-wrap p-[13px_14px] text-[11px]' : 'p-[15px_18px]'}`}>
        <span>Income & monthly budget</span>
        <strong className={`ml-auto text-[color:var(--ui-text-b1d9cb)] font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>{dollars(budget.surplus)} after bills</strong>
      </summary>
      <div className="px-4.5 pt-0.5 pb-4.25">
        <div className="grid grid-cols-2 gap-3 my-3">
          <label className="flex flex-col gap-2 text-[color:var(--ui-text-a7b7cc)] text-[11px]">
            Income entered as
            <select
              className="w-full min-w-0 text-xs border border-border rounded-lg bg-[var(--ui-surface-101722)] text-[color:var(--ui-text-edf2fa)] px-2.75 py-2.5 cursor-pointer"
              value={settings.incomeBasis}
              onChange={(e) => change({ incomeBasis: e.target.value as 'gross' | 'net' })}
            >
              <option value="gross">Gross pay · before tax</option>
              <option value="net">Take-home · already taxed</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-[color:var(--ui-text-a7b7cc)] text-[11px]">
            Estimated effective tax (%)
            <NumberField
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={settings.taxRate}
              disabled={settings.incomeBasis === 'net'}
              onChange={(e) => change({ taxRate: Number(e.target.value) })}
            />
          </label>
        </div>
        <dl className="my-3.25">
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>{settings.incomeBasis === 'gross' ? 'Gross income' : 'Entered take-home pay'}</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">{dollars(budget.income)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>Estimated tax</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">−{dollars(budget.taxes)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-[color:var(--ui-border-314052)] text-[color:var(--ui-text-d5e5ef)] pt-2.75 mt-0.75">
            <dt>Take-home pay</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">{dollars(budget.takeHome)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>Living expenses</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">−{dollars(budget.expenses)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>Loan payments</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">−{dollars(budget.payments)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-[color:var(--ui-border-314052)] text-[color:var(--ui-text-d5e5ef)] pt-2.75 mt-0.75">
            <dt>{budget.surplus < 0 ? 'Monthly shortfall' : 'Available after bills'}</dt>
            <dd className={`tabular-nums m-0 ${budget.surplus < 0 ? 'negative text-coral' : 'positive text-mint'}`}>
              {dollars(budget.surplus)}
            </dd>
          </div>
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>Scheduled investment transfers</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">−{dollars(budget.plannedInvestment)}</dd>
          </div>
          <div className="flex justify-between gap-3 py-2 text-[color:var(--ui-text-98aac1)]">
            <dt>Scheduled cash savings</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">−{dollars(budget.plannedSavings)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-[color:var(--ui-border-314052)] text-[color:var(--ui-text-d5e5ef)] pt-2.75 mt-0.75">
            <dt>{budget.surplus < 0 ? 'Unfunded bills' : 'Still unassigned'}</dt>
            <dd className="tabular-nums text-[color:var(--ui-text-e1eaf4)] m-0">{dollars(budget.surplus < 0 ? budget.surplus : budget.unassigned)}</dd>
          </div>
        </dl>
        <p className="text-[11px] leading-[1.7] text-[color:var(--ui-text-8da3ba)] m-0">
          The tax rate is an editable estimate, not a tax-bracket calculation. Only entered expenses
          are included. Saving transfers move money; they are not living expenses.
        </p>
        {budget.overcommitted && (
          <p className="text-[11px] leading-[1.7] text-[color:var(--ui-text-ebc184)] mt-2.5 m-0">
            The plan exceeds available money. Transfers are capped proportionally; no money is
            borrowed just to fund savings.
          </p>
        )}
      </div>
    </details>
  );
}
