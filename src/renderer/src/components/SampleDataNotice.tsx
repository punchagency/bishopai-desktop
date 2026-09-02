import { IconAlertTriangle } from './Icons';

/**
 * The one way a screen says "none of this is real".
 *
 * Three treatments used to share that job: "· offline preview" appended to a
 * subtitle sentence (Overview, Unmatched, Activity), a small warning Badge
 * (Sessions, Checkout, Refills, Engagement), and "Backend offline" (top bar,
 * Settings). Three phrasings for one state, and the two quiet ones sat in the
 * same grey as the sentence around them — on a screen listing people who look
 * exactly like clients waiting on her.
 *
 * lib/preview.ts already keeps this out of any build pointed at a real backend.
 * This is the second half of that argument: where samples ARE allowed, say so
 * in a way that cannot be mistaken for chrome.
 */
export function SampleDataNotice() {
  return (
    <div className="il-sample" role="status">
      <span className="il-sample__icon" aria-hidden="true">
        <IconAlertTriangle size={16} />
      </span>
      <p className="il-sample__text">
        <strong>Sample data — not your practice.</strong> The server didn’t answer, so this
        screen is showing invented people so the layout has something to draw. Nothing here
        is real, and nothing you do to it is saved.
      </p>
    </div>
  );
}
