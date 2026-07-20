// Client-facing text helpers. The backend speaks in machine enums
// (snake_case / SCREAMING_CASE / camelCase); Nicole and her clients should never
// see an underscore. Route every raw status/type/step through humanize before it
// reaches the screen.

/**
 * Turn a machine enum into clean, human text.
 *  "NEEDS_REVIEW" → "Needs review", "form_open" → "Form open",
 *  "nudge_3d" → "Nudge 3d", "AWAITING_APPROVAL" → "Awaiting approval".
 * Returns Sentence case (first letter capitalised, rest lower) — good for
 * standalone chips/badges.
 */
export function humanize(value: string | null | undefined): string {
  if (value == null) return '';
  const s = String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/** Same as humanize but lowercased throughout — for use mid-sentence
 *  (e.g. "Still needs review"). */
export function humanizeLower(value: string | null | undefined): string {
  return humanize(value).toLowerCase();
}

/**
 * A date as Nicole should read it. Anything unparseable renders as empty rather
 * than "Invalid Date" — a blank beats a broken-looking cell on a clinical screen.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
}
