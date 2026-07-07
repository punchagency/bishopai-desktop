import type {
  AuthStatus,
  CandidateAppointment,
  CheckoutData,
  CustomerMapData,
  CustomerSyncReport,
  ReconciliationData,
  EngagementData,
  LeadActivityItem,
  Overview,
  RefillDigest,
  RefillSendResponse,
  ReviewKind,
  ReviewQueue,
  SessionNote,
  UnmatchedConversation,
} from './types';

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
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    onUnauthorized?.(); // login turned on (or token expired) — bounce to login
    throw new Error(`${init?.method ?? 'GET'} ${new URL(url).pathname} → 401`);
  }
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${new URL(url).pathname} → ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch the review queue from the hosted backend. Throws on non-2xx. */
export function fetchReviewQueue(backendUrl: string, signal?: AbortSignal): Promise<ReviewQueue> {
  return json<ReviewQueue>(`${backendUrl}/review/queue`, { signal });
}

/** Consolidated Overview data (stats + activity + upcoming). */
export function fetchOverview(backendUrl: string, signal?: AbortSignal): Promise<Overview> {
  return json<Overview>(`${backendUrl}/dashboard/overview`, { signal });
}

/** Bee conversations that didn't correlate — need manual tagging. */
export function fetchUnmatched(
  backendUrl: string,
  signal?: AbortSignal,
): Promise<{ conversations: UnmatchedConversation[] }> {
  return json(`${backendUrl}/review/unmatched`, { signal });
}

/** Appointments offered as match candidates for an unmatched conversation. */
export function fetchCandidates(
  backendUrl: string,
  id: string,
): Promise<{ appointments: CandidateAppointment[] }> {
  return json(`${backendUrl}/review/unmatched/${id}/candidates`);
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
}

/** Full row (with content_json) for one sheet/protocol. */
export function fetchItem(backendUrl: string, kind: ReviewKind, id: string): Promise<ItemRow> {
  return json<ItemRow>(`${backendUrl}/review/${kind}/${id}`);
}

/** Server-rendered Markdown of the document as it stands. */
export function fetchRendered(backendUrl: string, kind: ReviewKind, id: string): Promise<{ markdown: string }> {
  return json<{ markdown: string }>(`${backendUrl}/review/${kind}/${id}/render`);
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
