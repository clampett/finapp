import { useState, type FormEvent, type Dispatch, type SetStateAction } from 'react';
import type { GraphData, GraphNode } from '../common/finance';
import { dollars, debtPayment } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { changeAccount, changeCategory, changeKind } from './budgeting-drafts';
import type { AccountOption, Transaction, TransactionKind } from './types';
import { formFieldStyle } from './types';

export interface AiAssetModalProps {
  isOpen: boolean;
  transDraft: Transaction;
  setTransDraft: Dispatch<SetStateAction<Transaction>>;
  availableAccounts: string[];
  dbAccounts: AccountOption[];
  matchedDebtNode?: GraphNode;
  graph?: GraphData;
  onSave: (e?: FormEvent) => Promise<void>;
  onCancel: () => void;
}

export function AiAssetModal({
  isOpen,
  transDraft,
  setTransDraft,
  availableAccounts,
  dbAccounts,
  matchedDebtNode,
  graph,
  onSave,
  onCancel,
}: AiAssetModalProps) {
  const [promptText, setPromptText] = useState('');
  const [estimating, setEstimating] = useState(false);
  const [estimationSource, setEstimationSource] = useState<'local_ai' | 'heuristic' | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hasEstimated, setHasEstimated] = useState(false);

  if (!isOpen) return null;

  const handleEstimate = async () => {
    if (!promptText.trim()) {
      setErrorMsg('Please describe your asset first.');
      return;
    }
    setErrorMsg(null);
    setEstimating(true);

    try {
      const response = await fetch('/api/v1/coach/value-asset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: promptText.trim() }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || 'Failed to estimate asset value.');
      }

      const json = await response.json();
      const data = json.data;

      if (!data || typeof data.amount !== 'number') {
        throw new Error('Received invalid estimation from local AI.');
      }

      setTransDraft((prev) => ({
        ...prev,
        kind: (data.kind as TransactionKind) || 'income',
        description: data.description || promptText.trim(),
        amount: data.amount,
        categoryName: data.categoryName || 'Assets',
        accountName: prev.accountName || availableAccounts[0] || 'Checking',
        transactionDate: prev.transactionDate || new Date().toISOString().split('T')[0],
        date: prev.date || new Date().toISOString().split('T')[0],
        notes: data.notes || `AI estimated based on: "${promptText.trim()}"`,
      }));

      setEstimationSource(data.source === 'local_ai' ? 'local_ai' : 'heuristic');
      setHasEstimated(true);
    } catch (err) {
      setErrorMsg((err as Error).message || 'Local AI estimation was unavailable.');
    } finally {
      setEstimating(false);
    }
  };

  return (
    <div
      style={{
        background: 'var(--ui-paint-161d2b)',
        border: '1px solid var(--ui-paint-3b82f6)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          borderBottom: '1px solid var(--ui-paint-283347)',
          paddingBottom: '0.75rem',
        }}
      >
        <div>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✨</span> Value Asset with Local AI
          </h4>
          <p className="text-(--ui-text-8b9ab1) text-[11px] mt-1 mb-0">
            Describe what you own. Local AI will evaluate it and pre-fill your asset record for
            review and approval.
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--ui-paint-8f9db3)',
            cursor: 'pointer',
            fontSize: '16px',
          }}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Asset Description Prompt Box */}
      <div
        style={{
          background: 'var(--ui-paint-121824)',
          border: '1px solid var(--ui-paint-283347)',
          borderRadius: '6px',
          padding: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <label
          htmlFor="ai-asset-description-prompt"
          style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}
        >
          Describe your asset (physical, vehicle, real estate, valuables, or personal property):
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <input
            id="ai-asset-description-prompt"
            type="text"
            placeholder="e.g. 2019 Toyota RAV4 with 45,000 miles in good condition, or 10 oz gold bar"
            value={promptText}
            onChange={(e) => setPromptText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void handleEstimate();
              }
            }}
            disabled={estimating}
            style={{
              ...formFieldStyle,
              flex: '1 1 300px',
              fontSize: '13px',
            }}
          />
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
            onClick={handleEstimate}
            disabled={estimating || !promptText.trim()}
          >
            {estimating ? (
              <>
                <span className="stock-loading-spinner" aria-hidden="true" />
                Estimating with AI…
              </>
            ) : (
              '⚡ Estimate with AI'
            )}
          </button>
        </div>

        {errorMsg && (
          <div
            style={{
              color: 'var(--ui-paint-f87171)',
              fontSize: '12px',
              marginTop: '8px',
            }}
          >
            {errorMsg}
          </div>
        )}

        {hasEstimated && (
          <div
            style={{
              marginTop: '8px',
              fontSize: '12px',
              color:
                estimationSource === 'local_ai'
                  ? 'var(--ui-paint-4ade80)'
                  : 'var(--ui-paint-93c5fd)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✓</span>
            {estimationSource === 'local_ai'
              ? 'Estimated via Local AI (Ollama). Please review the pre-filled values below.'
              : 'Estimated via intelligent valuation model. Please review the pre-filled values below.'}
          </div>
        )}
      </div>

      {/* Fields based directly on the "+ Add Asset/Transaction" window */}
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
            <option value="income">Income / Asset Value (Inflow)</option>
            <option value="expense">Expense / Liability (Outflow)</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Description / Asset Name
          <input
            type="text"
            required
            placeholder="e.g. 2019 Toyota RAV4"
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
            placeholder="e.g. Vehicles, Real Estate, Valuables"
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
            placeholder="Valuation methodology, condition, or notes..."
            value={transDraft.notes || ''}
            onChange={(e) => setTransDraft((prev) => ({ ...prev, notes: e.target.value }))}
            style={formFieldStyle}
          />
        </label>

        {matchedDebtNode && graph && transDraft.kind === 'expense' && (
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
            gridColumn: '1 / -1',
            padding: '10px 14px',
            borderRadius: '6px',
            background: 'var(--ui-paint-1e2838)',
            border: '1px solid var(--ui-paint-2563eb)',
            fontSize: '12px',
            color: 'var(--ui-paint-93c5fd)',
          }}
        >
          📋 <strong>Review & Approval Required:</strong> Please check that the description,
          estimated amount, account, and category match your asset. You can edit any field above
          before approving. Once approved, it will be recorded into your ledger and scenario net
          worth.
        </div>

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
            ✓ Approve Asset/Transaction
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
