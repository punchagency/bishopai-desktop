import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card } from '../components/Card';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { approveItem, fetchReviewQueue } from '../lib/api';
import { formatDate, humanize } from '../lib/format';
import { Skeleton, SkeletonRows } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import { InfoPopover } from '../components/InfoPopover';
import { SearchBar } from '../components/SearchBar';
import type {
  ReviewKind,
  ReviewQueue as Queue,
  ReviewSession,
  UnprocessedSession,
} from '../lib/types';
import { ReviewDetail } from './ReviewDetail';
import { ConnectionError } from '../components/ConnectionError';
import { UnprocessedPanel } from './UnprocessedPanel';
import { UnprocessedDetail } from './UnprocessedDetail';
import { allowSampleData } from '../lib/preview';

// Sample data so the dashboard renders standalone when the backend isn't up
// (design preview / offline). Replaced by live data the moment /review/queue
// responds.
const SAMPLE: Queue = {
  sessions: [
    {
      appointment_id: 'sample-appt-1',
      client_id: 'c1',
      client_name: 'Jane Doe',
      starts_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: 'draft',
      sheet_id: 'sample-1',
      protocol_id: 'sample-2',
      content_json: {},
    },
  ],
};

/** Which list the Sessions view is showing. */
type Scope = 'pending' | 'approved' | 'unprocessed';

interface Selection {
  /** Which document backs the detail view — the session's note is the same in
   *  both, so the sheet is preferred and the protocol is the fallback for a
   *  session that has no client attached yet. */
  kind: ReviewKind;
  id: string;
  appointmentId: string;
  clientName: string;
  clientId: string | null;
}

export function ReviewQueue({
  backendUrl,
  onChanged,
  processing = 0,
  unprocessed = 0,
}: {
  backendUrl: string;
  onChanged?: () => void;
  /** How many recordings are still being turned into drafts, from the overview
   *  stats. Shown as a banner so a just-imported/assigned session reads as
   *  "working" rather than missing until its draft lands. */
  processing?: number;
  /** Matched recordings with no readable note, from the overview stats. Drives
   *  the count on the "Not extracted" tab. */
  unprocessed?: number;
}) {
  const [queue, setQueue] = useState<Queue | null>(null);
  const [offline, setOffline] = useState(false);
  // Fetch failed and samples are not allowed here (any non-local backend).
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [pending, setPending] = useState<string | null>(null); // id being approved inline
  // Approved sessions used to disappear from the app entirely. This is how a
  // finished session stays reachable — to look back at, or to correct.
  //
  // 'unprocessed' is a third destination rather than a filter on the first two:
  // its rows are not sessions awaiting approval, they are recordings with no
  // note to approve, and they carry a different question ("why is this empty?"
  // rather than "is this right?"). It renders its own panel below.
  const [scope, setScope] = useState<Scope>('pending');
  // The open row on the "Not extracted" tab. Kept apart from `selected`: that
  // one addresses a NOTE by sheet/protocol id, and these rows have no note to
  // address — the whole point of them — so they are opened by recording.
  const [selectedUnprocessed, setSelectedUnprocessed] = useState<UnprocessedSession | null>(null);
  // Bumped after a re-run so the list refetches and the row leaves once it has
  // a real note.
  const [unprocessedReload, setUnprocessedReload] = useState(0);
  // Search only earns its place on the Approved archive — the growing list where
  // finding one client's past visit means scrolling. Pending is a daily handful.
  const [query, setQuery] = useState('');
  // Which client groups are expanded in the Approved list. A returning client has
  // one row per visit; grouping collapses those under the client's name so the
  // archive reads as a list of people, not a wall of repeated names. Keyed by
  // client id (name as the fallback for a session with no client attached).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleGroup = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const load = useCallback(
    (signal?: AbortSignal) => {
      // The unprocessed tab has its own source; fetching the review queue for it
      // would poll a list nothing is showing.
      if (scope === 'unprocessed') return Promise.resolve();
      // Search is approved-only; pending never carries a query.
      return fetchReviewQueue(backendUrl, signal, scope as 'pending' | 'approved', scope === 'approved' ? query : undefined)
        .then((q) => {
          setQueue(q);
          setOffline(false);
          // Drop a selection whose row is gone — approved out of this list,
          // deleted, or reseeded underneath us. Without this the detail pane
          // sits on a dead id showing "Loading…" against a 404 forever.
          setSelected((cur) =>
            cur && q.sessions.some((sn) => sn.appointment_id === cur.appointmentId) ? cur : null,
          );
        })
        .catch((err: Error) => {
          if (signal?.aborted) return;
          if (allowSampleData(backendUrl)) {
            setQueue(SAMPLE);
            setOffline(true);
          } else {
            setUnreachable(err.message);
          }
        });
    },
    [backendUrl, scope, query],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    // Debounce typing so we don't fire a request per keystroke; scope switches
    // and the first load (no query) run immediately.
    const t = setTimeout(() => load(ctrl.signal), query ? 250 : 0);
    // The sidebar badge polls, so without this the list can sit stale beside a
    // count that has already moved — new sessions land here while the screen is
    // open. Refreshing the list doesn't touch the open detail pane, so it's safe
    // to do mid-review.
    const timer = setInterval(() => load(), 30_000);
    return () => {
      ctrl.abort();
      clearTimeout(t);
      clearInterval(timer);
    };
  }, [load, query]);

  const switchScope = (next: Scope) => {
    if (next === scope) return;
    setSelected(null); // the open row won't be in the new list
    setSelectedUnprocessed(null); // nor will this one
    setQuery(''); // a filter from the other tab would silently hide everything
    // Drop the rows with the tab that produced them.
    //
    // Without this the new tab paints instantly with the OLD tab's sessions
    // underneath it and swaps them out a beat later when the fetch lands — so
    // clicking "Approved" showed a list of pending drafts labelled Approved,
    // which is not a slow load, it is a wrong answer that corrects itself. The
    // skeleton below keys off `queue` being empty, so clearing it is what makes
    // the switch read as loading rather than as loaded-and-wrong.
    setQueue(null);
    setScope(next);
  };

  // Approving either document approves the whole session, so the row is keyed on
  // the appointment rather than on whichever document backs it.
  const approve = async (kind: ReviewKind, id: string, appointmentId: string) => {
    if (id.startsWith('sample-')) return;
    setPending(appointmentId);
    try {
      await approveItem(backendUrl, kind, id);
      await load();
      onChanged?.();
    } catch {
      /* surfaced on next load; keep it quiet inline */
    } finally {
      setPending(null);
    }
  };

  if (unreachable) return <ConnectionError backendUrl={backendUrl} detail={unreachable} onRetry={() => load()} />;

  // Keyed on the ABSENCE OF DATA, not on a `loading` flag. The flag was set
  // inside the fetch, a tick after the click, and for that tick it was still
  // false while the previous tab's rows sat in `queue` — so the old list
  // painted under the new tab and swapped a beat later. There is no longer a
  // flag to get out of step with: switchScope clears `queue`, and empty means
  // empty. The unprocessed tab never fills `queue` — it has its own source and
  // its own skeleton — so it is excluded.
  const loadingList = scope !== 'unprocessed' && !queue;

  // Only the LIST waits. Returning a full-page skeleton here would take the
  // title and the tab bar down with it, so clicking a tab would blank the tabs
  // you just clicked — trading a wrong answer for a flicker.
  const sessions = queue?.sessions ?? [];
  const total = sessions.length;
  const searching = scope === 'approved' && query.trim().length > 0;
  // Group by client only on the Approved archive, and not while searching — a
  // name search should show its matches flat, not re-buried under a group header.
  // Pending is a daily handful where one row per visit is exactly what's wanted.
  const grouped = scope === 'approved' && !searching;

  // One queue row. Pulled out so it can render both flat (pending / search) and
  // inside a client group (approved), without duplicating the kind/id plumbing.
  const renderRow = (sn: (typeof sessions)[number]) => {
    const kind: ReviewKind = sn.sheet_id ? 'sheets' : 'protocols';
    const id = sn.sheet_id ?? sn.protocol_id;
    if (!id) return null;
    return (
      <QueueRow
        key={sn.appointment_id}
        name={sn.client_name ?? 'Unknown client'}
        kind="Session"
        date={formatDate(sn.starts_at ?? sn.updated_at)}
        status={sn.status}
        active={selected?.appointmentId === sn.appointment_id}
        approving={pending === sn.appointment_id}
        canApprove={scope === 'pending'}
        onOpen={() =>
          setSelected({
            kind,
            id,
            appointmentId: sn.appointment_id,
            clientName: sn.client_name ?? 'Unknown client',
            clientId: sn.client_id,
          })
        }
        onApprove={() => approve(kind, id, sn.appointment_id)}
      />
    );
  };

  return (
    <section className="il-view">
      <div className="il-view__head">
        <div>
          <h1 className="il-view__title">
            Sessions{' '}
            <InfoPopover label="How sessions work" title="How this works">
              After each session, the conversation is turned into a draft Appointment Sheet and an
              updated client Protocol. They wait under Awaiting review for you to read, edit and
              approve — approving writes the final documents to the client's Google Drive folder.
              Approved sessions stay under Approved, where you can look back at them, compare them
              against earlier visits, or amend one if something needs correcting.
            </InfoPopover>
          </h1>
          <p className="il-view__sub">
            {loadingList ? (
              // "0 items awaiting your approval" while the count is still
              // unknown is the same class of wrong answer the list had.
              <Skeleton width="13rem" height="0.85rem" />
            ) : scope === 'unprocessed' ? (
              'Recordings matched to a client that have no readable note yet'
            ) : (
              searching
                ? `${total} match${total === 1 ? '' : 'es'} for "${query.trim()}"`
                : scope === 'pending'
                  ? `${total} item${total === 1 ? '' : 's'} awaiting your approval`
                  : `${total} approved item${total === 1 ? '' : 's'}`
            )}
            {offline && scope !== 'unprocessed' && (
              <Badge tone="warning">&nbsp;offline preview&nbsp;</Badge>
            )}
          </p>
        </div>
      </div>

      <div className="il-tabs il-tabs--scope">
        <button
          className={`il-tab ${scope === 'pending' ? 'il-tab--on' : ''}`}
          onClick={() => switchScope('pending')}
        >
          Awaiting review
        </button>
        <button
          className={`il-tab ${scope === 'approved' ? 'il-tab--on' : ''}`}
          onClick={() => switchScope('approved')}
        >
          Approved
        </button>
        {/* Carries a count because its whole purpose is to be noticed when it is
            not empty — a blank note is invisible by nature, and the reason this
            tab exists is that seven of them went unnoticed for two days. */}
        <button
          className={`il-tab ${scope === 'unprocessed' ? 'il-tab--on' : ''}`}
          onClick={() => switchScope('unprocessed')}
        >
          Not extracted
          {unprocessed > 0 && <span className="il-tab__count">{unprocessed}</span>}
        </button>
      </div>

      {scope === 'unprocessed' ? (
        /* Same split pane as the queue, for the same reason: the list stays on
           screen while a transcript is open, so moving down it doesn't mean
           losing your place. Collapses to one column on narrow windows. */
        <div
          className={`il-split il-split--unprocessed ${
            selectedUnprocessed ? 'il-split--open' : ''
          }`}
        >
          <div className="il-split__list">
            <UnprocessedPanel
              backendUrl={backendUrl}
              onChanged={onChanged}
              selectedId={selectedUnprocessed?.conversation_id ?? null}
              onSelect={setSelectedUnprocessed}
              reloadKey={unprocessedReload}
            />
          </div>
          <div className="il-split__detail">
            {selectedUnprocessed ? (
              <UnprocessedDetail
                key={selectedUnprocessed.conversation_id}
                backendUrl={backendUrl}
                row={selectedUnprocessed}
                onClose={() => setSelectedUnprocessed(null)}
                onChanged={() => {
                  // The row is now queued, so it stops being the thing on
                  // screen: close the pane and let the list say where it went.
                  setSelectedUnprocessed(null);
                  setUnprocessedReload((n) => n + 1);
                  onChanged?.();
                }}
              />
            ) : (
              <div className="il-split__placeholder">
                <p>Pick a session to read its transcript.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
      {scope === 'pending' && processing > 0 && (
        <div className="il-processing" role="status">
          <span className="il-processing__spinner" aria-hidden="true" />
          <span>
            {processing} session{processing === 1 ? '' : 's'} being processed — the draft
            {processing === 1 ? '' : 's'} will appear here shortly.
          </span>
        </div>
      )}

      {loadingList ? (
        <div className="il-split">
          <div className="il-split__list">
            <SkeletonRows rows={6} />
          </div>
          <div className="il-split__detail">
            <div className="il-split__placeholder">
              <p>Pick a session to review it here.</p>
            </div>
          </div>
        </div>
      ) : total === 0 && !searching ? (
        <div className="il-view__empty">
          {scope === 'pending' ? (
            <EmptyState variant="review_pending" />
          ) : (
            <EmptyState variant="review_approved" />
          )}
        </div>
      ) : (
        /* Split pane: the queue stays on screen while a session is open, so
           Nicole keeps her place and can move down the list without losing
           context. Collapses to one column on narrow windows. */
        <div className={`il-split ${selected ? 'il-split--open' : ''}`}>
          <div className="il-split__list">
            {scope === 'approved' && (
              <SearchBar
                value={query}
                onChange={setQuery}
                placeholder="Search by client name"
                count={searching ? sessions.length : undefined}
              />
            )}
            {sessions.length === 0 ? (
              <p className="il-empty">No approved sessions match "{query.trim()}".</p>
            ) : grouped ? (
              groupSessions(sessions).map((g) =>
                // A client seen once is just a row — no point collapsing a group of
                // one. Two or more visits fold under a header showing the count.
                g.sessions.length === 1 ? (
                  renderRow(g.sessions[0])
                ) : (
                  <ClientGroup
                    key={g.key}
                    name={g.name}
                    count={g.sessions.length}
                    latest={formatDate(g.sessions[0].starts_at ?? g.sessions[0].updated_at)}
                    open={expanded.has(g.key)}
                    hasActive={g.sessions.some((s) => s.appointment_id === selected?.appointmentId)}
                    onToggle={() => toggleGroup(g.key)}
                  >
                    {g.sessions.map(renderRow)}
                  </ClientGroup>
                ),
              )
            ) : (
              sessions.map(renderRow)
            )}
          </div>

          <div className="il-split__detail">
            {selected ? (
              <ReviewDetail
                key={`${selected.kind}:${selected.id}`}
                backendUrl={backendUrl}
                kind={selected.kind}
                id={selected.id}
                clientName={selected.clientName}
                clientId={selected.clientId}
                onClose={() => setSelected(null)}
                onChanged={() => {
                  load();
                  onChanged?.();
                }}
              />
            ) : (
              <div className="il-split__placeholder">
                <p>Pick a session to review it here.</p>
              </div>
            )}
          </div>
        </div>
      )}
      </>
      )}
    </section>
  );
}

interface ClientGrouping {
  key: string;
  name: string;
  sessions: ReviewSession[];
}

/**
 * Fold the flat session list into one entry per client, preserving order. The
 * server returns sessions newest-first, so first-seen order gives groups in
 * recency order and each group's sessions stay newest-first inside it. Keyed by
 * client id, falling back to the name so sessions with no client attached don't
 * all collapse into a single "unknown" pile.
 */
function groupSessions(sessions: ReviewSession[]): ClientGrouping[] {
  const groups = new Map<string, ClientGrouping>();
  for (const sn of sessions) {
    const key = sn.client_id ?? `name:${sn.client_name ?? 'unknown'}`;
    const existing = groups.get(key);
    if (existing) {
      existing.sessions.push(sn);
    } else {
      groups.set(key, { key, name: sn.client_name ?? 'Unknown client', sessions: [sn] });
    }
  }
  return [...groups.values()];
}

/**
 * A collapsible header standing in for a returning client's run of visits. Closed
 * by default (the archive is for looking back, not daily work), it shows the
 * client's name, how many visits, and the most recent date; expanding reveals the
 * individual session rows. Stays open-looking when it holds the row being viewed,
 * so the detail pane never points at a session hidden inside a collapsed group.
 */
function ClientGroup({
  name, count, latest, open, hasActive, onToggle, children,
}: {
  name: string;
  count: number;
  latest: string;
  open: boolean;
  /** True when one of this group's sessions is the one open in the detail pane. */
  hasActive: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const show = open || hasActive;
  return (
    <div className={`il-cgroup ${show ? 'il-cgroup--open' : ''} ${hasActive ? 'il-cgroup--active' : ''}`}>
      <button className="il-cgroup__head" onClick={onToggle} aria-expanded={show}>
        <span className={`il-cgroup__chevron ${show ? 'il-cgroup__chevron--open' : ''}`} aria-hidden>
          ›
        </span>
        <span className="il-cgroup__text">
          <span className="il-cgroup__name" title={name}>{name}</span>
          <span className="il-cgroup__meta">
            {count} visits
            {latest && ` · latest ${latest}`}
          </span>
        </span>
      </button>
      {show && <div className="il-cgroup__body">{children}</div>}
    </div>
  );
}

/**
 * One line in the queue. This is a list to scan, not a set of cards to read, so
 * everything competing with the client's name is dialled down: status becomes a
 * dot rather than a pill, and Approve is a small quiet control that only fills
 * in on hover or when the row is the one open.
 */
function QueueRow({
  name, kind, date, status, active, approving, canApprove, onOpen, onApprove,
}: {
  name: string;
  kind: string;
  date: string;
  status: string;
  active: boolean;
  approving: boolean;
  /** Already-approved rows have nothing left to approve. */
  canApprove: boolean;
  onOpen: () => void;
  onApprove: () => void;
}) {
  return (
    <div className={`il-qrow ${active ? 'il-qrow--on' : ''}`}>
      {/* The row itself is the open affordance — one click, no "Open" button. */}
      <button className="il-qrow__main" onClick={onOpen} aria-current={active}>
        <span className={`il-qrow__status il-qrow__status--${status}`} title={humanize(status)} />
        <span className="il-qrow__text">
          {/* Long names ellipsise in a narrow column; keep the full one reachable. */}
          <span className="il-qrow__name" title={name}>{name}</span>
          <span className="il-qrow__meta">
            {kind}
            {date && ` · ${date}`}
          </span>
        </span>
      </button>
      {canApprove && (
        <Button
          className="il-qrow__approve"
          variant="ghost"
          size="sm"
          disabled={approving}
          onClick={onApprove}
        >
          {approving ? 'Approving…' : 'Approve'}
        </Button>
      )}
    </div>
  );
}
