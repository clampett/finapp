import { useState } from 'react';
import type { FormEvent } from 'react';
import type { GraphData } from './finance';
import { API_BASE, dollars } from './finance';
import { sessionHeaders } from './session';
import { NumberField } from './components/NumberField';

interface BudgetingTabProps {
  graph: GraphData;
}

// Maps to TransactionKind enum in SQL (income | expense) and StockTransactionType
export type TransactionKind = 'income' | 'expense';
export type StockTxnType = 'buy' | 'sell'; // dividend/split omitted per request: treat stocks like assets

export interface Transaction {
  id?: number;
  kind: TransactionKind;
  accountName: string;
  description: string;
  amount: number;
  date: string;
  notes: string;
}

export interface Stock {
  id?: number;
  ticker: string;
  sharesOwned: number;
  lastPrice: number;
  companyName?: string | null;
  paysDividend?: boolean;
  exchange?: string | null;
}

const initialTransaction = (): Transaction => ({
  kind: 'income',
  accountName: '',
  description: '',
  amount: 0,
  date: new Date().toISOString().split('T')[0],
  notes: '',
});

const initialStock: Stock = {
  ticker: '',
  sharesOwned: 0,
  lastPrice: 0,
  companyName: null,
  paysDividend: false,
  exchange: null,
};

export function BudgetingTab({ graph }: BudgetingTabProps) {
  const userId = Number(localStorage.getItem('finapp_user_id')) || 0;

  // Transaction form state
  const [transDraft, setTransDraft] = useState<Transaction>(initialTransaction);
  const [showTransForm, setShowTransForm] = useState(false);

  // Stock form state
  const [stockDraft, setStockDraft] = useState<Stock>(initialStock);

  // Editing IDs for forms
  const [editingTransId, setEditingTransId] = useState<number | null>(null);
  const [editingStockId, setEditingStockId] = useState<number | null>(null);

  // Handlers for transaction CRUD
  const updateTransactionDraft = (updates: Partial<Transaction>) => {
    setTransDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleAddTransaction = () => {
    setEditingTransId(null);
    setTransDraft(initialTransaction());
    setShowTransForm(true);
  };

  const handleSaveTransaction = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    try {
      const endpoint = editingTransId
        ? `${API_BASE}/transactions/${editingTransId}`
        : `${API_BASE}/transactions`;
      const data = { ...transDraft, userId };
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify(data),
        keepalive: true,
      });
      setEditingTransId(null);
      setShowTransForm(false);
      setTransDraft(initialTransaction());
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteTransaction = async (id: number): Promise<void> => {
    try {
      await fetch(`${API_BASE}/recurring-transactions/${id}`, {
        method: 'DELETE',
        headers: sessionHeaders(),
      });
      setEditingTransId(null);
      setShowTransForm(false);
      setTransDraft(initialTransaction());
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Handlers for stock CRUD
  const updateStockDraft = (updates: Partial<Stock>) => {
    setStockDraft((prev) => ({ ...prev, ...updates }));
  };

  const handleAddStock = () => {
    setEditingStockId(null);
    setStockDraft(initialStock);
  };

  const handleSaveStock = async (e?: FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    try {
      const endpoint = editingStockId ? `${API_BASE}/stocks/${editingStockId}` : `${API_BASE}/stocks`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
        body: JSON.stringify({
          userId,
          ticker: stockDraft.ticker.toUpperCase(),
          lastPrice: stockDraft.lastPrice,
        }),
        keepalive: true,
      });
    } catch (err) {
      console.error(err);
    }
  };

  const marketValue = stockDraft.sharesOwned * stockDraft.lastPrice;
  const accountOptions =
    graph?.nodes?.filter((n) => ['CHECKING', 'SAVINGS'].includes(n.nodeType)) ?? [];

  return (
    <div className="dashboard-tab">
      <h2>Transactions & Stocks</h2>

      {/* TRANSACTIONS SECTION */}
      <section aria-labelledby="transactions-heading">
        <div className="section-heading">
          <div>
            <h3 id="transactions-heading">Transactions (Income / Expense)</h3>
            <p>Add a transaction. Choose kind: income (earnings) or expense (payments).</p>
          </div>
        </div>

        {/* Add Transaction Button */}
        {!showTransForm && !editingTransId && (
          <div>
            <form
              style={{ display: 'flex', gap: '0.5rem' }}
              onSubmit={(e) => e.preventDefault()}
            >
              <button onClick={handleAddTransaction} type="button" disabled={!userId}>
                Add transaction
              </button>
              {transDraft.notes.trim() && (
                <p className="muted small">Notes: {transDraft.notes}</p>
              )}
            </form>
          </div>
        )}

        {/* Transaction Form */}
        {(showTransForm || editingTransId !== null) && (
          <form
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
            onSubmit={handleSaveTransaction}
          >
            <label>Kind</label>
            <select
              value={transDraft.kind}
              onChange={(ev) =>
                updateTransactionDraft({ kind: ev.target.value as TransactionKind })
              }
            >
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>

            <label>Description or Category</label>
            <input
              type="text"
              value={transDraft.description}
              onChange={(ev) => updateTransactionDraft({ description: ev.target.value })}
            />

            <label>Account</label>
            <select
              value={transDraft.accountName}
              onChange={(ev) => updateTransactionDraft({ accountName: ev.target.value })}
            >
              <option value="" disabled>
                Select account
              </option>
              {accountOptions.length > 0 ? (
                accountOptions.map((acc) => (
                  <option key={acc.id} value={acc.name}>
                    {acc.name}
                  </option>
                ))
              ) : (
                <>
                  <option value="Checking">Checking</option>
                  <option value="Savings">Savings</option>
                </>
              )}
            </select>

            <label>Date</label>
            <input
              type="date"
              value={transDraft.date}
              onChange={(ev) => updateTransactionDraft({ date: ev.target.value })}
            />

            <label>Amount ($)</label>
            <NumberField
              min="0"
              step="0.01"
              required
              value={String(transDraft.amount)}
              onChange={(ev) => updateTransactionDraft({ amount: Number(ev.target.value) })}
            />

            <label>Notes</label>
            <input
              type="text"
              placeholder="Optional notes"
              value={transDraft.notes}
              onChange={(ev) => updateTransactionDraft({ notes: ev.target.value })}
            />

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="submit" className="button primary">
                {editingTransId ? 'Save transaction' : 'Add transaction'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowTransForm(false);
                  setEditingTransId(null);
                }}
              >
                Cancel
              </button>
              {editingTransId !== null && (
                <button
                  type="button"
                  className="button danger"
                  onClick={() => handleDeleteTransaction(editingTransId)}
                >
                  Delete
                </button>
              )}
            </div>
          </form>
        )}

        {/* Transactions Info */}
        {(showTransForm || editingTransId !== null) && transDraft.notes.trim() && (
          <ul role="status">
            <li>{`Kind: ${transDraft.kind} | Description: ${transDraft.description || ''}${transDraft.amount ? ` | Amount: ${dollars(transDraft.amount)}` : ''}`}</li>
          </ul>
        )}
      </section>

      {/* STOCKS SECTION */}
      <section aria-labelledby="stocks-heading" style={{ marginTop: '2rem' }}>
        <div className="section-heading">
          <h3 id="stocks-heading">Stock Holdings</h3>
          <p>Treat stocks like other assets. Track shares and valuation.</p>
        </div>

        {!editingStockId && (
          <form
            style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}
            onSubmit={handleSaveStock}
          >
            <label>Ticker</label>
            <input
              type="text"
              maxLength={4}
              value={stockDraft.ticker || ''}
              onChange={(ev) => updateStockDraft({ ticker: ev.target.value })}
              placeholder="AAPL"
            />

            <label>Shares Owned</label>
            <NumberField
              min="0"
              value={String(stockDraft.sharesOwned)}
              onChange={(ev) => updateStockDraft({ sharesOwned: Number(ev.target.value) })}
            />

            <label>Last Price ($)</label>
            <NumberField
              min="0"
              step="0.01"
              required
              style={{ maxWidth: '12ch' }}
              value={String(stockDraft.lastPrice)}
              onChange={(ev) => updateStockDraft({ lastPrice: Number(ev.target.value) })}
            />

            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <button type="submit" className="button primary">
                Save stock
              </button>
              <button type="button" onClick={handleAddStock}>
                New
              </button>
            </div>
          </form>
        )}

        {!editingStockId && stockDraft.ticker.trim() && (
          <div style={{ marginTop: '1rem', padding: '0.5rem' }}>
            <p>
              <strong>{stockDraft.ticker.toUpperCase()}</strong>: {stockDraft.sharesOwned} shares × $
              {stockDraft.lastPrice.toFixed(2)} = <em>${marketValue.toFixed(2)}</em>
            </p>
          </div>
        )}

        {/* Stock Buy/Sell stubs */}
        {!editingStockId && stockDraft.ticker.trim() && (
          <>
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ fontSize: '0.85rem', color: '#666' }}>Buy / Sell</h4>
              <p className="muted small">
                Stock transactions (buy/sell) tracked in stock_transactions table; click to open
                transaction modal.
              </p>
            </div>
            {/* TODO: When backend API exists, add buy/sell buttons here */}
          </>
        )}
      </section>

      {/* INFO / DOCUMENTATION SECTION */}
      <section
        aria-label="Developer notes"
        style={{ marginTop: '2rem', borderTop: '1px solid #eee' }}
      >
        <div className="info">
          <h4>Data Models Used</h4>
          <ul>
            <li>
              <code>accounts</code>: Checking, savings, brokerage accounts where money lives.
            </li>
            <li>
              <code>categories</code>: Income (salary, dividends) or expense (rent, groceries).
            </li>
            <li>
              <code>recurring_transactions</code>: Templates like rent/salary; app generates
              transactions from these.
            </li>
            <li>
              <code>transactions</code>: One-off income/expense records linked to accounts and
              categories.
            </li>
            <li>
              <code>stocks</code>: Stock positions with ticker, company name, dividend info, last
              price.
            </li>
            <li>
              <code>stock_transactions</code>: Buy/sell/dividend/split operations on stocks (treated
              like other assets).
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}