import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { View } from '../common/finance';
import { readSettingsReturn, settingsReturnKey } from './settings-return';
import type { SettingsLeaveGuard, SettingsReturnContext } from './settings-return';

export function useWorkspaceNavigation(
  views: readonly { id: View; label: string }[],
  scope: string,
) {
  const allowed = views.map((item) => item.id);
  const [view, setView] = useState<View>(() => {
    const requested = new URL(location.href).searchParams.get('view');
    return requested === 'settings'
      ? 'settings'
      : (views.find((item) => item.id === requested)?.id ?? 'overview');
  });
  const [search, setSearch] = useState('');
  const [entry, setEntry] = useState<{ scope: string; context: SettingsReturnContext } | null>(
    null,
  );
  const guard = useRef<SettingsLeaveGuard | null>(null),
    pending = useRef(false);
  const restore = useRef<{ y: number; focus: boolean } | null>(null);
  const registerGuard = useCallback((handler: SettingsLeaveGuard | null) => {
    guard.current = handler;
  }, []);
  function returnContext() {
    if (entry?.scope === scope) return entry.context;
    let raw = null;
    try {
      raw = sessionStorage.getItem(settingsReturnKey(scope));
    } catch {
      /* Retained a safe URL-based destination when tab storage was blocked. */
    }
    return readSettingsReturn(raw, allowed, new URL(location.href).searchParams.get('returnTo'));
  }
  const destination = returnContext();
  async function navigate(next: View) {
    if (next === view || pending.current) return;
    if (view === 'settings' && guard.current) {
      pending.current = true;
      try {
        if (!(await guard.current())) return;
      } finally {
        pending.current = false;
      }
    }
    const url = new URL(location.href);
    if (next === 'settings') {
      // Captured context once on entry; repeated Settings clicks never overwrote the return destination.
      const context = { view, search, scrollY: Math.max(0, window.scrollY) };
      setEntry({ scope, context });
      try {
        sessionStorage.setItem(settingsReturnKey(scope), JSON.stringify(context));
      } catch {
        /* Preserved the in-memory return path when tab storage was unavailable. */
      }
      url.searchParams.set('returnTo', view);
      setSearch('');
    } else {
      const returning = view === 'settings' && next === destination.view;
      restore.current = { y: returning ? destination.scrollY : 0, focus: view === 'settings' };
      setSearch(returning ? destination.search : '');
      url.searchParams.delete('returnTo');
    }
    if (next === 'overview') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    history.replaceState(history.state, '', url);
    setView(next);
  }
  useLayoutEffect(() => {
    const target = restore.current ?? { y: 0, focus: false };
    restore.current = null;
    // Retried restoration as charts/layouts finished loading, stopping immediately if the user interacted.
    let frame = 0,
      stopped = false;
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      clearTimeout(timer);
    };
    const apply = () => {
      if (stopped) return;
      window.scrollTo({ top: target.y, behavior: 'instant' });
      if (Math.abs(window.scrollY - target.y) < 2) stop();
    };
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    });
    const timer = setTimeout(stop, 3000);
    observer.observe(document.querySelector('main') ?? document.body);
    apply();
    if (target.focus) {
      const focus =
        target.y >= 0 && document.querySelector<HTMLInputElement>('main > header input');
      if (focus && focus.value) focus.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLElement>('[aria-label="Main navigation"] [aria-current="page"]')
          ?.focus({ preventScroll: true });
    }
    const events = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    events.forEach((name) => window.addEventListener(name, stop, { once: true, passive: true }));
    return () => {
      stop();
      events.forEach((name) => window.removeEventListener(name, stop));
    };
  }, [view]);
  return {
    view,
    search,
    setSearch,
    navigate,
    closeSettings: () => navigate(destination.view),
    returnLabel: views.find((item) => item.id === destination.view)?.label ?? 'Overview',
    registerGuard,
  };
}
