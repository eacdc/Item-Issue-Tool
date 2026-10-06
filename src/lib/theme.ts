/**
 * Light / dark theme. The choice is remembered per browser; with none saved
 * the system setting decides. index.html applies it before the app loads, so
 * the page never flashes the wrong colours.
 */

export type Theme = 'light' | 'dark';

const KEY = 'cdc-issue-tool.theme';

export function savedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme, remember = true): void {
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Private mode or blocked storage: the theme still applies for this visit.
  }
}
