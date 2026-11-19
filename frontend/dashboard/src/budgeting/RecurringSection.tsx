import type { FormEvent, Dispatch, SetStateAction } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars } from '../common/finance';
import type { RecurringTransaction } from './types';
import { RecurringModal } from './RecurringModal';
import type { getScenarioSalary, getScenarioDebts } from './budgeting-bridge';

export interface RecurringSectionProps {
  recurringList: RecurringTransaction[];
  userId?: number;
  isDemo: boolean;
  generating: boolean;
  scenarioSalary: ReturnType<typeof getScenarioSalary>;
  scenarioDebts: ReturnType<typeof getScenarioDebts>;
  onGenerateDueOccurrences: () => Promise<void>;
  onImportScenarioSalary: () => Promise<void>;
  onImportScenarioDebts: () => Promise<void>;
  onOpenAddRecurring: () => void;
  onEditRecurring: (r: RecurringTransaction) => void;
  onDeleteRecurring: (id: number) => Promise<void>;
  // RecurringModal props
  showRecurForm: boolean;
  editingRecurId: number | null;
  recurDraft: RecurringTransaction;
  setRecurDraft: Dispatch<SetStateAction<RecurringTransaction>>;
  matchedRecurDebtNode?: GraphNode;
  graph: GraphData;
  onSaveRecur: (e?: FormEvent) => Promise<void>;
  onCancelRecur: () => void;
}

export function RecurringSection({
  recurringList,
  userId,
  isDemo,
  generating,
  scenarioSalary,
  scenarioDebts,
  onGenerateDueOccurrences,
  onImportScenarioSalary,
  onImportScenarioDebts,
  onOpenAddRecurring,
  onEditRecurring,
  onDeleteRecurring,
  showRecurForm,
  editingRecurId,
  recurDraft,
  setRecurDraft,
  matchedRecurDebtNode,
  graph,
  onSaveRecur,
  onCancelRecur,
}: RecurringSectionProps) {
  return (
    <section aria-labelledby="recurring-section-heading">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div>
          <h3 id="recurring-section-heading" style={{ margin: 0 }}>
            Recurring Transaction Templates
          </h3>
          <p className="text-(--ui-text-8b9ab1) text-[11px] mt-0.5 mb-0">
            Automate repeating expenses and income (e.g. rent, payroll, Netflix). Occurrences are
            generated into Transactions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 min-w-30 aria-busy:cursor-progress whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent text-(--ui-text-97a7c2) hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            onClick={onGenerateDueOccurrences}
            disabled={!userId}
            aria-busy={generating}
            aria-disabled={generating || !userId}
            title="Generate all transactions due on or before today"
          >
            {generating ? (
              <>
                <span className="stock-loading-spinner" aria-hidden="true" /> Generating…
              </>
            ) : (
              '⚡ Generate Due Occurrences'
            )}
          </button>
          {scenarioSalary.nodes.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-3 py-2 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-mint border border-mint/40 hover:bg-mint/10 transition-colors"
              onClick={onImportScenarioSalary}
              title="Import scenario salary node as monthly recurring income"
            >
              📥 Import Salary ({dollars(scenarioSalary.totalMonthly)})
            </button>
          )}
          {scenarioDebts.nodes.length > 0 && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-[7px] px-3 py-2 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-coral border border-coral/40 hover:bg-coral/10 transition-colors"
              onClick={onImportScenarioDebts}
              title="Import scenario debt payments as monthly recurring obligations"
            >
              📥 Import Debts ({dollars(scenarioDebts.totalMonthlyPayment)})
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            onClick={onOpenAddRecurring}
            disabled={!userId && !isDemo}
          >
            + Add Recurring Transaction
          </button>
        </div>
      </div>

      {/* Recurring Form (Create / Edit) */}
      <RecurringModal
        isOpen={showRecurForm}
        editingRecurId={editingRecurId}
        recurDraft={recurDraft}
        setRecurDraft={setRecurDraft}
        matchedRecurDebtNode={matchedRecurDebtNode}
        graph={graph}
        onSave={onSaveRecur}
        onCancel={onCancelRecur}
        onDelete={onDeleteRecurring}
      />

      {/* Recurring List Table */}
      {recurringList.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            background: 'var(--ui-paint-161d2b)',
            borderRadius: '8px',
            border: '1px dashed var(--ui-paint-283347)',
            color: 'var(--ui-paint-8f9db3)',
          }}
        >
          No recurring transactions set up yet. Click <strong>+ Add Recurring Rule</strong> to
          template repetitive bills or paychecks.
        </div>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            background: 'var(--ui-paint-161d2b)',
            borderRadius: '8px',
            border: '1px solid var(--ui-paint-283347)',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--ui-paint-283347)',
                  background: 'var(--ui-paint-121824)',
                  color: 'var(--ui-paint-8f9db3)',
                }}
              >
                <th style={{ padding: '12px' }}>Description</th>
                <th style={{ padding: '12px' }}>Kind</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px' }}>Frequency</th>
                <th style={{ padding: '12px' }}>Next Due</th>
                <th style={{ padding: '12px' }}>Active</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recurringList.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600 }}>{r.description}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          r.kind === 'income' ? 'var(--ui-paint-064e3b)' : 'var(--ui-paint-7f1d1d)',
                        color:
                          r.kind === 'income' ? 'var(--ui-paint-86efac)' : 'var(--ui-paint-fca5a5)',
                      }}
                    >
                      {r.kind}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                    {dollars(r.amount)}
                  </td>
                  <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>
                    {r.intervalCount > 1 ? `Every ${r.intervalCount} ${r.frequency}` : r.frequency}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{r.nextDueDate}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        color: r.isActive ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-8f9db3)',
                      }}
                    >
                      {r.isActive ? '● Active' : '○ Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
                      onClick={() => onEditRecurring(r)}
                      style={{ padding: '4px 8px', fontSize: '11px', marginRight: '6px' }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
                      style={{
                        color: 'var(--ui-paint-f87171)',
                        padding: '4px 8px',
                        fontSize: '11px',
                      }}
                      onClick={() => r.id && onDeleteRecurring(r.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
