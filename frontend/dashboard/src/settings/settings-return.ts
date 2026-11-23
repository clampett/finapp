import type { View } from '../common/finance';
export interface SettingsReturnContext {
  view: View;
  search: string;
  scrollY: number;
}
export type SettingsLeaveGuard = () => Promise<boolean>;
export const settingsReturnKey = (scope: string) => `finapp-settings-return-v1:${scope}`;

// Accepted only known workspace destinations; never treated a return value as an external redirect.
export function readSettingsReturn(
  raw: string | null,
  allowed: readonly View[],
  requested?: string | null,
): SettingsReturnContext {
  const valid = (value: unknown): value is View =>
    typeof value === 'string' && value !== 'settings' && allowed.includes(value as View);
  const fallback = {
    view: valid(requested) ? requested : ('overview' as View),
    search: '',
    scrollY: 0,
  };
  try {
    if (!raw || raw.length > 4096) return fallback;
    const value = JSON.parse(raw);
    if (
      !valid(value?.view) ||
      (valid(requested) && value.view !== requested) ||
      typeof value.search !== 'string' ||
      value.search.length > 1000 ||
      !Number.isFinite(value.scrollY) ||
      value.scrollY < 0 ||
      value.scrollY > 1e7
    )
      return fallback;
    return { view: value.view, search: value.search, scrollY: value.scrollY };
  } catch {
    return fallback;
  }
}
