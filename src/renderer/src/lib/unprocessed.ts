import type { UnprocessedReason, UnprocessedSession } from './types';

// The vocabulary for a session with no note, shared by the list and the detail
// pane so the two can never describe the same row differently.
//
// It lives outside both components because the list is where Nicole first reads
// "Out of allowance" and the detail pane is where she reads what that means; if
// one of them said "Extraction failed" for the same row, the pane would be
// contradicting the row that opened it.

export interface ReasonCopy {
  /** The badge. Short, and never the pipeline's word for it. */
  label: string;
  tone: 'warning' | 'neutral' | 'accent';
  /** One sentence: what happened. */
  blurb: string;
  /** What, if anything, she should do — null when the answer is "nothing". */
  action: string | null;
}

export const REASONS: Record<UnprocessedReason, ReasonCopy> = {
  quota: {
    label: 'Out of allowance',
    tone: 'neutral',
    blurb:
      "The day's allowance of AI requests ran out before this session could be read. Nothing is wrong with the recording.",
    // Deliberately not "try again". Re-running against a spent daily cap spends
    // another request on the cap that just refused it, which is the exact
    // mistake that produced seven blank notes.
    action: 'It will be read automatically once the allowance resets — no need to do anything.',
  },
  // An empty note has two causes that want opposite responses, and this used to
  // tell both of them the same story: "Every part of this session was skipped —
  // nothing was read." That is a claim about WHY, and it was made without
  // looking at whether anything had in fact been skipped.
  //
  // It was true of the notes it was written for — four quota casualties from
  // 2026-08-24, every stage dropped. It is close to the only case that can no
  // longer happen: extract.ts now throws when every stage fails, so a total loss
  // lands in `failed` and gets retried rather than filed as done. The empty
  // notes arriving from here on are mostly the other kind, and telling Nicole a
  // session she remembers as brief and uneventful "was never read" sends her to
  // spend requests re-running an extraction that will correctly produce nothing
  // again.
  blank: {
    label: 'Nothing to record',
    // Neutral, not warning. This is very often the correct outcome, and dressing
    // it in the same colour as a failure is what made an ordinary short visit
    // look like a broken one.
    tone: 'neutral',
    blurb: 'This session was read all the way through, and there was nothing clinical to record.',
    action:
      'That can be right — a short visit, a rescheduled appointment, or a recording that caught the wrong part of the day. Read the transcript below to check, and use "Read again" only if there should be findings.',
  },
  unread: {
    label: 'Not read',
    tone: 'warning',
    // Says what happened without overstating how much of it. One dropped stage
    // and four are both possible here; the row and the pane list which parts
    // actually dropped, so the sentence does not have to guess at the number.
    blurb:
      'Parts of this session could not be read, and nothing came back from the parts that were. The note is empty because the reading failed, not because the session was quiet.',
    action: 'The full transcript is below. Use "Read again" to try turning it into a note.',
  },
  incomplete: {
    label: 'Partly read',
    tone: 'warning',
    blurb: 'Some of the session was read and some was skipped, so the note is missing parts.',
    action: 'Read the transcript below for anything the note is missing.',
  },
  failed: {
    label: "Couldn't be read",
    tone: 'warning',
    blurb: 'Something went wrong while reading this session.',
    action: 'It will be tried again automatically. The transcript is below in the meantime.',
  },
  needs_review: {
    label: 'Needs a look',
    tone: 'warning',
    blurb: 'This session was tried several times and never came through.',
    action: 'The transcript is below. Use "Read again" to try once more.',
  },
  queued: {
    label: 'In line',
    tone: 'accent',
    blurb: 'Waiting its turn to be read.',
    // Sessions are read one at a time, on purpose: the day's allowance is
    // counted in requests and a session costs several, so reading two at once
    // is a race to spend it. Saying so turns a queue that looks stalled into
    // one that is simply taking its turn.
    action: 'Sessions are read one at a time. The transcript is below in the meantime.',
  },
  running: {
    label: 'Reading now',
    tone: 'accent',
    blurb: 'Being turned into a note right now.',
    action: 'The note will appear under Awaiting review when it is done.',
  },
};

/**
 * "Next up" / "3rd in line" — where this session sits, in the words someone
 * waiting on it would use.
 *
 * Ordinals rather than "position 3", because the number is not an identifier
 * and reading it as one invites the question of what happened to 1 and 2.
 */
export function queuePositionText(position: number | null): string | null {
  if (position == null || position < 1) return null;
  if (position === 1) return 'Next up';
  const suffix =
    position % 100 >= 11 && position % 100 <= 13
      ? 'th'
      : { 1: 'st', 2: 'nd', 3: 'rd' }[position % 10] ?? 'th';
  return `${position}${suffix} in line`;
}

/**
 * "Tried twice" — how much of the retry budget is gone.
 *
 * Returns null on the first attempt and on a spent allowance. A retry ladder is
 * only worth showing once it is visibly not working: "attempt 1 of 4" on a
 * session that has been queued for ten seconds reads as a problem where there
 * is none, and a session parked on the allowance has not used an attempt at all
 * — counting one would be the same lie the backend used to tell itself.
 */
type AttemptRow = Pick<UnprocessedSession, 'attempts' | 'max_attempts' | 'reason'>;

export function attemptText(row: AttemptRow): string | null {
  if (row.reason === 'quota' || row.attempts < 1) return null;
  if (row.attempts >= row.max_attempts) return `Stopped trying after ${row.attempts} tries`;
  return `Tried ${row.attempts === 1 ? 'once' : row.attempts === 2 ? 'twice' : `${row.attempts} times`}`;
}

/** "in 4 hours" — a wait, not a timestamp. Nobody needs to know the allowance
 *  resets at midnight Pacific; they need to know it isn't now. */
export function untilText(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return 'due now';
  const hours = Math.round(ms / 3_600_000);
  if (hours < 1) return `in ${Math.max(1, Math.round(ms / 60_000))} min`;
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(hours / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/** "48-minute" / "1 hr 5 min". A neutral word rather than "0 minutes" when the
 *  recorder gave no end time. */
export function durationText(seconds: number | null): string {
  if (!seconds || seconds <= 0) return 'Full';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins}-minute`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h}-hour`;
}

/**
 * "2 minutes of a 60-minute appointment" — the length of the recording set
 * against the length of the booking.
 *
 * Both numbers, not a percentage. A 27-minute Amber Stack recording was split
 * and its 695-character tail — two minutes of gym chat and a bathroom break —
 * was filed as a session on its own hour-long appointment. "3%" would have been
 * true and meant nothing; the two durations side by side are what make it
 * obvious that no consultation is in there.
 */
export function coverageText(
  recordingSeconds: number | null,
  appointmentSeconds: number | null,
): string | null {
  if (!recordingSeconds || !appointmentSeconds || appointmentSeconds <= 0) return null;
  const mins = (s: number) => Math.max(1, Math.round(s / 60));
  return `${mins(recordingSeconds)} minutes of a ${mins(appointmentSeconds)}-minute appointment`;
}
