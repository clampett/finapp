import { createContext, useCallback, useContext } from 'react';

export const SettingsDraftContext = createContext<(key: string, dirty: boolean) => void>(() => {});
// Registered each independently saved form without treating immediately applied theme changes as unsaved work.
export function useSettingsDraft(key: string) {
  const report = useContext(SettingsDraftContext);
  return useCallback((dirty: boolean) => report(key, dirty), [report, key]);
}
