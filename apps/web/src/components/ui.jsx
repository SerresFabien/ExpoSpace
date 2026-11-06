// Composants d'interface.
import { useEffect, useId, useRef } from 'react';

export function Loading({ label = 'Chargement…' }) {
  return (
    <p className="loading" role="status">
      <span className="spinner" aria-hidden="true" /> {label}
    </p>
  );
}

export function ErrorBox({ error, title = 'Une erreur est survenue', children }) {
  if (!error) return null;
  return (
    <div className="notice notice-error" role="alert">
      <strong>{title}</strong>
      <p>{error.message}</p>
      {children}
    </div>
  );
}

export function Notice({ kind = 'info', children, role }) {
  return (
    <div className={`notice notice-${kind}`} role={role}>
      {children}
    </div>
  );
}

export function Field({ label, error, hint, multiline = false, counter, ...props }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const Tag = multiline ? 'textarea' : 'input';
  const length = typeof props.value === 'string' ? props.value.length : 0;
  return (
    <div className={`field${error ? ' field-invalid' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      <Tag id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      {counter && props.maxLength && (
        <p className="field-counter" aria-live="polite">
          {length} / {props.maxLength}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}

export const fieldErrors = (error) => (error?.fields && typeof error.fields === 'object' ? error.fields : {});

// Dialogue natif : focus piégé, Échap, focus restauré.
export function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null);
  const opener = useRef(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      opener.current = document.activeElement;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    const handleClose = () => {
      onCloseRef.current?.();
      const target = opener.current;
      if (target && typeof target.focus === 'function' && document.contains(target)) target.focus();
    };
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, []);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby={titleId}
      onClick={(e) => e.target === ref.current && ref.current.close()}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-header">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="button-icon" onClick={() => ref.current.close()} aria-label="Fermer">
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, children, confirmLabel, danger = false, busy = false, onConfirm, onCancel }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="confirm-text">{children}</div>
      <div className="actions">
        <button type="button" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button type="button" className={danger ? 'button-danger' : 'button-primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Patientez…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function StatusBadge({ status, suspended }) {
  if (suspended) return <span className="badge badge-danger">Masquée par l’équipe</span>;
  return status === 'PUBLISHED' ? <span className="badge badge-success">Publiée</span> : <span className="badge">Brouillon</span>;
}
