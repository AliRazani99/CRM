import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Inbox, LoaderCircle, ArrowUpRight, ArrowDownRight, ChevronDown, Search } from 'lucide-react';

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

export function KpiCard({ title, value, hint, icon, tone = 'indigo', delta }) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const isPositive = hasDelta && delta >= 0;
  return (
    <article className="kpi-card">
      <div className={`kpi-icon tone-${tone}`}>{icon}</div>
      <div className="kpi-body">
        <span>{title}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
        {hasDelta ? (
          <small className={isPositive ? 'positive-text' : 'danger-text'}>
            {isPositive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {' '}
            {Math.abs(delta).toFixed(1)}٪ نسبت به بازه قبل
          </small>
        ) : null}
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

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'انتخاب کنید',
  searchPlaceholder = 'جستجو...',
  emptyLabel = 'موردی یافت نشد',
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [position, setPosition] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const updatePosition = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handleReposition = () => updatePosition();
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
    };
  }, [open]);

  useEffect(() => {
    function handleClickOutside(event) {
      const insideTrigger = containerRef.current?.contains(event.target);
      const insidePanel = panelRef.current?.contains(event.target);
      if (!insideTrigger && !insidePanel) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = options.find((option) => String(option.value) === String(value));

  const filtered = options.filter((option) => {
    if (!query.trim()) return true;
    const haystack = `${option.label} ${option.sublabel ?? ''}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  return (
    <div className={`searchable-select ${disabled ? 'disabled' : ''}`} ref={containerRef}>
      <button
        type="button"
        ref={triggerRef}
        className="searchable-select-trigger"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <span className={selected ? '' : 'placeholder'}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={16} />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              className="searchable-select-panel"
              style={{ position: 'fixed', top: position.top, left: position.left, width: position.width }}
            >
              <div className="searchable-select-search">
                <Search size={14} />
                <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />
              </div>
              <div className="searchable-select-options">
                {filtered.length === 0 ? (
                  <div className="searchable-select-empty">{emptyLabel}</div>
                ) : (
                  filtered.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={`searchable-select-option ${String(option.value) === String(value) ? 'active' : ''} ${option.disabled ? 'disabled' : ''}`}
                      disabled={option.disabled}
                      onClick={() => {
                        onChange(option.value);
                        setOpen(false);
                        setQuery('');
                      }}
                    >
                      <span>{option.label}</span>
                      {option.sublabel ? <small>{option.sublabel}</small> : null}
                    </button>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
