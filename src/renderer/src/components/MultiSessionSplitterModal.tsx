import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import {
  fetchCandidates,
  fetchSegments,
  splitUnmatchedConversation,
  type SessionSegment,
} from '../lib/api';
import type { CandidateAppointment, UnmatchedConversation } from '../lib/types';

interface Props {
  backendUrl: string;
  conversation: UnmatchedConversation;
  onClose: () => void;
  onSplitCompleted: () => void;
  onTreatAsSingleSession?: () => void;
}

interface EditableSegment {
  id: number;
  from_turn: number;
  to_turn: number;
  appointment_id?: string;
  client_name_hint?: string | null;
  snippet: string;
}

function formatCandidateLabel(cand: CandidateAppointment): string {
  const name = cand.client_name ?? 'Unbooked appointment';
  const time = cand.starts_at
    ? new Date(cand.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const evidenceParts: string[] = [];
  if (cand.name_mentions > 0) {
    const form =
      cand.name_matched_on === 'full'
        ? 'full name'
        : cand.name_matched_on === 'last'
        ? 'surname'
        : 'name';
    evidenceParts.push(`${form} heard ${cand.name_mentions}×`);
  }
  if (cand.overlap_seconds > 0) {
    const mins = Math.round(cand.overlap_seconds / 60);
    evidenceParts.push(mins >= 1 ? `overlaps ${mins}m` : 'overlaps briefly');
  }

  const evText = evidenceParts.length ? ` — ${evidenceParts.join(' · ')}` : '';
  return `${name}${time ? ` (${time})` : ''}${evText}`;
}

export function MultiSessionSplitterModal({
  backendUrl,
  conversation,
  onClose,
  onSplitCompleted,
  onTreatAsSingleSession,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateAppointment[]>([]);
  const [segments, setSegments] = useState<EditableSegment[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchCandidates(backendUrl, conversation.id).catch(() => ({ appointments: [] })),
      fetchSegments(backendUrl, conversation.id).catch(() => ({ segments: [], candidates: [] })),
    ])
      .then(([candRes, segRes]) => {
        if (!active) return;
        // Combine scored candidates
        const mergedCandidates = segRes.candidates?.length ? segRes.candidates : candRes.appointments;
        setCandidates(mergedCandidates);

        const usedApptIds = new Set<string>();

        const loadedSegs: EditableSegment[] = segRes.segments.map((s, idx) => {
          let matchedApptId: string | undefined = undefined;

          // 1. Try matching by name hint
          if (s.client_name_hint) {
            const firstName = s.client_name_hint.split(' ')[0].toLowerCase();
            const hit = mergedCandidates.find(
              (c) => !usedApptIds.has(c.id) && c.client_name?.toLowerCase().includes(firstName),
            );
            if (hit) matchedApptId = hit.id;
          }

          // 2. Fallback: Match by chronological index position among candidates
          if (!matchedApptId && mergedCandidates[idx] && !usedApptIds.has(mergedCandidates[idx].id)) {
            matchedApptId = mergedCandidates[idx].id;
          }

          // 3. Fallback: Pick first unused candidate
          if (!matchedApptId) {
            const firstUnused = mergedCandidates.find((c) => !usedApptIds.has(c.id));
            if (firstUnused) matchedApptId = firstUnused.id;
          }

          if (matchedApptId) {
            usedApptIds.add(matchedApptId);
          }

          return {
            id: idx + 1,
            from_turn: s.from_turn,
            to_turn: s.to_turn,
            appointment_id: matchedApptId,
            client_name_hint: s.client_name_hint,
            snippet: s.snippet,
          };
        });

        setSegments(loadedSegs);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        setError(String(e));
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [backendUrl, conversation.id]);

  const updateSegmentAppointment = (segId: number, apptId: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, appointment_id: apptId || undefined } : s)),
    );
  };

  const updateTurnRange = (segId: number, field: 'from_turn' | 'to_turn', value: number) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, [field]: value } : s)),
    );
  };

  const confirmSplit = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = segments.map((s) => ({
        from_turn: s.from_turn,
        to_turn: s.to_turn,
        appointment_id: s.appointment_id,
      }));

      await splitUnmatchedConversation(backendUrl, conversation.id, payload);
      onSplitCompleted();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Multi-Session Splitter"
      onClose={onClose}
      footer={
        <div className="il-modal__actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {error && <span className="il-error">{error}</span>}
          {onTreatAsSingleSession && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onTreatAsSingleSession();
              }}
              disabled={busy}
              title="Treat this recording as a single continuous session"
            >
              Treat as Single Session
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirmSplit} disabled={busy || loading || segments.length === 0}>
            {busy ? 'Splitting & Extracting…' : 'Split & Extract Sessions'}
          </Button>
        </div>
      }
    >
      <div style={{ padding: '0.5rem 0' }}>
        <p className="il-meta" style={{ marginBottom: '1rem', fontSize: '0.875rem' }}>
          This recording spans multiple appointments. We auto-detected session transition boundaries below.
          Assign each segment to its appointment or adjust the turn ranges as needed.
        </p>

        {loading ? (
          <p className="il-empty">Analyzing session boundaries…</p>
        ) : segments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1rem' }}>
            <p className="il-empty" style={{ marginBottom: '1rem' }}>
              No clear session boundaries detected. You can assign the entire recording to a single client.
            </p>
            {onTreatAsSingleSession && (
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onTreatAsSingleSession();
                }}
              >
                Assign Entire Recording (Single Session)
              </Button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {segments.map((seg, idx) => (
              <div
                key={seg.id}
                style={{
                  padding: '0.85rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--il-color-surface-raised, rgba(0,0,0,0.02))',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: '#c87850' }}>
                    Session #{idx + 1}
                  </strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <span>Turns:</span>
                    <input
                      type="number"
                      className="il-input"
                      style={{ width: '4.5rem', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                      value={seg.from_turn}
                      onChange={(e) => updateTurnRange(seg.id, 'from_turn', parseInt(e.target.value) || 1)}
                    />
                    <span>to</span>
                    <input
                      type="number"
                      className="il-input"
                      style={{ width: '4.5rem', padding: '0.2rem 0.4rem', fontSize: '0.8rem' }}
                      value={seg.to_turn}
                      onChange={(e) => updateTurnRange(seg.id, 'to_turn', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '0.6rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--il-color-text-subtle)', marginBottom: '0.25rem' }}>
                    Assign to Appointment:
                  </label>
                  <select
                    className="il-input"
                    style={{ width: '100%', padding: '0.45rem', fontSize: '0.85rem' }}
                    value={seg.appointment_id ?? ''}
                    onChange={(e) => updateSegmentAppointment(seg.id, e.target.value)}
                  >
                    <option value="">-- Unassigned (Hold in Unmatched) --</option>
                    {candidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {formatCandidateLabel(cand)}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ fontSize: '0.78rem', color: 'var(--il-color-text-subtle)', background: 'rgba(0,0,0,0.03)', padding: '0.4rem 0.6rem', borderRadius: '4px', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  "{seg.snippet}"
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
