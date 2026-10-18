import { forwardRef, type ButtonHTMLAttributes, type SelectHTMLAttributes, type InputHTMLAttributes, type ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
};

export function Button({
  type = 'button',
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`button button-${variant} button-${size} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {!loading && icon && <span className="button-icon" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, id, className = '', ...props },
  ref
) {
  const inputId = id || props.name || label.toLowerCase().replace(/\W+/g, '-');
  const descId = error || hint ? `${inputId}-desc` : undefined;

  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descId}
        className={error ? 'has-error' : ''}
        {...props}
      />
      {error ? (
        <small id={descId} className="field-error" role="alert">
          {error}
        </small>
      ) : hint ? (
        <small id={descId} className="field-hint">
          {hint}
        </small>
      ) : null}
    </div>
  );
});

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
};

export function SelectField({ label, hint, error, id, children, className = '', ...props }: SelectFieldProps) {
  const selectId = id || props.name || label.toLowerCase().replace(/\W+/g, '-');
  const descId = error || hint ? `${selectId}-desc` : undefined;

  return (
    <div className={`field ${className}`}>
      <label className="field-label" htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={descId}
        className={error ? 'has-error' : ''}
        {...props}
      >
        {children}
      </select>
      {error ? (
        <small id={descId} className="field-error" role="alert">
          {error}
        </small>
      ) : hint ? (
        <small id={descId} className="field-hint">
          {hint}
        </small>
      ) : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header>
          <h2 id="modal-title">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="modal-close-btn">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state" role="status">
      <div className="empty-mark" aria-hidden="true">□</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
