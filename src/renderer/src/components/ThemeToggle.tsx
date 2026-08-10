import { useTheme } from '../theme/useTheme';
import { IconSun, IconMoon } from './Icons';

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  return (
    <button
      className="il-toggle"
      onClick={toggle}
      title={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle color theme"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {resolved === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
    </button>
  );
}
