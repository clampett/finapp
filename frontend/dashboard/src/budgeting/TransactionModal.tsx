import type { FormEvent, Dispatch, SetStateAction } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars, debtPayment } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { changeAccount, changeCategory, changeKind } from './budgeting-drafts';
import type { AccountOption, Transaction, TransactionKind } from './types';
import { formFieldStyle } from './types';

export interface TransactionModalProps {
  isOpen: boolean;
  editingTransId: number | null;
  transDraft: Transaction;
  setTransDraft: Dispatch<SetStateAction<Transaction>>;
  availableAccounts: string[];
  dbAccounts: AccountOption[];
  matchedDebtNode?: GraphNode;
  graph: GraphData;
  onSave: (e?: FormEvent) => Promise<void>;
  onCancel: () => void;
  onDelete?: (id: number) => Promise<void>;
}

export function TransactionModal({
  isOpen,
  editingTransId,
  transDraft,
  setTransDraft,
  availableAccounts,
  dbAccounts,
  matchedDebtNode,
  graph,
  onSave,
  onCancel,
  onDelete,
}: TransactionModalProps) {
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
        {editingTransId ? 'Edit Transaction' : 'Record New Transaction'}
      </h4>
      <form
        onSubmit={onSave}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Kind
          <select
            value={transDraft.kind}
            onChange={(e) =>
              setTransDraft((prev) => changeKind(prev, e.target.value as TransactionKind))
            }
            style={formFieldStyle}
          >
            <option value="income">Income (Earnings / Inflow)</option>
            <option value="expense">Expense (Payment / Outflow)</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Description / Payee
          <input
            type="text"
            required
            placeholder="e.g. Salary, Trader Joe's, Electric bill"
            value={transDraft.description}
            onChange={(e) => setTransDraft((prev) => ({ ...prev, description: e.target.value }))}
            style={formFieldStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Amount ($)
          <NumberField
            min="0.01"
            step="0.01"
            required
            value={String(transDraft.amount)}
            onChange={(e) => setTransDraft((prev) => ({ ...prev, amount: Number(e.target.value) }))}
            style={formFieldStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Account
          <select
            value={transDraft.accountName || ''}
            onChange={(e) =>
              setTransDraft((prev) => changeAccount(prev, e.target.value, dbAccounts))
            }
            style={formFieldStyle}
          >
            <option value="">Select or Default</option>
            {availableAccounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Date
          <input
            type="date"
            required
            value={transDraft.transactionDate || transDraft.date || ''}
            onChange={(e) =>
              setTransDraft((prev) => ({
                ...prev,
                transactionDate: e.target.value,
                date: e.target.value,
              }))
            }
            style={formFieldStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Category (optional)
          <input
            type="text"
            placeholder="e.g. Groceries, Utilities, Rent"
            value={transDraft.categoryName || ''}
            onChange={(e) => setTransDraft((prev) => changeCategory(prev, e.target.value))}
            style={formFieldStyle}
          />
        </label>

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            fontSize: '13px',
            gridColumn: '1 / -1',
          }}
        >
          Notes (optional)
          <input
            type="text"
            placeholder="Additional details..."
            value={transDraft.notes || ''}
            onChange={(e) => setTransDraft((prev) => ({ ...prev, notes: e.target.value }))}
            style={formFieldStyle}
          />
        </label>

        {matchedDebtNode && transDraft.kind === 'expense' && (
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
            💳 <strong>Linked Scenario Debt Account:</strong> {matchedDebtNode.name}
            <div style={{ marginTop: '2px', color: 'var(--color-coral)' }}>
              Current Balance: <strong>{dollars(matchedDebtNode.amountOrBalance)}</strong> •
              Interest: <strong>{matchedDebtNode.interestRateApr}% APR</strong> • Minimum Monthly
              Payment: <strong>{dollars(debtPayment(matchedDebtNode, graph))}</strong>. Logging this
              expense will automatically pay down this debt balance and increase your net worth.
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
            {editingTransId ? 'Save Changes' : 'Record Transaction'}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          {editingTransId && onDelete && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
              style={{ marginLeft: 'auto' }}
              onClick={() => onDelete(editingTransId)}
            >
              Delete Transaction
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
