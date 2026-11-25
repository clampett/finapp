import type { GraphData } from '../common/finance';

export const PULSE_UPDATED = 'finapp-pulse-updated';
// Published scoped in-browser updates without adding network polling or copying account data to a server.
export function notifyPulseUpdate(key: string, graph?: GraphData) {
  if (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent !== 'undefined'
  )
    window.dispatchEvent(new CustomEvent(PULSE_UPDATED, { detail: { key, graph } }));
}
export const runPulseKey = (id: number, demo: boolean) =>
  `finapp-simulation-history-v1:${demo ? 'demo' : 'user'}:${id}`;
