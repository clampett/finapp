import type { SimulationResult, SimulationType } from './simulation-types';

interface SimulationMarketDataProps {
  simulationType: SimulationType;
  forecast?: SimulationResult | null;
  loading: boolean;
  onRefresh: () => void;
}

export function SimulationMarketData({
  simulationType,
  forecast,
  loading,
  onRefresh,
}: SimulationMarketDataProps) {
  if (simulationType === 'debt' || !forecast?.market_data) return null;
  // Preserved the original calibration details and converted fractional rates to display percentages.
  // Retained the refresh action so pending and stale history could still be checked after extraction.
  return (
    <section
      className={`rounded-[10px] p-4.25 border ${
        forecast.market_data.status === 'fallback'
          ? 'border-(--ui-border-6a5535) bg-(--ui-surface-30291b55)'
          : 'border-(--ui-border-365b54) bg-(--ui-surface-182f2b60)'
      }`}
    >
      <div className="text-[8px] text-(--ui-text-87bea9) mb-2.25 font-semibold tracking-wider">
        DATA BEHIND THE MODEL
      </div>
      <h3 className="text-sm font-semibold text-(--ui-text-c1e3d5) m-0">
        {['historical', 'stale_history'].includes(forecast.market_data.status)
          ? `${forecast.market_data.ticker} · ${forecast.market_data.years} years`
          : forecast.market_data.pending
            ? 'History loading'
            : 'Editable assumptions'}
      </h3>
      <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
        {forecast.market_data.source}
      </p>
      {forecast.market_data.start && (
        <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
          {forecast.market_data.start} → {forecast.market_data.end}
          <br />
          {forecast.market_data.observations} completed monthly returns
        </p>
      )}
      <dl className="text-[10px] leading-normal my-2 [&>div]:flex [&>div]:justify-between [&>div]:gap-2.25 [&>div]:mb-2.5 [&_dt]:text-(--ui-text-879bb8) [&_dd]:m-0 [&_dd]:text-right font-medium">
        <div>
          <dt>
            {forecast.market_data.return_mode === 'forward'
              ? 'Forward return assumption'
              : 'Annualized return input'}
          </dt>
          <dd>{(forecast.market_data.annual_return * 100).toFixed(2)}%</dd>
        </div>
        <div>
          <dt>Annual log-return volatility</dt>
          <dd>{(forecast.market_data.annual_volatility * 100).toFixed(2)}%</dd>
        </div>
      </dl>
      {forecast.market_data.observed_annual_return != null && (
        <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
          Observed historical mean: {(forecast.market_data.observed_annual_return * 100).toFixed(2)}
          %. Historical movements have been centered on the selected forward assumption; the past
          average is not treated as a forecast.
        </p>
      )}
      <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
        {forecast.market_data.method}
      </p>
      {forecast.market_data.regime_transitions && (
        <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
          Bull → bear: {(forecast.market_data.regime_transitions[0]![1]! * 100).toFixed(1)}%/mo ·
          Bear → bull: {(forecast.market_data.regime_transitions[1]![0]! * 100).toFixed(1)}%/mo
        </p>
      )}
      {forecast.market_data.status === 'stale_history' && (
        <p className="text-[10px] text-(--ui-text-a0b7b1) leading-[1.8] my-2.25">
          Cached history is older than 24 hours. Refresh is attempted in the background.
        </p>
      )}
      <button
        className="w-full mt-2.5 inline-flex items-center justify-center gap-1.75 whitespace-nowrap rounded-[7px] px-3.5 py-2.25 text-[11px] font-medium min-h-8.5 cursor-pointer bg-(--ui-surface-20293a) text-text border border-(--ui-border-37445c) hover:bg-(--ui-surface-hover-28354c) transition-colors disabled:opacity-45 disabled:cursor-not-allowed"
        disabled={loading}
        onClick={onRefresh}
      >
        {forecast.market_data.pending ? 'Check loaded history' : 'Refresh forecast'}
      </button>
      <small className="block text-(--ui-text-91a99f) text-[9px] leading-[1.7] mt-3">
        Free, cached data · no API key · historical performance is not a promise.
      </small>
    </section>
  );
}
