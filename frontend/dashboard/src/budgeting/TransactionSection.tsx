import type { FormEvent, Dispatch, SetStateAction } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars } from '../common/finance';
import type { AccountOption, Transaction } from './types';
import { TransactionModal } from './TransactionModal';
import { AiAssetModal } from './AiAssetModal';
import { FeatureIcon } from '../common/FeatureIcon';

export interface TransactionSectionProps {
  transactions: Transaction[];
  userId?: number;
  isDemo: boolean;
  onOpenAdd: () => void;
  onOpenAiAsset?: () => void;
  onEdit: (t: Transaction) => void;
  onDelete: (id: number) => Promise<void>;
  // Form props forwarded to TransactionModal / AiAssetModal
  showTransForm: boolean;
  showAiAssetForm?: boolean;
  editingTransId: number | null;
  transDraft: Transaction;
  setTransDraft: Dispatch<SetStateAction<Transaction>>;
  availableAccounts: string[];
  dbAccounts: AccountOption[];
  matchedDebtNode?: GraphNode;
  graph: GraphData;
  onSaveTrans: (e?: FormEvent) => Promise<void>;
  onCancelTrans: () => void;
  onCancelAiAsset?: () => void;
  hasActiveFilters?: boolean;
}

export function TransactionSection({
  transactions,
  userId,
  isDemo,
  onOpenAdd,
  onOpenAiAsset,
  onEdit,
  onDelete,
  showTransForm,
  showAiAssetForm = false,
  editingTransId,
  transDraft,
  setTransDraft,
  availableAccounts,
  dbAccounts,
  matchedDebtNode,
  graph,
  onSaveTrans,
  onCancelTrans,
  onCancelAiAsset,
  hasActiveFilters = false,
}: TransactionSectionProps) {
  return (
    <section aria-labelledby="transactions-section-heading">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 id="transactions-section-heading" className="m-0 text-sm font-semibold text-text">
            Recorded Transactions
          </h3>
          <p className="text-xs text-muted mt-1">Income and expenses linked to your accounts.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface text-text px-3 py-2 text-xs cursor-pointer hover:bg-hover-bg disabled:opacity-50"
            onClick={onOpenAiAsset}
            disabled={!onOpenAiAsset || (!userId && !isDemo)}
          >
            <FeatureIcon name="spark" />
            Manage assets
          </button>
          <button
            type="button"
            className="rounded-lg bg-primary text-primary-fg px-3 py-2 text-xs cursor-pointer disabled:opacity-50"
            onClick={onOpenAdd}
            disabled={!userId && !isDemo}
          >
            + Add Transaction
          </button>
        </div>
      </header>

      {/* Kept estimates separate from the transaction draft and its save handler. */}
      {showAiAssetForm && (
        <AiAssetModal isOpen={showAiAssetForm} onCancel={onCancelAiAsset || onCancelTrans} />
      )}

      {/* Transaction Form (Create / Edit) */}
      <TransactionModal
        isOpen={showTransForm}
        editingTransId={editingTransId}
        transDraft={transDraft}
        setTransDraft={setTransDraft}
        availableAccounts={availableAccounts}
        dbAccounts={dbAccounts}
        matchedDebtNode={matchedDebtNode}
        graph={graph}
        onSave={onSaveTrans}
        onCancel={onCancelTrans}
        onDelete={onDelete}
      />

      {/* Transactions Table */}
      {transactions.length === 0 ? (
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
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '15px', color: 'var(--color-text)' }}>
            {hasActiveFilters
              ? 'No transactions match your search or date filter.'
              : 'No single transactions recorded yet.'}
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-muted)' }}>
            {hasActiveFilters ? (
              'Try adjusting or clearing your search and date range filters.'
            ) : (
              <>
                Click <strong>+ Add Transaction</strong> to record actual income or expenses.
                Recurring salary and bills are managed in the{' '}
                <strong>Recurring Transactions</strong> tab. Use the separate asset estimator for
                planning references.
              </>
            )}
          </p>
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
                <th style={{ padding: '12px' }}>Date</th>
                <th style={{ padding: '12px' }}>Kind</th>
                <th style={{ padding: '12px' }}>Description</th>
                <th style={{ padding: '12px' }}>Account</th>
                <th style={{ padding: '12px' }}>Category</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '12px' }}>Notes</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                  <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                    {t.transactionDate || t.date}
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span
                      style={{
                        padding: '3px 8px',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        background:
                          t.kind === 'income' ? 'var(--ui-paint-064e3b)' : 'var(--ui-paint-7f1d1d)',
                        color:
                          t.kind === 'income' ? 'var(--ui-paint-86efac)' : 'var(--ui-paint-fca5a5)',
                      }}
                    >
                      {t.kind}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{t.description}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--ui-paint-93c5fd)' }}>
                    {t.accountName && t.accountName.trim().toLowerCase() === 'checking account'
                      ? 'Checking'
                      : t.accountName || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', color: 'var(--ui-paint-d1d5db)' }}>
                    {t.categoryName || '—'}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color:
                        t.kind === 'income' ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                    }}
                  >
                    {t.kind === 'income' ? `+${dollars(t.amount)}` : `-${dollars(t.amount)}`}
                  </td>
                  <td
                    style={{
                      padding: '10px 12px',
                      color: 'var(--ui-paint-8f9db3)',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {t.notes || '—'}
                  </td>
                  <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
                      onClick={() => onEdit(t)}
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
                      onClick={() => t.id && onDelete(t.id)}
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
