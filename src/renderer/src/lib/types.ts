/**
 * GET /pocket/status — is the recorder feeding us?
 *
 * Recordings reach the backend directly from Pocket, so this is a report about
 * something happening elsewhere, not a local connection this app controls.
 * `healthy` is about ingest (something landed recently), not credentials.
 */
export interface PocketStatus {
  configured: boolean;
  webhookVerified: boolean;
  pollEnabled: boolean;
  lastRecordingAt: string | null;
  recordingsLast24h: number;
  unmatched: number;
  healthy: boolean;
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

/**
 * One row per SESSION. The appointment sheet and the client protocol hold the
 * same note and are approved together, so the queue lists the visit once rather
 * than listing the same session twice under two document names.
 */
export interface ReviewSession {
  appointment_id: string;
  client_id: string | null;
  client_name: string | null;
  starts_at: string | null;
  updated_at: string;
  status: 'draft' | 'in_review' | 'approved';
  sheet_id: string | null;
  protocol_id: string | null;
  content_json: Record<string, unknown>;
}

export interface ReviewQueue {
  sessions: ReviewSession[];
}

// content_json shape (server/src/session/extract.ts SessionNoteSchema).
export type ProtocolChangeType = 'add' | 'remove' | 'adjust' | 'continue';
export type SupplementChange = 'start' | 'stop' | 'increase' | 'decrease' | 'continue';

export interface ProtocolChange {
  /** The model's own word when `type` wasn't a clean enum value. */
  type_raw?: string | null;
  type_unresolved?: boolean;
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
  /** "Here" or "Fullscript" — where the client obtains it. Distinct from the
   *  plan row's `source`, which is provenance and never shown to a client. */
  obtained_from?: string | null;
  /** The ROF's "Function" column — what this supplement is for, in the client's
   *  terms. Practitioner knowledge, so usually written during review. */
  func?: string | null;
  /** Structured dose, when the transcript stated it plainly. Feeds the WF4
   *  run-out projection; `dose` stays the verbatim text the documents print. */
  units_per_dose?: number | null;
  unit?: string | null;
  doses_per_day?: number | null;
  /** The model's own word when `change` wasn't a clean enum value ("hold" →
   *  stop). Shown as a mapping to confirm rather than presented as fact. */
  change_raw?: string | null;
  /** Nothing matched at all — `change` is a placeholder, not a reading. */
  change_unresolved?: boolean;
  /** A catalog product this name nearly matched. A suggestion, never applied. */
  name_matched_to?: string | null;
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
export const STRESSOR_CATEGORIES = [
  'immune',
  'food',
  'chemical',
  'metal',
  'scar',
  'emotional',
  'other',
] as const;
export type StressorCategory = (typeof STRESSOR_CATEGORIES)[number];

/**
 * One identified stressor. A list, not a string, because a session names several
 * minutes apart — and split into category + source because "food" and "food,
 * specifically dairy" are a question and its answer, not the same finding.
 *
 * `source` null is a real reading, not a blank to be filled: it means the
 * practitioner named the category and explicitly did NOT narrow it further.
 */
export interface Stressor {
  category: StressorCategory;
  /** The model's own word, when it wasn't already one of the categories. */
  category_raw?: string | null;
  category_unresolved?: boolean;
  source: string | null;
  body_area: string | null;
  detail: string | null;
}

export interface NrtFindings {
  pulse0: string | null;
  priority1: string | null;
  k27: string | null;
  stressors: Stressor[];
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
/** Where a finding came from: the practitioner's own words, and when. */
/**
 * How a finding's provenance was checked, strongest first. `span` means the
 * model pointed at a numbered transcript turn and quoted it word for word;
 * `span_near` means it pointed at the right turn but reworded it, which is the
 * shape a reversed meaning arrives in.
 */
export type VerificationStatus =
  | 'span'
  | 'span_near'
  | 'exact'
  | 'near'
  | 'unsupported'
  | 'misattributed'
  | 'bad_span';

export interface Evidence {
  /** Dotted field path — "nrt.hta", "concerns.0", "supplements.1". */
  path: string;
  quote: string;
  at_seconds: number | null;
  /** The numbered transcript turn this finding was read from. */
  turn?: number | null;
  /** The transcript does NOT back this finding. The finding is kept and flagged;
   *  these are the fields worth reading closely. */
  unverified?: boolean;
  /** How the check was satisfied, or how it failed. */
  verification?: VerificationStatus;
  /** The cited turn's ACTUAL words, resolved by the server. Shown in place of
   *  the model's quote wherever they differ. */
  turn_text?: string | null;
}

/** Server-computed extraction metadata — never anything the model said. */
export interface ExtractionMeta {
  prompt_version?: string;
  provider?: string;
  model?: string;
  /** Stages that failed. Their fields are ABSENT, not empty — the difference
   *  between "not tested" and "we never read that part of the session". */
  partial?: string[];
  /** Field paths where two parts of the transcript disagreed. */
  conflicts?: { path: string; chosen: string | null; candidates: string[] }[];
  /** Parts of the session that produced no usable extraction. `from`/`to` are
   *  seconds and are null on a recorder that emits no timestamps, so the turn
   *  range is what actually renders most of the time. */
  gaps?: {
    from: number | null;
    to: number | null;
    from_turn?: number | null;
    to_turn?: number | null;
    stage?: string | null;
  }[];
  /** Findings that state a figure the transcript never states — the fabrication
   *  a verified quote cannot rule out, because the cited turn can be real and
   *  about the right thing while the number in the finding was never spoken. */
  unstated_numbers?: { path: string; value: string; numbers: number[] }[];
  attribution_coverage?: number | null;
  chunks?: number | null;
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
  evidence?: Evidence[];
  extraction?: ExtractionMeta;
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
  /** Provenance (notes | fullscript | pb) — internal, never shown to a client. */
  source?: string | null;
  /** "Here" or "Fullscript" — the grid's last column. */
  obtained_from?: string | null;
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
  /** The recording this note was extracted from, so every field can be checked
   *  against what was actually said. */
  transcript?: {
    text: string;
    recorded_at: string | null;
    /** The session split into the SAME numbered turns the citations point at,
     *  parsed server-side. Empty on an unparseable transcript, in which case the
     *  pane falls back to plain lines of `text`. */
    turns?: TranscriptTurn[];
  } | null;
}

/** One turn of the recording, as the review pane reads it. */
export interface TranscriptTurn {
  index: number;
  role: 'PRACTITIONER' | 'CLIENT' | 'UNKNOWN';
  speaker: string;
  at_seconds: number | null;
  text: string;
}

export interface UnmatchedConversation {
  id: string;
  source_id: string;
  source?: string;
  starts_at: string;
  ends_at: string;
  correlation_status: string | null;
  transcript_preview: string;
}

/** GET /review/unmatched/:id — one recording in full, for the detail pane. */
export interface UnmatchedDetail {
  id: string;
  source_id: string;
  source?: string;
  starts_at: string;
  ends_at: string;
  correlation_status: string | null;
  extraction_status: string | null;
  /** The whole recording, not the 240-char list preview. May be null (the
   *  recorder sent a session with no usable transcript — nothing to read, only
   *  timing to go on). */
  transcript: string | null;
}

export interface CandidateAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  client_id: string | null;
  client_name: string | null;
  /** How often this client's name is spoken in the recording. Ranking evidence
   *  only — a name in a transcript never assigns anything on its own. */
  name_mentions: number;
  name_matched_on: 'full' | 'first' | 'last' | null;
  /** Seconds the recording and this booking overlap. */
  overlap_seconds: number;
}

/** A client, for the picker used when a recording has no booking at all. */
export interface ClientSummary {
  id: string;
  name: string;
  email: string | null;
  pb_id: string | null;
  last_seen: string | null;
  visit_count: string | number;
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
  /** Units a day the dose works out to (schedule grid first, then dose text). */
  per_day?: number | null;
  /** Days the bottle lasts at that rate — what the run-out date is built from. */
  days_supply?: number | null;
  /** Set once Nicole cancels this refill's automated client reminders. */
  reminders_cancelled_at?: string | null;
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
// Scheduled client emails (server/src/routes/reminders.ts).
export type ReminderKind = 'refill' | 'reengagement';
export interface ScheduledReminder {
  id: string;
  kind: ReminderKind;
  /** refills.id / leads.id — what cancel and restore act on. */
  source_id: string;
  client_id: string | null;
  client_name: string;
  to_email: string | null;
  subject: string;
  detail: string | null;
  /** yyyy-mm-dd. Today means "on the next scheduled pass". */
  send_at: string;
  stage: number;
  blocked_reason: string | null;
}
export interface UpcomingReminders {
  reminders: ScheduledReminder[];
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
  /** Subject of the next pending email — shown inline on the lead card. */
  next_subject: string | null;
  /** Effective body of the next pending email (for inline editing). */
  next_body?: string | null;
  /** ISO timestamp of when the next step fires. */
  next_send_at: string | null;
  /** True if this lead has a custom draft edited specifically for them. */
  is_custom_draft?: boolean;
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

// Email template — one (track, step) pair with effective copy.
export interface EmailTemplate {
  track: string;
  step: string;
  subject: string;
  body: string;
  is_custom: boolean;
  updated_at: string | null;
}

// Pending send queue item.
export interface QueueItem {
  lead_id: string;
  email: string | null;
  status: string;
  track: string;
  step: string;
  subject: string;
  body: string;
  send_at: string;
  /** True if this queue item has a custom draft edited specifically for this lead. */
  is_custom_draft?: boolean;
}

// Entry from email_send_log.
export interface SentEmail {
  id: string;
  lead_id: string | null;
  track: string | null;
  step: string | null;
  to_email: string;
  subject: string;
  body: string;
  dry_run: boolean;
  ok: boolean;
  error: string | null;
  sent_at: string;
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
  | 'activity'
  | 'settings';

// Unified audit trail (server/src/audit/log.ts).
export interface AuditEvent {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  actor: string;
  summary: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
export type WorkflowStatus = 'live' | 'pending' | 'planned';

export interface OverviewStats {
  awaiting_review: number | string;
  unmatched: number | string;
  /** Matched recordings whose extraction is still running (pending/processing/retrying). */
  processing?: number | string;
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

// --- Outbound approval queue ------------------------------------------------
//
// Nothing automated reaches a client until it is approved. The queue is split
// into two lists: `cancelled` is the win-back track for people who cancelled a
// booking; `normal` is everything else, grouped by why the email exists.

export type ApprovalList = 'normal' | 'cancelled';

export type ApprovalCategory =
  | 'enquiry'
  | 'appointment_lapse'
  | 'dose_lapse'
  | 'protocol'
  | 'cancelled';

export interface ApprovalItem {
  id: string;
  list: ApprovalList;
  category: ApprovalCategory;
  lead_id: string | null;
  client_id: string | null;
  to_email: string;
  subject: string;
  body: string;
  /** When the cadence says this is due. */
  send_after: string;
  /** After this it is dropped rather than sent — a late nudge reads worse than none. */
  expires_at: string;
  /** What generated it: 'cadence:<track>:<step>', 'refill:<id>'. */
  source_ref: string;
  lead_status: string | null;
  created_at: string;
}

export interface ApprovalSummary {
  total: number;
  byList: Record<string, number>;
  byCategory: Record<string, number>;
  /** Oldest pending item's due date — how long something has been waiting. */
  oldestSendAfter: string | null;
}
