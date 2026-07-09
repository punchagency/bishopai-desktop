import type { ViewKey, WorkflowStatus } from '../lib/types';

interface NavItem {
  key: ViewKey;
  label: string;
  icon: string;
  status?: WorkflowStatus; // shown as a small pill for workflow sections
}

const NAV: NavItem[] = [
  { key: 'overview', label: 'Overview', icon: '◈' },
  { key: 'review', label: 'Review Queue', icon: '✎', status: 'live' },
  { key: 'unmatched', label: 'Unmatched', icon: '⚟', status: 'live' },
  { key: 'checkout', label: 'Checkout', icon: '＄', status: 'live' },
  { key: 'refills', label: 'Refills', icon: '↻', status: 'live' },
  { key: 'engagement', label: 'Engagement', icon: '◐', status: 'live' },
  { key: 'schedule', label: 'Schedule', icon: '⊡', status: 'live' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
];

const STATUS_LABEL: Record<WorkflowStatus, string> = { live: 'live', pending: 'soon', planned: 'plan' };

interface SidebarProps {
  active: ViewKey;
  counts: Partial<Record<ViewKey, number>>;
  onSelect: (v: ViewKey) => void;
}

export function Sidebar({ active, counts, onSelect }: SidebarProps) {
  return (
    <nav className="il-sidebar">
      {NAV.map((n) => {
        const count = counts[n.key];
        return (
          <button
            key={n.key}
            className={`il-nav ${active === n.key ? 'il-nav--on' : ''}`}
            onClick={() => onSelect(n.key)}
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
    </nav>
  );
}
