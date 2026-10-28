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
    <details className={`budget-panel ${compact ? 'compact' : ''}`} open={!compact}>
      <summary>
        <span>Income & monthly budget</span>
        <strong>{dollars(budget.surplus)} after bills</strong>
      </summary>
      <div className="budget-content">
        <div className="budget-inputs">
          <label>
            Income entered as
            <select
              value={settings.incomeBasis}
              onChange={(e) => change({ incomeBasis: e.target.value as 'gross' | 'net' })}
            >
              <option value="gross">Gross pay · before tax</option>
              <option value="net">Take-home · already taxed</option>
            </select>
          </label>
          <label>
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
        <dl className="budget-reconciliation">
          <div>
            <dt>{settings.incomeBasis === 'gross' ? 'Gross income' : 'Entered take-home pay'}</dt>
            <dd>{dollars(budget.income)}</dd>
          </div>
          <div>
            <dt>Estimated tax</dt>
            <dd>−{dollars(budget.taxes)}</dd>
          </div>
          <div className="subtotal">
            <dt>Take-home pay</dt>
            <dd>{dollars(budget.takeHome)}</dd>
          </div>
          <div>
            <dt>Living expenses</dt>
            <dd>−{dollars(budget.expenses)}</dd>
          </div>
          <div>
            <dt>Loan payments</dt>
            <dd>−{dollars(budget.payments)}</dd>
          </div>
          <div className="subtotal">
            <dt>{budget.surplus < 0 ? 'Monthly shortfall' : 'Available after bills'}</dt>
            <dd className={budget.surplus < 0 ? 'negative' : 'positive'}>
              {dollars(budget.surplus)}
            </dd>
          </div>
          <div>
            <dt>Scheduled investment transfers</dt>
            <dd>−{dollars(budget.plannedInvestment)}</dd>
          </div>
          <div>
            <dt>Scheduled cash savings</dt>
            <dd>−{dollars(budget.plannedSavings)}</dd>
          </div>
          <div className="subtotal">
            <dt>{budget.surplus < 0 ? 'Unfunded bills' : 'Still unassigned'}</dt>
            <dd>{dollars(budget.surplus < 0 ? budget.surplus : budget.unassigned)}</dd>
          </div>
        </dl>
        <p className="budget-note">
          The tax rate is an editable estimate, not a tax-bracket calculation. Only entered expenses
          are included. Saving transfers move money; they are not living expenses.
        </p>
        {budget.overcommitted && (
          <p className="budget-warning">
            The plan exceeds available money. Transfers are capped proportionally; no money is
            borrowed just to fund savings.
          </p>
        )}
      </div>
    </details>
  );
}
