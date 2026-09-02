import type {
  ActivityItem,
  Overview,
  ReviewSession,
  UnmatchedConversation,
  UpcomingItem,
} from './types';

// One set of fixtures behind every offline preview.
//
// These used to be a private SAMPLE constant per view, and they disagreed: the
// Overview read "2 Awaiting review · 2 Unmatched · 3 Upcoming sessions" beside
// lists holding one row each, and the Approved tab showed the same unapproved
// draft as Awaiting review. A stat card that contradicts the list it links to
// teaches Nicole to distrust the number — and on the Overview the number IS the
// screen.
//
// So the lists are the source of truth and the stats are counted off them. Add
// a row and the Overview follows; there is nothing left to keep in sync.
//
// Everything here is visibly invented. See lib/preview.ts for where it is
// allowed to render at all (local backend only) and <SampleDataNotice> for how
// a screen says so.

const now = () => new Date().toISOString();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60e3).toISOString();
const hoursAhead = (h: number) => new Date(Date.now() + h * 3600e3).toISOString();

function sampleSession(
  n: string,
  clientName: string,
  status: ReviewSession['status'],
  startsAt: string,
): ReviewSession {
  return {
    appointment_id: `sample-appt-${n}`,
    client_id: `sample-client-${n}`,
    client_name: clientName,
    starts_at: startsAt,
    updated_at: now(),
    status,
    sheet_id: `sample-sheet-${n}`,
    protocol_id: `sample-protocol-${n}`,
    content_json: {},
    recording_seconds: 3000,
    appointment_seconds: 3600,
    transcript_chars: 16882,
    too_short_for_appointment: false,
  };
}

/** Sessions with a draft note waiting to be read — the "Awaiting review" tab. */
export const SAMPLE_PENDING_SESSIONS: ReviewSession[] = [
  sampleSession('1', 'Jane Doe', 'draft', minutesAgo(95)),
  sampleSession('2', 'Maya Chen', 'draft', minutesAgo(210)),
];

/** The "Approved" tab. Kept separate so it never shows an unapproved draft. */
export const SAMPLE_APPROVED_SESSIONS: ReviewSession[] = [
  sampleSession('3', 'David Osei', 'approved', minutesAgo(430)),
];

/** Recordings with no appointment behind them — the Unmatched queue. */
export const SAMPLE_UNMATCHED: UnmatchedConversation[] = [
  {
    id: 'sample-unmatched-1',
    source_id: 'rec_unmatched1',
    source: 'pocket',
    starts_at: minutesAgo(180),
    ends_at: minutesAgo(150),
    correlation_status: 'unmatched',
    transcript_preview:
      'Nicole: quick chat about supplement timing. Client: I take them at night.',
  },
  {
    id: 'sample-unmatched-2',
    source_id: 'rec_unmatched2',
    source: 'pocket',
    starts_at: minutesAgo(320),
    ends_at: minutesAgo(275),
    correlation_status: 'unmatched',
    transcript_preview:
      "Nicole: let's go over the sleep protocol before we book the follow-up.",
  },
];

/** The Overview's "Upcoming" card. */
export const SAMPLE_UPCOMING: UpcomingItem[] = [
  { starts_at: hoursAhead(2), status: 'confirmed', client_name: 'Maya Chen' },
  { starts_at: hoursAhead(5), status: 'confirmed', client_name: 'Jane Doe' },
  { starts_at: hoursAhead(26), status: 'pending', client_name: 'David Osei' },
];

export const SAMPLE_RECENT_ACTIVITY: ActivityItem[] = [
  { ts: now(), kind: 'conversation', text: 'Recording matched to an appointment' },
  { ts: now(), kind: 'draft', text: 'Session note drafted for Maya Chen' },
];

/**
 * Counted from the lists above, never hand-written — that is the whole point of
 * this module.
 */
export const SAMPLE_OVERVIEW: Overview = {
  stats: {
    awaiting_review: SAMPLE_PENDING_SESSIONS.length,
    unmatched: SAMPLE_UNMATCHED.length,
    upcoming: SAMPLE_UPCOMING.length,
    approved_today: SAMPLE_APPROVED_SESSIONS.length,
  },
  recent_activity: SAMPLE_RECENT_ACTIVITY,
  upcoming: SAMPLE_UPCOMING,
};
