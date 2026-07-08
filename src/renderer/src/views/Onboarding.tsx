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
      title: 'Connect Bee',
      body: 'Bee records your sessions. Connecting it here lets the app read those conversations and turn them into session notes automatically — nothing leaves your machine without your approval.',
      action: beeConnected ? undefined : { label: 'Connect Bee', onClick: onConnectBee },
      state: beeConnected ? 'done' : 'pending',
    },
    {
      id: 'pb',
      icon: '📋',
      title: 'PracticeQ API access',
      body: "Richmond has submitted the API access request to PracticeQ on your behalf. Once it's approved, the app will be able to read your appointments and mark sessions complete automatically.",
      state: 'waiting',
      waitingNote: 'Waiting on PracticeQ approval — nothing for you to do.',
    },
    {
      id: 'drive',
      icon: '📁',
      title: 'Google Drive folder',
      body: "Richmond is setting up a shared Google Drive folder where your approved session notes and protocols will be saved. You'll get a link once it's ready.",
      state: 'waiting',
      waitingNote: 'Richmond is handling this — nothing for you to do.',
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
