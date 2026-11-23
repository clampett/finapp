import { useCallback, useEffect, useState } from 'react';
import { parseGraph } from '../common/finance';
import type { GraphData } from '../common/finance';
import { parseLocalHoldings } from '../investing/portfolio';
import { getRun, listRuns } from '../history/run-store';
import type { SavedRun } from '../history/run-store';
import { PULSE_UPDATED, runPulseKey } from './pulse-events';

export function usePulseSources(userId: number, demo: boolean) {
  const owner = `${demo ? 'demo' : 'user'}:${userId}`,
    graphKey = `finapp-scenario-v2:${owner}`,
    holdingsKey = `finapp-holdings-v1:${owner}`;
  const read = useCallback(
    (graph?: GraphData) => {
      let scenario = graph ?? null;
      try {
        if (!scenario) {
          const raw = localStorage.getItem(graphKey);
          if (raw) scenario = parseGraph(JSON.parse(raw));
        }
      } catch {
        /* Retained unavailable state instead of displaying fabricated scenario figures. */
      }
      return { owner, graph: scenario, holdings: parseLocalHoldings(holdingsKey) };
    },
    [owner, graphKey, holdingsKey],
  );
  const [snapshot, setSnapshot] = useState(() => read());
  const [history, setHistory] = useState<{ owner: string; run: SavedRun | null }>({
    owner,
    run: null,
  });
  useEffect(() => {
    let memoryGraph: GraphData | undefined;
    const refresh = (event?: Event) => {
      const detail = (event as CustomEvent<{ key: string; graph?: GraphData }> | undefined)?.detail;
      if (detail && ![graphKey, holdingsKey].includes(detail.key)) return;
      // Retained unsaved in-memory edits locally when browser persistence was blocked.
      if (detail?.key === graphKey && detail.graph) {
        try {
          memoryGraph = parseGraph(detail.graph);
        } catch {
          return;
        }
      }
      setSnapshot(read(memoryGraph));
    };
    refresh();
    window.addEventListener(PULSE_UPDATED, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(PULSE_UPDATED, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [read, graphKey, holdingsKey]);
  useEffect(() => {
    let active: AbortController | undefined;
    const refresh = async (event?: Event) => {
      if (event && (event as CustomEvent).detail?.key !== runPulseKey(userId, demo)) return;
      active?.abort();
      const controller = new AbortController();
      active = controller;
      try {
        // Loaded only the latest saved run and cancelled superseded owner-specific requests.
        const page = await listRuns({ userId, demo }, 0, controller.signal);
        const run = page.items?.length
          ? await getRun({ userId, demo }, page.items[0].id, controller.signal)
          : null;
        if (!controller.signal.aborted) setHistory({ owner, run });
      } catch {
        if (!controller.signal.aborted) setHistory({ owner, run: null });
      }
    };
    void refresh();
    window.addEventListener(PULSE_UPDATED, refresh);
    return () => {
      active?.abort();
      window.removeEventListener(PULSE_UPDATED, refresh);
    };
  }, [owner, userId, demo]);
  // Hid a previous owner's signals immediately, before effects processed a profile change.
  return {
    ...(snapshot.owner === owner ? snapshot : read()),
    run: history.owner === owner ? history.run : null,
  };
}
