import { dollars } from '../common/finance';
import type { SimulationResult, SimulationType } from './simulation-types';

interface SimulationMarketDataProps {
  simulationType: SimulationType;
  forecast?: SimulationResult | null;
  onOpenCoach?: (question?: string) => void;
  exportForecastJson: () => void;
}

export function SimulationMarketData({
  simulationType,
  forecast,
  onOpenCoach,
  exportForecastJson,
}: SimulationMarketDataProps) {
  if (simulationType === 'debt' || !forecast?.market_data) {
    return null;
  }

  const { market_data: marketData } = forecast;

  return (
    <>
      <section
        className={`rounded-[10px] p-4.25 border ${
          marketData.status === 'fallback'
            ? 'border-(--ui-border-6a5535) bg-(--ui-surface-30291b55)'
            : 'border-(--ui-border-365b54) bg-(--ui-surface-182f2b60)'
        }`}
      >
        <div className="text-[8px] text-(--ui-text-87bea9) mb-2.25 font-semibold tracking-wider">DATA BEHIND THE MODEL</div>
        <h3 className="text-sm font-semibold text-(--ui-text-c1e3d5) m-0">
          {['historical', 'stale_history'].includes(marketData.status)
            ? 'Free historical calibration'
            : marketData.status === 'manual'
              ? 'User-edited calibration'
              : 'Default asset calibration'}
        </h3>
        <p className="text-(--ui-text-9eb9ad) text-[11px] mt-1.5 mb-3 leading-[1.6]">
          {marketData.status === 'manual'
            ? 'Configured directly in the scenario panel.'
            : marketData.status === 'fallback'
              ? 'Using conservative long-term baseline estimates.'
              : `Calibrated with ${marketData.observations} historical data points.`}
        </p>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-(--ui-text-7a988d) block text-[10px]">Return</span>
            <strong className="text-(--ui-text-e7f5ef)">{marketData.annual_return}%</strong>
          </div>
          <div>
            <span className="text-(--ui-text-7a988d) block text-[10px]">Volatility</span>
            <strong className="text-(--ui-text-e7f5ef)">{marketData.annual_volatility}%</strong>
          </div>
        </div>
      </section>

      {forecast.ending_distribution && forecast.ending_distribution.length > 0 && (
        <section className="mt-5">
          <div className="text-[8px] text-(--ui-text-889ab6) mb-1.5 font-semibold tracking-wider">OUTCOME DISTRIBUTION</div>
          <h3 className="text-sm font-semibold text-text mb-3 mt-0">Final year range</h3>
          <div className="space-y-1.5">
            {forecast.ending_distribution.map((bucket, index) => (
              <div key={index} className="flex items-center justify-between text-[11px] text-(--ui-text-a0b0c6)">
                <span>{dollars(bucket.lower)} – {dollars(bucket.upper)}</span>
                <span className="font-mono text-text">{Math.round(bucket.share * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        {onOpenCoach && (
          <button
            type="button"
            className="text-xs text-primary hover:underline cursor-pointer bg-transparent border-0 p-0"
            onClick={() => onOpenCoach('Can you explain these simulation results?')}
          >
            Ask AI Coach about this result
          </button>
        )}
        <button
          type="button"
          className="text-xs text-muted hover:text-text cursor-pointer bg-transparent border-0 p-0"
          onClick={exportForecastJson}
        >
          Export JSON
        </button>
      </div>
    </>
  );
}
