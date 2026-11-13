import type { GraphData, ScenarioAssumptions, SimulationType } from '../common/finance';
import { dollars } from '../common/finance';
import { NumberField } from '../common/NumberField';
import { BudgetControls } from '../workspace/BudgetControls';

interface SimulationParametersProps {
  graphData: GraphData;
  simulationType: SimulationType;
  settings: ScenarioAssumptions;
  onAssumptionsChange: (a: ScenarioAssumptions) => void;
  marketSource: 'historical' | 'manual';
  setMarketSource: (s: 'historical' | 'manual') => void;
  assetClass: string;
  setAssetClass: (a: string) => void;
  returnMode: 'forward' | 'observed';
  setReturnMode: (m: 'forward' | 'observed') => void;
  annualReturn: number;
  setAnnualReturn: (r: number) => void;
  annualVolatility: number;
  setAnnualVolatility: (v: number) => void;
  years: number;
  setYears: (y: number) => void;
  horizons: number[];
  rate: number;
  setRate: (r: number) => void;
  scheduledInvesting: boolean;
  setScheduledInvesting: (s: boolean) => void;
  target: number;
  setTarget: (t: number) => void;
  fee: number;
  setFee: (f: number) => void;
  borrowingApr: number;
  setBorrowingApr: (b: number) => void;
  inflation: boolean;
  setInflation: (i: boolean) => void;
  inflationRate: number;
  strategy: 'avalanche' | 'snowball';
  setStrategy: (s: 'avalanche' | 'snowball') => void;
  allocation: {
    plannedInvestment: number;
    plannedSavings: number;
    unassigned: number;
    investment: number;
    cash: number;
    overcommitted: boolean;
  };
  setLoading: (l: boolean) => void;
  setError: (e: string) => void;
}

export function SimulationParameters({
  graphData,
  simulationType,
  settings,
  onAssumptionsChange,
  marketSource,
  setMarketSource,
  assetClass,
  setAssetClass,
  returnMode,
  setReturnMode,
  annualReturn,
  setAnnualReturn,
  annualVolatility,
  setAnnualVolatility,
  years,
  setYears,
  horizons,
  rate,
  setRate,
  scheduledInvesting,
  setScheduledInvesting,
  target,
  setTarget,
  fee,
  setFee,
  borrowingApr,
  setBorrowingApr,
  inflation,
  setInflation,
  inflationRate,
  strategy,
  setStrategy,
  allocation,
  setLoading,
  setError,
}: SimulationParametersProps) {
  return (
    <section>
      <div className="text-[8px] text-(--ui-text-889ab6) mb-1.5 font-semibold tracking-wider">YOUR ASSUMPTIONS</div>
      <h3 className="text-sm font-semibold text-text mb-4 mt-0">Make it your scenario</h3>
      <BudgetControls graph={graphData} onChange={onAssumptionsChange} compact />
      {simulationType !== 'debt' && (
        <section className="my-4.25 p-0 border-0">
          <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
            Market assumptions
            <select
              className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
              value={marketSource}
              onChange={(e) => setMarketSource(e.target.value as 'historical' | 'manual')}
            >
              <option value="historical">Free historical calibration</option>
              <option value="manual">Editable price return assumptions</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
            Investment benchmark
            <select
              className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value)}
            >
              <option value="US_STOCKS">US stocks · SPY</option>
              <option value="BONDS">US bonds · AGG</option>
              <option value="INTL_STOCKS">International stocks · EFA</option>
              <option value="REAL_ESTATE">Real estate · VNQ</option>
            </select>
          </label>
          <div className="bg-(--ui-surface-0c1520) border border-(--ui-border-2a3d51) rounded-[9px] p-3.25 my-4">
            <p className="text-[10px] text-(--ui-text-95abc2) leading-[1.6] mb-3.5 mt-0">
              {marketSource === 'manual'
                ? 'Used for this simulation'
                : returnMode === 'forward'
                  ? 'Historical risk with an editable forward return'
                  : 'Observed historical return; these values are fallbacks only'}
            </p>
            {marketSource === 'historical' && (
              <label className="inline-flex items-center gap-2 text-[11px] text-(--ui-text-b9c5d9) cursor-pointer mb-3">
                <input
                  type="checkbox"
                  className="accent-(--ui-paint-82c9b1) w-3.25 h-3.25"
                  checked={returnMode === 'forward'}
                  onChange={(e) => setReturnMode(e.target.checked ? 'forward' : 'observed')}
                />{' '}
                Use an editable forward return
              </label>
            )}
            <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
              {marketSource === 'manual'
                ? 'Annual price return (%)'
                : returnMode === 'observed'
                  ? 'Fallback annual return (%)'
                  : 'Forward expected return (%)'}
              <NumberField
                type="number"
                min={-50}
                max={50}
                step={0.5}
                value={annualReturn}
                onChange={(e) => setAnnualReturn(Number(e.target.value))}
              />
            </label>
            <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
              {marketSource === 'historical'
                ? 'Fallback volatility (%)'
                : 'Annual volatility (%)'}
              <NumberField
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={annualVolatility}
                onChange={(e) => setAnnualVolatility(Number(e.target.value))}
              />
            </label>
          </div>
        </section>
      )}
      <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
        Time horizon
        <select
          className="w-full min-w-0 mt-2 px-2.5 py-1.5 text-xs rounded-[7px] border border-border bg-base text-text"
          value={years}
          onChange={(e) => {
            setLoading(true);
            setError('');
            setYears(Number(e.target.value));
          }}
        >
          {horizons.map((y) => (
            <option key={y} value={y}>
              {y} {y === 1 ? 'year' : 'years'}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-3 text-[11px] text-(--ui-text-b9c5d9) mt-4.25" htmlFor="allocation">
        <span>{simulationType === 'debt'
          ? 'Extra surplus toward debt'
          : 'Invest still-unassigned money'}</span>
        <strong className="text-(--ui-text-cebeff)">{rate}%</strong>
      </label>
      {simulationType !== 'debt' && (
        <label className="inline-flex items-center gap-2 text-[11px] text-(--ui-text-b9c5d9) cursor-pointer mt-3">
          <input
            type="checkbox"
            className="accent-(--ui-paint-82c9b1) w-3.25 h-3.25"
            checked={scheduledInvesting}
            onChange={(e) => setScheduledInvesting(e.target.checked)}
          />{' '}
          Include scheduled investment transfers
        </label>
      )}
      <input
        id="allocation"
        type="range"
        className="w-full mt-3 accent-brand cursor-pointer"
        min={0}
        max={100}
        step={1}
        value={rate}
        onChange={(e) => {
          setLoading(true);
          setError('');
          setRate(Number(e.target.value));
        }}
      />
      <p className="text-(--ui-text-8b9ab1) text-[11px] mt-2 mb-0 leading-[1.6]">
        {simulationType === 'debt'
          ? 'Minimum payments are included once. This adds a share of your remaining monthly surplus.'
          : `${dollars(allocation.plannedInvestment)} scheduled + ${rate}% of ${dollars(allocation.unassigned)} unassigned = ${dollars(allocation.investment)}/mo invested initially. Remaining cash savings: ${dollars(allocation.cash)}/mo.`}
      </p>
      {simulationType !== 'debt' && (
        <p className="text-(--ui-text-8b9ab1) text-[11px] mt-2 mb-0 leading-[1.6]">
          For $0 in new investments, turn off scheduled transfers and set the slider to 0%.
          Uninvested surplus stays in cash. Losses can still affect existing investments;
          expenses above take-home income can drain assets and create debt. Set a negative
          forward return to explore a prolonged market decline.
        </p>
      )}
      {simulationType !== 'debt' && (
        <>
          <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
            Net-worth target ($)
            <NumberField
              type="number"
              min={0}
              max={1e12}
              step={10000}
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            />
          </label>
          <details className="my-5 border border-(--ui-border-2d3f55) rounded-lg">
            <summary className="text-[11px] p-3 text-(--ui-text-adbed0) cursor-pointer font-medium select-none">Growth, fees & shortfalls</summary>
            <div className="px-3 pt-1 pb-3">
              <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
                Annual income growth (%)
                <NumberField
                  type="number"
                  min={-50}
                  max={25}
                  step={0.5}
                  value={settings.incomeGrowth}
                  onChange={(e) =>
                    onAssumptionsChange({
                      ...settings,
                      incomeGrowth: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
                Annual living-cost growth (%)
                <NumberField
                  type="number"
                  min={-25}
                  max={25}
                  step={0.5}
                  value={settings.expenseGrowth}
                  onChange={(e) =>
                    onAssumptionsChange({
                      ...settings,
                      expenseGrowth: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
                Additional portfolio fee (%)
                <NumberField
                  type="number"
                  min={0}
                  max={10}
                  step={0.05}
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                />
              </label>
              <label className="flex flex-col gap-2 text-[11px] text-(--ui-text-b9c5d9) mt-4.25">
                Shortfall borrowing APR (%)
                <NumberField
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={borrowingApr}
                  onChange={(e) => setBorrowingApr(Number(e.target.value))}
                />
              </label>
              <p className="text-(--ui-text-8b9ab1) text-[11px] mt-3 mb-0 leading-[1.6]">
                Growth is nominal and applied annually. Income continues through the
                horizon; retirement withdrawals are not modeled. The additional fee is
                separate from costs already reflected in adjusted fund prices.
              </p>
            </div>
          </details>
        </>
      )}
      {simulationType !== 'debt' && (
        <label className="flex items-center justify-between gap-2.5 mt-5 text-[11px] cursor-pointer">
          <span>
            Adjust for inflation<small className="block text-(--ui-text-7f91ac) text-[9px] mt-1">{inflationRate}% annually · today’s purchasing power</small>
          </span>
          <input
            type="checkbox"
            className="accent-brand w-4 h-4"
            checked={inflation}
            disabled={inflationRate === 0}
            onChange={(e) => {
              setLoading(true);
              setError('');
              setInflation(e.target.checked);
            }}
          />
        </label>
      )}
      {simulationType === 'debt' && (
        <div className="flex flex-col gap-2 mt-4.5">
          {(['avalanche', 'snowball'] as const).map((s) => (
            <button
              key={s}
              className={`text-left p-[10px_12px] rounded-[7px] border transition-colors cursor-pointer ${
                strategy === s
                  ? 'border-(--ui-border-a78bfa) bg-(--ui-surface-2a2440)'
                  : 'border-(--ui-border-354259) bg-(--ui-surface-182233) hover:border-(--ui-border-4f6080)'
              }`}
              onClick={() => setStrategy(s)}
            >
              <strong className="block text-[11px] text-text font-semibold">{s === 'avalanche' ? 'Avalanche' : 'Snowball'}</strong>
              <small className="block text-[10px] text-(--ui-text-97a5bd) mt-1">
                {s === 'avalanche' ? 'Highest APR first' : 'Smallest balance first'}
              </small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
