import { Button } from '../components/Button';
import { StatusDot } from '../components/StatusDot';
import type { PocketStatus } from '../lib/types';

interface Step {
  id: string;
  icon: string;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  state: 'done' | 'pending' | 'waiting';
  waitingNote?: string;
}

interface Props {
  pocket: PocketStatus | null;
  onDismiss: () => void;
}

export function Onboarding({ pocket, onDismiss }: Props) {
  // Nothing for Nicole to click: Pocket sends recordings to the server, so this
  // step is a report on setup done elsewhere, not an action she takes here.
  const pocketReady = !!pocket?.healthy;

  const steps: Step[] = [
    {
      id: 'pocket',
      icon: '🎙️',
      title: 'Pocket Recorder',
      body: 'Your Pocket recorder captures each client session and sends it straight to Innerlume, where it becomes a draft clinical note for you to review — saving you hours of writing.',
      state: pocketReady ? 'done' : 'waiting',
      waitingNote: pocketReady
        ? undefined
        : 'Richmond is connecting your Pocket account — nothing for you to do.',
    },
    {
      id: 'pb',
      icon: '📅',
      title: 'Practice Better Calendar & Records',
      body: "Connects with your Practice Better account to sync your schedule, auto-update patient records, and check for open availability times when clients need to book their next appointment.",
      state: 'waiting',
      waitingNote: 'Richmond is finalizing this connection — nothing for you to do.',
    },
    {
      id: 'drive',
      icon: '📁',
      title: 'Secure Google Drive Folder',
      body: "Draft notes and treatment protocols are automatically saved to your shared Google Drive folder as soon as you approve them, keeping everything tidy and organized.",
      state: 'waiting',
      waitingNote: 'Richmond is setting this up — nothing for you to do.',
    },
    {
      id: 'outlook',
      icon: '✉️',
      title: 'Automated Client Re-engagement',
      body: "Connects with your Outlook to automatically email patients who are due for a check-in. It suggests open slots from your schedule as simple, one-click booking links.",
      state: 'waiting',
      waitingNote: 'Richmond is configuring the email setup — nothing for you to do.',
    },
    {
      id: 'qb',
      icon: '💳',
      title: 'QuickBooks Billing & Checkout',
      body: "Automatically drafts invoices and securely charges client cards through QuickBooks when you approve their treatment plans, recording payment without manual entry.",
      state: 'waiting',
      waitingNote: 'Richmond is setting up payment options — nothing for you to do.',
    },
  ];

  return (
    <div className="il-onboard__scrim">
      <div className="il-onboard">
        <div className="il-onboard__hero">
          <img className="il-onboard__logo" src="/emblem.png" alt="Innerlume" />
          <h1 className="il-onboard__title">Welcome to your practice dashboard</h1>
          <p className="il-onboard__sub">
            This app quietly handles the paperwork after each session — turning your recorded
            sessions into draft notes, tracking refills, and keeping your client records up to date.
            You review and approve; it does the rest.
          </p>
        </div>

        <div className="il-onboard__steps">
          <p className="il-onboard__steps-label">Getting started</p>
          {steps.map((s) => (
            <div key={s.id} className={`il-onboard__step il-onboard__step--${s.state}`}>
              <div className="il-onboard__step-icon">
                {s.state === 'done' ? '✓' : s.icon}
              </div>
              <div className="il-onboard__step-body">
                <div className="il-onboard__step-head">
                  <span className="il-onboard__step-title">{s.title}</span>
                  {s.state === 'done' && (
                    <span className="il-onboard__step-status">
                      <StatusDot state="connected" /> Connected
                    </span>
                  )}
                  {s.state === 'waiting' && (
                    <span className="il-onboard__step-status">
                      <StatusDot state="connecting" /> In progress
                    </span>
                  )}
                </div>
                <p className="il-onboard__step-text">{s.body}</p>
                {s.waitingNote && (
                  <p className="il-onboard__step-note">{s.waitingNote}</p>
                )}
                {s.action && (
                  <Button variant="primary" onClick={s.action.onClick}>
                    {s.action.label}
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="il-onboard__foot">
          <p className="il-onboard__foot-note">
            You can revisit this guide any time from Settings.
          </p>
          <Button variant="primary" onClick={onDismiss}>
            Take me to the dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
