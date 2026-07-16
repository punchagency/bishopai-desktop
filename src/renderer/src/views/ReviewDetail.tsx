import { useEffect, useState } from 'react';
import { marked } from 'marked';
import { Modal } from '../components/Modal';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import { approveItem, fetchItem, fetchRendered, patchItem } from '../lib/api';
import type { ReviewKind, SessionNote } from '../lib/types';
import { NoteEditor } from './NoteEditor';

interface Props {
  backendUrl: string;
  kind: ReviewKind;
  id: string;
  clientName: string;
  onClose: () => void;
  onChanged: () => void; // refresh the queue after save/approve
}

type Tab = 'preview' | 'edit';

export function ReviewDetail({ backendUrl, kind, id, clientName, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('preview');
  const [note, setNote] = useState<SessionNote | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSample = id.startsWith('sample-');

  const loadPreview = () => {
    if (isSample) {
      setMarkdown('_Preview needs a running backend — this is offline sample data._');
      return;
    }
    fetchRendered(backendUrl, kind, id)
      .then((r) => setMarkdown(r.markdown))
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    if (isSample) {
      setNote({ concerns: [], assessments: [], protocol_changes: [], supplements: [], follow_ups: [] });
      loadPreview();
      return;
    }
    fetchItem(backendUrl, kind, id)
      .then((row) => setNote(row.content_json))
      .catch((e) => setError(String(e)));
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, kind, id]);

  const save = async () => {
    if (!note || isSample) return;
    setBusy(true);
    setError(null);
    try {
      await patchItem(backendUrl, kind, id, { content_json: note });
      loadPreview();
      setTab('preview');
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (isSample) return;
    setBusy(true);
    setError(null);
    try {
      await approveItem(backendUrl, kind, id);
      onChanged();
      onClose();
    } catch (e) {
      setError(String(e));
      setBusy(false);
    }
  };

  const label = kind === 'sheets' ? 'Appointment Sheet' : 'Protocol';

  return (
    <Modal
      title={`${clientName} · ${label}`}
      onClose={onClose}
      footer={
        <div className="il-modal__actions">
          {error && <span className="il-error">{error}</span>}
          {tab === 'edit' ? (
            <>
              <Button variant="ghost" onClick={() => setTab('preview')} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={save} disabled={busy || isSample}>
                {busy ? 'Saving…' : 'Save changes'}
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setTab('edit')} disabled={isSample}>
                Edit
              </Button>
              <Button variant="primary" onClick={approve} disabled={busy || isSample}>
                {busy ? 'Approving…' : 'Approve'}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="il-tabs">
        <button className={`il-tab ${tab === 'preview' ? 'il-tab--on' : ''}`} onClick={() => setTab('preview')}>
          Preview
        </button>
        <button className={`il-tab ${tab === 'edit' ? 'il-tab--on' : ''}`} onClick={() => setTab('edit')}>
          Edit
        </button>
        {isSample && <Badge tone="warning">offline sample</Badge>}
      </div>

      {tab === 'preview' ? (
        markdown
          ? <div
              className="il-prose"
              dangerouslySetInnerHTML={{ __html: marked.parse(markdown) as string }}
            />
          : <p className="il-empty">Loading…</p>
      ) : note ? (
        <NoteEditor note={note} onChange={setNote} />
      ) : (
        <p className="il-empty">Loading…</p>
      )}
    </Modal>
  );
}
