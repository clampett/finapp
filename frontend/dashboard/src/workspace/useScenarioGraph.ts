import { useEffect, useMemo, useState } from 'react';
import { API_BASE, activeGraph, parseGraph } from '../finance';
import type { GraphData } from '../finance';
import { newHistory, recordGraph } from '../graph-workspace';
import { clearSession, sessionHeaders } from '../session';

export function useScenarioGraph(userId: number, demo: boolean) {
  const storageKey = `finapp-scenario-v2:${demo ? 'demo' : 'user'}:${userId}`;
  // Partitioned browser drafts by demo/user and profile ID so editing one
  // example never overwrote a different account's local scenario.
  const [history, setHistory] = useState(() => newHistory({ nodes: [], edges: [] }));
  // Retained the full graph for editing and derived a view of active nodes for calculations.
  const graph = history.present;
  const live = useMemo(() => activeGraph(graph), [graph]);
  const [original, setOriginal] = useState<GraphData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [storageStatus, setStorageStatus] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let draft: GraphData | null = null;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) draft = parseGraph(JSON.parse(saved));
    } catch {
      /* Ignore an unreadable draft and load the server profile. */
    }
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/graph/${userId}`, {
          signal: controller.signal,
          headers: sessionHeaders(),
        });
        if (!demo && (response.status === 401 || response.status === 403)) {
          clearSession();
          location.replace('/login');
          return;
        }
        if (!response.ok)
          throw new Error(`We couldn’t load your accounts right now. Please try again.`);
        const body = await response.json();
        if (!body.success)
          throw new Error(body.message || 'Could not load this financial profile.');
        const source = parseGraph(body.data);
        // Retained the server scenario as Reset's reference, while an
        // existing browser draft took precedence for normal editing.
        setOriginal(source);
        setHistory(newHistory(draft ?? source));
      } catch (err) {
        if (controller.signal.aborted) return;
        if (draft) {
          setHistory(newHistory(draft));
          setStorageStatus('Using your local scenario. The server is unavailable.');
        } else setError(err instanceof Error ? err.message : 'Unable to load financial data.');
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [demo, userId, storageKey, reload]);
  const update = (next: GraphData) => {
    // Revalidated every change before updating React or localStorage; the
    // same constraints were therefore applied to editing and JSON imports.
    try {
      const valid = parseGraph(next);
      setHistory((current) => recordGraph(current, valid));
      setError('');
      try {
        localStorage.setItem(storageKey, JSON.stringify(valid));
        setStorageStatus('Scenario saved on this device');
      } catch {
        setStorageStatus('Browser storage unavailable. Export your scenario to keep changes.');
      }
    } catch (err) {
      setError((err as Error).message);
    }
  };
  // Persisted the current snapshot after undo/redo as well as normal edits;
  // kept native text-field undo untouched while a form or simulation was active.
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(graph));
    } catch {
      /* Retained the in-memory history when browser persistence failed. */
    }
  }, [graph, loaded, storageKey]);
  return {
    storageKey,
    history,
    setHistory,
    graph,
    live,
    original,
    loaded,
    setLoaded,
    error,
    setError,
    storageStatus,
    setStorageStatus,
    setReload,
    update,
  };
}
