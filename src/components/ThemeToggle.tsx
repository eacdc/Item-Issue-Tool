import { useEffect, useState } from 'react';
import { applyTheme, currentTheme, savedTheme, type Theme } from '../lib/theme';

/** Header button that switches between light and dark mode. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  // Follow the system setting until the user picks one.
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const onChange = (e: MediaQueryListEvent) => {
      if (savedTheme()) return;
      const next = e.matches ? 'dark' : 'light';
      applyTheme(next, false);
      setTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className="btn btn-small theme-toggle"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
    >
      {theme === 'dark' ? '☀ Light' : '☾ Dark'}
    </button>
  );
}
