import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

export function ConfirmDialog({
  title,
  children,
  confirmLabel,
  pending,
  onConfirm,
  onClose,
  destructive = false,
}: {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pending: boolean;
  onConfirm: () => void;
  onClose: () => void;
  destructive?: boolean;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const workspace = dialog.current?.closest('main');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) closeRef.current();
      if (event.key !== 'Tab') return;
      const focusable =
        dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!focusable?.length) {
        event.preventDefault();
        dialog.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialog.current || !dialog.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      // A refresh can remove the trigger after the dialog closes; wait for the updated layout.
      requestAnimationFrame(() => {
        if (dialog.current?.isConnected || document.activeElement !== document.body) return;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        else if (workspace?.isConnected) workspace.focus();
      });
    };
  }, []);
  useEffect(() => {
    if (pending) dialog.current?.focus();
    else if (document.activeElement === dialog.current)
      dialog.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [pending]);

  return (
    <div className="modal-backdrop">
      <div
        ref={dialog}
        className="confirm-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-busy={pending}
        aria-labelledby={titleId}
      >
        <div className="dialog-heading">
          <span className="dialog-icon">
            <Icon name="calendar" />
          </span>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={pending}
          >
            <Icon name="close" />
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {children}
        <div className="dialog-actions">
          <button className="button button-secondary" onClick={onClose} disabled={pending}>
            Go back
          </button>
          <button
            className={`button ${destructive ? 'button-danger' : 'button-primary'}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
