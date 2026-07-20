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
  /** Session date. Prefer this over updated_at, which is when the row was written. */
  starts_at?: string;
  ends_at?: string;
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
/** Dosing slots on the Supplement Protocol's Daily Schedule grid (cols D–J).
 *  A slot is filled only when the timing was actually spoken. */
export interface DosingSchedule {
  uponWaking: string | null;
  breakfast: string | null;
  midMorning: string | null;
  lunch: string | null;
  midAfternoon: string | null;
  dinner: string | null;
  beforeBed: string | null;
}
export const SCHEDULE_SLOTS: { key: keyof DosingSchedule; label: string }[] = [
  { key: 'uponWaking', label: 'Upon Waking' },
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'midMorning', label: 'Mid-Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'midAfternoon', label: 'Mid-Afternoon' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'beforeBed', label: 'Before Bed' },
];

export interface Supplement {
  name: string;
  dose: string | null;
  quantity: number | null;
  change: SupplementChange;
  schedule?: DosingSchedule | null;
}
export interface FollowUp {
  text: string;
  due_in_days: number | null;
}
// Nutrition Response Testing findings — feed the ROF's NRT block and the Flow
// Sheet's FOUNDATION/BODY SCAN columns. Null means the transcript never stated
// it; that's correct and expected, never a bug to paper over.
// The FOUNDATION column (D) of the Flow Sheet: a fixed list of muscle-testing
// prompts Nicole works down in order. One field per prompt, so the review screen
// can show a called result against an uncalled one instead of a single blob.
// Legacy notes stored one string here; the server parks it in `additional`.
export interface FoundationFindings {
  laying1: string | null;
  standing: string | null;
  hta: string | null;
  hta_post_run: string | null;
  laying2: string | null;
  art_open: string | null;
  art_switch: string | null;
  art_cns: string | null;
  art_dental: string | null;
  art_hormonal: string | null;
  additional: string | null;
}
// The BODY SCAN column (E): two passes — ART with polarity, then NRT without —
// each with its own PRIORITY / MATRIX / CELL readings. Kept separate because
// Nicole compares the two passes against each other.
export interface BodyScanFindings {
  art_ectoderm: string | null;
  art_priority: string | null;
  art_matrix: string | null;
  art_cell: string | null;
  additional_art: string | null;
  scan_priority: string | null;
  scan_matrix: string | null;
  scan_cell: string | null;
  additional_nrt: string | null;
}
export interface NrtFindings {
  pulse0: string | null;
  priority1: string | null;
  k27: string | null;
  stressors: string | null;
  foundation: FoundationFindings | null;
  body_scan: BodyScanFindings | null;
}
// The Flow Sheet's lifestyle log (column B). Same null-means-not-mentioned rule.
export interface Lifestyle {
  bm: string | null;
  sleep: string | null;
  water: string | null;
  cycle: string | null;
  exercise: string | null;
  diet: string | null;
}
export interface SessionNote {
  concerns: string[];
  goals?: string[];
  assessments: string[];
  protocol_changes: ProtocolChange[];
  supplements: Supplement[];
  /** Legacy notes stored plain strings; post-task extraction stores objects. */
  follow_ups: (string | FollowUp)[];
  nrt?: NrtFindings;
  lifestyle?: Lifestyle;
}

export type ReviewKind = 'sheets' | 'protocols';

// GET /review/:kind/:id/context (server/src/routes/review.ts) — what's already
// on file for this client, so Nicole can compare the draft against it instead
// of approving blind.
export interface SupplementPlanRow {
  name: string;
  dose: string | null;
  qty: number | null;
  schedule?: DosingSchedule | null;
  /** "Here" or "Fullscript" — the grid's last column. */
  source?: string | null;
}
export interface PriorNote {
  date: string;
  note: SessionNote;
}
export interface ReviewContext {
  client_id: string | null;
  prior: {
    sheet: PriorNote | null;
    protocol: PriorNote | null;
  };
  supplementPlan: {
    /** The running plan as it stands right now, before this draft is approved. */
    current: SupplementPlanRow[];
    /** What the plan would become if this draft were approved as-is. */
    merged: SupplementPlanRow[];
  };
}

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
  | 'schedule'
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
export interface UpcomingSession {
  id: string;
  pb_id: string | null;
  client_name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  service_type: string | null;
  source: 'pb' | 'local';
}
export interface BookingSlot {
  starts_at: string;
  ends_at: string;
  label: string;
}
export interface OfficeHours {
  timezone: string;
  days: number[];            // JS day-of-week 0=Sun
  start_hour: number;
  end_hour: number;
  session_duration_min: number;
  slot_horizon_days: number;
  max_slots: number;
  service_id?: string;
  service_type?: string;
}
export interface ScheduleData {
  pb_configured: boolean;
  sessions: UpcomingSession[];
  slots: BookingSlot[]; // server-derived — the same slots offered in emails
  office_hours: OfficeHours;
}
/** Alias kept for the Overview widget's upcoming list (same shape as UpcomingSession minus extras). */
export type UpcomingItem = Pick<UpcomingSession, 'starts_at' | 'status' | 'client_name'>;
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

// --- Tasks + prep brief -------------------------------------------------------

export type TaskStatus = 'open' | 'done' | 'dismissed';

export interface Task {
  id: string;
  client_id: string;
  client_name: string | null;
  appointment_id: string | null;
  title: string;
  /** Null is normal: a follow-up with no spoken timeframe has no due date. */
  due_date: string | null;
  status: TaskStatus;
  source: 'session' | 'manual';
  created_at: string;
  completed_at: string | null;
}

export interface BriefSupplement {
  name: string;
  dose: string | null;
  qty: number | null;
  due_date: string | null;
  ordered: boolean;
}

export interface Brief {
  client_id: string;
  client_name: string;
  appointment_id: string;
  starts_at: string;
  visit_number: number;
  last_session: {
    date: string;
    concerns: string[];
    assessments: string[];
    protocol_changes: string[];
    follow_ups: string[];
  } | null;
  open_tasks: Task[];
  supplements: BriefSupplement[];
  /** Fields last session never captured — her checklist for this visit. */
  not_covered_last_time: string[];
  outstanding_billing: { status: string; amount_cents: number; appointment_date: string } | null;
}
