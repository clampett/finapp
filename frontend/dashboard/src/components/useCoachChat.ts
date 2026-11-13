import { useEffect, useRef, useState } from 'react';
import {
  coachConversationSubject,
  coachReply,
  coachRequestForQuestion,
  liveCoachReply,
} from '../scenarioCoach';
import type {
  CoachAnswer,
  CoachComparison,
  CoachPreset,
  CoachTopic,
  CoachTurn,
} from '../scenarioCoach';

export interface CoachChatEntry {
  id: number;
  question: string;
  answer: string;
  source: string;
  subject?: CoachTopic;
  modelAnswer?: string;
  sources?: CoachAnswer['sources'];
}

export function useCoachChat(result: CoachComparison | null, preset: CoachPreset, years: number) {
  const [question, setQuestion] = useState('');
  const [chat, setChat] = useState<CoachChatEntry[]>([]);
  const [localState, setLocalState] = useState('checking');
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [useMarket, setUseMarket] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(false);
  const chatRequest = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    // Bounded the status request and bypassed cached responses after a local restart.
    fetch('/api/v1/coach/status', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2500)]),
      cache: 'no-store',
    })
      .then(async (response) => {
        const status = response.ok ? await response.json() : null;
        const state = status && status.contract !== 5 ? 'outdated' : status?.state;
        if (controller.signal.aborted) return;
        // Rejected older gateway responses before enabling local inference.
        setLocalState(['ready', 'model_missing', 'outdated'].includes(state) ? state : 'offline');
      })
      .catch(() => {
        if (!controller.signal.aborted) setLocalState('offline');
      });
    return () => controller.abort();
  }, [statusAttempt]);
  useEffect(() => {
    // Rechecked readiness while the launcher downloaded the model in the background.
    if (localState === 'checking') return;
    const timer = setTimeout(
      () => setStatusAttempt((attempt) => attempt + 1),
      localState === 'ready' ? 60000 : 10000,
    );
    return () => clearTimeout(timer);
  }, [localState, statusAttempt]);
  useEffect(() => () => chatRequest.current?.abort(), []);

  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(false), 60000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function stop() {
    if (!chatRequest.current) return;
    chatRequest.current?.abort();
    chatRequest.current = null;
    setAsking(false);
    setChat((entries) =>
      entries.map((entry) =>
        entry.source === 'Thinking…'
          ? { ...entry, source: 'Stopped', answer: 'Reply stopped.' }
          : entry,
      ),
    );
  }
  function resetChat() {
    // Cancelled pending inference so an older answer could not reappear after clearing chat.
    stop();
    setChat([]);
    setQuestion('');
    setError('');
  }
  async function ask(value: string) {
    const text = value.trim().slice(0, 400);
    if (!text || chatRequest.current || cooldown) return;
    const controller = new AbortController();
    chatRequest.current = controller;
    setAsking(true);
    setQuestion('');
    setError('');
    const id = ++sequence.current;
    const previousSubject = chat.findLast((entry) => entry.subject)?.subject;
    const subject = coachConversationSubject(text, previousSubject, result);
    const input = coachRequestForQuestion(text, result, previousSubject);
    // Used recent original AI prose without forwarding browser-added account or result summaries.
    const history: CoachTurn[] = chat
      .filter((entry) => entry.modelAnswer)
      .slice(-2)
      .flatMap((entry) => [
        { role: 'user' as const, content: entry.question },
        { role: 'assistant' as const, content: entry.modelAnswer! },
      ]);
    while (history.reduce((size, turn) => size + turn.content.length, 0) > 3800)
      history.splice(0, 2);
    input.history = history;
    input.context.settings = { preset, years };
    input.context.market =
      useMarket &&
      (subject === 'markets' ||
        /\b(news|headline|briefing|market trends?)\b|\b(markets?|stocks?|economy|rates)\b.*\b(today|recent|latest|this week)\b/i.test(
          text,
        ));
    // Kept messages in memory and limited the transcript to the latest exchanges.
    setChat((entries) => [
      ...entries.slice(-19),
      { id, question: text, answer: '', source: 'Thinking…', subject },
    ]);
    let answer = '';
    let modelAnswer: string | undefined;
    let sources: CoachAnswer['sources'];
    let source = 'FinApp guide';
    try {
      // Tried Ollama first while local AI was enabled, even if the status check was pending.
      if (liveEnabled && localState !== 'outdated') {
        const generated = await liveCoachReply(input, controller.signal);
        if (generated) {
          answer = generated.answer;
          modelAnswer = answer;
          sources = generated.sources;
          source = 'Local AI · Ollama';
          // Appended verified figures in the browser without sending them to the model.
          if (subject === 'comparison' && result)
            answer += `\n\n**Your comparison.** ${coachReply('What changed in my comparison?', result)}`;
        } else source = 'FinApp guide · local answer unavailable';
      }
    } catch (failure) {
      if (controller.signal.aborted) return;
      source = 'FinApp guide · local answer unavailable';
      if (failure instanceof Error && /wait a minute/.test(failure.message)) {
        setCooldown(true);
        setError(failure.message);
      }
    } finally {
      if (chatRequest.current === controller) {
        chatRequest.current = null;
        setAsking(false);
      }
    }
    if (controller.signal.aborted) return;
    // Preserved the built-in answer when the gateway rejected a model response.
    answer ||= coachReply(text, result, previousSubject);
    setChat((entries) =>
      entries.map((entry) =>
        entry.id === id ? { ...entry, answer, modelAnswer, sources, source } : entry,
      ),
    );
  }
  return {
    question,
    setQuestion,
    chat,
    asking,
    ask,
    stop,
    resetChat,
    localState,
    retry: () => setStatusAttempt((attempt) => attempt + 1),
    liveEnabled,
    setLiveEnabled,
    useMarket,
    setUseMarket,
    error,
    cooldown,
  };
}
