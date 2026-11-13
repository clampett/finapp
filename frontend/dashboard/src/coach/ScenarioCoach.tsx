import { useEffect, useRef, useState } from 'react';
import { money } from '../common/finance';
import type { GraphData } from '../common/finance';
import {
  coachChecks,
  coachInputs,
  coachModels,
  coachPresets,
  defaultCoachSettings,
  prepareCoachScenario,
  runCoachComparison,
  sampleScenario,
} from './scenarioCoach';
import type { CoachComparison, CoachModel, CoachPreset, CoachSettings } from './scenarioCoach';
import { CoachLab } from './CoachLab';
import type { MarketAssumption } from './CoachLab';
import { CoachBriefing } from './CoachBriefing';
import { Comparison } from './CoachComparison';
import { CoachConversation } from './CoachConversation';
import { useCoachChat } from './useCoachChat';
import { CoachNotebook } from './CoachNotebook';
import type { SavedComparison } from './CoachNotebook';

const button =
  'cursor-pointer rounded-lg border border-border px-4 py-2 text-sm text-text hover:bg-hover-bg disabled:opacity-40';
export function ScenarioCoach({
  graph,
  onOpenGraph,
}: {
  graph?: GraphData;
  onOpenGraph: () => void;
}) {
  const [copy, setCopy] = useState<GraphData | null>(null);
  const [preset, setPreset] = useState<CoachPreset>('expenses');
  const [model, setModel] = useState<CoachModel>('monte_carlo');
  const [years, setYears] = useState(20);
  const [settings, setSettings] = useState<CoachSettings>({ ...defaultCoachSettings });
  const [market, setMarket] = useState<MarketAssumption | null>(null);
  const [result, setResult] = useState<CoachComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'lab' | 'markets' | 'saved'>('lab');
  const [saved, setSaved] = useState<SavedComparison[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const request = useRef<AbortController | null>(null);
  const selected = saved.find((entry) => entry.id === selectedId) ?? saved[0];
  // Grounded notebook questions in the displayed saved run rather than the latest lab result.
  const activeResult = view === 'saved' ? (selected?.result ?? null) : result;
  const chat = useCoachChat(
    activeResult,
    activeResult?.preset ?? preset,
    activeResult?.years ?? years,
  );
  const scenario = copy ?? sampleScenario;
  // Kept both runs on the same snapshot, seed, horizon and baseline assumptions.
  const inputs = coachInputs(scenario, model, years, preset, market?.volatility, settings);
  const checks = coachChecks(scenario);
  useEffect(() => () => request.current?.abort(), []);
  function clearResult() {
    chat.stop();
    setResult(null);
    setError('');
  }
  function chooseScenario(useCopy: boolean) {
    // Cleared the conversation and results when the user changed data sources.
    setCopy(useCopy && graph ? prepareCoachScenario(graph) : null);
    clearResult();
    chat.resetChat();
  }
  function change(next: {
    model?: CoachModel;
    years?: number;
    preset?: CoachPreset;
    settings?: CoachSettings;
  }) {
    // Invalidated older results before showing controls for a different experiment.
    clearResult();
    if (next.model) setModel(next.model);
    if (next.years) setYears(next.years);
    if (next.preset) setPreset(next.preset);
    if (next.settings) setSettings(next.settings);
  }
  function chooseMarket(value: MarketAssumption | null) {
    if (request.current) return;
    clearResult();
    setMarket(value);
    setView('lab');
  }
  async function compare() {
    if (request.current || !inputs.changed) return;
    clearResult();
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    // Applied the same deadline to the two forecasts so partial comparisons were never shown.
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const next = await runCoachComparison(inputs, coachPresets[preset].title, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (failure) {
      if (request.current === controller)
        setError(
          controller.signal.aborted
            ? 'The comparison timed out. Try again.'
            : failure instanceof Error
              ? failure.message
              : 'The comparison could not be completed.',
        );
    } finally {
      // Released the request slot and stopped any sibling forecast still in flight.
      clearTimeout(timeout);
      controller.abort();
      if (request.current === controller) {
        request.current = null;
        setBusy(false);
      }
    }
  }
  function save() {
    if (!result || saved.some((entry) => entry.result === result)) return;
    // Saved immutable result snapshots in this tab only, with a small memory bound.
    setSaved((entries) =>
      [
        {
          id: Date.now(),
          result,
          assumptions: { ...settings, volatility: inputs.baseline.annual_volatility },
          description: `${copy ? 'Scenario copy' : 'Sample scenario'} · ${coachModels[model]} · ${inputs.before} to ${inputs.after} · Target ${money(settings.target)}`,
        },
        ...entries,
      ].slice(0, 4),
    );
  }
  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-border bg-surface p-5 sm:p-6">
        <p className="mb-2 mt-0 text-xs font-semibold uppercase tracking-widest text-active-text">
          AI Coach
        </p>
        <h2 className="m-0 text-2xl font-semibold text-text">Explore your next what-if</h2>
        <p className="mb-4 mt-2 text-sm text-muted">
          Test an idea, compare possible paths and talk through what you find. Your graph stays
          unchanged.
        </p>
        <nav aria-label="Coach workspace" className="flex flex-wrap gap-2">
          {(
            [
              ['lab', 'Scenario lab'],
              ['markets', 'Markets & news'],
              ['saved', `Saved comparisons (${saved.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={`${button} ${view === key ? 'border-active-border bg-active-bg text-active-text' : ''}`}
              aria-current={view === key ? 'page' : undefined}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
          <button className={`${button} sm:ml-auto`} onClick={onOpenGraph}>
            Open Node Graph
          </button>
        </nav>
      </header>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.75fr)]">
        <div className="min-w-0 space-y-5">
          {view === 'lab' && (
            <>
              <CoachLab
                copy={!!copy}
                hasGraph={!!graph}
                chooseScenario={chooseScenario}
                model={model}
                years={years}
                preset={preset}
                settings={settings}
                change={change}
                busy={busy}
                inputs={inputs}
                checks={checks}
                compare={() => void compare()}
                error={error}
                market={market}
                setMarket={chooseMarket}
              />
              {result && (
                <section className="rounded-2xl border border-border bg-surface p-5">
                  <p className="m-0 text-xs text-muted">
                    {coachModels[model]} · Target {money(settings.target)} in today’s USD
                  </p>
                  <Comparison result={result} />
                  <div className="mt-5 flex flex-wrap gap-2">
                    <button
                      className={button}
                      disabled={saved.some((entry) => entry.result === result)}
                      onClick={save}
                    >
                      Save comparison
                    </button>
                    <button
                      className={button}
                      disabled={chat.asking}
                      onClick={() =>
                        void chat.ask(
                          'Help me understand this comparison and one useful next step.',
                        )
                      }
                    >
                      Talk through my results
                    </button>
                  </div>
                </section>
              )}
              {!result && !busy && (
                <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted">
                  Start with one question: how would your plan change if expenses grew faster,
                  markets became more volatile, or you invested less? Run a comparison to see the
                  paths and ending outcomes side by side.
                </div>
              )}
            </>
          )}
          {view === 'markets' && (
            <CoachBriefing onAsk={(question) => void chat.ask(question)} onApply={chooseMarket} />
          )}
          {view === 'saved' && (
            <CoachNotebook
              saved={saved}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onRemove={(id) => setSaved((entries) => entries.filter((entry) => entry.id !== id))}
            />
          )}
          <p className="px-1 text-xs leading-relaxed text-muted">
            Educational modeling, not a prediction or a recommendation to trade. Historical prices
            and news provide context; they do not determine future returns.
          </p>
        </div>
        <CoachConversation chat={chat} />
      </div>
    </div>
  );
}
