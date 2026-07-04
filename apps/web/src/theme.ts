import { useState } from 'react';

const STORAGE = 'vinculo_theme';
export type Theme = 'light' | 'dark';

export function applyStoredTheme() {
  const t = (localStorage.getItem(STORAGE) as Theme) || 'light';
  document.documentElement.dataset.theme = t;
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>((localStorage.getItem(STORAGE) as Theme) || 'light');
  function toggle() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(STORAGE, next);
    document.documentElement.dataset.theme = next;
    setTheme(next);
  }
  return [theme, toggle];
}
