import { useTheme } from '../theme/useTheme';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      className="il-toggle"
      onClick={toggle}
      title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle color theme"
    >
      {resolved === 'dark' ? '☀' : '☾'}
    </button>
  );
}
