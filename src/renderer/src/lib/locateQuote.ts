// Finding the model's quote inside the practitioner's sentence.
//
// Review shows the TRANSCRIPT's words, not the model's rendering of them — that
// is what catches a reworded finding. But a turn is not a sentence: merging runs
// them up to 120 words, and the real sessions on file reach 117, 277 and 435
// words in a single turn. Handing a reader that paragraph and letting them find
// the six words that support the finding is most of the work of checking it.
//
// So wherever a turn is shown — in the hover card under a field, in the pane
// beside the form — the supporting words are marked inside it.

/** Normalised text plus, for each character, where it came from in the original.
 *  The map is what lets a match found in normalised space be highlighted in the
 *  words as they were actually said. */
interface Normalized {
  norm: string;
  /** map[i] = index in the source string of norm[i]. */
  map: number[];
}

/**
 * Collapse the differences transcription and quoting introduce — case,
 * punctuation, runs of whitespace — while keeping a way back to the source.
 * Deliberately the same shape of normalisation the server verifies with, so a
 * quote it accepted as verbatim is a quote this can locate.
 */
function normalize(s: string): Normalized {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // leading space is dropped
  for (let i = 0; i < s.length; i++) {
    const c = s[i].toLowerCase();
    if (/[a-z0-9']/.test(c)) {
      out.push(c);
      map.push(i);
      lastWasSpace = false;
    } else if (!lastWasSpace) {
      out.push(' ');
      map.push(i);
      lastWasSpace = true;
    }
  }
  while (out.length && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { norm: out.join(''), map };
}

/** Where in `text` the quote's words sit, or null if they can't be located. */
export interface Match {
  start: number;
  end: number;
  /** The quote was found word for word, rather than anchored on a shared term. */
  exact: boolean;
}

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'he', 'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'to', 'was',
  'were', 'will', 'with', 'i', 'my', 'you', 'your', 'we', 'our', 'so', 'um',
  'uh', 'like', 'all', 'but', 'me', 'she', 'her', 'this', 'too', 'just', 'not',
]);

/**
 * Locate `quote` inside `text`.
 *
 * Verbatim first. Failing that — the `span_near` case, where the model reworded
 * the turn it correctly cited — anchor on the longest content word the two share
 * and mark from there, so the eye still lands in the right part of a long turn
 * instead of at its start. An anchor match reports `exact: false`; callers show
 * it as a located region, never as a quotation. That distinction carries weight:
 * on a reversed finding ("inhaler tests fine" against a turn saying "your
 * inhaler is not testing well") the anchor is the only thing that agrees.
 */
export function locate(text: string, quote: string): Match | null {
  if (!text || !quote) return null;
  const hay = normalize(text);
  const needle = normalize(quote);
  if (!hay.norm || !needle.norm) return null;

  const at = hay.norm.indexOf(needle.norm);
  if (at >= 0) {
    return { start: hay.map[at], end: hay.map[at + needle.norm.length - 1] + 1, exact: true };
  }

  // Longest word first: a rare, long term ("gallbladder") pins the spot far more
  // reliably than a common short one, and is what the reader scans for anyway.
  const words = [...new Set(needle.norm.split(' '))]
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .sort((a, b) => b.length - a.length);
  for (const w of words) {
    const i = hay.norm.indexOf(w);
    if (i >= 0) return { start: hay.map[i], end: hay.map[i + w.length - 1] + 1, exact: false };
  }
  return null;
}
