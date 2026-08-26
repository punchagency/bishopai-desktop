// What Nicole is allowed to see when something goes wrong.
//
// Every failure in this app reaches the screen through one path: `json()` in
// api.ts throws, a view catches it and renders `err.message`. That message used
// to be built for whoever was reading the console —
//
//   POST /review/conversations/6609e95a…/reextract → 404
//   GET /review/queue → 500
//
// — and roughly twenty views render it verbatim. A status code is not a fact
// about the practice; it is a fact about HTTP, and it tells the person reading
// it neither what happened to their session nor what to do next. Worse, "404"
// on a re-extract reads as *your recording is gone*, when it means the row moved.
//
// So the rule: the message is a sentence about the work, and the protocol detail
// stays on the error object for logs and bug reports without being rendered.

/** A failed backend call, carrying a message safe to put on screen. */
export class ApiError extends Error {
  /** HTTP status, or null when the request never reached the server at all. */
  readonly status: number | null;
  /** Method, path and status — for logs and bug reports, never rendered raw. */
  readonly technical: string;
  /** True when the app couldn't reach the backend (offline, server down). */
  readonly offline: boolean;

  constructor(message: string, opts: { status: number | null; technical: string }) {
    super(message);
    this.name = 'ApiError';
    this.status = opts.status;
    this.technical = opts.technical;
    this.offline = opts.status === null;
  }
}

/**
 * Backend `error` strings that name a protocol condition rather than something
 * that happened to a session. These are the wrong half of a `{ error, detail }`
 * pair and must never be shown; the status-based sentence says more.
 */
const TECHNICAL_ERRORS = new Set([
  'internal error',
  'internal server error',
  'not found',
  'bad request',
  'invalid payload',
  'invalid body',
  'invalid query',
  'invalid id',
  'unauthorized',
  'forbidden',
  'conflict',
  'not_configured',
]);

/** Nothing answered. Exported so ConnectionError can tell this apart from a
 *  server that answered badly — different news, different headline. */
export const OFFLINE_MESSAGE =
  "Can't reach the server. Check your internet connection and try again.";

/**
 * The plain-language fallback per status.
 *
 * Each one says what happened and what to do, in that order, and none of them
 * names a number. 404 is the one that matters most: it almost always means the
 * row moved (re-matched, split, unmatched in another window) rather than that
 * anything was lost, and saying "not found" invites a panic about a recording.
 *
 * Read/write is split because "the change was not saved" is the part that
 * decides whether Nicole needs to do anything, and a failed GET never needs it.
 */
function messageForStatus(status: number | null, method: string): string {
  const writing = method !== 'GET';
  if (status === null) return OFFLINE_MESSAGE;
  if (status === 401) return 'You have been signed out. Please sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status === 404) {
    return writing
      ? 'That item has moved or is no longer here, so the change was not made. Refresh and try again.'
      : 'That item has moved or is no longer here. Refresh to see the latest.';
  }
  if (status === 409) {
    return 'Someone changed this while you were working on it. Refresh to see the latest version.';
  }
  if (status === 413) return 'That file is too large to send.';
  if (status === 429) return 'Too many requests at once. Wait a moment and try again.';
  if (status === 408 || status === 504) {
    return 'The server took too long to respond. Please try again.';
  }
  if (status >= 500) {
    return writing
      ? 'Something went wrong on the server, so the change was not saved. Please try again in a moment.'
      : 'Something went wrong on the server. Please try again in a moment.';
  }
  if (status >= 400) {
    return writing
      ? 'That change could not be saved. Refresh and try again.'
      : 'That could not be loaded. Refresh and try again.';
  }
  return 'Something went wrong. Please try again.';
}

/** Capitalise a backend sentence fragment ("no recording" → "No recording."). */
function asSentence(s: string): string {
  const t = s.trim();
  if (!t) return t;
  const capped = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * Choose what to show, in order of how much the sender knew about the session:
 *
 *   1. `detail` — written for Nicole by the handler that refused ("This session
 *      has been approved and its documents published…"). Always wins.
 *   2. `error`, when it names something clinical rather than something HTTP
 *      ("session already approved", "no recording").
 *   3. The status sentence.
 */
export function humanizeApiError(
  status: number | null,
  method: string,
  body: { detail?: unknown; error?: unknown } | null,
): string {
  const detail = typeof body?.detail === 'string' ? body.detail.trim() : '';
  if (detail) return detail;
  const error = typeof body?.error === 'string' ? body.error.trim() : '';
  if (error && !TECHNICAL_ERRORS.has(error.toLowerCase())) return asSentence(error);
  return messageForStatus(status, method);
}

// ── Pipeline stage names → what they produce ────────────────────────────────
//
// `narrative`, `assessments`, `protocol` and `nrt` are the four calls the
// extractor makes. They are engineering vocabulary and they were being printed
// straight onto the review screen — "These parts were not read: nrt, protocol,
// narrative:chunked-fallback" — which names four things Nicole has never heard
// of and one that isn't even a thing, it's a retry strategy.
//
// What she needs to know is which PARTS OF THE NOTE are missing, because that
// is what she is about to read and sign. So the map is to the note's own
// sections, and the `:suffix` (how the stage was run) is dropped entirely —
// nobody reviewing a session needs to know it was chunked.
const STAGE_LABELS: Record<string, string> = {
  narrative: 'concerns, goals and follow-ups',
  assessments: "the practitioner's assessments",
  protocol: 'supplements and protocol changes',
  nrt: 'NRT findings',
};

/** One stage, in the words of the note it fills. Unknown stages pass through
 *  rather than vanishing — a silent omission would be worse than a stray word. */
export function stageLabel(stage: string): string {
  const base = stage.split(':')[0];
  return STAGE_LABELS[base] ?? base.replace(/[_-]+/g, ' ');
}

/**
 * A `partial` list as a readable phrase.
 *
 * Deduped, because a dropped stage appears twice — once for how it was run,
 * once for the fact it produced nothing — and "NRT findings, NRT findings" is
 * not a sentence. Ordered by where the sections sit in the note rather than by
 * the order the stages happened to fail in, which is a race and reads as one.
 *
 * Joined with semicolons, not commas-and-"and": the labels are themselves
 * phrases containing both, so the obvious join produced "concerns, goals and
 * follow-ups, NRT findings, supplements and protocol changes and the
 * practitioner's assessments" — one long garden path with no clear boundaries.
 */
export function stageList(stages: string[]): string {
  const order = Object.keys(STAGE_LABELS);
  const rank = (s: string) => {
    const i = order.indexOf(s.split(':')[0]);
    return i === -1 ? order.length : i;
  };
  const seen = [...new Set([...stages].sort((a, b) => rank(a) - rank(b)).map(stageLabel))];
  return seen.join('; ');
}
