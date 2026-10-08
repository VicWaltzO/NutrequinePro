// Stable snapshots let React hydrate browser preferences without effect updates.
let themeOverride;
export function readTheme() {
  if (themeOverride) return themeOverride;
  try {
    const saved = localStorage.getItem('nutrequine-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Browser storage can be unavailable. */ }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function subscribeTheme(listener) {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('nutrequine-theme-change', listener);
  window.addEventListener('storage', listener);
  media.addEventListener('change', listener);
  return () => {
    window.removeEventListener('nutrequine-theme-change', listener);
    window.removeEventListener('storage', listener);
    media.removeEventListener('change', listener);
  };
}
export function changeTheme(next) {
  themeOverride = undefined;
  try { localStorage.setItem('nutrequine-theme', next); }
  catch { themeOverride = next; }
  document.documentElement.dataset.theme = next;
  window.dispatchEvent(new Event('nutrequine-theme-change'));
}
export function readView() { return location.hash.slice(1); }
export function subscribeView(listener) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}
