import React, { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { StatusDot } from "../components/StatusDot";
import type { IntegrationStatus, PocketStatus } from "../lib/types";
import { fetchIntegrationStatus } from "../lib/api";
import {
  IconMic,
  IconCalendar,
  IconFolder,
  IconMail,
  IconCreditCard,
  IconCheck,
} from "../components/Icons";
import emblemUrl from "../assets/emblem.png";

interface Step {
  id: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
  state: "done" | "pending" | "waiting";
  waitingNote?: string;
}

interface Props {
  backendUrl: string;
  pocket: PocketStatus | null;
  onDismiss: () => void;
}

export function Onboarding({ backendUrl, pocket, onDismiss }: Props) {
  // Escape, a click on the scrim and the ✕ all dismiss. This panel predates
  // components/Modal.tsx and had none of the three: the only way out was the
  // footer button, which scrolled off the bottom on a short window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDismiss();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  // Nothing for Nicole to click: Pocket sends recordings to the server, so this
  // step is a report on setup done elsewhere, not an action she takes here.
  const pocketReady = !!pocket?.healthy;

  // The other four used to be hardcoded "in progress — Richmond is setting this
  // up". They finished, and the guide went on saying otherwise, so the first
  // thing a new user read was already stale. Now it reports what is actually
  // connected, and each step flips on its own when the backend says so.
  const [live, setLive] = useState<IntegrationStatus | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchIntegrationStatus(backendUrl, ctrl.signal)
      .then(setLive)
      .catch(() => {
        // null keeps every step in its "checking" state rather than inventing a
        // problem out of a failed request.
        if (!ctrl.signal.aborted) setLive(null);
      });
    return () => ctrl.abort();
  }, [backendUrl]);

  // Until the status lands, a step is "checking" — neither connected nor a fault.
  const stateOf = (ready: boolean | undefined): Step["state"] =>
    ready === undefined ? "waiting" : ready ? "done" : "waiting";

  const steps: Step[] = [
    {
      id: "pocket",
      icon: <IconMic size={24} />,
      title: "Pocket Recorder",
      body: "Your Pocket recorder captures each client session and sends it straight to Innerlume, where it becomes a draft clinical note for you to review — saving you hours of writing.",
      state: pocketReady ? "done" : "waiting",
      waitingNote: pocketReady
        ? undefined
        : "Richmond is connecting your Pocket account — nothing for you to do.",
    },
    {
      id: "pb",
      icon: <IconCalendar size={24} />,
      title: "Practice Better Calendar & Records",
      body: "Connects with your Practice Better account to sync your schedule, auto-update patient records, and check for open availability times when clients need to book their next appointment.",
      state: stateOf(live?.practice_better),
      waitingNote: live?.practice_better
        ? undefined
        : live === null
          ? "Checking…"
          : "Richmond is finishing this connection — nothing for you to do.",
    },
    {
      id: "drive",
      icon: <IconFolder size={24} />,
      title: "Secure Google Drive Folder",
      body: "Draft notes and treatment protocols are automatically saved to your shared Google Drive folder as soon as you approve them, keeping everything tidy and organized.",
      state: stateOf(live?.google_drive),
      waitingNote: live?.google_drive
        ? undefined
        : live === null
          ? "Checking…"
          : "Richmond is finishing this connection — nothing for you to do.",
    },
    {
      id: "outlook",
      icon: <IconMail size={24} />,
      title: "Automated Client Re-engagement",
      body: "Connects with your Outlook to automatically email patients who are due for a check-in. It suggests open slots from your schedule as simple, one-click booking links.",
      state: stateOf(live?.outlook),
      waitingNote: live?.outlook
        ? undefined
        : live === null
          ? "Checking…"
          : "Richmond is finishing this connection — nothing for you to do.",
    },
    {
      id: "qb",
      icon: <IconCreditCard size={24} />,
      title: "QuickBooks Billing & Checkout",
      body: "Automatically drafts invoices and securely charges client cards through QuickBooks when you approve their treatment plans, recording payment without manual entry.",
      state: stateOf(live?.quickbooks),
      waitingNote: live?.quickbooks
        ? undefined
        : live === null
          ? "Checking…"
          : "Richmond is finishing this connection — nothing for you to do.",
    },
  ];

  return (
    <div className="il-onboard__scrim" onMouseDown={onDismiss}>
      <div className="il-onboard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="il-onboard__hero">
          <button
            className="il-toggle il-onboard__close"
            onClick={onDismiss}
            aria-label="Close"
          >
            ✕
          </button>
          <img className="il-onboard__logo" src={emblemUrl} alt="Innerlume" />
          <h1 className="il-onboard__title">
            Welcome to your practice dashboard
          </h1>
          <p className="il-onboard__sub">
            This app quietly handles the paperwork after each session — turning
            your recorded sessions into draft notes, tracking refills, and
            keeping your client records up to date. You review and approve; it
            does the rest.
          </p>
        </div>

        <div className="il-onboard__steps">
          <p className="il-onboard__steps-label">Getting started</p>
          {steps.map((s) => (
            <div
              key={s.id}
              className={`il-onboard__step il-onboard__step--${s.state}`}
            >
              <div
                className="il-onboard__step-icon"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {s.state === "done" ? <IconCheck size={20} /> : s.icon}
              </div>
              <div className="il-onboard__step-body">
                <div className="il-onboard__step-head">
                  <span className="il-onboard__step-title">{s.title}</span>
                  {s.state === "done" && (
                    <span className="il-onboard__step-status">
                      <StatusDot state="connected" /> Connected
                    </span>
                  )}
                  {s.state === "waiting" && (
                    <span className="il-onboard__step-status">
                      <StatusDot state="connecting" />{" "}
                      {s.waitingNote === "Checking…" ? "Checking" : "In progress"}
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
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
