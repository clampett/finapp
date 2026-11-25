export type PulseFailure =
  | 'busy'
  | 'offline'
  | 'timeout'
  | 'invalid_response'
  | 'rate_limit'
  | 'updating'
  | 'changed'
  | 'unavailable';
const messages: Record<PulseFailure, string> = {
  busy: 'Local AI is answering another request. Try again in a moment.',
  offline: 'Local AI is not ready yet. Try again shortly.',
  timeout: 'That suggestion took too long. Please try again.',
  invalid_response: 'AI could not finish a usable suggestion. Please try again.',
  rate_limit: 'Please wait a few minutes before requesting another suggestion.',
  updating: 'AI Pulse is updating. Restart FinApp once, then try again.',
  changed: 'Your scenario changed. Generate a fresh suggestion.',
  unavailable: 'The AI could not complete this request. Please try again.',
};
// Distinguished connection, capacity, and response failures instead of calling every error an offline model.
export function pulseFailure(status: number, code?: unknown): PulseFailure {
  if ([401, 403, 404].includes(status)) return 'updating';
  if (status === 429) return 'rate_limit';
  return typeof code === 'string' && Object.hasOwn(messages, code)
    ? (code as PulseFailure)
    : 'unavailable';
}
export const pulseFailureMessage = (reason: PulseFailure) => messages[reason];
