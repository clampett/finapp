import { coachModels, coachPresets } from './scenarioCoach';
import type { CoachModel, CoachPreset, CoachSettings, coachInputs } from './scenarioCoach';
import { CoachMarket } from './CoachMarket';

export type MarketAssumption = { symbol: string; volatility: number; date: string };
interface Props {
  copy: boolean;
  hasGraph: boolean;
  chooseScenario: (useCopy: boolean) => void;
  model: CoachModel;
  years: number;
  preset: CoachPreset;
  settings: CoachSettings;
  change: (next: {
    model?: CoachModel;
    years?: number;
    preset?: CoachPreset;
    settings?: CoachSettings;
  }) => void;
  busy: boolean;
  inputs: ReturnType<typeof coachInputs>;
  checks: string[];
  compare: () => void;
  error: string;
  market: MarketAssumption | null;
  setMarket: (value: MarketAssumption | null) => void;
}
const field = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text';
const button =
  'cursor-pointer rounded-lg border border-border px-3 py-2 text-xs hover:bg-hover-bg aria-pressed:border-active-border aria-pressed:bg-active-bg aria-pressed:text-active-text disabled:opacity-40';

export function CoachLab(props: Props) {
  const { settings, inputs } = props;
  const controls: {
    key: keyof CoachSettings;
    label: string;
    min: number;
    max: number;
    step: number;
    scale: number;
    suffix: string;
  }[] = [
    {
      key: 'annualReturn',
      label: 'Annual return assumption',
      min: -5,
      max: 15,
      step: 0.5,
      scale: 100,
      suffix: '%',
    },
    {
      key: 'inflation',
      label: 'Annual inflation',
      min: 0,
      max: 10,
      step: 0.5,
      scale: 100,
      suffix: '%',
    },
    {
      key: 'fee',
      label: 'Annual investment fees',
      min: 0,
      max: 3,
      step: 0.1,
      scale: 100,
      suffix: '%',
    },
    {
      key: 'investmentRate',
      label: 'Unallocated surplus invested',
      min: 0,
      max: 100,
      step: 5,
      scale: 1,
      suffix: '%',
    },
    {
      key: 'target',
      label: 'Target in today’s USD',
      min: 100000,
      max: 2000000,
      step: 50000,
      scale: 1,
      suffix: '',
    },
  ];
  return (
    <section
      className="rounded-2xl border border-border bg-surface p-5 sm:p-6"
      aria-labelledby="coach-lab"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="coach-lab" className="m-0 text-xl font-semibold text-text">
            Build a what-if
          </h3>
          <p className="mb-0 mt-1 text-sm text-muted">
            Change one assumption. Follow the effect through your plan.
          </p>
        </div>
        <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
          {props.copy ? 'Scenario copy' : 'Sample data'}
        </span>
      </div>
      <fieldset disabled={props.busy} className="m-0 min-w-0 space-y-6 border-0 p-0">
        <div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              aria-pressed={!props.copy}
              onClick={() => props.chooseScenario(false)}
            >
              Sample scenario
            </button>
            {props.hasGraph && (
              <button
                type="button"
                className={button}
                aria-pressed={props.copy}
                onClick={() => props.chooseScenario(true)}
              >
                Use a copy of my scenario
              </button>
            )}
          </div>
          <p className="mb-0 mt-2 text-xs text-muted">
            {props.copy
              ? 'Using a snapshot of active nodes, routes and assumptions from your graph.'
              : 'Explore freely with synthetic income, expenses, cash and investments.'}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-muted">
            Forecast model
            <select
              className={field}
              value={props.model}
              onChange={(event) => props.change({ model: event.target.value as CoachModel })}
            >
              {Object.entries(coachModels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            Time horizon
            <select
              className={field}
              value={props.years}
              onChange={(event) => props.change({ years: Number(event.target.value) })}
            >
              {[5, 10, 20, 30, 40, 50].map((year) => (
                <option key={year} value={year}>
                  {year} years
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(coachPresets).map(([key, choice]) => (
            <button
              key={key}
              type="button"
              aria-pressed={props.preset === key}
              onClick={() => props.change({ preset: key as CoachPreset })}
              className={`cursor-pointer rounded-xl border p-3 text-left transition-colors ${
                props.preset === key
                  ? 'border-active-border bg-active-bg text-active-text'
                  : 'border-border bg-raised text-text hover:bg-hover-bg'
              }`}
            >
              <strong className="block text-sm">{choice.title}</strong>
              <span className="mt-1 block text-xs leading-relaxed text-muted">
                {choice.description}
              </span>
            </button>
          ))}
        </div>
        <div className="rounded-xl border border-border bg-raised p-4">
          <label className="block text-sm text-text" htmlFor="coach-intensity">
            Stress intensity
            <span className="float-right text-xs text-muted">
              {settings.intensity === 0.5
                ? 'Mild'
                : settings.intensity === 1
                  ? 'Standard'
                  : 'Severe'}
            </span>
          </label>
          <input
            id="coach-intensity"
            type="range"
            min={0.5}
            max={1.5}
            step={0.5}
            className="mt-3 w-full accent-primary"
            value={settings.intensity}
            onChange={(event) =>
              props.change({ settings: { ...settings, intensity: Number(event.target.value) } })
            }
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
            <span className="text-muted">{coachPresets[props.preset].title}</span>
            <strong className="tabular-nums text-active-text">
              {inputs.before} → {inputs.after}
            </strong>
          </div>
        </div>
        <details className="rounded-xl border border-border p-4 text-sm text-text">
          <summary className="cursor-pointer font-medium">Tune the baseline & goal</summary>
          <div className="mt-4 space-y-4">
            {controls.map((control) => (
              <label key={control.key} className="block text-xs text-muted">
                {control.label}
                <strong className="float-right text-text">
                  {control.key === 'target'
                    ? new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        maximumFractionDigits: 0,
                      }).format(settings[control.key])
                    : (settings[control.key] * control.scale).toFixed(1) + control.suffix}
                </strong>
                <input
                  aria-label={control.label}
                  type="range"
                  className="mt-3 w-full accent-primary"
                  min={control.min}
                  max={control.max}
                  step={control.step}
                  value={settings[control.key] * control.scale}
                  onChange={(event) =>
                    props.change({
                      settings: {
                        ...settings,
                        [control.key]: Number(event.target.value) / control.scale,
                      },
                    })
                  }
                />
              </label>
            ))}
            <p className="m-0 text-xs text-muted">
              Both forecasts use the same baseline and goal. Results are shown in today’s dollars.
            </p>
          </div>
        </details>
        {!!props.checks.length && (
          <details className="text-xs text-muted">
            <summary className="cursor-pointer">Scenario checks · {props.checks.length}</summary>
            <ul className="space-y-2 pl-4">
              {props.checks.map((check) => (
                <li key={check}>{check}</li>
              ))}
            </ul>
          </details>
        )}
        <button
          type="button"
          onClick={props.compare}
          disabled={!inputs.changed}
          className="w-full cursor-pointer rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-fg disabled:opacity-40"
        >
          {props.busy ? 'Comparing the two paths…' : 'Run this comparison →'}
        </button>
        {!inputs.changed && (
          <p className="m-0 text-xs text-muted">
            This input is already at its limit. Try a different stress test.
          </p>
        )}
      </fieldset>
      {props.error && (
        <p role="alert" className="mt-3 text-sm text-coral">
          {props.error}
        </p>
      )}
      <details className="mt-5 text-sm text-muted">
        <summary className="cursor-pointer">Use historical benchmark volatility</summary>
        <div className="mt-3">
          <CoachMarket disabled={props.busy} selected={props.market} onSelect={props.setMarket} />
        </div>
      </details>
    </section>
  );
}
