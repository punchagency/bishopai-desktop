import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ThemeMode } from './palette';

interface ThemeContextValue {
  mode: ThemeMode; // user's choice: light | dark | system
  resolved: 'light' | 'dark'; // what's actually applied
  setMode: (m: ThemeMode) => void;
  toggle: () => void; // quick light<->dark flip
}

// eslint-disable-next-line react-refresh/only-export-components
export const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'innerlume.theme';

function systemPrefersDark(): boolean {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(
    () => (localStorage.getItem(STORAGE_KEY) as ThemeMode | null) ?? 'system',
  );
  const resolved = resolve(mode);

  // Apply to <html> so CSS variables cascade to everything.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  // Follow the OS when in "system" mode.
  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => document.documentElement.setAttribute('data-theme', resolve('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [mode]);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  }, []);

  const toggle = useCallback(() => {
    setMode(resolve(mode) === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode, toggle }),
    [mode, resolved, setMode, toggle],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
