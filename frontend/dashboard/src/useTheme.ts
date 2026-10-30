import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';
const preferenceKey = 'user-theme';

function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function deviceTheme(): Theme {
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => savedTheme() ?? deviceTheme());
  useEffect(() => {
    // Applied the same browser preference used by public pages without changing
    // scenario state, chart data, or the selected workspace tab.
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', theme === 'light' ? '#f3f4f7' : '#0c1018');
  }, [theme]);
  useEffect(() => {
    const system = matchMedia('(prefers-color-scheme: light)');
    const changed = (event: StorageEvent) => {
      if (event.key === preferenceKey || event.key === null) {
        setTheme(savedTheme() ?? deviceTheme());
      }
    };
    const systemChanged = () => {
      if (!savedTheme()) setTheme(deviceTheme());
    };
    window.addEventListener('storage', changed);
    system.addEventListener('change', systemChanged);
    return () => {
      window.removeEventListener('storage', changed);
      system.removeEventListener('change', systemChanged);
    };
  }, []);
  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    // Retained a usable switch even when a browser denied persistent storage.
    try {
      localStorage.setItem(preferenceKey, next);
    } catch {
      /* Kept the selection in memory. */
    }
    setTheme(next);
  };
  return { theme, toggleTheme };
}
