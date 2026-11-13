import { dollars, money } from '../common/finance';
import type { SimulationResult, SimulationType } from './simulation-types';

interface SimulationOutcomeTableProps {
  simulationType: SimulationType;
  quantiles: { key: string; label: string; color: string }[];
  metrics?: SimulationResult['metrics'];
  forecast?: SimulationResult | null;
}

export function SimulationOutcomeTable({
  simulationType,
  quantiles,
  metrics,
  forecast,
}: SimulationOutcomeTableProps) {
  if (simulationType === 'debt') {
    return null;
  }

  return (
    <>
      <section>
        <h3 className="text-sm font-semibold text-text mb-4 mt-0">How to read this chart</h3>
        {quantiles.map((q) => (
          <div className="flex gap-2.5 mb-3.75" key={q.key}>
            <i className="w-1.75 h-1.75 rounded-full mt-1.25 shrink-0" style={{ background: q.color }} />
            <div>
              <strong className="text-[11px] font-[550]" style={{ color: q.color }}>{q.label}</strong>
              <p className="text-[10px] text-(--ui-text-8e9fb9) mt-1.25 mb-0 leading-[1.65] max-[760px]:text-[11px]">
                {q.key === 'p90'
                  ? '90% of modeled outcomes fall below this value. It is an optimistic outcome, not a guaranteed bull market.'
                  : q.key === 'p50'
                    ? 'Half of modeled outcomes are above this value and half below. This is the median across 1,000 simulations.'
                    : '10% of modeled outcomes fall below this value. More severe losses are still possible.'}
              </p>
            </div>
          </div>
        ))}
        <p className="text-(--ui-text-8b9ab1) text-[9px] leading-[1.6] mt-2 mb-0">
          The shaded band spans P10–P90 at each year. These curves are percentiles, not
          three individual market paths.
        </p>
      </section>

      {metrics && (
        <section>
          <h3 className="text-sm font-semibold text-text mb-4 mt-0">What drives the result?</h3>
          <dl className="text-[10px] leading-normal my-2 [&>div]:flex [&>div]:justify-between [&>div]:gap-2.25 [&>div]:mb-2.5 [&_dt]:text-(--ui-text-879bb8) [&_dd]:m-0 [&_dd]:text-right font-medium">
            <div>
              <dt>Entered income</dt>
              <dd>{dollars(metrics.monthly_income)}</dd>
            </div>
            <div>
              <dt>Estimated tax</dt>
              <dd>−{dollars(metrics.monthly_taxes)}</dd>
            </div>
            <div>
              <dt>Take-home income</dt>
              <dd>{dollars(metrics.take_home_income)}</dd>
            </div>
            <div>
              <dt>Living expenses</dt>
              <dd>−{money(metrics.monthly_expenses)}</dd>
            </div>
            <div>
              <dt>Debt payments</dt>
              <dd>−{money(metrics.minimum_debt_payments)}</dd>
            </div>
            <div>
              <dt>Total initially invested /mo</dt>
              <dd>{dollars(metrics.monthly_contribution)}</dd>
            </div>
            <div>
              <dt>Initially kept in cash /mo</dt>
              <dd>{dollars(metrics.monthly_cash_saving)}</dd>
            </div>
            <div>
              <dt>No-growth reference</dt>
              <dd>{money(metrics.no_growth_baseline ?? 0)}</dd>
            </div>
          </dl>
          <p className="text-(--ui-text-8b9ab1) text-[11px] leading-[1.6] mt-2 mb-0">
            The reference uses the same cash flows and debt schedule without asset growth,
            expressed in the chart’s dollars.
          </p>
        </section>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-[11px] text-(--ui-text-b6c2d9) font-medium select-none">Model assumptions</summary>
        <ul className="pl-3.75 text-[10px] text-(--ui-text-8fa1bb) leading-[1.8] my-2 [&>li]:mt-2.25">
          {(
            forecast?.assumptions ?? [
              'Start the Java and Python services to calculate this scenario.',
            ]
          ).map((a) => (
            <li key={a}>{a}</li>
          ))}
          <li>
            A fixed random seed makes comparisons repeatable. Market history is a modeling
            input, not a prediction of future returns.
          </li>
        </ul>
      </details>
    </>
  );
}
