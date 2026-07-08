import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  title: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
}

export function Modal({ title, onClose, footer, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="il-modal__scrim" onMouseDown={onClose}>
      <div className="il-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="il-modal__head">
          <h2 className="il-modal__title">{title}</h2>
          <button className="il-toggle" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="il-modal__body">{children}</div>
        {footer && <footer className="il-modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
