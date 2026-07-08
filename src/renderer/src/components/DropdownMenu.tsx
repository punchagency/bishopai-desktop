import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DropdownItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

interface Props {
  label: string;
  items: DropdownItem[];
  disabled?: boolean;
}

export function DropdownMenu({ label, items, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', (e) => e.key === 'Escape' && close());
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        className="il-btn il-btn--secondary il-dropdown__trigger"
        disabled={disabled}
        onMouseDown={(e) => { e.stopPropagation(); toggle(); }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label} <span className="il-dropdown__caret">▾</span>
      </button>
      {open && createPortal(
        <div
          className="il-dropdown__menu"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {items.map((item) => (
            <button
              key={item.label}
              className="il-dropdown__item"
              disabled={item.disabled}
              onMouseDown={() => { setOpen(false); item.onClick(); }}
            >
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
