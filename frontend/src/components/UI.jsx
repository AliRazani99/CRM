import { X, Inbox, LoaderCircle } from 'lucide-react';

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function KpiCard({ title, value, hint, icon, tone = 'indigo' }) {
  return (
    <article className="kpi-card">
      <div className={`kpi-icon tone-${tone}`}>{icon}</div>
      <div className="kpi-body">
        <span>{title}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </article>
  );
}

export function Panel({ title, subtitle, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel-header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </header>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, required = false }) {
  return (
    <label className="field">
      <span className="field-label">
        {label} {required ? <b>*</b> : null}
      </span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Modal({ open, title, subtitle, onClose, children, width = '640px' }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: width }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="بستن">
            <X size={18} />
          </button>
        </header>
        <div className="modal-content">{children}</div>
      </div>
    </div>
  );
}

export function StatusBadge({ status }) {
  const labels = {
    paid: 'تسویه کامل',
    partial: 'پرداخت ناقص',
    unpaid: 'بدون پرداخت',
    healthy: 'موجودی مناسب',
    low: 'موجودی کم',
    critical: 'بحرانی',
    in: 'واریز',
    out: 'برداشت',
  };
  return <span className={`status status-${status}`}>{labels[status] ?? status}</span>;
}

export function EmptyState({ title = 'داده‌ای وجود ندارد', description, icon }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Inbox size={24} />}</div>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
    </div>
  );
}

export function FormMessage({ result }) {
  if (!result?.message) return null;
  return <div className={`form-message ${result.ok ? 'success' : 'error'}`}>{result.message}</div>;
}

export function LoadingButton({ loading, children, ...props }) {
  return (
    <button {...props} disabled={loading || props.disabled}>
      {loading ? <LoaderCircle size={16} className="spin" /> : null}
      {children}
    </button>
  );
}
