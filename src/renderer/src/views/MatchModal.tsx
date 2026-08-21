import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import {
  assignConversationToClient,
  fetchCandidates,
  fetchClients,
  fetchSegments,
  matchConversation,
  splitUnmatchedConversation,
} from '../lib/api';
import { formatDate } from '../lib/format';
import type { CandidateAppointment, ClientSummary, UnmatchedConversation } from '../lib/types';
import { IconScissors, IconRefresh } from '../components/Icons';
import { SessionTimelineBar } from '../components/SessionTimelineBar';

interface Props {
  backendUrl: string;
  conversation: UnmatchedConversation;
  onClose: () => void;
  onMatched: () => void;
}

type Mode = 'multisession' | 'booking' | 'walkin';

interface EditableSegment {
  id: number;
  from_turn: number;
  to_turn: number;
  appointment_id?: string;
  client_name_hint?: string | null;
  snippet: string;
  time_disagreement_note?: string | null;
}

function evidence(a: CandidateAppointment): string | null {
  const bits: string[] = [];
  if (a.name_mentions > 0) {
    const form =
      a.name_matched_on === 'full' ? 'full name' : a.name_matched_on === 'last' ? 'surname' : 'name';
    bits.push(`${form} heard ${a.name_mentions}×`);
  }
  if (a.overlap_seconds > 0) {
    const mins = Math.round(a.overlap_seconds / 60);
    bits.push(mins >= 1 ? `overlaps ${mins} min` : 'overlaps briefly');
  }
  return bits.length ? bits.join(' · ') : null;
}

function formatCandidateLabel(cand: CandidateAppointment): string {
  const name = cand.client_name ?? 'Unbooked appointment';
  const time = cand.starts_at
    ? new Date(cand.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';
  const why = evidence(cand);
  return `${name}${time ? ` (${time})` : ''}${why ? ` — ${why}` : ''}`;
}

export function MatchModal({ backendUrl, conversation, onClose, onMatched }: Props) {
  const [mode, setMode] = useState<Mode>('booking');
  const [candidates, setCandidates] = useState<CandidateAppointment[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  // Real turn count from the backend's parse, so a manual split is bounded by
  // the recording rather than by a guessed constant.
  const [totalTurns, setTotalTurns] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSample = conversation.id.length < 20;

  useEffect(() => {
    if (isSample) {
      setCandidates([]);
      return;
    }

    Promise.all([
      fetchCandidates(backendUrl, conversation.id).catch(() => ({ appointments: [] })),
      fetchSegments(backendUrl, conversation.id).catch(() => ({ segments: [], candidates: [], turns: [] })),
    ])
      .then(([candRes, segRes]) => {
        setTotalTurns(segRes.turns?.length ?? 0);
        const mergedCandidates = segRes.candidates?.length ? segRes.candidates : candRes.appointments;
        setCandidates(mergedCandidates);

        const usedApptIds = new Set<string>();

        const loadedSegs: EditableSegment[] = (segRes.segments || []).map((s, idx) => {
          // 1. Use server-side overlap-maximising assignment if present.
          let matchedApptId: string | undefined =
            s.suggested_appointment_id &&
            mergedCandidates.some((c) => c.id === s.suggested_appointment_id)
              ? s.suggested_appointment_id
              : undefined;

          if (!matchedApptId) {
            // 2. Fallback: name hint match among unused candidates
            if (s.client_name_hint) {
              const firstName = s.client_name_hint.split(' ')[0].toLowerCase();
              const hit = mergedCandidates.find(
                (c) => !usedApptIds.has(c.id) && c.client_name?.toLowerCase().includes(firstName),
              );
              if (hit) matchedApptId = hit.id;
            }

            // 3. Fallback: first unused candidate with real overlap
            if (!matchedApptId) {
              const firstOverlapping = mergedCandidates.find(
                (c) => !usedApptIds.has(c.id) && c.overlap_seconds > 0,
              );
              if (firstOverlapping) matchedApptId = firstOverlapping.id;
            }
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
            time_disagreement_note: s.time_disagreement_note,
          };
        });

        // Fallback default if no segments returned
        if (loadedSegs.length === 0) {
          loadedSegs.push({
            id: 1,
            from_turn: 1,
            to_turn: Math.max(1, segRes.turns?.length ?? 1),
            snippet: conversation.transcript_preview ?? '',
          });
        }

        setSegments(loadedSegs);
        if (loadedSegs.length >= 2) {
          setMode('multisession');
        }
      })
      .catch((e) => setError(String(e)));
  }, [backendUrl, conversation.id, isSample]);

  useEffect(() => {
    if (mode !== 'walkin' || isSample) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchClients(backendUrl, clientQuery, ctrl.signal)
        .then((r) => setClients(r.clients))
        .catch(() => setClients([]));
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [mode, clientQuery, backendUrl, isSample]);

  const updateSegmentAppointment = (segId: number, apptId: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === segId ? { ...s, appointment_id: apptId || undefined } : s)),
    );
  };

  const updateTurnRange = (segId: number, field: 'from_turn' | 'to_turn', value: number) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segId);
      if (idx < 0) return prev;

      const nextState = [...prev];
      nextState[idx] = { ...nextState[idx], [field]: value };

      // Auto-healing zero-gap boundary constraint:
      // If to_turn of segment i changes, automatically adjust from_turn of segment i+1
      if (field === 'to_turn' && idx < nextState.length - 1) {
        nextState[idx + 1] = { ...nextState[idx + 1], from_turn: value + 1 };
      }
      // If from_turn of segment i changes, automatically adjust to_turn of segment i-1
      if (field === 'from_turn' && idx > 0) {
        nextState[idx - 1] = { ...nextState[idx - 1], to_turn: Math.max(1, value - 1) };
      }

      return nextState;
    });
  };

  const mergeWithNext = (segId: number) => {
    setSegments((prev) => {
      const idx = prev.findIndex((s) => s.id === segId);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const current = prev[idx];
      const next = prev[idx + 1];
      const merged: EditableSegment = {
        ...current,
        to_turn: next.to_turn,
      };
      return [...prev.slice(0, idx), merged, ...prev.slice(idx + 2)].map((s, i) => ({ ...s, id: i + 1 }));
    });
  };

  const redetectBoundaries = async () => {
    setBusy(true);
    try {
      const res = await fetchSegments(backendUrl, conversation.id);
      setTotalTurns(res.turns?.length ?? 0);
      const cands: CandidateAppointment[] = res.candidates ?? candidates ?? [];
      const usedIds = new Set<string>();
      const loadedSegs: EditableSegment[] = (res.segments || []).map((s, idx) => {
        let matchedApptId: string | undefined =
          s.suggested_appointment_id && cands.some((c) => c.id === s.suggested_appointment_id)
            ? s.suggested_appointment_id
            : undefined;
        if (!matchedApptId && s.client_name_hint) {
          const fn = s.client_name_hint.split(' ')[0].toLowerCase();
          const hit = cands.find((c) => !usedIds.has(c.id) && c.client_name?.toLowerCase().includes(fn));
          if (hit) matchedApptId = hit.id;
        }
        if (!matchedApptId) {
          const firstOver = cands.find((c) => !usedIds.has(c.id) && c.overlap_seconds > 0);
          if (firstOver) matchedApptId = firstOver.id;
        }
        if (matchedApptId) usedIds.add(matchedApptId);
        return {
          id: idx + 1,
          from_turn: s.from_turn,
          to_turn: s.to_turn,
          appointment_id: matchedApptId,
          client_name_hint: s.client_name_hint,
          snippet: s.snippet,
          time_disagreement_note: s.time_disagreement_note,
        };
      });
      if (loadedSegs.length > 0) {
        setSegments(loadedSegs);
      }
    } catch {
      // keep current
    } finally {
      setBusy(false);
    }
  };

  const addSegment = () => {
    setSegments((prev) => {
      if (prev.length === 0) {
        return [{ id: 1, from_turn: 1, to_turn: Math.max(1, totalTurns), snippet: '' }];
      }
      const last = prev[prev.length - 1];
      const mid = Math.max(last.from_turn + 1, Math.floor((last.from_turn + last.to_turn) / 2));
      const updatedLast = { ...last, to_turn: mid };
      const newSeg: EditableSegment = {
        id: prev.length + 1,
        from_turn: mid + 1,
        to_turn: last.to_turn,
        snippet: 'Manual split segment',
      };
      return [...prev.slice(0, -1), updatedLast, newSeg];
    });
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'multisession') {
        const payload = segments.map((s) => ({
          from_turn: s.from_turn,
          to_turn: s.to_turn,
          appointment_id: s.appointment_id,
        }));
        await splitUnmatchedConversation(backendUrl, conversation.id, payload);
      } else if (mode === 'booking') {
        if (!selected) return;
        await matchConversation(backendUrl, conversation.id, selected);
      } else {
        if (!selectedClient) return;
        await assignConversationToClient(backendUrl, conversation.id, selectedClient);
      }
      onMatched();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const canConfirm =
    mode === 'multisession'
      ? segments.length > 0
      : mode === 'booking'
      ? !!selected
      : !!selectedClient;

  return (
    <Modal
      title="Assign & Tag Recording"
      onClose={onClose}
      footer={
        <div className="il-modal__actions">
          {error && <span className="il-error">{error}</span>}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!canConfirm || busy}>
            {busy
              ? 'Processing…'
              : mode === 'multisession'
              ? 'Split & Assign Sessions'
              : mode === 'booking'
              ? 'Assign Single Session'
              : 'Assign Walk-in Client'}
          </Button>
        </div>
      }
    >
      <div className="il-tabs" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
        <button
          className={`il-tab ${mode === 'multisession' ? 'il-tab--on' : ''}`}
          onClick={() => setMode('multisession')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: '#c87850', fontWeight: 600 }}
        >
          <IconScissors size={14} />
          Split Multi-Session ({segments.length})
        </button>
        <button
          className={`il-tab ${mode === 'booking' ? 'il-tab--on' : ''}`}
          onClick={() => setMode('booking')}
        >
          Single Booked Appointment
        </button>
        <button
          className={`il-tab ${mode === 'walkin' ? 'il-tab--on' : ''}`}
          onClick={() => setMode('walkin')}
        >
          No booking (Walk-in)
        </button>
      </div>

      {mode === 'multisession' ? (
        <div style={{ padding: '0.25rem 0' }}>
          <SessionTimelineBar
            totalTurns={Math.max(totalTurns, segments[segments.length - 1]?.to_turn ?? 1)}
            segments={segments}
            candidates={candidates ?? []}
            onMergeWithNext={mergeWithNext}
          />

          <p className="il-card__meta il-assign__intro" style={{ marginBottom: '1rem' }}>
            Assign each session segment to its client appointment below, or click <strong>+ Add Split Segment</strong> to break the recording at custom turns:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', maxHeight: '320px', overflowY: 'auto' }}>
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: '#c87850' }}>
                    Session Encounter #{idx + 1}
                  </strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                    <span>Turns:</span>
                    <input
                      type="number"
                      className="il-input"
                      style={{ width: '4.2rem', padding: '0.15rem 0.35rem', fontSize: '0.8rem' }}
                      value={seg.from_turn}
                      onChange={(e) => updateTurnRange(seg.id, 'from_turn', parseInt(e.target.value) || 1)}
                    />
                    <span>to</span>
                    <input
                      type="number"
                      className="il-input"
                      style={{ width: '4.2rem', padding: '0.15rem 0.35rem', fontSize: '0.8rem' }}
                      value={seg.to_turn}
                      onChange={(e) => updateTurnRange(seg.id, 'to_turn', parseInt(e.target.value) || 1)}
                    />
                  </div>
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--il-color-text-subtle)', marginBottom: '0.2rem' }}>
                    Assign to Client / Appointment:
                  </label>
                  <select
                    className="il-input"
                    style={{ width: '100%', padding: '0.4rem', fontSize: '0.85rem' }}
                    value={seg.appointment_id ?? ''}
                    onChange={(e) => updateSegmentAppointment(seg.id, e.target.value)}
                  >
                    <option value="">-- Hold in Unmatched --</option>
                    {(candidates ?? []).map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {formatCandidateLabel(cand)}
                      </option>
                    ))}
                  </select>
                </div>

                {seg.time_disagreement_note && (
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#b45309',
                      background: 'rgba(251,191,36,0.10)',
                      border: '1px solid rgba(251,191,36,0.35)',
                      padding: '0.3rem 0.55rem',
                      borderRadius: '4px',
                      marginBottom: '0.4rem',
                    }}
                  >
                    ⚠️ {seg.time_disagreement_note}
                  </div>
                )}
                {seg.snippet && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--il-color-text-subtle)', background: 'rgba(0,0,0,0.03)', padding: '0.35rem 0.55rem', borderRadius: '4px', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    "{seg.snippet}"
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <Button variant="secondary" onClick={addSegment} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                + Add Split Segment
              </Button>
              <Button variant="ghost" onClick={redetectBoundaries} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <IconRefresh size={13} /> Re-detect AI
              </Button>
            </div>
            {segments.length > 1 && (
              <Button
                variant="ghost"
                onClick={() => setSegments(segments.slice(0, -1))}
                style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', color: '#ef4444' }}
              >
                Remove Last Segment
              </Button>
            )}
          </div>
        </div>
      ) : mode === 'booking' ? (
        <>
          <p className="il-card__meta il-assign__intro">
            Ranked by evidence spoken in the transcript — name mentions outrank time overlap alone.
            Nothing is assigned until you choose.
          </p>
          {candidates === null ? (
            <p className="il-empty">Loading candidates…</p>
          ) : candidates.length === 0 ? (
            <p className="il-empty">
              {isSample ? 'Preview needs a running backend.' : 'No appointments available to match.'}
            </p>
          ) : (
            <ul className="il-choices">
              {candidates.map((a) => {
                const why = evidence(a);
                return (
                  <li key={a.id}>
                    <label className={`il-choice ${selected === a.id ? 'il-choice--on' : ''}`}>
                      <input
                        type="radio"
                        name="candidate"
                        checked={selected === a.id}
                        onChange={() => setSelected(a.id)}
                      />
                      <span className="il-choice__name">{a.client_name ?? 'Unknown client'}</span>
                      <span className="il-choice__meta">
                        {new Date(a.starts_at).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                      </span>
                      {why && <span className="il-choice__why">{why}</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="il-card__meta il-assign__intro">
            For a walk-in, a phone call, or anything that never made it onto the calendar. The
            appointment is created from the recording's own time.
          </p>
          <input
            className="il-input"
            value={clientQuery}
            placeholder="Search clients by name or email"
            onChange={(e) => setClientQuery(e.target.value)}
          />
          {clients === null ? (
            <p className="il-empty">Loading clients…</p>
          ) : clients.length === 0 ? (
            <p className="il-empty">No clients match that search.</p>
          ) : (
            <ul className="il-choices">
              {clients.map((c) => (
                <li key={c.id}>
                  <label className={`il-choice ${selectedClient === c.id ? 'il-choice--on' : ''}`}>
                    <input
                      type="radio"
                      name="client"
                      checked={selectedClient === c.id}
                      onChange={() => setSelectedClient(c.id)}
                    />
                    <span className="il-choice__name">{c.name}</span>
                    <span className="il-choice__meta">
                      {c.last_seen ? `Last seen ${formatDate(c.last_seen)}` : 'No visits yet'}
                      {c.email ? ` · ${c.email}` : ''}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
