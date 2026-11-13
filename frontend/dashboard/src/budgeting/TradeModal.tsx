import type { FormEvent, Dispatch, SetStateAction } from 'react';
import { dollars } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { formFieldStyle } from './types';

export interface TradeModalData {
  open: boolean;
  stockId: number | null;
  ticker: string;
  type: 'buy' | 'sell';
  quantity: number;
  price: number;
  accountName: string;
  notes: string;
}

export interface TradeModalProps {
  isOpen: boolean;
  tradeModal: TradeModalData;
  setTradeModal: Dispatch<SetStateAction<TradeModalData>>;
  availableAccounts: string[];
  onExecuteTrade: (e: FormEvent) => Promise<void>;
  onCancel: () => void;
}

export function TradeModal({
  isOpen,
  tradeModal,
  setTradeModal,
  availableAccounts,
  onExecuteTrade,
  onCancel,
}: TradeModalProps) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        background: 'var(--ui-paint-1c2436)',
        border: '1px solid var(--ui-paint-3b82f6)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
      }}
    >
      <h4 style={{ margin: '0 0 1rem 0' }}>
        Trade {tradeModal.ticker} —{' '}
        {tradeModal.type === 'buy' ? 'Buy Shares' : 'Sell Shares'}
      </h4>
      <form
        onSubmit={onExecuteTrade}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
        }}
      >
        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Action
          <select
            value={tradeModal.type}
            onChange={(e) =>
              setTradeModal((prev) => ({ ...prev, type: e.target.value as 'buy' | 'sell' }))
            }
            style={formFieldStyle}
          >
            <option value="buy">Buy</option>
            <option value="sell">Sell</option>
          </select>
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Quantity of Shares
          <NumberField
            min="0.0001"
            step="0.0001"
            required
            value={String(tradeModal.quantity)}
            onChange={(e) =>
              setTradeModal((prev) => ({ ...prev, quantity: Number(e.target.value) }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Price per Share ($)
          <NumberField
            min="0.01"
            step="0.01"
            required
            value={String(tradeModal.price)}
            onChange={(e) =>
              setTradeModal((prev) => ({ ...prev, price: Number(e.target.value) }))
            }
            style={formFieldStyle}
          />
        </label>

        <label
          style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}
        >
          Account
          <select
            value={tradeModal.accountName}
            onChange={(e) =>
              setTradeModal((prev) => ({ ...prev, accountName: e.target.value }))
            }
            style={formFieldStyle}
          >
            {availableAccounts.map((acc) => (
              <option key={acc} value={acc}>
                {acc}
              </option>
            ))}
          </select>
        </label>

        <div style={{ gridColumn: '1 / -1', fontSize: '13px', color: 'var(--ui-paint-93c5fd)' }}>
          Total Estimated {tradeModal.type === 'buy' ? 'Cost' : 'Proceeds'}:{' '}
          <strong>{dollars(tradeModal.quantity * tradeModal.price)}</strong>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', gridColumn: '1 / -1' }}>
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors"
          >
            Execute {tradeModal.type.toUpperCase()}
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
