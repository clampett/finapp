import { money } from '../common/finance';
import type { CoachComparison, CoachSettings } from './coach-engine';
import { Comparison } from './CoachComparison';

export interface SavedComparison {
  id: number;
  result: CoachComparison;
  description: string;
  assumptions: CoachSettings & { volatility: number };
}
const button =
  'cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text hover:bg-hover-bg';

export function CoachNotebook({
  saved,
  selectedId,
  onSelect,
  onRemove,
}: {
  saved: SavedComparison[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  onRemove: (id: number) => void;
}) {
  const selected = saved.find((entry) => entry.id === selectedId) ?? saved[0];
  // Read the saved assumptions rather than controls that may have changed since the run.
  const assumptions = selected?.assumptions;
  const rows = assumptions
    ? [
        ['Annual return', `${(assumptions.annualReturn * 100).toFixed(1)}%`],
        ['Annual inflation', `${(assumptions.inflation * 100).toFixed(1)}%`],
        ['Annual fees', `${(assumptions.fee * 100).toFixed(1)}%`],
        ['Annual volatility', `${(assumptions.volatility * 100).toFixed(1)}%`],
        ['Unallocated surplus invested', `${assumptions.investmentRate}%`],
        ['Stress intensity', `${assumptions.intensity}×`],
        ['Target in today’s USD', money(assumptions.target)],
      ]
    : [];
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h3 className="m-0 text-lg font-semibold text-text">Your experiment notebook</h3>
      <p className="text-sm text-muted">
        Keep up to four comparisons while this tab is open. Each keeps its original assumptions and
        outcomes.
      </p>
      {!saved.length && (
        <p className="text-sm text-muted">Run and save your first comparison in Scenario lab.</p>
      )}
      <div className="space-y-2">
        {saved.map((entry) => (
          <div key={entry.id} className="flex gap-2">
            <button
              className={`${button} flex-1 text-left ${selected?.id === entry.id ? 'border-active-border bg-active-bg' : ''}`}
              onClick={() => onSelect(entry.id)}
            >
              <strong className="block">
                {entry.result.label} · {entry.result.years} years
              </strong>
              <span className="text-xs text-muted">{entry.description}</span>
            </button>
            <button
              className={button}
              aria-label={`Remove ${entry.result.label} comparison`}
              onClick={() => onRemove(entry.id)}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <>
          <details className="mt-4 rounded-xl border border-border p-4 text-xs text-muted">
            <summary className="cursor-pointer font-medium text-text">
              Assumptions used for this run
            </summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd className="m-0 mt-1 font-semibold text-text">{value}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Comparison key={selected.id} result={selected.result} />
        </>
      )}
    </section>
  );
}
