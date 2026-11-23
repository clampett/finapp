import { useEffect, useRef, useState } from 'react';
import type { PulseContext } from './pulse-models';
import { pulseFailureMessage } from './pulse-insight-status';
import { requestPulseInsight, PulseRequestError } from './pulse-request';
import type { PulseInsight } from './pulse-request';
const cache = new Map<string, { at: number; data: PulseInsight }>();
export function usePulseInsight(context: PulseContext, owner: string) {
  const key = owner + ':' + JSON.stringify(context);
  const [snapshot, setSnapshot] = useState<{
    key: string;
    insight: PulseInsight | null;
    busy: boolean;
    message: string;
  }>({ key, insight: null, busy: false, message: '' });
  const active = useRef<{ key: string; controller: AbortController } | null>(null);
  // Cancelled outdated suggestions and derived an empty view immediately after a context change.
  useEffect(
    () => () => {
      if (active.current?.key === key) {
        active.current.controller.abort();
        active.current = null;
      }
    },
    [key],
  );
  async function suggest() {
    if (active.current?.key === key) return;
    active.current?.controller.abort();
    const saved = cache.get(key);
    if (saved && Date.now() - saved.at < 600000) {
      setSnapshot({ key, insight: saved.data, busy: false, message: '' });
      return;
    }
    const controller = new AbortController();
    active.current = { key, controller };
    setSnapshot({ key, insight: null, busy: true, message: '' });
    try {
      // Sent only qualitative flags on an explicit click; never scheduled background LLM calls.
      const data = await requestPulseInsight(
        context,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]),
        owner,
      );
      if (controller.signal.aborted) return;
      if (cache.size >= 16 && !cache.has(key)) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), data });
      setSnapshot({ key, insight: data, busy: false, message: '' });
    } catch (error) {
      if (!controller.signal.aborted)
        setSnapshot({
          key,
          insight: null,
          busy: false,
          message:
            error instanceof Error && error.name === 'TimeoutError'
              ? pulseFailureMessage('timeout')
              : error instanceof TypeError
                ? pulseFailureMessage('unavailable')
                : error instanceof PulseRequestError
                  ? error.message
                  : pulseFailureMessage('invalid_response'),
        });
    } finally {
      if (active.current?.controller === controller) active.current = null;
    }
  }
  return {
    ...(snapshot.key === key
      ? snapshot
      : {
          insight: null,
          busy: false,
          message: snapshot.busy ? pulseFailureMessage('changed') : '',
        }),
    suggest,
  };
}
