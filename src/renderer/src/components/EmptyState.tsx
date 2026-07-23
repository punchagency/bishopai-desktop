import type { ReactNode } from 'react';
import {
  IconActivity,
  IconCheck,
  IconCreditCard,
  IconFileText,
  IconInbox,
  IconLeaf,
  IconRefill,
  IconUsers,
} from './Icons';

// Centralized empty state configuration across all views.
// Presets define icon, title, and body for each domain so copy & icons remain unified.

export type EmptyStateVariant =
  | 'activity'
  | 'checkout'
  | 'refills'
  | 'leads'
  | 'review_pending'
  | 'review_approved'
  | 'unmatched';

interface Preset {
  icon: ReactNode;
  title: string;
  body: string;
}

export const EMPTY_STATE_PRESETS: Record<EmptyStateVariant, Preset> = {
  activity: {
    icon: <IconActivity size={24} />,
    title: 'Nothing yet',
    body: 'As you work — approving sessions, taking payments, managing refills and leads — each action is logged here so you always have a complete history.',
  },
  checkout: {
    icon: <IconCreditCard size={24} />,
    title: 'No checkouts yet',
    body: 'A checkout appears here when a session is marked complete in Practice Better — with the session fee and any supplements ready to review and charge.',
  },
  refills: {
    icon: <IconRefill size={24} />,
    title: 'No refills due',
    body: "Clients appear here as their supplements run low — usually within about two weeks of running out, projected nightly from each supplement's dose and quantity.",
  },
  leads: {
    icon: <IconUsers size={24} />,
    title: 'No leads yet',
    body: 'New enquiries flow in here from the website contact and booking forms, then move through the welcome and re-booking cadence automatically.',
  },
  review_pending: {
    icon: <IconCheck size={24} />,
    title: "You're all caught up",
    body: "New Appointment Sheets and Protocols land here after each session is captured and turned into a draft note. There's nothing waiting on your review right now.",
  },
  review_approved: {
    icon: <IconFileText size={24} />,
    title: 'Nothing approved yet',
    body: 'Sessions you approve move here, so you can look back at them or correct one after the fact.',
  },
  unmatched: {
    icon: <IconInbox size={24} />,
    title: "Everything's matched",
    body: "Bee conversations we can't automatically tie to an appointment land here so you can tag the client by hand. There's nothing waiting right now.",
  },
};

export interface EmptyStateProps {
  variant?: EmptyStateVariant;
  icon?: ReactNode;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ variant, icon, title, children, action }: EmptyStateProps) {
  const preset = variant ? EMPTY_STATE_PRESETS[variant] : null;

  const displayIcon = icon ?? preset?.icon ?? <IconLeaf size={24} />;
  const displayTitle = title ?? preset?.title ?? 'No items';
  const displayBody = children ?? preset?.body;

  return (
    <div className="il-emptystate">
      <div className="il-emptystate__icon" aria-hidden="true">
        {displayIcon}
      </div>
      <h3 className="il-emptystate__title">{displayTitle}</h3>
      {displayBody && <p className="il-emptystate__body">{displayBody}</p>}
      {action && <div className="il-emptystate__action">{action}</div>}
    </div>
  );
}
