// Restored the saved preference before styles were painted, including on deep links.
// Used the operating-system preference only until an explicit choice had been saved.
try {
  const saved = localStorage.getItem('user-theme');
  document.documentElement.dataset.theme =
    saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark';
} catch {
  document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}
