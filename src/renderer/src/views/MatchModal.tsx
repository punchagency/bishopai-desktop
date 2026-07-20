import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import {
  assignConversationToClient,
  fetchCandidates,
  fetchClients,
  matchConversation,
} from '../lib/api';
import { formatDate } from '../lib/format';
import type { CandidateAppointment, ClientSummary, UnmatchedConversation } from '../lib/types';

interface Props {
  backendUrl: string;
  conversation: UnmatchedConversation;
  onClose: () => void;
  onMatched: () => void;
}

type Mode = 'booking' | 'walkin';

/** Why a candidate sits where it does in the list. */
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

export function MatchModal({ backendUrl, conversation, onClose, onMatched }: Props) {
  const [mode, setMode] = useState<Mode>('booking');
  const [candidates, setCandidates] = useState<CandidateAppointment[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [clientQuery, setClientQuery] = useState('');
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSample = conversation.id.length < 20; // seeded sample rows use short ids

  useEffect(() => {
    if (isSample) {
      setCandidates([]);
      return;
    }
    fetchCandidates(backendUrl, conversation.id)
      .then((r) => setCandidates(r.appointments))
      .catch((e) => setError(String(e)));
  }, [backendUrl, conversation.id, isSample]);

  // The client list is only needed once she switches to the walk-in path.
  useEffect(() => {
    if (mode !== 'walkin' || isSample) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchClients(backendUrl, clientQuery, ctrl.signal)
        .then((r) => setClients(r.clients))
        .catch(() => setClients([]));
    }, 200); // debounce typing
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [mode, clientQuery, backendUrl, isSample]);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'booking') {
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

  const canConfirm = mode === 'booking' ? !!selected : !!selectedClient;

  return (
    <Modal
      title="Assign this recording"
      onClose={onClose}
      footer={
        <div className="il-modal__actions">
          {error && <span className="il-error">{error}</span>}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!canConfirm || busy}>
            {busy ? 'Assigning…' : mode === 'booking' ? 'Assign to appointment' : 'Assign to client'}
          </Button>
        </div>
      }
    >
      <div className="il-tabs">
        <button
          className={`il-tab ${mode === 'booking' ? 'il-tab--on' : ''}`}
          onClick={() => setMode('booking')}
        >
          A booked appointment
        </button>
        <button
          className={`il-tab ${mode === 'walkin' ? 'il-tab--on' : ''}`}
          onClick={() => setMode('walkin')}
        >
          No booking
        </button>
      </div>

      {mode === 'booking' ? (
        <>
          <p className="il-card__meta il-assign__intro">
            Ranked by what the recording itself suggests — a name spoken in the session outranks a
            booking that merely overlaps it. Nothing is assigned until you choose.
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
                        {new Date(a.starts_at).toLocaleString()}
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
