import { API_BASE } from '../common/finance';
import { sessionHeaders } from '../common/session';
import type { SimulationResult } from '../simulation/simulation-types';

export type RunKind = 'monte_carlo' | 'markov';
export interface RunSummary {
  id: string;
  title: string;
  kind: RunKind;
  createdAt: string;
  years: number;
  p10: number;
  p50: number;
  p90: number;
}
export interface SavedRun {
  summary: RunSummary;
  inputs: Record<string, unknown>;
  result: SimulationResult;
}
export interface RunPage {
  items: RunSummary[];
  total: number;
  page: number;
  size: number;
}
export interface RunOwner {
  userId: number;
  demo: boolean;
}
const key = (owner: RunOwner) => `finapp-simulation-history-v1:demo:${owner.userId}`;
export const modelName = (kind: RunKind) =>
  kind === 'monte_carlo' ? 'Monte Carlo' : 'Markov regime';

export function validRun(value: unknown): value is SavedRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as SavedRun,
    summary = run.summary;
  if (
    !summary ||
    !['monte_carlo', 'markov'].includes(summary.kind) ||
    typeof summary.id !== 'string' ||
    typeof summary.title !== 'string' ||
    summary.title.length > 100 ||
    !Number.isFinite(Date.parse(summary.createdAt)) ||
    !run.inputs ||
    run.result?.model_version !== 3 ||
    run.result.status !== 'success'
  )
    return false;
  const points = run.result[summary.kind];
  const last = Array.isArray(points) ? points.at(-1) : undefined;
  // Revalidated browser snapshots before exposing them to charts, comparisons, and exports.
  return (
    Number.isInteger(summary.years) &&
    summary.years >= 1 &&
    summary.years <= 50 &&
    run.inputs.years === summary.years &&
    run.inputs.sim_type === summary.kind &&
    JSON.stringify(run.inputs) === JSON.stringify(run.result.inputs) &&
    summary.p10 === last?.p10 &&
    summary.p50 === last?.p50 &&
    summary.p90 === last?.p90 &&
    Array.isArray(points) &&
    points.length === summary.years + 1 &&
    points.every(
      (point, index) =>
        point.year === index &&
        [point.p10, point.p50, point.p90, point.reference].every(Number.isFinite) &&
        point.p10 <= point.p50 &&
        point.p50 <= point.p90,
    ) &&
    [summary.p10, summary.p50, summary.p90].every(Number.isFinite)
  );
}

function readDemo(owner: RunOwner): SavedRun[] {
  const raw = localStorage.getItem(key(owner));
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value))
    throw new Error(
      'Demo history could not be read. Browser storage contains an invalid history record.',
    );
  return value.filter(validRun).slice(0, 20);
}

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}/simulation-runs${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...sessionHeaders() },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      response.status === 401 || response.status === 403
        ? 'Your session expired. Sign in again to access saved runs.'
        : body?.message || body?.detail || `Saved runs are unavailable (${response.status}).`,
    );
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function listRuns(owner: RunOwner, page = 0, signal?: AbortSignal): Promise<RunPage> {
  if (!owner.demo) return api(`?page=${page}&size=12`, { signal });
  const rows = readDemo(owner).sort((a, b) =>
    b.summary.createdAt.localeCompare(a.summary.createdAt),
  );
  return {
    items: rows.slice(page * 12, page * 12 + 12).map((run) => run.summary),
    total: rows.length,
    page,
    size: 12,
  };
}
export async function getRun(owner: RunOwner, id: string, signal?: AbortSignal): Promise<SavedRun> {
  const run = owner.demo
    ? readDemo(owner).find((item) => item.summary.id === id)
    : await api<SavedRun>(`/${encodeURIComponent(id)}`, { signal });
  if (!validRun(run))
    throw new Error('This saved run is unavailable or has an unsupported result format.');
  return run;
}
export async function saveRun(
  owner: RunOwner,
  title: string,
  kind: RunKind,
  forecast: SimulationResult,
): Promise<SavedRun> {
  const name = title.trim();
  if (!name || name.length > 100) throw new Error('Use a run name between 1 and 100 characters.');
  if (!forecast.inputs) throw new Error('Run a fresh simulation before saving it.');
  // Copied the completed response, never the controls currently being edited or a later graph draft.
  const run: SavedRun = JSON.parse(
    JSON.stringify({
      summary: {
        id: crypto.randomUUID(),
        title: name,
        kind,
        createdAt: new Date().toISOString(),
        years: forecast.inputs.years,
        p10: forecast[kind]?.at(-1)?.p10,
        p50: forecast[kind]?.at(-1)?.p50,
        p90: forecast[kind]?.at(-1)?.p90,
      },
      inputs: forecast.inputs,
      result: forecast,
    }),
  );
  if (!validRun(run)) throw new Error('Wait for a complete forecast before saving.');
  if (!owner.demo)
    return api('', {
      method: 'POST',
      body: JSON.stringify({ title: name, kind, inputs: run.inputs, result: run.result }),
    });
  const rows = readDemo(owner);
  if (rows.length >= 20)
    throw new Error('Demo history holds 20 runs. Delete one before saving another.');
  try {
    localStorage.setItem(key(owner), JSON.stringify([run, ...rows]));
  } catch {
    throw new Error(
      'Browser storage is full or unavailable. Export this result or delete an older demo run.',
    );
  }
  return run;
}
export async function renameRun(owner: RunOwner, id: string, title: string) {
  const name = title.trim();
  if (!name || name.length > 100) throw new Error('Use a run name between 1 and 100 characters.');
  if (!owner.demo)
    return api<RunSummary>(`/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: name }),
    });
  const rows = readDemo(owner),
    run = rows.find((item) => item.summary.id === id);
  if (!run) throw new Error('Saved run not found.');
  run.summary.title = name;
  localStorage.setItem(key(owner), JSON.stringify(rows));
  return run.summary;
}
export async function deleteRun(owner: RunOwner, id: string) {
  if (!owner.demo) return api<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  localStorage.setItem(
    key(owner),
    JSON.stringify(readDemo(owner).filter((item) => item.summary.id !== id)),
  );
}
