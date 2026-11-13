import type { FormEvent, Dispatch, SetStateAction } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars, debtPayment } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { changeKind } from './budgeting-drafts';
import type { RecurrenceFrequency, RecurringTransaction, TransactionKind } from './types';
import { formFieldStyle } from './types';

export interface RecurringModalProps {
  isOpen: boolean;
  editingRecurId: number | null;
  recurDraft: RecurringTransaction;
  setRecurDraft: Dispatch<SetStateAction<RecurringTransaction>>;
  matchedRecurDebtNode?: GraphNode;
  graph: GraphData;
  onSave: (e?: FormEvent) => Promise<void>;
  onCancel: () => void;
  onDelete?: (id: number) => Promise<void>;
}

export function RecurringModal({
  isOpen,
  editingRecurId,
  recurDraft,
  setRecurDraft,
  matchedRecurDebtNode,
  graph,
  onSave,
  onCancel,
  onDelete,
}: RecurringModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        background: 'var(--ui-paint-161d2b)',
        border: '1px solid var(--ui-paint-283347)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <h4 style={{ margin: '0 0 1rem 0' }}>
        {editingRecurId ? 'Edit Recurring Rule' : 'New Recurring Rule Template'}
      </h4>
      <form
        onSubmit={onSave}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Kind
          <select
            value={recurDraft.kind}
            onChange={(e) =>
              setRecurDraft((prev) => changeKind(prev, e.target.value as TransactionKind))
            }
            style={formFieldStyle}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Description
          <input
            type="text"
            required
            placeholder="e.g. Monthly Rent, Bi-weekly Salary"
            value={recurDraft.description}
            onChange={(e) =>
              setRecurDraft((prev) => ({ ...prev, description: e.target.value }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Amount ($)
          <NumberField
            min="0.01"
            step="0.01"
            required
            value={String(recurDraft.amount)}
            onChange={(e) =>
              setRecurDraft((prev) => ({ ...prev, amount: Number(e.target.value) }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Frequency
          <select
            value={recurDraft.frequency}
            onChange={(e) =>
              setRecurDraft((prev) => ({
                ...prev,
                frequency: e.target.value as RecurrenceFrequency,
              }))
            }
            style={formFieldStyle}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Bi-weekly (Every 2 weeks)</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Interval Count
          <NumberField
            min="1"
            step="1"
            required
            value={String(recurDraft.intervalCount || 1)}
            onChange={(e) =>
              setRecurDraft((prev) => ({
                ...prev,
                intervalCount: Math.max(1, Number(e.target.value)),
              }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Next Due Date
          <input
            type="date"
            required
            value={recurDraft.nextDueDate}
            onChange={(e) =>
              setRecurDraft((prev) => ({ ...prev, nextDueDate: e.target.value }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Start Date
          <input
            type="date"
            required
            value={recurDraft.startDate}
            onChange={(e) =>
              setRecurDraft((prev) => ({ ...prev, startDate: e.target.value }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          End Date (Optional)
          <input
            type="date"
            value={recurDraft.endDate || ''}
            onChange={(e) =>
              setRecurDraft((prev) => ({ ...prev, endDate: e.target.value || null }))
            }
            style={formFieldStyle}
          />
        </label>

        {matchedRecurDebtNode && recurDraft.kind === 'expense' && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '10px 14px',
              borderRadius: '6px',
              background: 'rgba(244, 63, 94, 0.12)',
              border: '1px solid var(--color-coral)',
              color: 'var(--color-coral)',
              fontSize: '12px',
            }}
          >
            💳 <strong>Linked Scenario Debt Account:</strong> {matchedRecurDebtNode.name}
            <div style={{ marginTop: '2px', color: 'var(--color-coral)' }}>
              Current Balance: <strong>{dollars(matchedRecurDebtNode.amountOrBalance)}</strong> • Interest:{' '}
              <strong>{matchedRecurDebtNode.interestRateApr}% APR</strong> • Minimum Monthly Payment:{' '}
              <strong>{dollars(debtPayment(matchedRecurDebtNode, graph))}</strong>.
            </div>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            gridColumn: '1 / -1',
            marginTop: '0.5rem',
          }}
        >
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors"
          >
            {editingRecurId ? 'Save Changes' : 'Create Recurring Rule'}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          {editingRecurId && onDelete && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
              style={{ marginLeft: 'auto' }}
              onClick={() => onDelete(editingRecurId)}
            >
              Delete Rule
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
