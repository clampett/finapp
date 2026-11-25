import type { PulseContext } from './pulse-models';
import { pulseFailure, pulseFailureMessage } from './pulse-insight-status';
export interface PulseInsight {
  action: string;
  message: string;
  source: 'local_ai';
}
export class PulseRequestError extends Error {}
const actions = ['cashflow', 'diversification', 'forecast', 'assumptions', 'explore'];
function validMessage(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !!value.trim() &&
    value.length <= 240 &&
    // Rejected control characters explicitly while allowing ordinary prose and percentile labels.
    ![...value].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) &&
    !/[\d$€£%<>]|https?:|\b(buy|sell|guarantee|risk.free|rebalance)\b/i.test(
      value.replace(/\bP(?:10|50|90)\b/gi, '').replace(/\b(?:5|10|20|30|40|50)[ -]years?\b/gi, ''),
    ) &&
    !/\b(?:spread(?:ing)?|diversif(?:y|ying))\s+(?:your\s+)?(?:investments|portfolio|holdings)\b/i.test(
      value,
    )
  );
}

export function createPulseRequester({
  request = fetch,
  now = Date.now,
}: { request?: typeof fetch; now?: () => number } = {}) {
  const legacyAttempts = new Map<string, { at: number; count: number }>();
  return async (
    context: PulseContext,
    signal: AbortSignal,
    owner: string,
  ): Promise<PulseInsight> => {
    let response = await request('/api/v1/coach/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
      signal,
    });
    if ([401, 403, 404].includes(response.status)) {
      // Reused the working model-backed chat route when an older running gateway did not yet expose Pulse.
      // Retained a separate client attempt budget in addition to chat's existing server limits.
      let budget = legacyAttempts.get(owner);
      if (!budget || now() - budget.at >= 300000) budget = { at: now(), count: 0 };
      if (budget.count >= 3) throw new PulseRequestError(pulseFailureMessage('rate_limit'));
      if (legacyAttempts.size >= 32 && !legacyAttempts.has(owner))
        legacyAttempts.delete(legacyAttempts.keys().next().value!);
      budget.count++;
      legacyAttempts.set(owner, budget);
      response = await request('/api/v1/coach/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          topic: 'conversation',
          context: { subject: 'nextExperiment', market: false },
          question: `Suggest one hypothetical FinApp experiment in one short sentence under thirty words. Signals: cash flow ${context.cashflow}; concentration ${context.concentration}; saved forecast ${context.forecast}. No amounts or advice to change real investments.`,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new PulseRequestError(pulseFailureMessage(pulseFailure(response.status, body?.code)));
      }
      const body = await response.json();
      // Retained an actual generated sentence; never substituted a built-in guide or invented a model response.
      const message =
        typeof body.answer === 'string'
          ? body.answer.trim().match(/^[\s\S]{1,240}?(?:[.!?](?=\s|$)|$)/)?.[0]
          : null;
      if (!validMessage(message))
        throw new PulseRequestError(pulseFailureMessage('invalid_response'));
      return {
        source: 'local_ai',
        message,
        action:
          context.cashflow === 'shortfall'
            ? 'cashflow'
            : context.forecast !== 'none'
              ? 'forecast'
              : 'assumptions',
      };
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new PulseRequestError(pulseFailureMessage(pulseFailure(response.status, body?.code)));
    }
    const data = await response.json();
    if (data.source !== 'local_ai' || !actions.includes(data.action) || !validMessage(data.message))
      throw new PulseRequestError(pulseFailureMessage('invalid_response'));
    return data;
  };
}
export const requestPulseInsight = createPulseRequester();
