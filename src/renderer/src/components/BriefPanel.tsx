import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { Skeleton } from './Skeleton';
import { fetchBrief } from '../lib/api';
import type { Brief } from '../lib/types';

// The ninety seconds before a client walks in. Everything here is read back from
// Nicole's own approved notes — nothing is inferred, and nothing is written.

const today = (): string => new Date().toISOString().slice(0, 10);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: '1.1rem' }}>
      <h4 className="il-card__title" style={{ fontSize: '0.82rem', letterSpacing: '0.04em', textTransform: 'uppercase', opacity: 0.7 }}>
        {title}
      </h4>
      <div style={{ marginTop: '0.4rem' }}>{children}</div>
    </div>
  );
}

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="il-card__meta">{empty}</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.7 }}>
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export function BriefPanel({
  backendUrl,
  appointmentId,
  onClose,
}: {
  backendUrl: string;
  appointmentId: string;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setBrief(null);
    setError(null);
    fetchBrief(backendUrl, appointmentId, ctrl.signal)
      .then(setBrief)
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError('Could not load this brief.');
      });
    return () => ctrl.abort();
  }, [backendUrl, appointmentId]);

  const title = brief ? `${brief.client_name} — visit ${brief.visit_number}` : 'Prep brief';

  return (
    <Modal title={title} onClose={onClose}>
      {error && <p className="il-card__meta">{error}</p>}

      {!brief && !error && (
        <div style={{ display: 'grid', gap: '0.7rem' }}>
          {[90, 70, 80, 60].map((w, i) => (
            <Skeleton key={i} width={`${w}%`} height="1rem" />
          ))}
        </div>
      )}

      {brief && (
        <>
          {brief.open_tasks.length > 0 && (
            <Section title="Open follow-ups">
              <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                {brief.open_tasks.map((t) => {
                  const overdue = t.due_date !== null && t.due_date < today();
                  return (
                    <li key={t.id}>
                      {t.title}{' '}
                      {t.due_date ? (
                        <Badge tone={overdue ? 'warning' : 'neutral'}>
                          {overdue ? `overdue — due ${t.due_date}` : `due ${t.due_date}`}
                        </Badge>
                      ) : (
                        <Badge tone="neutral" title="No timeframe was given in the session, so none was invented.">
                          no date
                        </Badge>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {brief.last_session ? (
            <Section title={`Last session — ${brief.last_session.date}`}>
              <p className="il-card__meta" style={{ marginBottom: '0.3rem' }}>Concerns</p>
              <List items={brief.last_session.concerns} empty="None noted." />
              <p className="il-card__meta" style={{ margin: '0.6rem 0 0.3rem' }}>Assessment</p>
              <List items={brief.last_session.assessments} empty="None noted." />
              {brief.last_session.protocol_changes.length > 0 && (
                <>
                  <p className="il-card__meta" style={{ margin: '0.6rem 0 0.3rem' }}>Protocol changes</p>
                  <List items={brief.last_session.protocol_changes} empty="" />
                </>
              )}
            </Section>
          ) : (
            <Section title="Last session">
              <p className="il-card__meta">
                First visit — no prior approved notes. (A session that hasn&apos;t been reviewed yet
                won&apos;t appear here.)
              </p>
            </Section>
          )}

          {brief.supplements.length > 0 && (
            <Section title="Current plan">
              <ul style={{ margin: 0, paddingLeft: '1.1rem', lineHeight: 1.9 }}>
                {brief.supplements.map((s, i) => (
                  <li key={i}>
                    <strong>{s.name}</strong>
                    {s.dose ? ` — ${s.dose}` : ''}
                    {s.due_date && (
                      <>
                        {' '}
                        <Badge tone={s.ordered ? 'neutral' : 'warning'}>
                          {s.ordered ? `runs out ${s.due_date}` : `runs out ${s.due_date}, not reordered`}
                        </Badge>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief.not_covered_last_time.length > 0 && (
            <Section title="Not covered last time">
              <p className="il-card__meta" style={{ marginBottom: '0.45rem' }}>
                These were never stated in the last session, so they were left blank rather than
                guessed. Worth picking up today.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {brief.not_covered_last_time.map((f) => (
                  <Badge key={f} tone="accent">
                    {f}
                  </Badge>
                ))}
              </div>
            </Section>
          )}

          {brief.outstanding_billing && (
            <Section title="Billing">
              <p className="il-card__meta">
                {brief.outstanding_billing.status} from {brief.outstanding_billing.appointment_date} —{' '}
                ${(brief.outstanding_billing.amount_cents / 100).toFixed(2)}
              </p>
            </Section>
          )}
        </>
      )}
    </Modal>
  );
}
