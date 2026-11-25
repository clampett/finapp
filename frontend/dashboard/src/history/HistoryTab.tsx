import { useEffect, useRef, useState } from 'react';
import { FeatureIcon } from '../common/FeatureIcon';
import { deleteRun, getRun, listRuns, renameRun } from './run-store';
import type { RunOwner, RunPage, SavedRun } from './run-store';
import { RunDetail } from './RunDetail';
import { RunComparison } from './RunComparison';
import { RunCard } from './RunCard';
import './history.css';

export default function HistoryTab({
  userId,
  demo,
  onOpenGraph,
}: RunOwner & { onOpenGraph: () => void }) {
  const owner = { userId, demo };
  const [page, setPage] = useState(0);
  const [reload, setReload] = useState(0);
  const [data, setData] = useState<RunPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [opened, setOpened] = useState<SavedRun[]>([]);
  const [opening, setOpening] = useState(false);
  const [action, setAction] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const detailRequest = useRef<AbortController | null>(null);
  const detailHeading = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    listRuns({ userId, demo }, page, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (page > 0 && !value.items.length) {
          setPage((value) => value - 1);
          return;
        }
        setData(value);
        setError('');
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Saved runs could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [userId, demo, page, reload]);
  useEffect(() => () => detailRequest.current?.abort(), []);
  const openedKey = opened.map((run) => run.summary.id).join(':');
  useEffect(() => {
    // Moved focus only after the saved detail panel had been committed to the page.
    if (!openedKey) return;
    detailHeading.current?.focus({ preventScroll: true });
    detailHeading.current?.scrollIntoView({
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      block: 'start',
    });
  }, [openedKey]);
  const refresh = () => {
    setLoading(true);
    setError('');
    setReload((value) => value + 1);
  };
  const changePage = (next: number) => {
    setLoading(true);
    setError('');
    setPage(next);
  };
  const open = async (ids: string[]) => {
    if (action) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setOpening(true);
    setOpened([]);
    setNotice('');
    try {
      // Fetched immutable details only when opened, keeping history pages lightweight.
      const runs = await Promise.all(ids.map((id) => getRun(owner, id, controller.signal)));
      if (controller.signal.aborted) return;
      setOpened(runs);
    } catch (reason) {
      if (!controller.signal.aborted)
        setNotice(reason instanceof Error ? reason.message : 'Run could not be opened.');
    } finally {
      if (!controller.signal.aborted) setOpening(false);
    }
  };
  return (
    <div className="history-tab">
      <header className="history-hero">
        <div>
          <span className="history-eyebrow">
            <FeatureIcon name="history" />
            YOUR FORECAST LIBRARY
          </span>
          <h1>
            A record of your
            <br />
            <em>what-ifs.</em>
          </h1>
          <p>
            Keep the assumptions. Keep the perspective. Revisit saved simulations and see how your
            thinking evolves.
          </p>
          <span className="history-storage">
            <FeatureIcon name={demo ? 'clock' : 'save'} />
            {demo
              ? 'Demo history · Stored in this browser · Up to 20 runs'
              : 'Private account history · Up to 100 runs'}
          </span>
        </div>
        <div className="history-hero-summary">
          <strong>{data?.total ?? '—'}</strong>
          <span>saved perspectives</span>
          <button className="history-primary" onClick={onOpenGraph}>
            <FeatureIcon name="spark" />
            New simulation
          </button>
        </div>
      </header>
      <div className="history-toolbar">
        <div>
          <h2>Simulation history</h2>
          <p>Saved results stay unchanged when your current scenario changes.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selected.length > 0 && (
            <button className="history-button" onClick={() => setSelected([])}>
              Clear selection
            </button>
          )}
          <button
            className="history-button"
            disabled={selected.length !== 2 || opening}
            onClick={() => void open(selected)}
          >
            <FeatureIcon name="compare" />
            Compare {selected.length}/2
          </button>
          <button className="history-button" disabled={loading} onClick={refresh}>
            <FeatureIcon name="refresh" />
            Refresh
          </button>
        </div>
      </div>
      {error && (
        <p className="history-notice" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <p className="history-notice" role="status">
          Loading saved perspectives…
        </p>
      )}
      {!loading && !error && !data?.items.length && (
        <section className="history-empty">
          <FeatureIcon name="history" />
          <h2>Your next what-if deserves a place here.</h2>
          <p>
            Open a Monte Carlo or Markov simulation in Node Graph. When the forecast finishes,
            choose <strong>Save run</strong> to keep its chart, inputs, and model context.
          </p>
          <button className="history-primary" onClick={onOpenGraph}>
            Explore a simulation <FeatureIcon name="arrow" />
          </button>
        </section>
      )}
      {!!data?.items.length && (
        <div className="history-grid">
          {data.items.map((run) => (
            <RunCard
              key={run.id}
              run={run}
              selected={selected.includes(run.id)}
              selectionFull={selected.length >= 2}
              busy={action}
              confirming={confirm === run.id}
              onToggle={() =>
                setSelected((ids) =>
                  ids.includes(run.id) ? ids.filter((id) => id !== run.id) : [...ids, run.id],
                )
              }
              onOpen={() => void open([run.id])}
              onConfirm={() => setConfirm(run.id)}
              onCancel={() => setConfirm(null)}
              onDelete={async () => {
                if (action) return;
                setAction(true);
                setNotice('');
                detailRequest.current?.abort();
                setOpening(false);
                try {
                  await deleteRun(owner, run.id);
                  setSelected((ids) => ids.filter((id) => id !== run.id));
                  setOpened((rows) => (rows.some((row) => row.summary.id === run.id) ? [] : rows));
                  refresh();
                  setNotice('Saved run deleted.');
                  setConfirm(null);
                } catch (reason) {
                  setNotice(
                    reason instanceof Error ? reason.message : 'The run could not be deleted.',
                  );
                } finally {
                  setAction(false);
                }
              }}
            />
          ))}
        </div>
      )}
      {!!data?.total && (
        <nav className="history-pagination" aria-label="Saved run pages">
          <button
            className="history-button"
            disabled={page === 0 || loading}
            onClick={() => changePage(page - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {Math.max(1, Math.ceil(data.total / 12))}
          </span>
          <button
            className="history-button"
            disabled={(page + 1) * 12 >= data.total || loading}
            onClick={() => changePage(page + 1)}
          >
            Next
          </button>
        </nav>
      )}
      <p role="status" className="history-status">
        {notice}
      </p>
      {opening && (
        <p role="status" className="history-notice">
          Opening saved results…
        </p>
      )}
      {!!opened.length && (
        <div ref={detailHeading} tabIndex={-1} className="history-detail-anchor">
          <div className="history-detail-close">
            <button
              className="history-button"
              onClick={() => {
                detailRequest.current?.abort();
                setOpened([]);
              }}
            >
              <FeatureIcon name="close" />
              Close results
            </button>
          </div>
          {opened.length === 2 ? (
            <RunComparison runs={opened as [SavedRun, SavedRun]} />
          ) : (
            <RunDetail
              key={opened[0].summary.id}
              run={opened[0]}
              busy={action}
              onRename={async (title) => {
                setAction(true);
                setNotice('');
                const run = opened[0];
                try {
                  const summary = await renameRun(owner, run.summary.id, title);
                  setOpened((current) =>
                    current[0]?.summary.id === run.summary.id ? [{ ...run, summary }] : current,
                  );
                  refresh();
                  setNotice('Run renamed.');
                } catch (reason) {
                  setNotice(reason instanceof Error ? reason.message : 'Run could not be renamed.');
                } finally {
                  setAction(false);
                }
              }}
            />
          )}
        </div>
      )}
      <footer className="history-footer">
        Saved simulations are educational estimates, not guarantees or personalized financial
        advice.
      </footer>
    </div>
  );
}
