import { useCallback, useEffect, useRef, useState } from 'react';
import type { SettingsLeaveGuard } from './settings-return';

export function useSettingsExit(
  dirty: boolean,
  busy: boolean,
  register?: (guard: SettingsLeaveGuard | null) => void,
) {
  const [open, setOpen] = useState(false),
    [notice, setNotice] = useState('');
  const resolve = useRef<((allowed: boolean) => void) | null>(null),
    decision = useRef<Promise<boolean> | null>(null);
  const settle = useCallback((allowed: boolean) => {
    const finish = resolve.current;
    resolve.current = null;
    decision.current = null;
    setOpen(false);
    finish?.(allowed);
  }, []);
  const check = useCallback(() => {
    if (busy) {
      setNotice('Please wait for your current settings update to finish.');
      return Promise.resolve(false);
    }
    if (!dirty) return Promise.resolve(true);
    if (decision.current) return decision.current;
    // Resolved one navigation decision at a time so repeated close clicks could not discard additional work.
    decision.current = new Promise<boolean>((finish) => {
      resolve.current = finish;
      setOpen(true);
    });
    return decision.current;
  }, [dirty, busy]);
  useEffect(() => {
    register?.(check);
    return () => register?.(null);
  }, [register, check]);
  useEffect(
    () => () => {
      resolve.current?.(false);
    },
    [],
  );
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, busy]);
  return { open, settle, notice };
}
