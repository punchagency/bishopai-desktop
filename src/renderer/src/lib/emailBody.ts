// Splitting a cadence email into the part Nicole writes and the part the server
// appends.
//
// An approval is stored already-injected: the runner takes the plain-text
// template body, turns its newlines into <br/>, and appends a block of booking
// buttons (server/src/reengagement/runner.ts). Handing all of that to a textarea
// meant editing raw markup — one stray angle bracket away from a broken email,
// and the buttons carry signed single-use tokens that must not be retyped.
//
// So the editor works on the message alone and the block is carried through
// untouched. The server marks it with data-innerlume="booking-slots"; the
// legacy pattern below catches rows queued before that marker existed.

const MARKER = '<div data-innerlume="booking-slots"';

// Bodies injected before the marker was added. Matched on the heading text
// rather than the styles, which have already changed once.
const LEGACY = /<div style="margin-top: 1\.5rem;[^"]*"\s*>\s*<p[^>]*>Some available times that work for me:/i;

export interface SplitBody {
  /** What Nicole wrote, as plain text with real newlines. */
  message: string;
  /** The appended booking-button HTML, verbatim, or null if there was none. */
  slots: string | null;
}

/** True if this body carries a server-appended booking block. */
export function hasSlotBlock(body: string): boolean {
  return body.includes(MARKER) || LEGACY.test(body);
}

function slotBlockIndex(body: string): number {
  const marked = body.indexOf(MARKER);
  if (marked !== -1) return marked;
  const legacy = LEGACY.exec(body);
  return legacy ? legacy.index : -1;
}

// Escaping is symmetric so the pair round-trips, and so that a message she
// types with an "&" or a "<" in it cannot alter the markup around it. The
// runner does not escape the template text it injects, but the templates are
// plain prose with no bare & or <, so an untouched body still rejoins
// byte-for-byte; a template that did contain one would simply be normalised to
// a proper entity on save, which is more correct HTML, not less.
// Only & < > — this text lands between tags, never inside an attribute, so
// quotes need no escaping. Escaping them would also cost us the exact round
// trip: the templates are full of apostrophes ("you're ready", "I'd love to").
// The two maps are exact inverses, which is what keeps repeated edits stable.
const ENTITY = /&(amp|lt|gt);/g;
const ENTITY_TEXT: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>' };
const ESCAPE = /[&<>]/g;
const TEXT_ENTITY: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };

/** HTML the runner produced back into the plain text it was made from. */
function toPlainText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(ENTITY, (m) => ENTITY_TEXT[m] ?? m);
}

/** Plain text back into the shape the runner would have produced. */
function toHtmlText(text: string): string {
  return text.replace(ESCAPE, (c) => TEXT_ENTITY[c]).replace(/\n/g, '<br/>');
}

export function splitEmailBody(body: string): SplitBody {
  const idx = slotBlockIndex(body);
  if (idx === -1) {
    // No injected block. A plain-text body is already what she should edit;
    // an HTML one with no block we leave alone rather than guess at.
    return { message: body, slots: null };
  }
  return {
    message: toPlainText(body.slice(0, idx)).trimEnd(),
    slots: body.slice(idx),
  };
}

/**
 * Reassemble what splitEmailBody took apart.
 *
 * join(split(body)) === body for an unedited body — the runner separates the
 * two halves with a single newline, so this does too.
 */
export function joinEmailBody(message: string, slots: string | null): string {
  // '' means the block was removed in the editor: the email goes back to being
  // the plain-text message it started as, rather than HTML with a dangling gap.
  if (!slots) return message;
  return `${toHtmlText(message)}\n${slots}`;
}
