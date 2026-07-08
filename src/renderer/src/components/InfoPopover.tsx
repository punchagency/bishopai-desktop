import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function InfoPopover({
  label,
  title,
  children,
}: {
  label: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleOpen = () => {
    if (wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const panelWidth = 352;
      const left = Math.min(
        Math.max(8, r.left + r.width / 2 - panelWidth / 2),
        window.innerWidth - panelWidth - 8,
      );
      setPos({ top: r.bottom + 6, left });
    }
    setOpen((v) => !v);
  };

  return (
    <span className="il-info m-2" style={{ margin: "8px" }} ref={wrapRef}>
      <button
        type="button"
        className="il-info__trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={handleOpen}
      >
        i
      </button>
      {open &&
        createPortal(
          <span
            className="il-info__panel"
            id={panelId}
            role="tooltip"
            style={{ top: pos.top, left: pos.left }}
          >
            {title && <span className="il-info__title">{title}</span>}
            <span className="il-info__body">{children}</span>
          </span>,
          document.body,
        )}
    </span>
  );
}
