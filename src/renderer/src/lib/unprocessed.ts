import type { UnprocessedReason } from './types';

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
  blank: {
    label: 'Not read',
    tone: 'warning',
    blurb:
      'Every part of this session was skipped, so the note is empty. That is not a quiet session — nothing was read.',
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
    label: 'Queued',
    tone: 'accent',
    blurb: 'Waiting its turn to be read.',
    action: 'The transcript is below if you need it before the note arrives.',
  },
  running: {
    label: 'Reading now',
    tone: 'accent',
    blurb: 'Being turned into a note right now.',
    action: 'The note will appear under Awaiting review when it is done.',
  },
};

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
