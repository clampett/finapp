import { useState } from 'react';
import { dollars, downloadJson } from '../common/finance';
import { FeatureIcon } from '../common/FeatureIcon';
import { ForecastChart } from '../simulation/ForecastChart';
import { modelName } from './run-store';
import type { SavedRun } from './run-store';

export function RunDetail({
  run,
  onRename,
  busy,
}: {
  run: SavedRun;
  onRename: (title: string) => void;
  busy: boolean;
}) {
  const [title, setTitle] = useState(run.summary.title);
  const points = run.result[run.summary.kind] ?? [];
  const real = Number(run.inputs.inflation_rate) > 0;
  const nodes = Array.isArray(run.inputs.nodes)
    ? run.inputs.nodes.filter((node) => node && typeof node === 'object')
    : [];
  return (
    <section className="history-detail" aria-labelledby="run-detail-title">
      <div className="history-detail-heading">
        <div>
          <span className="history-eyebrow">SAVED PERSPECTIVE · READ ONLY</span>
          <h2 id="run-detail-title">{run.summary.title}</h2>
          <p>
            {modelName(run.summary.kind)} · {run.summary.years} years ·{' '}
            {real ? 'Inflation adjusted' : 'Nominal USD'} · Saved{' '}
            {new Date(run.summary.createdAt).toLocaleString()}
          </p>
        </div>
        <button
          className="history-button"
          onClick={() => downloadJson(run, `finapp-run-${run.summary.id}.json`)}
        >
          <FeatureIcon name="download" />
          Export JSON
        </button>
      </div>
      <div className="history-metrics">
        {[
          ['Downside · P10', run.summary.p10],
          ['Median · P50', run.summary.p50],
          ['Upper outcome · P90', run.summary.p90],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <span>{label}</span>
            <strong>{dollars(Number(value))}</strong>
          </div>
        ))}
      </div>
      <div className="history-chart">
        <ForecastChart points={points} realDollars={real} />
      </div>
      <p className="history-explainer">
        These are the original saved results, not a new forecast. The shaded band spans P10–P90;
        more severe outcomes are possible. Editing today’s scenario does not change this run.
      </p>
      <details className="history-assumptions">
        <summary>View saved inputs and model context</summary>
        <div className="history-input-grid">
          {[
            ['Market source', run.inputs.market_source],
            [
              'Calibrated annual return',
              run.result.market_data
                ? `${(run.result.market_data.annual_return * 100).toFixed(2)}%`
                : 'Manual inputs',
            ],
            [
              'Calibrated volatility',
              run.result.market_data
                ? `${(run.result.market_data.annual_volatility * 100).toFixed(2)}%`
                : 'Manual inputs',
            ],
            ['Return basis', run.inputs.historical_return_mode],
            ['Requested annual return', `${(Number(run.inputs.annual_return) * 100).toFixed(2)}%`],
            ['Requested volatility', `${(Number(run.inputs.annual_volatility) * 100).toFixed(2)}%`],
            ['Annual fee', `${(Number(run.inputs.annual_fee) * 100).toFixed(2)}%`],
            ['Inflation', `${(Number(run.inputs.inflation_rate) * 100).toFixed(2)}%`],
            ['Target', dollars(Number(run.inputs.target))],
            ['Included accounts', nodes.length],
          ].map(([label, value]) => (
            <div key={String(label)}>
              <span>{String(label)}</span>
              <strong>{String(value ?? 'Not recorded')}</strong>
            </div>
          ))}
        </div>
        {run.result.market_data && (
          <p className="history-explainer">
            Calibration: {run.result.market_data.source} · {run.result.market_data.status}.{' '}
            {run.result.market_data.method}
          </p>
        )}
        <ul className="history-assumption-list">
          {run.result.assumptions?.map((value, index) => (
            <li key={index}>{value}</li>
          ))}
        </ul>
        <details>
          <summary>Included accounts at the time of the run</summary>
          <div className="history-account-list">
            {nodes.slice(0, 201).map((node, index) => (
              <div key={index}>
                <span>{String(node.name ?? node.type ?? 'Account')}</span>
                <strong>{dollars(Number(node.balance))}</strong>
              </div>
            ))}
          </div>
        </details>
        {!!run.result.warnings?.length && (
          <p className="history-explainer">Warnings: {run.result.warnings.join(' ')}</p>
        )}
      </details>
      <form
        className="history-rename"
        onSubmit={(event) => {
          event.preventDefault();
          onRename(title);
        }}
      >
        <label htmlFor="rename-saved-run">Run name</label>
        <input
          id="rename-saved-run"
          value={title}
          maxLength={100}
          required
          onChange={(event) => setTitle(event.target.value)}
        />
        <button
          className="history-button"
          disabled={busy || !title.trim() || title.trim() === run.summary.title}
        >
          Rename
        </button>
      </form>
    </section>
  );
}
