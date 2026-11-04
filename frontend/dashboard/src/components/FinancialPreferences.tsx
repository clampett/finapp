import { useState } from 'react';
import type { FormEvent } from 'react';
import type { GraphData } from '../finance';
import { assumptionsFor, dollars } from '../finance';
import {
  normalizeSimulationDefaults,
  simulationFieldNames,
  simulationFields,
} from '../simulationPreferences';
import type { SimulationDefaults } from '../simulationPreferences';

const card = 'space-y-4 rounded-xl border border-border bg-surface p-5 sm:p-6';
const field = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text';
const action = 'cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg';

export function SimulationPreferences({
  defaults,
  onSave,
  graph,
  onUpdate,
  ready,
}: {
  defaults: SimulationDefaults;
  onSave: (value: SimulationDefaults) => void;
  graph: GraphData;
  onUpdate: (graph: GraphData) => void;
  ready: boolean;
}) {
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState(defaults);
  const assumptions = assumptionsFor(graph);
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(
      simulationFieldNames.map((name) => [name, Number(data.get(name))]),
    );
    try {
      onSave(normalizeSimulationDefaults({ ...draft, ...values }));
      setNotice('Simulation defaults saved for this browser.');
    } catch {
      setNotice('Browser storage is unavailable. Simulation defaults could not be saved.');
    }
  }
  return (
    <>
      <form className={card} onSubmit={save}>
        <div>
          <h3 className="text-base font-semibold text-text">Forecast and debt defaults</h3>
          <p className="mt-1 text-sm text-muted">
            Applied when you open a new simulation. You can adjust the inputs for an individual run.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {simulationFieldNames.map((name) => {
            const { label, min, max, step } = simulationFields[name];
            return (
              <label key={name} className="space-y-1 text-sm text-muted">
                <span>{label}</span>
                <input
                  className={field}
                  name={name}
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  defaultValue={defaults[name]}
                  required
                />
              </label>
            );
          })}
          <label className="space-y-1 text-sm text-muted">
            Market return source
            <select
              className={field}
              value={draft.marketSource}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  marketSource: event.target.value === 'manual' ? 'manual' : 'historical',
                })
              }
            >
              <option value="historical">Historical sample</option>
              <option value="manual">Manual return and volatility</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted">
            Historical return baseline
            <select
              className={field}
              value={draft.returnMode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  returnMode: event.target.value === 'observed' ? 'observed' : 'forward',
                })
              }
            >
              <option value="forward">Center on the annual return assumption</option>
              <option value="observed">Use observed historical returns</option>
            </select>
          </label>
          <label className="space-y-1 text-sm text-muted">
            Debt comparison shown first
            <select
              className={field}
              value={draft.strategy}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  strategy: event.target.value === 'snowball' ? 'snowball' : 'avalanche',
                })
              }
            >
              <option value="avalanche">Avalanche · highest APR first</option>
              <option value="snowball">Snowball · smallest balance first</option>
            </select>
          </label>
        </div>
        <p className="text-sm text-muted">
          Inflation adjusts purchasing power. Fees reduce the modeled investment return. Shortfall
          APR is applied to unfunded expenses.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button className={action}>Save simulation defaults</button>
          <span role="status" className="text-sm text-muted">
            {notice}
          </span>
        </div>
      </form>
      {ready && (
        <form
          className={card}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            onUpdate({
              ...graph,
              assumptions: {
                incomeBasis: data.get('incomeBasis') === 'net' ? 'net' : 'gross',
                taxRate: Number(data.get('taxRate')),
                incomeGrowth: Number(data.get('incomeGrowth')),
                expenseGrowth: Number(data.get('expenseGrowth')),
              },
            });
            setNotice('Scenario assumptions applied. Check the workspace for save status.');
          }}
        >
          <h3 className="text-base font-semibold text-text">Scenario cash flow assumptions</h3>
          <p className="text-sm text-muted">
            Updates this scenario’s calculations across the dashboard. The effective tax estimate
            applies to gross income.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted">
              Income basis
              <select className={field} name="incomeBasis" defaultValue={assumptions.incomeBasis}>
                <option value="gross">Gross pay</option>
                <option value="net">Take-home pay</option>
              </select>
            </label>
            {(
              [
                ['taxRate', 'Effective tax (%)', 0, 60],
                ['incomeGrowth', 'Annual income growth (%)', -50, 25],
                ['expenseGrowth', 'Annual expense growth (%)', -25, 25],
              ] as const
            ).map(([name, label, min, max]) => (
              <label key={name} className="space-y-1 text-sm text-muted">
                {label}
                <input
                  className={field}
                  name={name}
                  type="number"
                  min={min}
                  max={max}
                  step="any"
                  defaultValue={assumptions[name]}
                  required
                />
              </label>
            ))}
          </div>
          <button className={action}>Apply cash flow assumptions</button>
        </form>
      )}
    </>
  );
}

const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'JPY'] as const;
type Currency = (typeof currencies)[number];

export function BalancePreferences({
  graph,
  onUpdate,
  userId,
}: {
  graph: GraphData;
  onUpdate: (graph: GraphData) => void;
  userId: number;
}) {
  const key = `finapp-balance-display:${userId}`;
  const [display, setDisplay] = useState<{ currency: Currency; rate: number }>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (
        currencies.includes(saved?.currency) &&
        Number.isFinite(saved?.rate) &&
        saved.rate > 0 &&
        saved.rate <= 1e6
      )
        return saved;
    } catch {
      /* Used the standard USD view when preferences could not be read. */
    }
    return { currency: 'USD', rate: 1 };
  });
  const [notice, setNotice] = useState('');
  const [currency, setCurrency] = useState(display.currency);
  const nodes = graph.nodes.filter(({ nodeType }) =>
    ['CHECKING', 'SAVINGS', 'INVESTMENT', 'DEBT'].includes(nodeType),
  );
  const converted = new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: display.currency,
  });
  return (
    <>
      <form
        className={card}
        onSubmit={(event) => {
          event.preventDefault();
          const rate =
            currency === 'USD' ? 1 : Number(new FormData(event.currentTarget).get('rate'));
          try {
            localStorage.setItem(key, JSON.stringify({ currency, rate }));
            setDisplay({ currency, rate });
            setNotice('Currency display saved.');
          } catch {
            setNotice('Browser storage is unavailable. Currency display could not be saved.');
          }
        }}
      >
        <h3 className="text-base font-semibold text-text">Balance display currency</h3>
        <p className="text-sm text-muted">
          Use a manual exchange rate to preview these balances in another currency. Account values
          and simulations use USD.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-muted">
            Display currency
            <select
              className={field}
              value={currency}
              onChange={(event) => setCurrency(event.target.value as Currency)}
            >
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          {currency !== 'USD' && (
            <label className="space-y-1 text-sm text-muted">
              Units of {currency} per 1 USD
              <input
                key={currency}
                name="rate"
                className={field}
                type="number"
                min="0.000001"
                max="1000000"
                step="any"
                defaultValue={currency === display.currency ? display.rate : undefined}
                required
              />
            </label>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={action}>Save currency display</button>
          <span role="status" className="text-sm text-muted">
            {notice}
          </span>
        </div>
      </form>
      <form
        className={card}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          onUpdate({
            ...graph,
            nodes: graph.nodes.map((node) =>
              data.has(node.id) ? { ...node, amountOrBalance: Number(data.get(node.id)) } : node,
            ),
          });
        }}
      >
        <h3 className="text-base font-semibold text-text">Scenario starting balances</h3>
        <p className="text-sm text-muted">
          Edit the starting amounts used by the Node Graph and forecasts. These edits are saved with
          the scenario on this device.
        </p>
        {nodes.length ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {nodes.map((node) => (
                <label
                  key={node.id + ':' + node.amountOrBalance}
                  className="space-y-1 text-sm text-muted"
                >
                  <span className="block">
                    {node.name} · {node.nodeType.toLowerCase()} (USD)
                  </span>
                  <input
                    className={field}
                    type="number"
                    name={node.id}
                    defaultValue={node.amountOrBalance}
                    min={['CHECKING', 'SAVINGS'].includes(node.nodeType) ? -1e12 : 0}
                    max={1e12}
                    step="any"
                    required
                  />
                  <span className="block text-xs">
                    {display.currency === 'USD'
                      ? dollars(node.amountOrBalance)
                      : `≈ ${converted.format(node.amountOrBalance * display.rate)}`}
                  </span>
                </label>
              ))}
            </div>
            <button className={action}>Apply starting balances</button>
          </>
        ) : (
          <p className="text-sm text-muted">
            Add a checking, savings, investment, or debt node in Node Graph to edit its balance
            here.
          </p>
        )}
      </form>
    </>
  );
}
