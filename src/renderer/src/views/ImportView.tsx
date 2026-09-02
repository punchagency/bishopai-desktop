import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../components/Button';
import { assignConversationToClient, fetchClients, importTranscript } from '../lib/api';
import { formatDate } from '../lib/format';
import type { ClientSummary, ViewKey } from '../lib/types';
import { IconCheck, IconDownload } from '../components/Icons';

interface Props {
  backendUrl: string;
  /** A file to read on open — e.g. one dropped onto the window. */
  initialFile?: File | null;
  onClose: () => void;
  /** Refresh nav counts after an import. */
  onImported: () => void;
  /** Send the practitioner to the view where the result now lives. */
  onNavigate: (view: ViewKey) => void;
}

const ACCEPT = '.txt,.md,.vtt,.srt,.docx,text/plain';

// Mirrors MAX_TRANSCRIPT_CHARS on the server (routes/review.ts). Kept in sync by
// hand so we can refuse an over-length transcript here — with a clear count —
// instead of letting the upload come back a 400.
const MAX_TRANSCRIPT_CHARS = 200_000;

/**
 * Turn a dropped/chosen file into transcript text. Word (.docx) is zipped XML,
 * not text, so it goes through mammoth's raw-text extraction (browser path, over
 * an ArrayBuffer — no filesystem). Legacy .doc is a different, binary format
 * mammoth can't read, so it's refused with a pointer to a fix. Everything else
 * is plain text.
 */
async function fileToTranscript(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
    // Lazy-loaded: mammoth + jszip is ~850KB and only the .docx path needs it,
    // so it splits into its own chunk fetched the first time one is imported.
    const mammoth = await import('mammoth');
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    return value;
  }
  if (name.endsWith('.doc')) {
    throw new Error('Old-format .doc files can’t be read — save it as .docx, or paste the text.');
  }
  return file.text();
}

type Done =
  | { kind: 'attached'; client: string }
  | { kind: 'matched' } // auto-lined-up with a real booking
  | { kind: 'unmatched' };

/**
 * Import a transcript recorded elsewhere and attach it in one pass — the manual
 * case where the practitioner already knows whose session it is. Paste or drop,
 * pick the client, and it lands on that client (a walk-in appointment built from
 * the session date) and starts the review draft immediately. Skipping the client
 * still imports, dropping it into the Unmatched queue to resolve later.
 *
 * A full-screen sheet rather than a modal: a transcript, a client search and a
 * date want more room than a dialog, and this is a deliberate task, not a quick
 * confirm.
 */
export function ImportView({
  backendUrl,
  initialFile,
  onClose,
  onImported,
  onNavigate,
}: Props) {
  const [text, setText] = useState('');
  const [filename, setFilename] = useState<string | undefined>(undefined);
  const [date, setDate] = useState('');
  const [dropHot, setDropHot] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState('');
  const [clients, setClients] = useState<ClientSummary[] | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const readFile = async (file: File | undefined | null) => {
    if (!file) return;
    try {
      const content = await fileToTranscript(file);
      if (!content.trim()) {
        setError('That file looks empty.');
        return;
      }
      setText(content);
      setFilename(file.name);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  // A file dropped onto the window (on open, or again while already open) flows
  // in via this prop and is read here — .docx included.
  useEffect(() => {
    void readFile(initialFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  // Debounced client search, same shape as MatchModal's walk-in picker.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetchClients(backendUrl, query, ctrl.signal)
        .then((r) => setClients(r.clients))
        .catch(() => {
          // Typing aborts the previous search, so without this every keystroke
          // could blank the list — and worse, a cancelled request's catch could
          // land after the newer one's success and wipe a good result. An empty
          // client list reads as "no such person", which is how a duplicate
          // client gets created.
          if (ctrl.signal.aborted) return;
          setClients([]);
        });
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [backendUrl, query]);

  const selectedClient = clients?.find((c) => c.id === clientId) ?? null;

  const run = async (attach: boolean) => {
    if (!text.trim()) return;
    if (attach && !clientId) return;
    setBusy(true);
    setError(null);
    try {
      if (text.length > MAX_TRANSCRIPT_CHARS) {
        setError(`Transcript is too long (${text.length.toLocaleString()} characters, max ${MAX_TRANSCRIPT_CHARS.toLocaleString()}). Trim it or split the session.`);
        setBusy(false);
        return;
      }
      // A date-only value is a local calendar day; send it as local noon so the
      // session lands on that day regardless of timezone, not the day before.
      const occurredAt = date ? new Date(`${date}T12:00:00`).toISOString() : undefined;
      const { conversation_id, correlation } = await importTranscript(backendUrl, {
        transcript: text,
        occurredAt,
      });

      if (correlation.status === 'matched') {
        // The date happened to line up with a real booking — already attached
        // and extracting; assigning a client on top would only conflict.
        setDone({ kind: 'matched' });
      } else if (attach && clientId) {
        await assignConversationToClient(backendUrl, conversation_id, clientId);
        setDone({ kind: 'attached', client: selectedClient?.name ?? 'the client' });
      } else {
        setDone({ kind: 'unmatched' });
      }
      onImported();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const chars = text.trim().length;
  const tooLong = chars > MAX_TRANSCRIPT_CHARS;

  const body = done ? (
    <div className="il-importv__done">
      <span
        className={`il-import__badge il-import__badge--${done.kind === 'unmatched' ? 'unmatched' : 'matched'}`}
        aria-hidden="true"
      >
        {done.kind === 'unmatched' ? '↳' : <IconCheck size={24} />}
      </span>
      <div>
        <h3 className="il-importv__done-title">
          {done.kind === 'attached'
            ? `Imported and attached to ${done.client}`
            : done.kind === 'matched'
              ? 'Imported and matched to a booking'
              : 'Imported to the Unmatched queue'}
        </h3>
        <p className="il-importv__done-text">
          {done.kind === 'unmatched'
            ? 'Open it in Unmatched to attach it to a client — that starts the review draft.'
            : 'The review draft is being prepared and will appear in the Review Queue shortly.'}
        </p>
      </div>
    </div>
  ) : (
    <div className="il-importv__grid">
      {/* Left: the transcript itself (dropzone + editable paste area). */}
      <div className="il-importv__col">
        <div
          className={`il-import__drop ${dropHot ? 'il-import__drop--hot' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDropHot(true);
          }}
          onDragLeave={() => setDropHot(false)}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDropHot(false);
            void readFile(e.dataTransfer.files?.[0]);
          }}
        >
          <span className="il-import__drop-icon" aria-hidden="true">
            <IconDownload size={32} />
          </span>
          {filename ? (
            <span className="il-import__file">
              <span className="il-import__file-name">{filename}</span>
              <button
                className="il-import__file-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setText('');
                  setFilename(undefined);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                aria-label="Remove file"
              >
                ✕
              </button>
            </span>
          ) : (
            <span className="il-import__drop-text">
              <strong>Drop a file</strong> or click to browse
              <span className="il-import__drop-sub">.txt · .md · .docx · .vtt · .srt</span>
            </span>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
        </div>
        <div className="il-import__or">
          <span>or paste</span>
        </div>
        <textarea
          className="il-input il-input--area il-importv__area"
          value={text}
          placeholder="Paste the transcript here…"
          onChange={(e) => {
            setText(e.target.value);
            if (filename) setFilename(undefined);
          }}
        />
      </div>

      {/* Right: who it belongs to, and when. */}
      <div className="il-importv__col il-importv__attach">
        <div className="il-field">
          <label className="il-field__label" htmlFor="il-import-client">
            Attach to client
          </label>
          <input
            id="il-import-client"
            className="il-input"
            value={query}
            placeholder="Search by name or email"
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {clients === null ? (
          <p className="il-empty">Loading clients…</p>
        ) : clients.length === 0 ? (
          <p className="il-empty">No clients match that search.</p>
        ) : (
          <ul className="il-choices il-importv__clients">
            {clients.map((c) => (
              <li key={c.id}>
                <label className={`il-choice ${clientId === c.id ? 'il-choice--on' : ''}`}>
                  <input
                    type="radio"
                    name="import-client"
                    checked={clientId === c.id}
                    onChange={() => setClientId(c.id)}
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
        <div className="il-field il-importv__date-field">
          <label className="il-field__label" htmlFor="il-import-date">
            Session date <span className="il-import__optional">— when it happened</span>
          </label>
          <input
            id="il-import-date"
            type="date"
            className="il-input il-import__date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <p className="il-importv__hint">
          Attaching creates a visit on the session date and starts the review draft. No client yet?
          Import it and decide from the Unmatched queue.
        </p>
      </div>
    </div>
  );

  return createPortal(
    <div className="il-importv__scrim" onMouseDown={() => !busy && onClose()}>
      <div className="il-importv" onMouseDown={(e) => e.stopPropagation()}>
        <header className="il-importv__head">
          <h2 className="il-importv__title">Import a transcript</h2>
          <button className="il-toggle" onClick={onClose} aria-label="Close" disabled={busy}>
            ✕
          </button>
        </header>

        <div className="il-importv__body">{body}</div>

        <footer className="il-importv__foot">
          {error && <span className="il-error">{error}</span>}
          {done ? (
            <>
              <Button variant="ghost" onClick={onClose}>
                Close
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onNavigate(done.kind === 'unmatched' ? 'unmatched' : 'review');
                  onClose();
                }}
              >
                {done.kind === 'unmatched' ? 'Go to Unmatched' : 'Go to Review Queue'}
              </Button>
            </>
          ) : (
            <>
              <span className={`il-importv__count ${tooLong ? 'il-importv__count--over' : ''}`}>
                {chars
                  ? `${chars.toLocaleString()} / ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters${tooLong ? ' — too long' : ''}`
                  : ''}
              </span>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={() => run(false)} disabled={!text.trim() || tooLong || busy}>
                Import without attaching
              </Button>
              <Button
                variant="primary"
                onClick={() => run(true)}
                disabled={!text.trim() || !clientId || tooLong || busy}
              >
                {busy ? 'Importing…' : 'Import & attach'}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
