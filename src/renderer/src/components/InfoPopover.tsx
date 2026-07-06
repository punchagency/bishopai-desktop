import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

// Small "ⓘ" trigger that reveals an explanation popover. Used to explain
// dashboard concepts to Nicole in-context (dry-run, refill tiers, why a send
// failed, what a Fullscript draft plan is). Closes on outside-click and Escape.
export function InfoPopover({
  label,
  title,
  children,
}: {
  /** Accessible name for the trigger, e.g. "What does dry-run mean?" */
  label: string;
  /** Optional heading shown at the top of the popover. */
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span className="il-info" ref={wrapRef}>
      <button
        type="button"
        className="il-info__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        i
      </button>
      {open && (
        <span className="il-info__panel" id={panelId} role="tooltip">
          {title && <span className="il-info__title">{title}</span>}
          <span className="il-info__body">{children}</span>
        </span>
      )}
    </span>
  );
}
