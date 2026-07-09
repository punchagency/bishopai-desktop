import { useEffect, useState } from 'react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { InfoPopover } from '../components/InfoPopover';
import { fetchOfficeHours, saveOfficeHours, fetchServices } from '../lib/api';
import type { OfficeHours } from '../lib/types';

// Day names for the checkboxes
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Common IANA timezones Nicole might be in
const TIMEZONES = [
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/Paris',
  'Europe/Dublin',
  'Australia/Sydney',
  'Pacific/Auckland',
];

const DEFAULT: OfficeHours = {
  timezone: 'Europe/London',
  days: [1, 2, 3, 4, 5],
  start_hour: 9,
  end_hour: 17,
  session_duration_min: 60,
  slot_horizon_days: 7,
  max_slots: 3,
  service_id: '',
  service_type: 'virtual',
};

export function OfficeHoursCard({ backendUrl }: { backendUrl: string }) {
  const [oh, setOh] = useState<OfficeHours>(DEFAULT);
  const [saved, setSaved] = useState<OfficeHours>(DEFAULT);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [services, setServices] = useState<{ id: string; name: string; duration?: number; serviceTypes?: string[] }[]>([]);
  const [pbConfigured, setPbConfigured] = useState(false);

  useEffect(() => {
    fetchOfficeHours(backendUrl)
      .then((data) => { setOh(data); setSaved(data); })
      .catch(() => { /* server not up yet — keep defaults */ })
      .finally(() => setLoading(false));

    fetchServices(backendUrl)
      .then((res) => {
        setPbConfigured(res.pb_configured);
        setServices(res.items);
      })
      .catch(() => { /* offline / unconfigured */ });
  }, [backendUrl]);

  const dirty = JSON.stringify(oh) !== JSON.stringify(saved);

  const toggleDay = (d: number) => {
    setOh((prev) => ({
      ...prev,
      days: prev.days.includes(d) ? prev.days.filter((x) => x !== d) : [...prev.days, d].sort(),
    }));
    setMsg(null);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const updated = await saveOfficeHours(backendUrl, oh);
      setOh(updated);
      setSaved(updated);
      setMsg('Saved.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  return (
    <Card
      title="Office hours & availability"
      meta="Controls which times appear in re-engagement emails and the Schedule view"
      actions={
        <InfoPopover label="How availability settings work" title="About office hours">
          <p style={{ margin: '0 0 0.5rem' }}>
            Your office hours settings determine when you are available for client consultations.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>Timezone:</strong> Choose your practice timezone. The slot times in patient emails will automatically format to this timezone.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>Working days & hours:</strong> Check the days and select the hours you are open for bookings.
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            <strong>Practice Better Service:</strong> If Practice Better is connected, you can choose a specific service to associate with these bookings.
          </p>
          <p style={{ margin: 0 }}>
            <strong>Look-ahead & Max slots:</strong> Controls how many days in advance the system checks for availability, and the maximum number of suggested slot links that are injected into each re-engagement email.
          </p>
        </InfoPopover>
      }
    >
      {/* Timezone */}
      <div className="il-field">
        <label className="il-field__label" htmlFor="oh-tz">Timezone</label>
        <select
          id="oh-tz"
          className="il-input"
          value={oh.timezone}
          onChange={(e) => { setOh((p) => ({ ...p, timezone: e.target.value })); setMsg(null); }}
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
          {/* Allow a custom value if already set outside the list */}
          {!TIMEZONES.includes(oh.timezone) && (
            <option value={oh.timezone}>{oh.timezone}</option>
          )}
        </select>
      </div>

      {/* Working days */}
      <div className="il-field" style={{ marginTop: '0.75rem' }}>
        <label className="il-field__label">Working days</label>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
          {DAY_NAMES.map((name, idx) => (
            <label
              key={idx}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.25rem',
                padding: '0.2rem 0.6rem',
                borderRadius: '0.4rem',
                background: oh.days.includes(idx) ? 'var(--accent, #7c6bff)' : 'var(--surface-2, #2a2a2a)',
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: '0.85rem',
              }}
            >
              <input
                type="checkbox"
                style={{ display: 'none' }}
                checked={oh.days.includes(idx)}
                onChange={() => toggleDay(idx)}
              />
              {name}
            </label>
          ))}
        </div>
      </div>

      {/* Start / End hours */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <div className="il-field" style={{ flex: 1, minWidth: '120px' }}>
          <label className="il-field__label" htmlFor="oh-start">Opening time</label>
          <select
            id="oh-start"
            className="il-input"
            value={oh.start_hour}
            onChange={(e) => { setOh((p) => ({ ...p, start_hour: Number(e.target.value) })); setMsg(null); }}
          >
            {Array.from({ length: 24 }, (_, i) => (
              <option key={i} value={i}>{formatHour(i)}</option>
            ))}
          </select>
        </div>
        <div className="il-field" style={{ flex: 1, minWidth: '120px' }}>
          <label className="il-field__label" htmlFor="oh-end">Closing time</label>
          <select
            id="oh-end"
            className="il-input"
            value={oh.end_hour}
            onChange={(e) => { setOh((p) => ({ ...p, end_hour: Number(e.target.value) })); setMsg(null); }}
          >
            {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => (
              <option key={i} value={i}>{formatHour(i)}</option>
            ))}
          </select>
        </div>
        <div className="il-field" style={{ flex: 1, minWidth: '120px' }}>
          <label className="il-field__label" htmlFor="oh-dur">Session length</label>
          <select
            id="oh-dur"
            className="il-input"
            value={oh.session_duration_min}
            onChange={(e) => { setOh((p) => ({ ...p, session_duration_min: Number(e.target.value) })); setMsg(null); }}
          >
            {[30, 45, 60, 75, 90, 120].map((m) => (
              <option key={m} value={m}>{m} min</option>
            ))}
          </select>
        </div>
      </div>

      {/* Slot horizon + max */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
        <div className="il-field" style={{ flex: 1, minWidth: '120px' }}>
          <label className="il-field__label" htmlFor="oh-horizon">Look-ahead (days)</label>
          <select
            id="oh-horizon"
            className="il-input"
            value={oh.slot_horizon_days}
            onChange={(e) => { setOh((p) => ({ ...p, slot_horizon_days: Number(e.target.value) })); setMsg(null); }}
          >
            {[3, 5, 7, 10, 14].map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
        <div className="il-field" style={{ flex: 1, minWidth: '120px' }}>
          <label className="il-field__label" htmlFor="oh-max">Max slots in email</label>
          <select
            id="oh-max"
            className="il-input"
            value={oh.max_slots}
            onChange={(e) => { setOh((p) => ({ ...p, max_slots: Number(e.target.value) })); setMsg(null); }}
          >
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>
      {/* Practice Better Service dropdown (if PB configured) */}
      {pbConfigured && (
        <div style={{ display: 'flex', gap: '1rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <div className="il-field" style={{ flex: 2, minWidth: '200px' }}>
            <label className="il-field__label" htmlFor="oh-service">Practice Better Service</label>
            <select
              id="oh-service"
              className="il-input"
              value={oh.service_id || ''}
              onChange={(e) => {
                const val = e.target.value;
                const match = services.find((s) => s.id === val);
                setOh((p) => ({
                  ...p,
                  service_id: val,
                  session_duration_min: match?.duration ?? p.session_duration_min,
                  service_type: match?.serviceTypes?.[0] ?? p.service_type,
                }));
                setMsg(null);
              }}
            >
              <option value="">-- Automatic / first match --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.duration ? `(${s.duration} min)` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="il-field" style={{ flex: 1, minWidth: '150px' }}>
            <label className="il-field__label" htmlFor="oh-service-type">Location / Type</label>
            <select
              id="oh-service-type"
              className="il-input"
              value={oh.service_type || 'virtual'}
              onChange={(e) => { setOh((p) => ({ ...p, service_type: e.target.value })); setMsg(null); }}
            >
              <option value="virtual">Virtual / Video</option>
              <option value="phone">Phone Call</option>
              <option value="face">In-Person</option>
            </select>
          </div>
        </div>
      )}

      <div className="il-card__row" style={{ marginTop: '0.9rem' }}>
        {error && <span className="il-error">{error}</span>}
        {msg && !error && <span className="il-error" style={{ color: 'var(--text-muted)' }}>{msg}</span>}
        <Button
          variant="primary"
          disabled={busy || !dirty || oh.start_hour >= oh.end_hour || oh.days.length === 0}
          onClick={save}
        >
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {oh.start_hour >= oh.end_hour && (
        <p className="il-view__sub" style={{ color: 'var(--error, #ef4444)' }}>
          Opening time must be before closing time.
        </p>
      )}
    </Card>
  );
}

function formatHour(h: number): string {
  const d = new Date(0);
  d.setUTCHours(h % 24);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'UTC' });
}
