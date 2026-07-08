export type CourierState = 'connected' | 'connecting' | 'disconnected' | 'error';
export type BeePhase = 'setup' | 'approving' | 'active' | 'attention';

export interface CourierStatus {
  state: CourierState;
  phase: BeePhase; // coarse onboarding phase for the UI
  lastSyncedAt: string | null;
  message: string;
  authUrl?: string; // present while awaiting owner approval of Bee access
}

// Mirrors the backend GET /review/queue row shapes (server/src/routes/review.ts).
export interface ReviewSheet {
  id: string;
  status: 'draft' | 'in_review' | 'approved';
  updated_at: string;
  appointment_id: string;
  starts_at?: string;
  ends_at?: string;
  client_id: string | null;
  client_name: string | null;
  content_json: Record<string, unknown>;
}

export interface ReviewProtocol {
  id: string;
  status: 'draft' | 'in_review' | 'approved';
  updated_at: string;
  appointment_id: string;
  client_id: string | null;
  client_name: string | null;
  content_json: Record<string, unknown>;
}

export interface ReviewQueue {
  appointment_sheets: ReviewSheet[];
  protocols: ReviewProtocol[];
}

// content_json shape (server/src/session/extract.ts SessionNoteSchema).
export type ProtocolChangeType = 'add' | 'remove' | 'adjust' | 'continue';
export type SupplementChange = 'start' | 'stop' | 'increase' | 'decrease' | 'continue';

export interface ProtocolChange {
  description: string;
  type: ProtocolChangeType;
}
export interface Supplement {
  name: string;
  dose: string | null;
  quantity: number | null;
  change: SupplementChange;
}
export interface SessionNote {
  concerns: string[];
  assessments: string[];
  protocol_changes: ProtocolChange[];
  supplements: Supplement[];
  follow_ups: string[];
}

export type ReviewKind = 'sheets' | 'protocols';

export interface UnmatchedConversation {
  id: string;
  bee_id: string;
  starts_at: string;
  ends_at: string;
  correlation_status: string | null;
  transcript_preview: string;
}

export interface CandidateAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  client_name: string | null;
}

// WF4 refill digest (server/src/routes/refills.ts).
export type RefillTier = 'overdue' | 'soon' | 'coming';
export interface RefillItem {
  id: string;
  due_date: string | null;
  status: 'pending' | 'notified' | 'snoozed';
  days_left: number | null;
  client_id: string | null;
  client_name: string | null;
  supplement_name: string | null;
  dose: string | null;
  qty: number | null;
  tier: RefillTier;
  /** Persisted Fullscript plan link from the last successful send, if any. */
  fullscript_plan_id?: string | null;
  invitation_url?: string | null;
}
export interface RefillDigest {
  fullscript_configured: boolean;
  refills: RefillItem[];
}
export interface RefillOrderResult {
  refill_id: string | null;
  client_name: string | null;
  supplement_name: string | null;
  ok: boolean;
  error: string | null;
  invitation_url: string | null;
  fullscript_plan_id: string | null;
}
export interface RefillSendResponse {
  batch_id: string;
  sent: number;
  failed: number;
  results: RefillOrderResult[];
}

// WF2 checkout (server/src/routes/checkout.ts).
export interface CheckoutLineItem {
  label: string;
  amount_cents: number;
}
export interface CheckoutSummary {
  currency: string;
  qb_invoice_id: string;
  line_items: CheckoutLineItem[];
  total_cents: number;
  fullscript_changes: string[];
}
export interface CheckoutItem {
  id: string;
  status: string;
  summary_snapshot: CheckoutSummary | null;
  qb_txn_id: string | null;
  updated_at: string;
  client_name: string | null;
  starts_at: string | null;
}
export interface CheckoutData {
  quickbooks_configured: boolean;
  checkouts: CheckoutItem[];
}

// client → QuickBooks customer mapping (server/src/routes/checkout.ts).
export interface CustomerMapRow {
  client_id: string;
  client_name: string;
  email: string | null;
  qbo_customer_id: string | null;
  updated_at: string | null;
}
export interface CustomerMapData {
  quickbooks_configured: boolean;
  clients: CustomerMapRow[];
}
// WF2 payment reconciliation ledger / dead-letter surface.
export type ReconciliationStatus = 'PENDING' | 'RECORDING' | 'RECORDED' | 'FAILED' | 'NEEDS_REVIEW';
export interface Reconciliation {
  id: string;
  checkout_id: string;
  status: ReconciliationStatus;
  amount_cents: number;
  currency: string;
  invoice_id: string | null;
  customer_id: string | null;
  provider_txn_id: string | null;
  accounting_payment_id: string | null;
  attempts: number;
  last_error: string | null;
  next_attempt_at: string;
  updated_at: string;
  client_name: string | null;
}
export interface ReconciliationData {
  quickbooks_configured: boolean;
  reconciliations: Reconciliation[];
}

export interface CustomerSyncReport {
  ok: boolean;
  error?: string;
  customersScanned: number;
  clientsScanned: number;
  alreadyMapped: number;
  mapped: { clientId: string; clientName: string; qboCustomerId: string; via: 'email' | 'name' }[];
  ambiguous: { clientId: string; clientName: string; via: 'email' | 'name'; candidateIds: string[] }[];
  unmatched: { clientId: string; clientName: string }[];
}

// WF3 engagement (server/src/routes/engagement.ts).
export interface EngagementLead {
  id: string;
  source: string | null;
  email: string | null;
  status: string;
  last_touch: string | null;
  created_at: string;
  activity_count: number | string;
  last_activity: string | null;
  sent_steps: string[];
  next_action: 'send' | 'deactivate' | 'none';
  next_step: string | null;
}
export interface LeadActivityItem {
  id: string;
  type: string;
  path: string | null;
  detail: string | null;
  occurred_at: string;
  lead_email: string | null;
}
export interface EngagementData {
  outlook_configured: boolean;
  outlook_sender: string | null;
  leads: EngagementLead[];
}

// One connected mailbox.
export interface OutlookAccount {
  sender: string;
  connectedAt: string | null;
  primary: boolean;
}

// Outlook connect status (server/src/routes/outlook.ts → GET /auth/outlook/status).
export interface OutlookStatus {
  available: boolean; // Entra app registered → the Connect flow can be offered
  connected: boolean; // at least one mailbox can send right now
  sender: string | null; // the primary sender
  primarySender: string | null;
  connectedAt: string | null;
  mode: 'oauth' | 'static' | 'none';
  accounts: OutlookAccount[];
}

// Local dashboard auth (server/src/routes/auth.ts).
export interface AuthStatus {
  enabled: boolean;
  configured: boolean;
}

// Dashboard sections (the cockpit over WF1–WF4, §8).
export type ViewKey =
  | 'overview'
  | 'review'
  | 'unmatched'
  | 'checkout'
  | 'refills'
  | 'engagement'
  | 'settings';
export type WorkflowStatus = 'live' | 'pending' | 'planned';

export interface OverviewStats {
  awaiting_review: number | string;
  unmatched: number | string;
  upcoming: number | string;
  approved_today: number | string;
  refills_due?: number | string;
  leads_active?: number | string;
  checkouts_awaiting?: number | string;
}
export interface ActivityItem {
  ts: string;
  kind: string;
  text: string;
}
export interface UpcomingItem {
  starts_at: string;
  status: string;
  client_name: string | null;
}
export interface Overview {
  stats: OverviewStats;
  recent_activity: ActivityItem[];
  upcoming: UpcomingItem[];
}

// The preload bridge exposed on window.
export interface InnerlumeBridge {
  getAppInfo: () => Promise<{ backendUrl: string; version: string }>;
  openExternal: (url: string) => void;
  bee: {
    getStatus: () => Promise<CourierStatus>;
    connect: () => Promise<CourierStatus>;
    onStatus: (cb: (s: CourierStatus) => void) => () => void; // returns unsubscribe
  };
}

declare global {
  interface Window {
    innerlume: InnerlumeBridge;
  }
}
