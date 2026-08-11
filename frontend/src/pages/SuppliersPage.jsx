import { useMemo, useState } from 'react';
import { Plus, Search, Truck } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Field, FormMessage, Modal, PageHeader, Panel } from '../components/UI';
import { formatCAD, formatDate, formatToman } from '../utils/formatters';

const blankSupplier = { name: '', country: '', phone: '', email: '' };

export default function SuppliersPage() {
  const { suppliers, purchases, addSupplier } = useERP();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(blankSupplier);
  const [result, setResult] = useState(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState(suppliers[0]?.id ?? null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return suppliers.filter((supplier) => !query || supplier.name.toLowerCase().includes(query) || supplier.country.toLowerCase().includes(query) || supplier.email.toLowerCase().includes(query));
  }, [suppliers, search]);

  const selected = suppliers.find((supplier) => supplier.id === selectedSupplierId) ?? filtered[0];
  const supplierPurchases = selected ? purchases.filter((purchase) => purchase.supplierId === selected.id) : [];

  const submit = (event) => {
    event.preventDefault();
    const response = addSupplier(form);
    setResult(response);
    if (response.ok) {
      setForm(blankSupplier);
      setTimeout(() => setModalOpen(false), 500);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="تأمین‌کنندگان"
        subtitle="اطلاعات تماس، حجم خرید و تاریخچه همکاری با فروشندگان کالا"
        actions={(
          <button className="button primary" type="button" onClick={() => setModalOpen(true)}>
            <Plus size={17} /> تأمین‌کننده جدید
          </button>
        )}
      />

      <div className="supplier-layout">
        <Panel className="supplier-list-panel">
          <div className="search-box wide">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام، کشور یا ایمیل" />
          </div>
          <div className="supplier-list">
            {filtered.map((supplier) => (
              <button
                type="button"
                key={supplier.id}
                className={`supplier-list-item ${selected?.id === supplier.id ? 'active' : ''}`}
                onClick={() => setSelectedSupplierId(supplier.id)}
              >
                <div className="customer-avatar"><Truck size={18} /></div>
                <div className="customer-list-copy">
                  <strong>{supplier.name}</strong>
                  <span>{supplier.country}</span>
                </div>
                <div className="customer-list-value">
                  <strong>{formatCAD(supplier.totalPurchaseCAD)}</strong>
                  <span>{supplier.purchaseCount} خرید</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="customer-detail-stack">
          {selected ? (
            <>
              <Panel>
                <div className="customer-profile-head">
                  <div className="large-avatar"><Truck size={26} /></div>
                  <div className="customer-profile-title">
                    <h2>{selected.name}</h2>
                    <span>{selected.country} • {selected.email || 'بدون ایمیل'}</span>
                  </div>
                </div>
                <div className="profile-kpis">
                  <div><span>تعداد خرید</span><strong>{selected.purchaseCount}</strong></div>
                  <div><span>ارزش خرید</span><strong>{formatCAD(selected.totalPurchaseCAD)}</strong></div>
                  <div><span>میانگین هر خرید</span><strong>{formatCAD(selected.purchaseCount ? selected.totalPurchaseCAD / selected.purchaseCount : 0)}</strong></div>
                  <div><span>آخرین خرید</span><strong>{supplierPurchases[0] ? formatDate(supplierPurchases[0].date) : '—'}</strong></div>
                </div>
                <div className="customer-contact-grid">
                  <div><span>تلفن</span><strong dir="ltr">{selected.phone || '—'}</strong></div>
                  <div><span>ایمیل</span><strong dir="ltr">{selected.email || '—'}</strong></div>
                </div>
              </Panel>

              <Panel title="تاریخچه خرید از تأمین‌کننده" subtitle="فاکتورهای خرید ثبت‌شده">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>شناسه</th><th>تاریخ</th><th>انبار مقصد</th><th>خرید ارزی</th><th>هزینه جانبی</th><th>بهای ورود</th></tr></thead>
                    <tbody>
                      {supplierPurchases.length === 0 ? (
                        <tr><td colSpan="6" className="empty-cell">خریدی برای این تأمین‌کننده ثبت نشده است.</td></tr>
                      ) : supplierPurchases.map((purchase) => (
                        <tr key={purchase.id}>
                          <td className="mono accent-text">{purchase.id}</td>
                          <td>{formatDate(purchase.date)}</td>
                          <td>{purchase.warehouse === 'w1' ? 'انبار ۱' : 'انبار ۲'}</td>
                          <td>{formatCAD(purchase.subtotalCAD)}</td>
                          <td>{formatToman(purchase.extraCostsIRR)}</td>
                          <td>{formatToman(purchase.totalLandedIRR)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <Panel><div className="empty-state"><Truck size={24} /><strong>تأمین‌کننده‌ای انتخاب نشده است</strong></div></Panel>
          )}
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="ثبت تأمین‌کننده جدید" subtitle="اطلاعات پایه طرف خرید را وارد کنید">
        <form onSubmit={submit} className="form-stack">
          <div className="form-grid two-columns">
            <Field label="نام تأمین‌کننده" required><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
            <Field label="کشور"><input value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
            <Field label="شماره تماس"><input dir="ltr" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="ایمیل"><input dir="ltr" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
          </div>
          <FormMessage result={result} />
          <div className="modal-actions">
            <button className="button ghost" type="button" onClick={() => setModalOpen(false)}>انصراف</button>
            <button className="button primary" type="submit"><Plus size={16} /> ثبت تأمین‌کننده</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
