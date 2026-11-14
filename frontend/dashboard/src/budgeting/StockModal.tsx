import type { FormEvent, Dispatch, SetStateAction } from 'react';
import { dollars } from '../common/finance';
import { NumberField } from '../common/NumberField';
import type { Stock } from './types';
import { formFieldStyle } from './types';

export interface StockModalProps {
  isOpen: boolean;
  editingStockId: number | null;
  stockDraft: Stock;
  setStockDraft: Dispatch<SetStateAction<Stock>>;
  fetchingQuote: boolean;
  quotePrice: number | null;
  detectedDividend: {
    pays: boolean;
    perShare: number;
    frequency: string;
    yieldPct: number | null;
    rate: number | null;
  } | null;
  onSave: (e?: FormEvent) => Promise<void>;
  onCancel: () => void;
  onDelete?: (id: number) => Promise<void>;
}

export function StockModal({
  isOpen,
  editingStockId,
  stockDraft,
  setStockDraft,
  fetchingQuote,
  quotePrice,
  detectedDividend,
  onSave,
  onCancel,
  onDelete,
}: StockModalProps) {
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
        {editingStockId ? 'Edit Stock Details' : 'Add Stock To Portfolio'}
      </h4>
      {editingStockId && (
        <p className="text-(--ui-text-8b9ab1) text-[11px]">
          Modify your stock details, dividend settings, or position holdings below.
        </p>
      )}
      <form
        onSubmit={onSave}
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
        }}
      >
        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Ticker Symbol
          <input
            type="text"
            required
            maxLength={10}
            placeholder="e.g. AAPL, NVDA, VOO"
            value={stockDraft.ticker}
            onChange={(e) =>
              setStockDraft((prev) => ({ ...prev, ticker: e.target.value.toUpperCase() }))
            }
            style={formFieldStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Price at Purchase ($)
          <NumberField
            min="0"
            step="0.01"
            required
            value={String(stockDraft.purchasePrice ?? stockDraft.lastPrice ?? '')}
            onChange={(e) =>
              setStockDraft((prev) => ({ ...prev, purchasePrice: Number(e.target.value) }))
            }
            style={formFieldStyle}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Shares Owned
          <NumberField
            min="0"
            step="0.0001"
            required
            value={String(stockDraft.sharesOwned ?? 0)}
            onChange={(e) =>
              setStockDraft((prev) => ({ ...prev, sharesOwned: Number(e.target.value) }))
            }
            style={formFieldStyle}
          />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          <span style={{ color: 'var(--ui-paint-8f9db3)' }}>Current Price ($)</span>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              background: 'var(--ui-paint-0f141e)',
              border: '1px solid var(--ui-paint-283347)',
              minHeight: '38px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {fetchingQuote ? (
              <span style={{ color: 'var(--ui-paint-93c5fd)', fontSize: '12px' }}>
                Fetching current price...
              </span>
            ) : quotePrice != null ? (
              <span style={{ color: 'var(--ui-paint-4ade80)', fontWeight: 600 }}>
                {dollars(quotePrice)}
              </span>
            ) : (
              <span style={{ color: 'var(--ui-paint-64748b)', fontSize: '12px' }}>
                Auto-fetched from market
              </span>
            )}
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
          Company Name (optional)
          <input
            type="text"
            placeholder="e.g. Apple Inc."
            value={stockDraft.companyName || ''}
            onChange={(e) => setStockDraft((prev) => ({ ...prev, companyName: e.target.value }))}
            style={formFieldStyle}
          />
        </label>

        {detectedDividend && (
          <div
            style={{
              gridColumn: '1 / -1',
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: detectedDividend.pays
                ? 'rgba(74, 222, 128, 0.12)'
                : 'rgba(148, 163, 184, 0.10)',
              border: `1px solid ${
                detectedDividend.pays ? 'rgba(74, 222, 128, 0.3)' : 'rgba(148, 163, 184, 0.2)'
              }`,
              color: detectedDividend.pays ? 'var(--ui-paint-4ade80)' : '#94a3b8',
            }}
          >
            {detectedDividend.pays ? (
              <>
                <span>✓</span>
                <span>
                  <strong>Dividend detected:</strong> ${detectedDividend.perShare.toFixed(4)}
                  /share ({detectedDividend.frequency})
                  {detectedDividend.yieldPct != null && ` • ~${detectedDividend.yieldPct}% yield`}
                  {Number(stockDraft.sharesOwned || 0) > 0 && (
                    <span style={{ color: 'var(--color-text)', marginLeft: '6px' }}>
                      → {dollars(Number(stockDraft.sharesOwned) * detectedDividend.perShare)}/
                      {detectedDividend.frequency} recurring income
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                <span>ℹ</span>
                <span>No dividend distributions detected for this security.</span>
              </>
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            gridColumn: '1 / -1',
            marginTop: '0.25rem',
          }}
        >
          <input
            type="checkbox"
            id="paysDividendCheckbox"
            checked={Boolean(stockDraft.paysDividend)}
            onChange={(e) => setStockDraft((prev) => ({ ...prev, paysDividend: e.target.checked }))}
          />
          <label
            htmlFor="paysDividendCheckbox"
            style={{
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Pays Dividends
            {detectedDividend?.pays && (
              <span
                style={{
                  fontSize: '11px',
                  color: 'var(--ui-paint-4ade80)',
                  background: 'rgba(74, 222, 128, 0.15)',
                  borderRadius: '4px',
                  padding: '1px 6px',
                }}
              >
                Auto-detected
              </span>
            )}
          </label>
        </div>

        {stockDraft.paysDividend && (
          <>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '13px',
              }}
            >
              Dividend Frequency
              <select
                value={stockDraft.dividendFrequency || 'quarterly'}
                onChange={(e) =>
                  setStockDraft((prev) => ({ ...prev, dividendFrequency: e.target.value }))
                }
                style={formFieldStyle}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="semiannual">Semiannual</option>
                <option value="annual">Annual</option>
                <option value="irregular">Irregular</option>
              </select>
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                fontSize: '13px',
              }}
            >
              Dividend Per Share ($)
              <NumberField
                min="0"
                step="0.0001"
                value={String(stockDraft.dividendPerShare || 0)}
                onChange={(e) =>
                  setStockDraft((prev) => ({
                    ...prev,
                    dividendPerShare: Number(e.target.value),
                  }))
                }
                style={formFieldStyle}
              />
            </label>

            {stockDraft.dividendFrequency !== 'irregular' &&
              Number(stockDraft.sharesOwned || 0) > 0 &&
              Number(stockDraft.dividendPerShare || 0) > 0 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontSize: '12px',
                    color: 'var(--ui-paint-93c5fd)',
                    background: 'rgba(59, 130, 246, 0.1)',
                    padding: '6px 10px',
                    borderRadius: '4px',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                  }}
                >
                  Estimated dividend income of{' '}
                  <strong>
                    {dollars(
                      (Number(stockDraft.sharesOwned) || 0) *
                        (Number(stockDraft.dividendPerShare) || 0),
                    )}
                    /{stockDraft.dividendFrequency || 'quarterly'}
                  </strong>{' '}
                  is included in full portfolio forecasts that use editable price returns. Record
                  payouts as income after you receive them.
                </div>
              )}
          </>
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
            {editingStockId ? 'Save Changes' : 'Add Stock'}
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-transparent text-(--ui-text-97a7c2) border border-transparent hover:bg-(--ui-surface-hover-1a2536) hover:text-text transition-colors"
            onClick={onCancel}
          >
            Cancel
          </button>
          {editingStockId && onDelete && (
            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.25 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer text-coral border border-(--ui-border-633246) bg-(--ui-surface-2b1b28) hover:bg-(--ui-surface-hover-3d2034) transition-colors"
              style={{ marginLeft: 'auto' }}
              onClick={() => onDelete(editingStockId)}
            >
              Delete Stock
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
