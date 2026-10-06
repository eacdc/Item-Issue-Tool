import { useEffect, type ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  wide?: boolean;
  /** Nearly the whole window, for a grid. */
  full?: boolean;
}

export function Modal({ title, children, footer, onClose, wide, full }: Props) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`modal${wide ? ' modal-wide' : ''}${full ? ' modal-full' : ''}`}>
        <header className="modal-header">
          <h2>{title}</h2>
          {onClose && (
            <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}
