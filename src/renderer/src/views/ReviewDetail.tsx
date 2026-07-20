import { useEffect, useState } from 'react';
import { Markdown } from '../components/Markdown';
import { Button } from '../components/Button';
import { Badge } from '../components/Badge';
import {
  amendItem,
  approveItem,
  fetchItem,
  fetchRendered,
  fetchReviewContext,
  fetchRevisions,
  fetchSessionHistory,
  patchItem,
  type NoteRevision,
} from '../lib/api';
import { formatDate } from '../lib/format';
import type { PriorNote, ReviewContext, ReviewKind, SessionNote } from '../lib/types';
import { NoteEditor } from './NoteEditor';
import { FlowSheetPanel } from './FlowSheetPanel';
import { SupplementProtocolPanel } from './SupplementProtocolPanel';
import { SessionHistoryPanel } from './SessionHistoryPanel';

interface Props {
  backendUrl: string;
  kind: ReviewKind;
  id: string;
  clientName: string;
  clientId: string | null;
  onClose: () => void;
  onChanged: () => void; // refresh the queue after save/approve
}

type Tab = 'preview' | 'edit' | 'flowsheet' | 'history' | 'supplement';

export function ReviewDetail({ backendUrl, kind, id, clientName, onClose, onChanged }: Props) {
  const [tab, setTab] = useState<Tab>('preview');
  const [note, setNote] = useState<SessionNote | null>(null);
  const [markdown, setMarkdown] = useState<string>('');
  const [context, setContext] = useState<ReviewContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [status, setStatus] = useState<string>('');
  // An approved note is read-only: its documents are already in Drive and may be
  // with the client, so corrections go through Amend, which keeps the superseded
  // version and republishes deliberately.
  const [amending, setAmending] = useState(false);
  const [reason, setReason] = useState('');
  // The amend model only means anything if the superseded version is actually
  // reachable. Storing history nobody can read is the same as not keeping it.
  const [revisions, setRevisions] = useState<NoteRevision[]>([]);
  const [history, setHistory] = useState<PriorNote[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const isSample = id.startsWith('sample-');
  const isApproved = status === 'approved';

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
    setLoadFailed(false);
    fetchItem(backendUrl, kind, id)
      .then((row) => {
        setNote(row.content_json);
        setStatus(row.status);
      })
      .catch((e) => {
        setError(String(e));
        setLoadFailed(true);
      });
    loadPreview();
    fetchReviewContext(backendUrl, kind, id)
      .then(setContext)
      .catch(() => setContext(null)); // comparison panels just show less — never block the review
    fetchRevisions(backendUrl, kind, id)
      .then((r) => setRevisions(r.revisions))
      .catch(() => setRevisions([]));
    setHistoryLoading(true);
    fetchSessionHistory(backendUrl, kind, id)
      .then((r) => {
        setHistory(r.sessions);
        setHistoryTotal(r.total);
      })
      .catch(() => setHistory([]))
      .finally(() => setHistoryLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, kind, id]);

  const save = async () => {
    if (!note || isSample) return;
    // Belt and braces: the UI doesn't offer a plain save on an approved note,
    // and the backend refuses one, but don't fire a request that can only 409.
    if (isApproved && !amending) return;
    setBusy(true);
    setError(null);
    try {
      if (amending) {
        const r = await amendItem(backendUrl, kind, id, {
          content_json: note,
          reason: reason.trim() || undefined,
        });
        setAmending(false);
        setReason('');
        setStatus(r.status);
        const hist = await fetchRevisions(backendUrl, kind, id).catch(() => null);
        if (hist) setRevisions(hist.revisions);
      } else {
        await patchItem(backendUrl, kind, id, { content_json: note });
      }
      loadPreview();
      setTab('preview');
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const startAmend = () => {
    setAmending(true);
    setTab('edit');
  };

  const cancelEdit = () => {
    setAmending(false);
    setReason('');
    setTab('preview');
    // Drop in-memory edits so a cancelled amendment can't be saved later.
    fetchItem(backendUrl, kind, id)
      .then((row) => setNote(row.content_json))
      .catch(() => {});
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
    <div className="il-detail">
      <header className="il-detail__head">
        {/* Only needed when the panes collapse to one column; the queue is
            otherwise still on screen to the left. */}
        <Button variant="ghost" onClick={onClose}>
          ← Sessions
        </Button>
        <div className="il-detail__title">
          <h2>{clientName}</h2>
          <span className="il-detail__kind">{label}</span>
          {isApproved && <Badge tone="success">Approved</Badge>}
        </div>
      </header>

      <div className="il-tabs">
        <button className={`il-tab ${tab === 'preview' ? 'il-tab--on' : ''}`} onClick={() => setTab('preview')}>
          Preview
        </button>
        {/* An approved note has no editable state to offer: the only way to
            change it is Amend, which sets `amending` and opens this tab. */}
        {(!isApproved || amending) && (
          <button className={`il-tab ${tab === 'edit' ? 'il-tab--on' : ''}`} onClick={() => setTab('edit')}>
            {amending ? 'Amending' : 'Edit'}
          </button>
        )}
        <button className={`il-tab ${tab === 'flowsheet' ? 'il-tab--on' : ''}`} onClick={() => setTab('flowsheet')}>
          Flow Sheet
        </button>
        <button className={`il-tab ${tab === 'history' ? 'il-tab--on' : ''}`} onClick={() => setTab('history')}>
          History{history.length > 0 && <span className="il-tab__count">{history.length}</span>}
        </button>
        <button className={`il-tab ${tab === 'supplement' ? 'il-tab--on' : ''}`} onClick={() => setTab('supplement')}>
          Supplement Protocol
        </button>
        {isSample && <Badge tone="warning">offline sample</Badge>}
      </div>

      {revisions.length > 0 && (
        <div className="il-amends">
          <span className="il-amends__title">
            Amended {revisions.length} time{revisions.length === 1 ? '' : 's'}
          </span>
          {revisions.map((r) => (
            <span key={r.revision} className="il-amends__item">
              <strong>v{r.revision}</strong> superseded {formatDate(r.created_at)}
              {r.reason ? ` · ${r.reason}` : ''}
            </span>
          ))}
        </div>
      )}

      <div className="il-detail__body">
      {tab === 'preview' &&
        (markdown ? <Markdown source={markdown} /> : <Pending failed={loadFailed} />)}

      {tab === 'edit' &&
        (note
          ? (
            <NoteEditor
              note={note}
              prior={context?.prior.sheet ?? context?.prior.protocol ?? null}
              onChange={setNote}
            />
          )
          : <Pending failed={loadFailed} />)}

      {tab === 'flowsheet' &&
        (note
          ? <FlowSheetPanel note={note} prior={context?.prior.sheet ?? context?.prior.protocol ?? null} />
          : <Pending failed={loadFailed} />)}

      {tab === 'history' &&
        (note
          ? (
            <SessionHistoryPanel
              note={note}
              sessions={history}
              total={historyTotal}
              loading={historyLoading}
            />
          )
          : <Pending failed={loadFailed} />)}

      {tab === 'supplement' &&
        (note
          ? (
            <SupplementProtocolPanel
              plan={context?.supplementPlan ?? null}
              note={note}
              priorProtocol={context?.prior.protocol?.note ?? null}
            />
          )
          : <Pending failed={loadFailed} />)}
      </div>

      {/* Sticky, so Approve stays reachable however long the clinical form runs. */}
      <footer className="il-detail__actions">
        {error && <span className="il-error">{error}</span>}
        {tab === 'edit' ? (
          <>
            {amending && (
              <input
                className="il-input il-detail__reason"
                value={reason}
                placeholder="What are you correcting? (optional, kept with the record)"
                onChange={(e) => setReason(e.target.value)}
              />
            )}
            <Button variant="ghost" onClick={cancelEdit} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={busy || isSample}>
              {busy ? 'Saving…' : amending ? 'Save amendment' : 'Save changes'}
            </Button>
          </>
        ) : isApproved ? (
          <Button variant="secondary" onClick={startAmend} disabled={isSample}>
            Amend…
          </Button>
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
      </footer>
    </div>
  );
}

/**
 * A pane that can't load must say so. "Loading…" that never resolves reads as a
 * slow network when it's actually a row that no longer exists.
 */
function Pending({ failed }: { failed: boolean }) {
  return (
    <p className="il-empty">
      {failed
        ? "This session couldn't be opened — it may have been approved or removed. Pick another from the list."
        : 'Loading…'}
    </p>
  );
}
