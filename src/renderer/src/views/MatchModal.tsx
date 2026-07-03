import { useEffect, useState } from 'react';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { fetchCandidates, matchConversation } from '../lib/api';
import type { CandidateAppointment, UnmatchedConversation } from '../lib/types';

interface Props {
  backendUrl: string;
  conversation: UnmatchedConversation;
  onClose: () => void;
  onMatched: () => void;
}

export function MatchModal({ backendUrl, conversation, onClose, onMatched }: Props) {
  const [candidates, setCandidates] = useState<CandidateAppointment[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
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

  const confirm = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await matchConversation(backendUrl, conversation.id, selected);
      onMatched();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Match to appointment"
      onClose={onClose}
      footer={
        <div className="il-modal__actions">
          {error && <span className="il-error">{error}</span>}
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={!selected || busy}>
            {busy ? 'Matching…' : 'Match'}
          </Button>
        </div>
      }
    >
      <p className="il-card__meta" style={{ marginBottom: '0.9rem' }}>
        Pick the appointment this Bee conversation belongs to. Matching correlates it and runs
        extraction — we never auto-guess.
      </p>

      {candidates === null ? (
        <p className="il-empty">Loading candidates…</p>
      ) : candidates.length === 0 ? (
        <p className="il-empty">
          {isSample ? 'Preview needs a running backend.' : 'No appointments available to match.'}
        </p>
      ) : (
        <ul className="il-choices">
          {candidates.map((a) => (
            <li key={a.id}>
              <label className={`il-choice ${selected === a.id ? 'il-choice--on' : ''}`}>
                <input
                  type="radio"
                  name="candidate"
                  checked={selected === a.id}
                  onChange={() => setSelected(a.id)}
                />
                <span className="il-choice__name">{a.client_name ?? 'Unknown client'}</span>
                <span className="il-choice__meta">{new Date(a.starts_at).toLocaleString()}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
