import type { FormEvent, Dispatch, SetStateAction } from 'react';
import { dollars } from '../common/finance';
import type { Stock, StockPosition } from './types';
import { StockModal } from './StockModal';
import type { TradeModalData } from './TradeModal';
import { TradeModal } from './TradeModal';

export interface StockSectionProps {
  stocks: Stock[];
  positions: StockPosition[];
  currentPrices: Record<string, number>;
  totalPurchasedValue: number;
  totalPortfolioValue: number;
  userId?: number;
  onOpenAddStock: () => void;
  onEditStock: (s: Stock) => void;
  onDeleteStock: (id: number) => Promise<void>;
  onOpenTrade: (s: Stock | StockPosition, type: 'buy' | 'sell') => void;
  // StockModal props
  showStockForm: boolean;
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
  onSaveStock: (e?: FormEvent) => Promise<void>;
  onCancelStock: () => void;
  // TradeModal props
  tradeModal: TradeModalData;
  setTradeModal: Dispatch<SetStateAction<TradeModalData>>;
  availableAccounts: string[];
  onExecuteTrade: (e: FormEvent) => Promise<void>;
  onCancelTrade: () => void;
}

export function StockSection({
  stocks,
  positions,
  currentPrices,
  totalPurchasedValue,
  totalPortfolioValue,
  userId,
  onOpenAddStock,
  onEditStock,
  onDeleteStock,
  onOpenTrade,
  showStockForm,
  editingStockId,
  stockDraft,
  setStockDraft,
  fetchingQuote,
  quotePrice,
  detectedDividend,
  onSaveStock,
  onCancelStock,
  tradeModal,
  setTradeModal,
  availableAccounts,
  onExecuteTrade,
  onCancelTrade,
}: StockSectionProps) {
  return (
    <section aria-labelledby="stocks-section-heading">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <h3
              id="stocks-section-heading"
              style={{
                margin: 0,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                flexWrap: 'wrap',
              }}
            >
              <span>Stock Holdings & Valuations</span>
              {stocks.length > 0 && (
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--ui-paint-8f9db3)',
                    display: 'inline-flex',
                    gap: '6px',
                    alignItems: 'center',
                  }}
                >
                  (Purchased Price:{' '}
                  <strong style={{ color: 'var(--ui-paint-cbd5e1)' }}>{dollars(totalPurchasedValue)}</strong> |
                  Current Price:{' '}
                  <strong
                    style={{
                      color: totalPortfolioValue >= totalPurchasedValue ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                    }}
                  >
                    {dollars(totalPortfolioValue)}
                  </strong>
                  )
                </span>
              )}
            </h3>
          </div>
          <p className="text-(--ui-text-8b9ab1) text-[11px] mt-0.5 mb-0">
            Track shares, cost basis, market prices, and buy/sell operations.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-primary text-primary-fg hover:bg-(--ui-surface-hover-cbbcfc) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
          onClick={onOpenAddStock}
          disabled={!userId}
        >
          + Add Stock Ticker
        </button>
      </div>

      {/* Stock Form (Create / Edit) */}
      <StockModal
        isOpen={showStockForm}
        editingStockId={editingStockId}
        stockDraft={stockDraft}
        setStockDraft={setStockDraft}
        fetchingQuote={fetchingQuote}
        quotePrice={quotePrice}
        detectedDividend={detectedDividend}
        onSave={onSaveStock}
        onCancel={onCancelStock}
        onDelete={onDeleteStock}
      />

      {/* Trade Buy/Sell Modal */}
      <TradeModal
        isOpen={tradeModal.open}
        tradeModal={tradeModal}
        setTradeModal={setTradeModal}
        availableAccounts={availableAccounts}
        onExecuteTrade={onExecuteTrade}
        onCancel={onCancelTrade}
      />

      {/* Stocks and Positions Table */}
      {stocks.length === 0 ? (
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
          No stock positions yet. Click <strong>+ Add Stock Ticker</strong> to track your
          investments.
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
                <th style={{ padding: '12px' }}>Ticker</th>
                <th style={{ padding: '12px' }}>Company</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Shares Owned</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Purchased Price</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Current Price</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Market Value</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Cost Basis</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Dividends</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>Trade & Manage</th>
              </tr>
            </thead>
            <tbody>
              {stocks.map((stock) => {
                const pos = positions.find((p) => p.stockId === stock.id);
                const shares = pos
                  ? Number(pos.sharesOwned || 0)
                  : Number(stock.sharesOwned || 0);
                const sym = stock.ticker?.toUpperCase() || '';
                const currentPrice =
                  currentPrices[sym] !== undefined
                    ? currentPrices[sym]
                    : (pos?.lastPrice ?? stock.lastPrice ?? 0);
                const purchasedPrice =
                  pos?.avgCostPerShare != null && Number(pos.avgCostPerShare) > 0
                    ? Number(pos.avgCostPerShare)
                    : Number(stock.purchasePrice ?? stock.lastPrice ?? 0);
                const marketVal = shares * currentPrice;
                const costBasis = pos?.costBasis
                  ? Number(pos.costBasis)
                  : shares * purchasedPrice;
                const totalDiv = pos ? pos.totalDividends : 0;

                const sameTickerStocks = stocks.filter(
                  (s) => s.ticker?.toUpperCase() === sym,
                );
                const isMultiLot = sameTickerStocks.length > 1;
                const lotIndex =
                  sameTickerStocks.findIndex((s) => s.id === stock.id) + 1;

                return (
                  <tr key={stock.id} style={{ borderBottom: '1px solid var(--ui-paint-1f2737)' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--ui-paint-38bdf8)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>{stock.ticker}</span>
                        {isMultiLot && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 600,
                              background: 'rgba(56, 189, 248, 0.15)',
                              color: 'var(--ui-paint-38bdf8)',
                              padding: '1px 5px',
                              borderRadius: '4px',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                            }}
                          >
                            Lot #{lotIndex}
                          </span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--ui-paint-cbd5e1)' }}>
                      {stock.companyName || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }}>
                      {Number(shares)
                        .toFixed(4)
                        .replace(/\.?0+$/, '')}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {dollars(purchasedPrice)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: currentPrice >= purchasedPrice ? 'var(--ui-paint-4ade80)' : 'var(--ui-paint-f87171)',
                      }}
                    >
                      {dollars(currentPrice)}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: 'var(--ui-paint-4ade80)',
                      }}
                    >
                      {dollars(marketVal)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ui-paint-8f9db3)' }}>
                      {costBasis ? dollars(costBasis) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--ui-paint-a7f3d0)' }}>
                      {totalDiv ? dollars(totalDiv) : '—'}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <button
                        type="button"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          marginRight: '4px',
                          color: 'var(--ui-paint-4ade80)',
                        }}
                        onClick={() => onOpenTrade(pos || stock, 'buy')}
                      >
                        + Buy
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          marginRight: '6px',
                          color: 'var(--ui-paint-fb923c)',
                        }}
                        onClick={() => onOpenTrade(pos || stock, 'sell')}
                      >
                        − Sell
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) text-(--ui-text-97a7c2) hover:text-text transition-colors"
                        onClick={() => onEditStock(stock)}
                        style={{ padding: '4px 8px', fontSize: '11px', marginRight: '4px' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center whitespace-nowrap rounded-[7px] font-medium cursor-pointer bg-transparent border border-transparent hover:bg-(--ui-surface-hover-1a2536) transition-colors"
                        style={{ color: 'var(--ui-paint-f87171)', padding: '4px 8px', fontSize: '11px' }}
                        onClick={() => stock.id && onDeleteStock(stock.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
