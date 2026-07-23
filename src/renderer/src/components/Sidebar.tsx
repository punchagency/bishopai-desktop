import type { ViewKey, WorkflowStatus } from '../lib/types';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: string;
  status?: WorkflowStatus; // shown as a small pill for workflow sections
}

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: '◈' },
  { key: 'review', label: 'Sessions', icon: '✎', status: 'live' },
  { key: 'unmatched', label: 'Unmatched', icon: '⚟', status: 'live' },
  { key: 'checkout', label: 'Checkout', icon: '＄', status: 'live' },
  { key: 'refills', label: 'Refills', icon: '↻', status: 'live' },
  { key: 'engagement', label: 'Engagement', icon: '◐', status: 'live' },
  { key: 'schedule', label: 'Schedule', icon: '⊡', status: 'live' },
  { key: 'activity', label: 'Activity', icon: '❋', status: 'live' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

const STATUS_LABEL: Record<WorkflowStatus, string> = { live: 'live', pending: 'soon', planned: 'plan' };

interface SidebarProps {
  active: ViewKey;
  counts: Partial<Record<ViewKey, number>>;
  onSelect: (v: ViewKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ active, counts, onSelect, collapsed, onToggle }: SidebarProps) {
  return (
    <nav className={`il-sidebar ${collapsed ? 'il-sidebar--tight' : ''}`}>
      {NAV.map((n) => {
        const count = counts[n.key];
        return (
          <button
            key={n.key}
            className={`il-nav ${active === n.key ? 'il-nav--on' : ''}`}
            onClick={() => onSelect(n.key)}
            // Collapsed, the icon is the only label — the name has to stay
            // reachable on hover and to assistive tech.
            title={collapsed ? n.label : undefined}
            aria-label={collapsed ? n.label : undefined}
          >
            <span className="il-nav__icon">{n.icon}</span>
            <span className="il-nav__label">{n.label}</span>
            {count ? <span className="il-nav__count">{count}</span> : null}
            {n.status && n.status !== 'live' && (
              <span className={`il-pill il-pill--${n.status}`}>{STATUS_LABEL[n.status]}</span>
            )}
          </button>
        );
      })}

      <button
        className="il-nav il-nav--toggle"
        onClick={onToggle}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
      >
        <span className="il-nav__icon">{collapsed ? '»' : '«'}</span>
        <span className="il-nav__label">Collapse</span>
      </button>
    </nav>
  );
}
