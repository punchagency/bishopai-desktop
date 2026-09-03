// Shows a cadence email the way the recipient will get it.
//
// Bodies are a mix. The templates are plain text, but once the runner appends
// booking buttons (server/src/reengagement/runner.ts) the body is HTML — so
// rendering it as a React child put raw `<div style=...>` on screen in the
// Approvals list, which is what Nicole was reading instead of her email.
//
// dangerouslySetInnerHTML is not the fix: this is an Electron renderer, and
// components/Markdown.tsx exists precisely to keep untrusted-ish strings away
// from innerHTML. A sandboxed iframe is the third option and the honest one —
// with no allow-* flags nothing inside can run script, navigate, or reach the
// app, and the frame paints on white, which is what the mail client will do.
//
// Blocking navigation is a feature, not a side effect: the buttons in this
// preview are single-use booking links, and a stray click would confirm a real
// appointment. Here they are inert.

const HTML_TAG = /<(?:div|p|a|table|br|span|img|h[1-6]|ul|ol|li|strong|em)\b/i;

/** Does this body need to be drawn as HTML rather than printed as text? */
export function isHtmlEmail(body: string): boolean {
  return HTML_TAG.test(body);
}

const FRAME_STYLE = `
  html, body { margin: 0; padding: 12px; background: #ffffff; color: #2a1d16; }
  body {
    font: 14px/1.55 'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    word-break: break-word;
  }
  img { max-width: 100%; }
  /* Inert by design — see the note at the top of this file. */
  a { pointer-events: none; cursor: default; }
`;

export function EmailPreview({
  body,
  className = 'il-email-body',
}: {
  body: string;
  /** Class for the plain-text branch, so existing call sites keep their look. */
  className?: string;
}) {
  if (!isHtmlEmail(body)) {
    return <pre className={className}>{body}</pre>;
  }

  const srcDoc = `<!doctype html><html><head><meta charset="utf-8"><style>${FRAME_STYLE}</style></head><body>${body}</body></html>`;

  return (
    <iframe
      className="il-email-frame"
      title="Email preview"
      sandbox=""
      srcDoc={srcDoc}
    />
  );
}
