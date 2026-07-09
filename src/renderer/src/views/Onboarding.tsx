import { Button } from '../components/Button';
import { StatusDot } from '../components/StatusDot';
import type { CourierState } from '../lib/types';

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
  courierState: CourierState;
  onConnectBee: () => void;
  onDismiss: () => void;
}

export function Onboarding({ courierState, onConnectBee, onDismiss }: Props) {
  const beeConnected = courierState === 'connected';

  const steps: Step[] = [
    {
      id: 'bee',
      icon: '🐝',
      title: 'Connect Bee Wearable',
      body: 'Your Bee wearable captures your client sessions. Once connected, your conversations are automatically summarized into draft clinical notes right on your machine — ensuring absolute privacy and saving you hours of writing.',
      action: beeConnected ? undefined : { label: 'Connect Bee', onClick: onConnectBee },
      state: beeConnected ? 'done' : 'pending',
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
            This app quietly handles the paperwork after each session — turning your Bee conversations
            into draft notes, tracking refills, and keeping your client records up to date. You review
            and approve; it does the rest.
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
