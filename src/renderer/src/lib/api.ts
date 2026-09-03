import type {
  ClientSummary,
  PriorNote,
  AuthStatus,
  CandidateAppointment,
  CheckoutData,
  CustomerMapData,
  CustomerSyncReport,
  ReconciliationData,
  EmailTemplate,
  EngagementData,
  LeadActivityItem,
  OfficeHours,
  OutlookStatus,
  Overview,
  PocketStatus,
  ApprovalItem,
  ApprovalList,
  ApprovalSummary,
  QueueItem,
  RefillDigest,
  RefillSendResponse,
  ReminderKind,
  SentEmail,
  UpcomingReminders,
  ReviewContext,
  ReviewKind,
  ReviewQueue,
  ScheduleData,
  SessionNote,
  UnmatchedConversation,
} from './types';
import { ApiError, humanizeApiError } from './errors';

// Session token for the local dashboard auth. Held in memory; the app also
// persists it and calls setAuthToken on boot. Attached to every backend request
// and required only when Nicole has turned login on.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export function setAuthToken(token: string | null): void {
  authToken = token;
}
export function setUnauthorizedHandler(cb: () => void): void {
  onUnauthorized = cb;
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (authToken) headers.authorization = `Bearer ${authToken}`;
  const method = init?.method ?? 'GET';
  const path = new URL(url).pathname;

  let res: Response;
  try {
    res = await fetch(url, { ...init, headers });
  } catch (err) {
    // Server down, wrong address, no network. `fetch` rejects with "Failed to
    // fetch", which is both technical and wrong-sounding — it reads as though
    // the app broke rather than that nothing answered.
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError(humanizeApiError(null, method, null), {
      status: null,
      technical: `${method} ${path} → ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (res.status === 401) onUnauthorized?.(); // login on (or token expired) — bounce to login

  if (!res.ok) {
    // The backend often sends a human explanation ("This session has been
    // approved and its documents published…"), and that always wins. What it
    // sends otherwise — `internal error`, `not found` — is a protocol fact, and
    // so is the status; neither belongs on screen. See lib/errors.ts.
    const body = await res
      .json()
      .then((b: { detail?: unknown; error?: unknown }) => b)
      .catch(() => null);
    throw new ApiError(humanizeApiError(res.status, method, body), {
      status: res.status,
      technical: `${method} ${path} → ${res.status}`,
    });
  }
  return (await res.json()) as T;
}

/**
 * Fetch the review queue. Defaults to what's awaiting Nicole; pass
 * 'approved' for what she has already signed off on.
 */
export function fetchReviewQueue(
  backendUrl: string,
  signal?: AbortSignal,
  scope: 'pending' | 'approved' = 'pending',
  query?: string,
): Promise<ReviewQueue> {
  const params = new URLSearchParams();
  if (scope === 'approved') params.set('status', 'approved');
  const q = query?.trim();
  if (q) params.set('q', q);
  const qs = params.toString();
  return json<ReviewQueue>(`${backendUrl}/review/queue${qs ? `?${qs}` : ''}`, { signal });
}

/** Consolidated Overview data (stats + activity + upcoming). */
export function fetchOverview(backendUrl: string, signal?: AbortSignal): Promise<Overview> {
  return json<Overview>(`${backendUrl}/dashboard/overview`, { signal });
}

// --- Schedule (WF Item 4) -----------------------------------------------------

/** Upcoming sessions for the Schedule view (PB or local DB fallback). */
export function fetchSchedule(backendUrl: string, signal?: AbortSignal): Promise<ScheduleData> {
  return json<ScheduleData>(`${backendUrl}/appointments/upcoming`, { signal });
}

/** Available booking slots derived from office hours minus booked sessions. */
export function fetchSlots(backendUrl: string, signal?: AbortSignal): Promise<{ slots: import('./types').BookingSlot[]; office_hours: OfficeHours }> {
  return json(`${backendUrl}/appointments/slots`, { signal });
}

/** Nicole's current office hours configuration. */
export function fetchOfficeHours(backendUrl: string, signal?: AbortSignal): Promise<OfficeHours> {
  return json<OfficeHours>(`${backendUrl}/appointments/office-hours`, { signal });
}

/** Save Nicole's office hours configuration. */
export function saveOfficeHours(backendUrl: string, oh: OfficeHours): Promise<OfficeHours> {
  return json<OfficeHours>(`${backendUrl}/appointments/office-hours`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(oh),
  });
}

/** Practice Better services if configured. */
export function fetchServices(backendUrl: string, signal?: AbortSignal): Promise<{ pb_configured: boolean; items: { id: string; name: string; duration?: number; serviceTypes?: string[] }[] }> {
  return json(`${backendUrl}/appointments/services`, { signal });
}


/** Recordings that didn't correlate — need manual tagging. */
export function fetchUnmatched(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ conversations: UnmatchedConversation[] }> {
  return json(`${backendUrl}/review/unmatched`, { signal });
}

/** One matched recording in full — transcript plus backend-numbered turns.
 *  Reached from the "Not extracted" list, where the note is the thing missing
 *  and the transcript is the thing that answers the question anyway. */
export function fetchConversationDetail(
  backendUrl: string,
  id: string,
  signal?: AbortSignal,
): Promise<{ conversation: import('./types').ConversationDetail }> {
  return json(`${backendUrl}/review/conversations/${id}`, { signal });
}

/** Matched recordings that never produced a readable note (see UnprocessedSession). */
export function fetchUnprocessed(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ sessions: import('./types').UnprocessedSession[] }> {
  return json(`${backendUrl}/review/unprocessed`, { signal });
}

/** Re-run extraction addressed by RECORDING rather than by note. The blank-note
 *  case has a sheet to aim at, but a conversation that failed before writing one
 *  does not — and that is exactly the row most in need of a retry. */
export function reextractConversation(
  backendUrl: string,
  conversationId: string,
): Promise<{ status: string }> {
  return json<{ status: string }>(
    `${backendUrl}/review/conversations/${conversationId}/reextract`,
    { method: 'POST' },
  );
}

/** One unmatched recording in full (whole transcript + timing) for the detail pane. */
export function fetchUnmatchedDetail(
  backendUrl: string,
  id: string,
  signal?: AbortSignal,
): Promise<{ conversation: import('./types').UnmatchedDetail }> {
  return json(`${backendUrl}/review/unmatched/${id}`, { signal });
}

/** Appointments offered as match candidates for an unmatched conversation. */
export function fetchCandidates(
  backendUrl: string,
  id: string,
  signal?: AbortSignal,
): Promise<{ appointments: CandidateAppointment[] }> {
  return json(`${backendUrl}/review/unmatched/${id}/candidates`, { signal });
}

export interface SessionSegment {
  from_turn: number;
  to_turn: number;
  client_name_hint?: string | null;
  /** Server-computed best appointment match by overlap maximisation. */
  suggested_appointment_id?: string | null;
  snippet: string;
  confidence_score?: number;
  /** Present when segmentation could not run — shown instead of a fake session. */
  detection_note?: string | null;
  /** Present when turn-share and calendar-overlap disagree by > 25%. */
  time_disagreement_note?: string | null;
}

/** One turn as the backend numbered it. `SessionSegment.from_turn` indexes into
 *  this list, so the two only line up because they come from the same parse. */
export interface SessionTurn {
  index: number;
  speaker: string;
  role: 'PRACTITIONER' | 'CLIENT' | 'UNKNOWN';
  text: string;
}

/** Detect multi-session boundaries for a recording. */
export function fetchSegments(
  backendUrl: string,
  id: string,
  signal?: AbortSignal,
): Promise<{
  conversation_id: string;
  segments: SessionSegment[];
  candidates: CandidateAppointment[];
  turns: SessionTurn[];
}> {
  return json(`${backendUrl}/review/unmatched/${id}/segments`, { signal });
}

/** Split a multi-session recording into separate child session conversations. */
export function splitUnmatchedConversation(
  backendUrl: string,
  id: string,
  segments: Array<{ from_turn: number; to_turn: number; appointment_id?: string; client_id?: string }>,
): Promise<{ parent_id: string; split_conversations: string[] }> {
  return json(`${backendUrl}/review/unmatched/${id}/split`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ segments }),
  });
}

/**
 * Import a transcript by hand (paste or drag-drop) — no recorder involved.
 * Lands an unmatched conversation (deduplicated server-side on the transcript
 * hash); the returned correlation says whether the given date happened to
 * auto-match a booked appointment. Attach it from the Unmatched view afterward.
 */
export function importTranscript(
  backendUrl: string,
  body: { transcript: string; occurredAt?: string },
): Promise<{ conversation_id: string; correlation: { status: 'matched' | 'unmatched' } }> {
  return json(`${backendUrl}/review/import`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      transcript: body.transcript,
      ...(body.occurredAt ? { occurred_at: body.occurredAt } : {}),
    }),
  });
}

/** Manually tie a conversation to an appointment (triggers extraction). */
export function matchConversation(backendUrl: string, id: string, appointmentId: string): Promise<unknown> {
  return json(`${backendUrl}/review/unmatched/${id}/match`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appointment_id: appointmentId }),
  });
}

interface ItemRow {
  id: string;
  status: string;
  content_json: SessionNote;
  updated_at: string;
  /** False when detaching this session from its client can't succeed. */
  can_unmatch?: boolean;
  /** Why not — shown instead of offering an action that would only fail. */
  unmatch_blocked_reason?: string | null;
}

/** Full row (with content_json) for one sheet/protocol. */
export function fetchItem(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  signal?: AbortSignal,
): Promise<ItemRow> {
  return json<ItemRow>(`${backendUrl}/review/${kind}/${id}`, { signal });
}

/** Server-rendered Markdown of the document as it stands. */
export function fetchRendered(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  signal?: AbortSignal,
): Promise<{ markdown: string }> {
  return json<{ markdown: string }>(`${backendUrl}/review/${kind}/${id}/render`, { signal });
}

/** The client's prior approved note + running supplement plan, for comparison. */
export function fetchReviewContext(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  signal?: AbortSignal,
): Promise<ReviewContext> {
  return json<ReviewContext>(`${backendUrl}/review/${kind}/${id}/context`, { signal });
}

/** Save edits to content_json (and/or status). */
export function patchItem(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  body: { content_json?: SessionNote; status?: string },
): Promise<ItemRow> {
  return json<ItemRow>(`${backendUrl}/review/${kind}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Correct a note that has already been approved. Not a save: the backend files
 * the superseded version as a revision and republishes the documents that can
 * safely be reissued. A plain PATCH is refused on an approved note.
 */
export function amendItem(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  body: { content_json: SessionNote; reason?: string },
): Promise<ItemRow & { revision: number }> {
  return json<ItemRow & { revision: number }>(`${backendUrl}/review/${kind}/${id}/amend`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Re-run LLM extraction on an existing recording using the latest extraction pipeline. */
export function reextractItem(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
): Promise<{ status: string }> {
  return json<{ status: string }>(`${backendUrl}/review/${kind}/${id}/reextract`, {
    method: 'POST',
  });
}

/** The client's previous sessions, newest first — the running flow sheet view. */
export function fetchSessionHistory(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  signal?: AbortSignal,
): Promise<{ total: number; sessions: PriorNote[] }> {
  return json<{ total: number; sessions: PriorNote[] }>(
    `${backendUrl}/review/${kind}/${id}/history`,
    { signal },
  );
}

/** Clients for the walk-in picker, most recently seen first. */
export function fetchClients(
  backendUrl: string,
  q?: string,
  signal?: AbortSignal,
): Promise<{ clients: ClientSummary[] }> {
  const qs = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
  return json<{ clients: ClientSummary[] }>(`${backendUrl}/clients${qs}`, { signal });
}

/**
 * Assign a recording that never had a booking straight to a client. The backend
 * creates the appointment from the recording's own time window.
 */
export function assignConversationToClient(
  backendUrl: string,
  conversationId: string,
  clientId: string,
): Promise<{ appointment_id: string; client_id: string; status: string }> {
  return json(`${backendUrl}/review/unmatched/${conversationId}/assign-client`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_id: clientId }),
  });
}

/**
 * Detach a recording from the wrong client. Refused once the note is approved —
 * its documents are already published, so that needs an amendment instead.
 */
export function unmatchConversation(
  backendUrl: string,
  conversationId: string,
): Promise<{ status: string }> {
  return json(`${backendUrl}/review/conversations/${conversationId}/unmatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

/**
 * Detach the session under review from its client, reached from the session
 * itself — a wrong match is usually noticed while reading the note.
 */
export function unmatchReviewItem(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
): Promise<{ status: string }> {
  return json(`${backendUrl}/review/${kind}/${id}/unmatch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

export interface NoteRevision {
  revision: number;
  content_json: SessionNote;
  reason: string | null;
  created_at: string;
}

/**
 * The `reason` the server stores on a draft snapshot.
 *
 * Duplicated from the server's DRAFT_REPLACED_REASON, which is where it is
 * written and where it is normally filtered. It is repeated here because this
 * app talks to a deployed backend it does not ship with: the server-side filter
 * only takes effect on release, and until then — and against any older build —
 * these rows arrive anyway. Two copies of one string is the cost of not making
 * the reviewer wait for a deploy to stop being told a draft was amended.
 */
const DRAFT_REPLACED_REASON = 're-extraction — draft replaced by a fresh run';

/**
 * Superseded versions of an APPROVED note, newest first.
 *
 * Drafts that re-extraction replaced are dropped: they are the re-extract
 * button's undo buffer, they only occur while the extraction pipeline is being
 * tested, and listing them told the reviewer a draft had been "amended" three
 * times when it had merely been re-run.
 */
export async function fetchRevisions(
  backendUrl: string,
  kind: ReviewKind,
  id: string,
  signal?: AbortSignal,
): Promise<{ revisions: NoteRevision[] }> {
  const r = await json<{ revisions: NoteRevision[] }>(
    `${backendUrl}/review/${kind}/${id}/revisions`,
    { signal },
  );
  return { revisions: (r.revisions ?? []).filter((v) => v.reason !== DRAFT_REPLACED_REASON) };
}

/** Approve the document (writes to the backend approvals audit table). */
export function approveItem(backendUrl: string, kind: ReviewKind, id: string): Promise<ItemRow> {
  return json<ItemRow>(`${backendUrl}/review/${kind}/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// --- WF4 refills -------------------------------------------------------------

/** Daily refill digest (open refills, soonest first, tiered by urgency). */
export function fetchRefillDigest(backendUrl: string, signal?: AbortSignal): Promise<RefillDigest> {
  return json<RefillDigest>(`${backendUrl}/refills/digest`, { signal });
}

/** Push a refill reminder out (default 14 days). */
export function snoozeRefill(backendUrl: string, id: string, days?: number): Promise<unknown> {
  return json(`${backendUrl}/refills/${id}/snooze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(days ? { days } : {}),
  });
}

/** Close a refill out for this cycle. */
export function skipRefill(backendUrl: string, id: string): Promise<unknown> {
  return json(`${backendUrl}/refills/${id}/skip`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// --- Scheduled client emails -------------------------------------------------

/** The client emails the cadences will send, soonest first. Read-only. */
export function fetchUpcomingReminders(
  backendUrl: string,
  days?: number,
  signal?: AbortSignal,
): Promise<UpcomingReminders> {
  const q = days ? `?days=${days}` : '';
  return json<UpcomingReminders>(`${backendUrl}/reminders/upcoming${q}`, { signal });
}

/**
 * Stop (or resume) the remaining cadence behind a scheduled email. Silences the
 * automation only — a cancelled refill still shows as running low in the digest.
 */
export function setReminderCancelled(
  backendUrl: string,
  kind: ReminderKind,
  sourceId: string,
  cancelled: boolean,
): Promise<{ id: string; kind: ReminderKind; cancelled_at: string | null }> {
  return json(`${backendUrl}/reminders/${kind}/${sourceId}/${cancelled ? 'cancel' : 'restore'}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// --- WF2 checkout ------------------------------------------------------------

/** Post-session charges with their frozen summary + status. */
export function fetchCheckouts(backendUrl: string, signal?: AbortSignal): Promise<CheckoutData> {
  return json<CheckoutData>(`${backendUrl}/checkout`, { signal });
}

/** Card details for a live charge (Option A — the backend tokenizes; the PAN is
 *  never stored client- or server-side beyond the tokenization call). */
export interface CardInput {
  number: string;
  expMonth: string;
  expYear: string;
  cvc: string;
  name?: string;
}

/** Approve a checkout → charge (dry-run until QB) → docs → PB mark. Pass a card
 *  when QuickBooks is live; omit it in dry-run. */
export function approveCheckout(
  backendUrl: string,
  id: string,
  card?: CardInput,
): Promise<{ status: string; qbTxnId?: string; error?: string }> {
  return json(`${backendUrl}/checkout/${id}/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(card ? { card } : {}),
  });
}

/** Nicole's final confirm: PB_MARKED → CLOSED. */
export function closeCheckout(backendUrl: string, id: string): Promise<{ status: string }> {
  return json(`${backendUrl}/checkout/${id}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// --- WF2 payment reconciliation ----------------------------------------------

/** Reconciliation ledger; pass a status (e.g. NEEDS_REVIEW) to filter. */
export function fetchReconciliations(backendUrl: string, status?: string): Promise<ReconciliationData> {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return json<ReconciliationData>(`${backendUrl}/checkout/reconciliations${q}`);
}

/** Re-drive a FAILED / NEEDS_REVIEW reconciliation now (idempotent). */
export function retryReconciliation(
  backendUrl: string,
  id: string,
): Promise<{ status: string; last_error: string | null; accounting_payment_id: string | null }> {
  return json(`${backendUrl}/checkout/reconciliations/${id}/retry`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

// --- client → QuickBooks customer mapping ------------------------------------

/** All clients with their current QBO customer mapping (unmapped first). */
export function fetchCustomerMap(backendUrl: string): Promise<CustomerMapData> {
  return json<CustomerMapData>(`${backendUrl}/checkout/customer-map`);
}

/** Pull QBO customers and auto-map unambiguous exact matches; returns a report. */
export function syncCustomerMap(backendUrl: string): Promise<CustomerSyncReport> {
  return json<CustomerSyncReport>(`${backendUrl}/checkout/customer-map/sync`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

/** Manually set/override a client's QBO customer id. */
export function setCustomerMap(
  backendUrl: string,
  clientId: string,
  qboCustomerId: string,
): Promise<{ client_id: string; qbo_customer_id: string }> {
  return json(`${backendUrl}/checkout/customer-map/${clientId}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ qbo_customer_id: qboCustomerId }),
  });
}

/** Remove a client's mapping (to re-sync or fix it). */
export function clearCustomerMap(backendUrl: string, clientId: string): Promise<{ ok: boolean }> {
  return json(`${backendUrl}/checkout/customer-map/${clientId}`, { method: 'DELETE' });
}

// --- WF3 engagement ----------------------------------------------------------

/** Leads with their computed next cadence step + activity summary. */
export function fetchEngagementLeads(backendUrl: string, signal?: AbortSignal): Promise<EngagementData> {
  return json<EngagementData>(`${backendUrl}/engagement/leads`, { signal });
}

/** Recent site / lead activity feed. */
export function fetchEngagementActivity(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ activity: LeadActivityItem[] }> {
  return json(`${backendUrl}/engagement/activity`, { signal });
}

/** Take a lead out of the automation. */
export function stopLead(backendUrl: string, id: string): Promise<unknown> {
  return json(`${backendUrl}/engagement/leads/${id}/stop`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

/** Run the cadence pass now (dry-run sends until Outlook is configured). */
export function runCadence(backendUrl: string): Promise<{ scanned: number; sent: number; deactivated: number }> {
  return json(`${backendUrl}/engagement/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
}

/** Send an email to a specific lead immediately (with optional custom subject/body). */
export function sendLeadEmail(
  backendUrl: string,
  leadId: string,
  custom?: { step?: string; subject?: string; body?: string },
): Promise<{ ok: boolean; step: string; subject: string }> {
  return json(`${backendUrl}/engagement/leads/${leadId}/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(custom ?? {}),
  });
}

/** Save a customized draft for a lead's upcoming email step. */
export function saveLeadDraft(
  backendUrl: string,
  leadId: string,
  step: string,
  subject: string,
  body: string,
): Promise<{ lead_id: string; step: string; subject: string; body: string; is_custom_draft: boolean }> {
  return json(`${backendUrl}/engagement/leads/${leadId}/draft`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ step, subject, body }),
  });
}

/** Times currently offerable to this lead, for the booking-block editor. */
export function fetchLeadSlots(
  backendUrl: string,
  leadId: string,
  signal?: AbortSignal,
): Promise<{ slots: { starts_at: string; label: string }[]; timezone: string }> {
  return json(`${backendUrl}/engagement/leads/${leadId}/slots`, { signal });
}

/**
 * Render a booking block for the chosen times. An empty list returns empty html,
 * which is how the editor removes the block. `dropped` counts times that were
 * taken between loading the editor and saving.
 */
export function renderLeadSlotBlock(
  backendUrl: string,
  leadId: string,
  slots: string[],
): Promise<{ html: string; dropped?: number }> {
  return json(`${backendUrl}/engagement/leads/${leadId}/slot-block`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slots }),
  });
}

/** Reset a lead's customized draft back to the track template. */
export function resetLeadDraft(
  backendUrl: string,
  leadId: string,
  step: string,
): Promise<{ lead_id: string; step: string; reset: boolean }> {
  return json(`${backendUrl}/engagement/leads/${leadId}/draft/${step}`, {
    method: 'DELETE',
  });
}

/** All leads with a pending send, sorted by send date (soonest first). */
export function fetchEmailQueue(backendUrl: string, signal?: AbortSignal): Promise<{ queue: QueueItem[] }> {
  return json<{ queue: QueueItem[] }>(`${backendUrl}/engagement/queue`, { signal });
}

/** Paginated sent log across all leads. */
export function fetchSentLog(
  backendUrl: string,
  limit = 50,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ sent: SentEmail[]; total: number }> {
  return json<{ sent: SentEmail[]; total: number }>(
    `${backendUrl}/engagement/sent?limit=${limit}&offset=${offset}`,
    { signal },
  );
}

/** Per-lead email send history. */
export function fetchLeadHistory(
  backendUrl: string,
  leadId: string,
  signal?: AbortSignal,
): Promise<{ history: SentEmail[] }> {
  return json<{ history: SentEmail[] }>(`${backendUrl}/engagement/leads/${leadId}/history`, { signal });
}

/** All email templates with effective copy (DB override or default). */
export function fetchEmailTemplates(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ templates: EmailTemplate[] }> {
  return json<{ templates: EmailTemplate[] }>(`${backendUrl}/templates`, { signal });
}

/** Save an email template override (subject + body). */
export function saveEmailTemplate(
  backendUrl: string,
  track: string,
  step: string,
  subject: string,
  body: string,
): Promise<EmailTemplate> {
  return json<EmailTemplate>(`${backendUrl}/templates/${track}/${step}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, body }),
  });
}

/** Reset a template to its hardcoded default. */
export function resetEmailTemplate(
  backendUrl: string,
  track: string,
  step: string,
): Promise<EmailTemplate> {
  return json<EmailTemplate>(`${backendUrl}/templates/${track}/${step}`, { method: 'DELETE' });
}

// --- Outlook connection (WF3) ------------------------------------------------

/** Current Outlook connection status (open endpoint). */
/** Is Pocket actually feeding us recordings? (GET /pocket/status) */
export function fetchPocketStatus(backendUrl: string, signal?: AbortSignal): Promise<PocketStatus> {
  return json<PocketStatus>(`${backendUrl}/pocket/status`, { signal });
}

export function fetchOutlookStatus(backendUrl: string, signal?: AbortSignal): Promise<OutlookStatus> {
  return json<OutlookStatus>(`${backendUrl}/auth/outlook/status`, { signal });
}

/** Mint the Microsoft consent URL (authenticated) to open in the system browser. */
export function startOutlookConnect(backendUrl: string): Promise<{ url: string }> {
  return json<{ url: string }>(`${backendUrl}/auth/outlook/start`);
}

/** Forget one Outlook mailbox (or all if sender omitted) → back to dry-run. */
export function disconnectOutlook(backendUrl: string, sender?: string): Promise<OutlookStatus> {
  return json(`${backendUrl}/auth/outlook/disconnect`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(sender ? { sender } : {}),
  });
}

/** Choose which connected mailbox WF3 sends re-engagement email from. */
export function setPrimaryOutlook(backendUrl: string, sender: string): Promise<OutlookStatus> {
  return json(`${backendUrl}/auth/outlook/primary`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sender }),
  });
}

// --- Local dashboard auth ----------------------------------------------------

/** Is login required, and has a password been set? (Open endpoint.) */
export function fetchAuthStatus(backendUrl: string): Promise<AuthStatus> {
  return json<AuthStatus>(`${backendUrl}/auth/status`);
}

/** Exchange a password for a session token. Returns null on a wrong password. */
export async function login(backendUrl: string, password: string): Promise<string | null> {
  const res = await fetch(`${backendUrl}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`login → ${res.status}`);
  return ((await res.json()) as { token: string }).token;
}

/** Change the auth toggle and/or password. Sends the current token (needed once
 *  auth is on). Throws with the server message on 400/401 so the UI can show it. */
export async function updateAuthSettings(
  backendUrl: string,
  body: { enabled?: boolean; password?: string },
  token: string | null,
): Promise<AuthStatus> {
  const res = await fetch(`${backendUrl}/auth/settings`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error((msg as { error?: string }).error ?? `settings → ${res.status}`);
  }
  return (await res.json()) as AuthStatus;
}

/** Bulk-send selected refills to Fullscript (dry-run until configured). */
export function sendRefillOrders(backendUrl: string, refillIds: string[]): Promise<RefillSendResponse> {
  return json(`${backendUrl}/refills/orders`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refill_ids: refillIds }),
  });
}

// --- Audit trail / activity ---------------------------------------------------

/** Global activity feed, newest first. Optional entity-type filter. */
export function fetchActivity(
  backendUrl: string,
  opts?: { type?: string; limit?: number },
  signal?: AbortSignal,
): Promise<{ events: import('./types').AuditEvent[] }> {
  const params = new URLSearchParams();
  if (opts?.type) params.set('type', opts.type);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const qs = params.toString();
  return json(`${backendUrl}/audit${qs ? `?${qs}` : ''}`, { signal });
}

/** One entity's history (e.g. a checkout or session), newest first. */
export function fetchEntityHistory(
  backendUrl: string,
  entityType: string,
  entityId: string,
  signal?: AbortSignal,
): Promise<{ events: import('./types').AuditEvent[] }> {
  return json(`${backendUrl}/audit/${entityType}/${entityId}`, { signal });
}

// --- Tasks + prep brief -------------------------------------------------------

/** Nicole's open follow-ups, promoted from session notes on approval. */
export function fetchTasks(backendUrl: string, signal?: AbortSignal): Promise<{ tasks: import('./types').Task[] }> {
  return json(`${backendUrl}/tasks`, { signal });
}

export function updateTask(
  backendUrl: string,
  id: string,
  status: import('./types').TaskStatus,
): Promise<import('./types').Task> {
  return json(`${backendUrl}/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

/** Pre-session prep brief for one appointment. */
export function fetchBrief(
  backendUrl: string,
  appointmentId: string,
  signal?: AbortSignal,
): Promise<import('./types').Brief> {
  return json(`${backendUrl}/appointments/${appointmentId}/brief`, { signal });
}

// --- Outbound approval queue ------------------------------------------------

/** Emails waiting for approval. Nothing here has been seen by a client. */
export function fetchApprovals(
  backendUrl: string,
  list?: ApprovalList,
  signal?: AbortSignal,
): Promise<{ approvals: ApprovalItem[] }> {
  const q = list ? `?list=${list}` : '';
  return json<{ approvals: ApprovalItem[] }>(`${backendUrl}/engagement/approvals${q}`, { signal });
}

/** Counts for the dashboard alert. */
export function fetchApprovalSummary(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<ApprovalSummary> {
  return json<ApprovalSummary>(`${backendUrl}/engagement/approvals/summary`, { signal });
}

/** Approve for sending. Does not send — the daily dispatch does. */
export function approveEmails(backendUrl: string, ids: string[]): Promise<{ approved: number }> {
  return json(`${backendUrl}/engagement/approvals/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
}

export function rejectEmails(
  backendUrl: string,
  ids: string[],
  reason?: string,
): Promise<{ rejected: number }> {
  return json(`${backendUrl}/engagement/approvals/reject`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids, reason }),
  });
}

/** Edit before approving. The item stays pending — editing is not approving. */
export function updateApproval(
  backendUrl: string,
  id: string,
  subject: string,
  body: string,
): Promise<{ ok: boolean }> {
  return json(`${backendUrl}/engagement/approvals/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ subject, body }),
  });
}

/** Send everything already approved, without waiting for the daily job. */
export function dispatchApproved(backendUrl: string): Promise<{ sent: number; failed: number }> {
  return json(`${backendUrl}/engagement/approvals/dispatch`, { method: 'POST' });
}
