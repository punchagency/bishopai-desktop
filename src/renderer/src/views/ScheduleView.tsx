import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSchedule } from '../lib/api';
import { InfoPopover } from '../components/InfoPopover';
import { Modal } from '../components/Modal';
import type { ScheduleData, UpcomingSession } from '../lib/types';

// ---------------------------------------------------------------------------
// ScheduleView — Nicole's weekly calendar
// Shows upcoming booked sessions (PB live or local DB fallback) and derived
// available booking slots in a premium, timezone-aware weekly calendar grid.
// Handles custom length sessions by positioning them absolute on the hour scale.
// Clicking on any slot or session card launches a details modal with context.
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Props {
  backendUrl: string;
}

type SelectedItem =
  | { type: 'session'; data: UpcomingSession }
  | { type: 'slot'; starts_at: string; ends_at: string };

export function ScheduleView({ backendUrl }: Props) {
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(() => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    fetchSchedule(backendUrl, ac.signal)
      .then(setData)
      .catch((e: Error) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => setLoading(false));
  }, [backendUrl]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  if (loading) return <div className="il-empty">Loading schedule…</div>;
  if (error)   return <div className="il-empty il-empty--error">⚠ {error}</div>;
  if (!data)   return null;

  const oh = data.office_hours;
  const slots = data.slots;
  const workingDayLabels = oh.days.map((d) => DAY_NAMES[d] ?? '').join(', ');

  // Helper to resolve hours/minutes in target timezone
  const getTzHourAndMinute = (iso: string, tz: string) => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: 'numeric',
        minute: 'numeric',
        hour12: false,
      }).formatToParts(new Date(iso));
      const hour = Number(parts.find(p => p.type === 'hour')?.value ?? '0');
      const minute = Number(parts.find(p => p.type === 'minute')?.value ?? '0');
      return { hour, minute };
    } catch {
      const d = new Date(iso);
      return { hour: d.getHours(), minute: d.getMinutes() };
    }
  };

  // Helper to format ISO to date string (YYYY-MM-DD) in target timezone
  const getTzDateString = (dateOrIso: Date | string, tz: string): string => {
    const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(d);
      const y = parts.find(p => p.type === 'year')?.value ?? '';
      const m = parts.find(p => p.type === 'month')?.value ?? '';
      const day = parts.find(p => p.type === 'day')?.value ?? '';
      return `${y}-${m}-${day}`;
    } catch {
      return d.toISOString().split('T')[0];
    }
  };

  // Helper to get formatted day header details
  const getTzDayParts = (d: Date, tz: string) => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).formatToParts(d);
      const weekday = parts.find(p => p.type === 'weekday')?.value ?? '';
      const day = parts.find(p => p.type === 'day')?.value ?? '';
      const month = parts.find(p => p.type === 'month')?.value ?? '';
      return { weekday, day, month };
    } catch {
      return { weekday: DAY_NAMES[d.getDay()], day: String(d.getDate()), month: '' };
    }
  };

  // Helper to format time (e.g. "10:30 AM") in target timezone
  const formatTime = (iso: string, tz: string): string => {
    try {
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(new Date(iso));
    } catch {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  };

  // Build the range of hours to show
  let startHour = oh.start_hour;
  let endHour = oh.end_hour;

  // Scan sessions to find absolute range
  for (const s of data.sessions) {
    const { hour: sHour } = getTzHourAndMinute(s.starts_at, oh.timezone);
    if (sHour < startHour) startHour = Math.max(0, sHour);

    const endIso = s.ends_at || new Date(new Date(s.starts_at).getTime() + oh.session_duration_min * 60_000).toISOString();
    const { hour: eHour, minute: eMin } = getTzHourAndMinute(endIso, oh.timezone);
    const approxEnd = eMin > 0 ? eHour + 1 : eHour;
    if (approxEnd > endHour) endHour = Math.min(24, approxEnd);
  }

  const hoursArray: number[] = [];
  for (let h = startHour; h < endHour; h++) {
    hoursArray.push(h);
  }

  const totalHours = endHour - startHour;

  // Helper to extract timezone-correct weekday index (0-6)
  const getTzDayOfWeek = (d: Date, tz: string): number => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        weekday: 'short',
      }).formatToParts(d);
      const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
      const WEEKDAY_MAP: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      };
      return WEEKDAY_MAP[weekdayStr] ?? d.getDay();
    } catch {
      return d.getDay();
    }
  };

  // Next working days starting from today, up to 7 days
  const today = new Date();
  const dates: Date[] = [];
  let dayOffset = 0;
  while (dates.length < 7 && dayOffset < 30) {
    const d = new Date(today.getTime() + dayOffset * 86_400_000);
    const dayOfWeek = getTzDayOfWeek(d, oh.timezone);
    if (oh.days.includes(dayOfWeek)) {
      dates.push(d);
    }
    dayOffset++;
  }

  // Fallback to next 7 consecutive days if no days are configured
  if (dates.length === 0) {
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d);
    }
  }

  const getEventStyle = (startsAt: string, endsAt: string | null, defaultDurationMin: number) => {
    const startObj = getTzHourAndMinute(startsAt, oh.timezone);
    const endIso = endsAt || new Date(new Date(startsAt).getTime() + defaultDurationMin * 60_000).toISOString();
    const endObj = getTzHourAndMinute(endIso, oh.timezone);

    const startPos = startObj.hour + (startObj.minute / 60);
    const endPos = endObj.hour + (endObj.minute / 60);

    const top = Math.max(0, (startPos - startHour) * 60);
    const height = Math.max(25, (endPos - startPos) * 60);

    return {
      top: `${top}px`,
      height: `${height}px`,
    };
  };

  const formatHour = (h: number) => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour} ${ampm}`;
  };

  return (
    <div className="il-schedule">
      {/* Header */}
      <header className="il-schedule__header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 className="il-title">Schedule</h1>
            <InfoPopover label="How the schedule works" title="About your Schedule">
              <p style={{ margin: '0 0 0.5rem' }}>
                This calendar shows your upcoming booked sessions and available slots.
              </p>
              <p style={{ margin: '0 0 0.5rem' }}>
                <strong>Practice Better Sync:</strong> If connected, your calendar syncs live. In offline mode, the system uses locally saved sessions.
              </p>
              <p style={{ margin: 0 }}>
                <strong>Availability Slots:</strong> Calculated by taking your working hours and subtracting any already booked sessions.
              </p>
            </InfoPopover>
          </div>
          <p className="il-subtitle">
            {data.pb_configured
              ? 'Live from Practice Better'
              : 'Showing locally-synced sessions — connect Practice Better for live data'}{' '}
            · {oh.timezone} · {workingDayLabels} · {oh.start_hour}:00 – {oh.end_hour}:00
          </p>
        </div>
        {!data.pb_configured && (
          <span className="il-pill il-pill--pending">offline mode</span>
        )}
      </header>

      {/* Calendar Component */}
      <div className="il-calendar">
        {/* Column Headers */}
        <div className="il-calendar__header-days" style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}>
          <div className="il-calendar__header-spacer" />
          {dates.map((d) => {
            const { weekday, day, month } = getTzDayParts(d, oh.timezone);
            const isCurrentDay = d.toDateString() === today.toDateString();
            return (
              <div
                key={d.toISOString()}
                className={`il-calendar__day-head ${isCurrentDay ? 'il-calendar__day-head--today' : ''}`}
              >
                <span className="il-calendar__day-head-name">{weekday}</span>
                <span className="il-calendar__day-head-date">
                  {day} <span style={{ fontSize: '0.72rem', fontWeight: 500 }}>{month}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable Calendar Body */}
        <div className="il-calendar__body-scroll">
          <div className="il-calendar__grid-wrapper" style={{ gridTemplateColumns: `60px repeat(${dates.length}, 1fr)` }}>
            {/* Hour labels */}
            <div className="il-calendar__hours-col">
              {hoursArray.map((h) => (
                <div key={h} className="il-calendar__hour-slot">
                  {formatHour(h)}
                </div>
              ))}
            </div>

            {/* Day columns */}
            {dates.map((d) => {
              const dayStr = getTzDateString(d, oh.timezone);
              const daySessions = data.sessions.filter(s => getTzDateString(s.starts_at, oh.timezone) === dayStr);
              const daySlots = slots.filter(s => getTzDateString(s.starts_at, oh.timezone) === dayStr);

              return (
                <div key={d.toISOString()} className="il-calendar__day-col">
                  {/* Background hour gridlines */}
                  <div className="il-calendar__grid-lines">
                    {hoursArray.map((h) => (
                      <div key={h} className="il-calendar__grid-line-row" />
                    ))}
                  </div>

                  {/* Booked sessions */}
                  {daySessions.map((s) => {
                    const style = getEventStyle(s.starts_at, s.ends_at, oh.session_duration_min);
                    const statusColor: Record<string, string> = {
                      confirmed: '#22c55e', pending: '#f59e0b', cancelled: '#ef4444',
                    };
                    const dot = statusColor[s.status] ?? '#6b7280';

                    return (
                      <div
                        key={s.id}
                        className={`il-calendar__event il-calendar__event--${s.status} ${s.source === 'local' ? 'il-calendar__event--local' : ''}`}
                        style={{ ...style, cursor: 'pointer' }}
                        onClick={() => setSelectedItem({ type: 'session', data: s })}
                      >
                        <div className="il-calendar__event-time">
                          {formatTime(s.starts_at, oh.timezone)}
                          {s.ends_at ? ` - ${formatTime(s.ends_at, oh.timezone)}` : ''}
                        </div>
                        <div className="il-calendar__event-title">
                          {s.client_name ?? '(unknown)'}
                        </div>
                        <div className="il-calendar__event-meta">
                          <span>{s.service_type || 'Session'}</span>
                          <span>
                            <span style={{ color: dot, marginRight: '0.2rem' }}>●</span>
                            {s.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Available booking slots */}
                  {daySlots.map((slot) => {
                    const style = getEventStyle(slot.starts_at, slot.ends_at, oh.session_duration_min);
                    return (
                      <div
                        key={slot.starts_at}
                        className="il-calendar__event il-calendar__event--slot"
                        style={{ ...style, cursor: 'pointer' }}
                        title="Available time slot offered in client re-engagement emails."
                        onClick={() => setSelectedItem({ type: 'slot', starts_at: slot.starts_at, ends_at: slot.ends_at })}
                      >
                        <div className="il-calendar__event-slot-title">Available Slot</div>
                        <div className="il-calendar__event-time">
                          {formatTime(slot.starts_at, oh.timezone)}
                          {slot.ends_at ? ` - ${formatTime(slot.ends_at, oh.timezone)}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Details Modal */}
      {selectedItem && (
        <Modal
          title={selectedItem.type === 'session' ? 'Session Details' : 'Available Booking Slot'}
          onClose={() => setSelectedItem(null)}
          footer={
            <div className="il-modal__actions" style={{ justifyContent: 'flex-end', width: '100%' }}>
              <button className="il-button il-button--secondary" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>
          }
        >
          {selectedItem.type === 'session' ? (
            <SessionDetailView session={selectedItem.data} tz={oh.timezone} />
          ) : (
            <SlotDetailView
              startsAt={selectedItem.starts_at}
              endsAt={selectedItem.ends_at}
              tz={oh.timezone}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

// --- Detail sub-components ---------------------------------------------------

function SessionDetailView({ session, tz }: { session: UpcomingSession; tz: string }) {
  const fmtFull = (iso: string) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

  const startStr = fmtFull(session.starts_at);
  const endStr = session.ends_at ? fmtFull(session.ends_at) : null;

  const statusColor: Record<string, string> = {
    confirmed: '#22c55e', pending: '#f59e0b', cancelled: '#ef4444',
  };
  const color = statusColor[session.status] ?? '#6b7280';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
      <div>
        <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Client</span>
        <h3 className="il-title" style={{ margin: '0.2rem 0 0', fontSize: '1.2rem' }}>
          {session.client_name ?? '(unknown client)'}
        </h3>
      </div>

      <div>
        <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Schedule Time</span>
        <p style={{ margin: '0.2rem 0 0', fontWeight: 500, fontSize: '0.92rem', lineHeight: 1.4 }}>
          {startStr}
          {endStr ? (
            <>
              <br />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>to {endStr}</span>
            </>
          ) : ''}
        </p>
      </div>

      <div style={{ display: 'flex', gap: '2rem' }}>
        <div>
          <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Service Type</span>
          <p style={{ margin: '0.2rem 0 0', fontWeight: 500, fontSize: '0.92rem' }}>{session.service_type || 'General Consultation'}</p>
        </div>
        <div>
          <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Status</span>
          <p style={{ margin: '0.2rem 0 0', fontWeight: 500, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color }}>●</span> {session.status}
          </p>
        </div>
      </div>

      <div>
        <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Source Connection</span>
        <div style={{ marginTop: '0.25rem' }}>
          {session.source === 'pb' ? (
            <span className="il-pill il-pill--success" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
              ⚡ Practice Better Live Sync
            </span>
          ) : (
            <span className="il-pill il-pill--planned" style={{ display: 'inline-flex', gap: '0.35rem', alignItems: 'center' }}>
              💾 Offline Local Cache
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SlotDetailView({ startsAt, endsAt, tz }: { startsAt: string; endsAt: string; tz: string }) {
  const [copied, setCopied] = useState(false);

  const fmtFull = (iso: string) => new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));

  const startStr = fmtFull(startsAt);
  const endStr = endsAt ? fmtFull(endsAt) : null;

  const handleCopy = () => {
    const formattedText = `${startStr}${endStr ? ` to ${new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(new Date(endsAt))}` : ''}`;
    navigator.clipboard.writeText(formattedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', padding: '0.25rem 0' }}>
      <div>
        <span className="il-note" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.72rem' }}>Available Time</span>
        <p style={{ margin: '0.2rem 0 0', fontWeight: 500, fontSize: '0.92rem', lineHeight: 1.4 }}>
          {startStr}
          {endStr ? (
            <>
              <br />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>to {endStr}</span>
            </>
          ) : ''}
        </p>
      </div>

      <div className="il-note" style={{ background: 'var(--surface-2)', padding: '0.85rem', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', lineHeight: 1.4 }}>
        <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--text)' }}>How this slot is used:</strong>
        This open time slot is automatically suggested as a click-to-book option in re-engagement emails. You can copy the formatted time to send directly to your client.
      </div>

      <div>
        <button
          className={`il-button ${copied ? 'il-button--success' : 'il-button--primary'}`}
          style={{ width: '100%', justifyContent: 'center', padding: '0.65rem 0', fontWeight: 600 }}
          onClick={handleCopy}
        >
          {copied ? '✓ Copied!' : '📋 Copy Slot Date & Time'}
        </button>
      </div>
    </div>
  );
}
