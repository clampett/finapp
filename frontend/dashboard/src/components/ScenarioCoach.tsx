import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE, dollars, money } from '../finance';
import type { GraphData } from '../finance';
import {
  coachChecks,
  coachConversationSubject,
  coachInputs,
  coachModels,
  coachPresets,
  coachReply,
  liveCoachReply,
  coachRequestForQuestion,
  prepareCoachScenario,
  runCoachComparison,
  sampleScenario,
} from '../scenarioCoach';
import type { CoachComparison, CoachModel, CoachPreset, CoachTopic } from '../scenarioCoach';

type ChatEntry = { question: string; answer: string; source: string; subject?: CoachTopic };

const panel = 'min-w-0 rounded-xl border border-border bg-surface p-5 sm:p-6';
const field = 'w-full rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text';
const secondary =
  'cursor-pointer rounded-lg border border-border bg-raised px-3 py-2 text-sm text-text hover:bg-hover-bg disabled:opacity-50';
// Exposed common prompts for experiment planning, result interpretation, and model explanations.
const prompts = [
  'What should I try next?',
  'What changed in my comparison?',
  'How does Monte Carlo work?',
];
const probability = (value: number) => `${(value * 100).toFixed(1)}%`;

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
  const [result, setResult] = useState<CoachComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<ChatEntry[]>([]);
  const [localState, setLocalState] = useState<
    'checking' | 'ready' | 'model_missing' | 'offline' | 'outdated'
  >('checking');
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [marketAssumption, setMarketAssumption] = useState<{
    symbol: string;
    volatility: number;
    date: string;
  } | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [asking, setAsking] = useState(false);
  const chatRequest = useRef<AbortController | null>(null);
  const request = useRef<AbortController | null>(null);
  const thread = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    // Bounded the status request and bypassed cached responses after a local restart.
    fetch('/api/v1/coach/status', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
      cache: 'no-store',
    })
      .then(async (response) => {
        const status = response.ok ? await response.json() : null;
        const state = status && status.contract !== 4 ? 'outdated' : status?.state;
        if (controller.signal.aborted) return;
        // Rejected older gateway responses before enabling local inference.
        setLocalState(
          state === 'ready' || state === 'model_missing' || state === 'outdated'
            ? state
            : 'offline',
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocalState('offline');
      });
    return () => controller.abort();
  }, [statusAttempt]);
  useEffect(() => {
    // Rechecked readiness while the launcher downloaded the model in the background.
    if (localState === 'ready' || localState === 'checking') return;
    const timer = setTimeout(() => setStatusAttempt((attempt) => attempt + 1), 10000);
    return () => clearTimeout(timer);
  }, [localState, statusAttempt]);
  useEffect(
    () => () => {
      request.current?.abort();
      chatRequest.current?.abort();
    },
    [],
  );
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [chat]);

  const scenario = copy ?? sampleScenario;
  const inputs = coachInputs(scenario, model, years, preset, marketAssumption?.volatility);
  const checks = coachChecks(scenario);

  function clearResult() {
    setResult(null);
    setError('');
  }

  function chooseScenario(next: GraphData | null) {
    // Cleared the conversation and results when the user changed data sources.
    setCopy(next ? prepareCoachScenario(next) : null);
    clearResult();
    resetChat();
  }

  function resetChat() {
    // Cancelled pending inference so an older answer could not reappear after clearing chat.
    chatRequest.current?.abort();
    chatRequest.current = null;
    setAsking(false);
    setChat([]);
    setQuestion('');
  }

  async function compare() {
    if (request.current || !inputs.changed) return;
    clearResult();
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    // Applied the same deadline to the two forecasts so partial comparisons were never shown.
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const next = await runCoachComparison(inputs, coachPresets[preset].title, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (failure) {
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
      request.current = null;
      setBusy(false);
    }
  }

  async function ask(value: string) {
    const text = value.trim();
    if (!text || chatRequest.current) return;
    setQuestion('');
    const previousSubject = chat.findLast((entry) => entry.subject)?.subject;
    const subject = coachConversationSubject(text, previousSubject, result);
    let answer: string | null = null;
    let source = 'FinApp guide';
    // Tried Ollama first while local AI was enabled, even if the status check was pending.
    const input =
      liveEnabled && localState !== 'outdated'
        ? coachRequestForQuestion(text, result, previousSubject)
        : undefined;
    if (input) {
      const controller = new AbortController();
      chatRequest.current = controller;
      setAsking(true);
      try {
        const generated = await liveCoachReply(input, controller.signal);
        // Preserved the built-in answer when the gateway rejected a model response.
        if (generated) {
          answer = generated;
          source = 'Local AI · Ollama';
          // Appended verified figures in the browser without sending them to the model.
          if (input.topic === 'conversation' && subject === 'comparison' && result) {
            answer += `\n\n**Your comparison.** ${coachReply('What changed in my comparison?', result)}`;
          }
        } else source = 'FinApp guide · local answer unavailable';
      } catch {
        source = 'FinApp guide · local answer unavailable';
      } finally {
        if (chatRequest.current === controller) {
          chatRequest.current = null;
          setAsking(false);
        }
      }
      if (controller.signal.aborted) return;
    }
    // Kept messages in memory and limited the transcript to the latest exchanges.
    const reply = answer ?? coachReply(text, result, previousSubject);
    setChat((current) => [
      ...current.slice(-19),
      { question: text, answer: reply, source, subject },
    ]);
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void ask(question);
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
      <section className={panel} aria-labelledby="coach-lab">
        <div className="mb-5">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-active-text">
            Scenario lab
          </p>
          <h3 id="coach-lab" className="m-0 text-lg font-semibold text-text">
            Test one assumption at a time
          </h3>
          <p className="mb-0 mt-2 text-sm text-muted">
            Compare a baseline with a stress case using the same forecast model.
          </p>
        </div>
        <fieldset
          disabled={busy}
          className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-70"
        >
          <legend className="mb-2 text-sm font-medium text-text">Scenario source</legend>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondary}
              aria-pressed={!copy}
              onClick={() => chooseScenario(null)}
            >
              Sample scenario
            </button>
            {graph && (
              <button
                type="button"
                className={secondary}
                aria-pressed={!!copy}
                onClick={() => chooseScenario(graph)}
              >
                Use a copy of my scenario
              </button>
            )}
          </div>
          <p className="m-0 text-xs leading-relaxed text-muted">
            {copy
              ? 'Using a snapshot of your graph. Only its active nodes, routes, and assumptions are included. Your saved scenario is unchanged.'
              : 'Using synthetic sample data. Your financial scenario is only used if you select a copy.'}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted">
              Forecast model
              <select
                className={field}
                value={model}
                onChange={(event) => {
                  setModel(event.target.value === 'markov' ? 'markov' : 'monte_carlo');
                  clearResult();
                }}
              >
                {Object.entries(coachModels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm text-muted">
              Time horizon
              <select
                className={field}
                value={years}
                onChange={(event) => {
                  setYears(Number(event.target.value));
                  clearResult();
                }}
              >
                {[5, 10, 20, 30, 40, 50].map((value) => (
                  <option key={value} value={value}>
                    {value} years
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1 text-sm text-muted">
            Stress test
            <select
              className={field}
              value={preset}
              onChange={(event) => {
                setPreset(event.target.value as CoachPreset);
                clearResult();
              }}
            >
              {Object.entries(coachPresets).map(([value, { title }]) => (
                <option key={value} value={value}>
                  {title}
                </option>
              ))}
            </select>
          </label>
          <div className="rounded-lg border border-border bg-raised p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <strong className="text-text">{coachPresets[preset].title}</strong>
              <span className="font-semibold tabular-nums text-active-text">
                {inputs.before} → {inputs.after}
              </span>
            </div>
            <p className="mb-0 mt-1 text-xs text-muted">
              Manual return assumptions, 2.5% annual inflation, and a $500,000 target in today’s
              USD.
            </p>
            <p className="mb-0 mt-1 text-xs text-muted">
              Shared annual volatility: {probability(inputs.baseline.annual_volatility)}
              {marketAssumption
                ? ` · ${marketAssumption.symbol} history as of ${marketAssumption.date}`
                : ' · FinApp default'}
              .
            </p>
            <p className="mb-0 mt-1 text-xs text-muted">{coachPresets[preset].description}</p>
            {!inputs.changed && (
              <p className="mb-0 text-xs text-muted">
                The selected input is already at the model’s limit. Choose another stress test.
              </p>
            )}
          </div>
          {checks.length > 0 && (
            <div className="rounded-lg border border-border p-3 text-sm text-muted">
              <strong className="text-text">Before you run</strong>
              <ul className="mb-0 mt-1 list-disc pl-5">
                {checks.map((check) => (
                  <li key={check}>{check}</li>
                ))}
              </ul>
              {copy && (
                <button
                  type="button"
                  className="mt-2 cursor-pointer text-active-text underline"
                  onClick={onOpenGraph}
                >
                  Review inputs in Node Graph
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={!inputs.changed}
            onClick={() => void compare()}
            className="cursor-pointer rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-50"
          >
            {busy ? 'Running two forecasts…' : 'Run comparison'}
          </button>
        </fieldset>
        <p role="status" className="sr-only">
          {busy ? 'Running baseline and stress forecasts.' : result ? 'Comparison ready.' : ''}
        </p>
        <p className="mb-0 mt-3 text-xs text-muted">
          Comparisons use the FinApp server. A local installation can run them without internet
          access.
        </p>
        {error && (
          <p role="alert" className="mt-4 text-sm text-coral">
            {error}
          </p>
        )}
        {result && <Comparison result={result} />}
      </section>

      <div className="min-w-0 space-y-5">
        <section className={panel} aria-labelledby="coach-chat">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-active-text">
                Scenario assistant
              </p>
              <h3 id="coach-chat" className="m-0 text-lg font-semibold text-text">
                Ask FinApp
              </h3>
            </div>
            {(chat.length > 0 || asking) && (
              <button type="button" className={secondary} onClick={resetChat}>
                Clear chat
              </button>
            )}
          </div>
          <p className="mt-2 text-sm text-muted">
            Ask about a forecast, your comparison, or how to use FinApp. Ollama answers first when
            local AI is enabled. The FinApp guide is available as a fallback.
          </p>
          <details className="mb-3 rounded-lg border border-border bg-raised px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-text">
              How to read coach replies
            </summary>
            <dl className="mb-1 mt-2 space-y-2 text-muted">
              <div>
                <dt className="font-semibold text-text">Try this</dt>
                <dd className="m-0">
                  Shows which time horizon and stress test to choose for your next comparison.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text">Already set</dt>
                <dd className="m-0">
                  The time horizon and stress test you asked for match a comparison you’ve already
                  run. Use the results in the table for that setup.
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-text">Watch this metric</dt>
                <dd className="m-0">
                  Points to a row in the results table. Read across it to compare the baseline and
                  stress case. For example, a lower P10 means the downside got worse under the
                  stress assumption.
                </dd>
              </div>
            </dl>
          </details>
          <div
            ref={thread}
            role="log"
            aria-label="Conversation"
            className="max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border bg-raised p-3 text-sm"
          >
            {chat.length === 0 ? (
              <p className="m-0 leading-relaxed text-muted">
                Try a question below. Chat history stays in this tab.
              </p>
            ) : (
              chat.map((entry, index) => (
                <div key={index} className="space-y-2">
                  <p className="m-0 break-words rounded-lg bg-active-bg px-3 py-2 text-active-text">
                    <strong>You</strong> · {entry.question}
                  </p>
                  <div className="space-y-2 rounded-lg bg-surface px-3 py-2 leading-relaxed text-text">
                    <p className="m-0 text-xs font-semibold text-muted">{entry.source}</p>
                    {'\n'}
                    {entry.answer.split('\n\n').map((paragraph, part) => {
                      const heading = paragraph.match(/^\*\*(.+?)\*\* (.+)$/);
                      return (
                        <p key={part} className="m-0">
                          {heading ? (
                            <>
                              <strong>{heading[1]}</strong> {heading[2]}
                            </>
                          ) : (
                            paragraph
                          )}
                          {'\n'}
                        </p>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="my-3 flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                className={secondary}
                disabled={asking}
                onClick={() => void ask(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
          <form onSubmit={submitQuestion} className="flex gap-2">
            <input
              aria-label="Ask FinApp a question"
              className={field + ' min-w-0'}
              placeholder="Ask about a forecast…"
              maxLength={400}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
            <button type="submit" disabled={asking || !question.trim()} className={secondary}>
              Send
            </button>
          </form>
          {asking && (
            <p role="status" className="mt-2 text-xs text-muted">
              Preparing a local explanation…
            </p>
          )}
          <div className="mt-4 border-t border-border pt-3 text-xs text-muted">
            {localState === 'ready' ? (
              <label className="flex items-center gap-2 text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={liveEnabled}
                  disabled={asking}
                  onChange={(event) => setLiveEnabled(event.target.checked)}
                />
                Use local AI explanations
              </label>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p role="status" className="m-0 font-medium text-text">
                  {localState === 'checking'
                    ? 'Checking local AI…'
                    : localState === 'outdated'
                      ? 'Restart FinApp to update local AI'
                      : localState === 'model_missing'
                        ? 'Local model is being prepared or unavailable · FinApp guide available'
                        : 'Ollama is offline · FinApp guide available'}
                </p>
                <button
                  type="button"
                  className={secondary}
                  disabled={localState === 'checking'}
                  onClick={() => {
                    setLocalState('checking');
                    setStatusAttempt((attempt) => attempt + 1);
                  }}
                >
                  Check again
                </button>
              </div>
            )}
            <p className="mb-0 mt-1">
              Ollama processes questions on this computer. FinApp shares limited comparison signals
              for guidance. It never attaches account balances or exact forecast results.
            </p>
          </div>
        </section>
        <CoachMarket
          disabled={busy}
          selected={marketAssumption}
          onSelect={(value) => {
            setMarketAssumption(value);
            clearResult();
          }}
        />
      </div>
    </div>
  );
}

const benchmarks = {
  VOO: 'U.S. stocks',
  BND: 'U.S. bonds',
  VXUS: 'International stocks',
  VNQ: 'U.S. real estate',
};
type MarketAssumption = { symbol: string; volatility: number; date: string };

function CoachMarket({
  disabled,
  selected,
  onSelect,
}: {
  disabled: boolean;
  selected: MarketAssumption | null;
  onSelect: (value: MarketAssumption | null) => void;
}) {
  const [benchmark, setBenchmark] = useState<keyof typeof benchmarks>('VOO');
  const [market, setMarket] = useState<{
    symbol: string;
    price: number;
    date: string;
    closes: number[];
    volatility: number | null;
    historyStart: string | null;
    historyEnd: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // Reused the Investments quote cache for a fixed list of benchmark funds.
    const controller = new AbortController();
    fetch(`${API_BASE}/market/stocks/${benchmark}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (
          !controller.signal.aborted &&
          data.currency === 'USD' &&
          Number.isFinite(data.latest_price) &&
          data.latest_price > 0 &&
          typeof data.latest_date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(data.latest_date)
        ) {
          // Used the last 21 trading closes for a 20-session change and a compact trend line.
          const closes: unknown[] = Array.isArray(data.history)
            ? data.history.slice(-21).map((point: { close?: unknown } | null) => point?.close)
            : [];
          // Accepted volatility only within the simulator's supported range of 0% to 100%.
          setMarket({
            symbol: benchmark,
            price: data.latest_price,
            volatility:
              typeof data.annual_volatility === 'number' &&
              data.annual_volatility >= 0 &&
              data.annual_volatility <= 1
                ? data.annual_volatility
                : null,
            historyStart: typeof data.stats_start_date === 'string' ? data.stats_start_date : null,
            historyEnd: typeof data.stats_end_date === 'string' ? data.stats_end_date : null,
            date: data.latest_date,
            closes: closes.every(
              (close): close is number =>
                typeof close === 'number' && Number.isFinite(close) && close > 0,
            )
              ? closes
              : [],
          });
        }
      })
      .catch(() => {
        /* Kept the coach usable if the quote service was unavailable. */
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [benchmark]);
  const closes = market?.closes ?? [];
  // Calculated the 20-session change from 21 closes, including the starting observation.
  const change = closes.length === 21 ? (closes[20] / closes[0] - 1) * 100 : null;
  const low = Math.min(...closes);
  const spread = Math.max(...closes) - low || 1;
  // Scaled the closes into SVG coordinates without changing the displayed market values.
  const line = closes
    .map(
      (close, index) =>
        `${(index * 160) / Math.max(1, closes.length - 1)},${42 - (36 * (close - low)) / spread}`,
    )
    .join(' ');
  return (
    <section className={panel} aria-labelledby="coach-market">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-active-text">
        Market context
      </p>
      <h3 id="coach-market" className="m-0 text-base font-semibold text-text">
        Compare market benchmarks
      </h3>
      <label className="mt-3 block space-y-1 text-sm text-muted">
        Benchmark
        <select
          className={field}
          value={benchmark}
          onChange={(event) => {
            setMarket(null);
            setLoading(true);
            setBenchmark(event.target.value as keyof typeof benchmarks);
          }}
        >
          {Object.entries(benchmarks).map(([symbol, label]) => (
            <option key={symbol} value={symbol}>
              {label} · {symbol}
            </option>
          ))}
        </select>
      </label>
      {market ? (
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <strong className="text-xl tabular-nums text-text">{dollars(market.price)}</strong>
          <span className="text-xs text-muted">
            Latest adjusted close · <time dateTime={market.date}>{market.date}</time>
          </span>
        </div>
      ) : (
        <p role="status" className="mt-3 text-sm text-muted">
          {loading ? 'Loading market context…' : 'The market quote is currently unavailable.'}
        </p>
      )}
      {change !== null && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-raised px-3 py-2">
          <div>
            <p className="m-0 text-xs text-muted">20-session change</p>
            <strong className={change < 0 ? 'text-coral' : 'text-mint'}>
              {change > 0 ? '+' : ''}
              {change.toFixed(2)}%
            </strong>
          </div>
          <svg
            className={`h-10 w-36 ${change < 0 ? 'text-coral' : 'text-mint'}`}
            viewBox="-2 0 164 46"
            aria-hidden="true"
          >
            <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </div>
      )}
      {market && market.volatility !== null && (
        <div className="mt-3 space-y-2 border-t border-border pt-3 text-sm text-muted">
          <p className="m-0">
            Historical annualized volatility{' '}
            <strong className="text-text">{probability(market.volatility)}</strong>
          </p>
          {market.historyStart && market.historyEnd && (
            <p className="m-0 text-xs">
              {market.historyStart} to {market.historyEnd}
            </p>
          )}
          <button
            type="button"
            className={secondary}
            disabled={disabled}
            onClick={() => {
              if (market.volatility !== null)
                onSelect({
                  symbol: market.symbol,
                  volatility: market.volatility,
                  date: market.historyEnd ?? market.date,
                });
            }}
          >
            Use volatility in both forecasts
          </button>
        </div>
      )}
      {selected && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>{selected.symbol} volatility applied</span>
          <button
            type="button"
            className={secondary}
            disabled={disabled}
            onClick={() => onSelect(null)}
          >
            Reset to FinApp default
          </button>
        </div>
      )}
      <p className="mb-0 mt-2 text-xs text-muted">
        Yahoo Finance via FinApp’s shared cache. Historical volatility is an optional modeling
        input. Expected returns stay separate.
      </p>
    </section>
  );
}

function Comparison({ result }: { result: CoachComparison }) {
  // Presented both runs at the same horizon and kept percentages separate from dollar values.
  const delta = result.stress.median - result.baseline.median;
  const rows = [
    ['Median ending net worth (P50)', money(result.baseline.median), money(result.stress.median)],
    [
      'Downside ending net worth (P10)',
      money(result.baseline.downside),
      money(result.stress.downside),
    ],
    [
      'Chance of reaching the target',
      probability(result.baseline.targetChance),
      probability(result.stress.targetChance),
    ],
  ];
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h4 className="m-0 text-base font-semibold text-text">{result.years}-year comparison</h4>
      <p className="mt-1 text-sm text-muted">
        {delta === 0
          ? 'Median ending net worth stayed the same.'
          : `Median ending net worth was ${money(Math.abs(delta))} ${delta < 0 ? 'lower' : 'higher'} in the stress case.`}
      </p>
      <table className="w-full border-collapse text-left text-xs sm:text-sm">
        <thead className="text-muted">
          <tr>
            <th scope="col" className="py-2">
              Metric
            </th>
            <th scope="col" className="py-2 text-right">
              Baseline
            </th>
            <th scope="col" className="py-2 text-right">
              Stress case
            </th>
          </tr>
        </thead>
        <tbody className="text-text">
          {rows.map(([label, baseline, stress]) => (
            <tr key={label} className="border-t border-border">
              <th scope="row" className="py-2 pr-2 font-medium">
                {label}
              </th>
              <td className="py-2 pl-1 text-right tabular-nums">{baseline}</td>
              <td className="py-2 pl-1 text-right tabular-nums">{stress}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
