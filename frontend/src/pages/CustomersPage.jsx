import { useMemo, useState } from 'react';
import { CreditCard, Search, UserPlus, UsersRound } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Field, FormMessage, Modal, PageHeader, Panel } from '../components/UI';
import { formatDate, formatToman } from '../utils/formatters';

const blankCustomer = {
  name: '',
  phone: '',
  instagram: '',
  postalCode: '',
  address: '',
};

export default function CustomersPage() {
  const { customers, sales, addCustomer, settleCustomerDebt } = useERP();
  const [search, setSearch] = useState('');
  const [customerModal, setCustomerModal] = useState(false);
  const [settleModal, setSettleModal] = useState(false);
  const [customerForm, setCustomerForm] = useState(blankCustomer);
  const [settleForm, setSettleForm] = useState({ customerId: customers.find((item) => item.debt > 0)?.id ?? '', amount: 0 });
  const [customerResult, setCustomerResult] = useState(null);
  const [settleResult, setSettleResult] = useState(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return customers.filter((customer) => !query || customer.name.toLowerCase().includes(query) || customer.phone.includes(query) || customer.instagram.toLowerCase().includes(query));
  }, [customers, search]);

  const selectedCustomer = customers.find((item) => item.id === selectedCustomerId) ?? filtered[0];
  const customerSales = selectedCustomer ? sales.filter((sale) => sale.customerId === selectedCustomer.id) : [];

  const submitCustomer = (event) => {
    event.preventDefault();
    const response = addCustomer(customerForm);
    setCustomerResult(response);
    if (response.ok) {
      setCustomerForm(blankCustomer);
      setTimeout(() => setCustomerModal(false), 500);
    }
  };

  const openSettlement = (customer) => {
    setSettleForm({ customerId: customer.id, amount: customer.debt });
    setSettleResult(null);
    setSettleModal(true);
  };

  const submitSettlement = (event) => {
    event.preventDefault();
    const response = settleCustomerDebt(settleForm);
    setSettleResult(response);
    if (response.ok) setTimeout(() => setSettleModal(false), 500);
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="مشتریان و مطالبات"
        subtitle="پروفایل مشتری، سابقه خرید، مانده بدهی و ثبت تسویه"
        actions={(
          <button className="button primary" type="button" onClick={() => setCustomerModal(true)}>
            <UserPlus size={17} /> مشتری جدید
          </button>
        )}
      />

      <div className="customer-layout">
        <Panel className="customer-list-panel">
          <div className="search-box wide">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="نام، شماره تماس یا اینستاگرام" />
          </div>
          <div className="customer-list">
            {filtered.map((customer) => (
              <button
                type="button"
                key={customer.id}
                className={`customer-list-item ${selectedCustomer?.id === customer.id ? 'active' : ''}`}
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <div className="customer-avatar"><UsersRound size={18} /></div>
                <div className="customer-list-copy">
                  <strong>{customer.name}</strong>
                  <span>{customer.phone}</span>
                </div>
                <div className="customer-list-value">
                  <strong className={customer.debt > 0 ? 'danger-text' : 'positive-text'}>{formatToman(customer.debt)}</strong>
                  <span>مانده بدهی</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <div className="customer-detail-stack">
          {selectedCustomer ? (
            <>
              <Panel>
                <div className="customer-profile-head">
                  <div className="large-avatar"><UsersRound size={26} /></div>
                  <div className="customer-profile-title">
                    <h2>{selectedCustomer.name}</h2>
                    <span>{selectedCustomer.phone} • {selectedCustomer.instagram || 'بدون اینستاگرام'}</span>
                  </div>
                  {selectedCustomer.debt > 0 ? (
                    <button className="button primary" type="button" onClick={() => openSettlement(selectedCustomer)}>
                      <CreditCard size={17} /> ثبت تسویه
                    </button>
                  ) : null}
                </div>
                <div className="profile-kpis">
                  <div><span>مجموع خرید</span><strong>{formatToman(selectedCustomer.totalPurchases)}</strong></div>
                  <div><span>مانده بدهی</span><strong className={selectedCustomer.debt > 0 ? 'danger-text' : 'positive-text'}>{formatToman(selectedCustomer.debt)}</strong></div>
                  <div><span>تعداد فاکتور</span><strong>{customerSales.length}</strong></div>
                  <div><span>میانگین سبد</span><strong>{formatToman(customerSales.length ? customerSales.reduce((sum, item) => sum + item.total, 0) / customerSales.length : 0)}</strong></div>
                </div>
                <div className="customer-contact-grid">
                  <div><span>آدرس</span><strong>{selectedCustomer.address || '—'}</strong></div>
                  <div><span>کدپستی</span><strong>{selectedCustomer.postalCode || '—'}</strong></div>
                </div>
              </Panel>

              <Panel title="تاریخچه سفارش‌های مشتری" subtitle="تمام فاکتورهای ثبت‌شده برای این مشتری">
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>فاکتور</th><th>تاریخ</th><th>مبلغ کل</th><th>دریافتی</th><th>بدهی</th></tr></thead>
                    <tbody>
                      {customerSales.length === 0 ? (
                        <tr><td colSpan="5" className="empty-cell">هنوز سفارشی برای این مشتری ثبت نشده است.</td></tr>
                      ) : customerSales.map((sale) => (
                        <tr key={sale.id}>
                          <td className="mono accent-text">{sale.id}</td>
                          <td>{formatDate(sale.date)}</td>
                          <td>{formatToman(sale.total)}</td>
                          <td>{formatToman(sale.paid)}</td>
                          <td className={sale.debt > 0 ? 'danger-text' : ''}>{formatToman(sale.debt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </>
          ) : (
            <Panel><div className="empty-state"><UsersRound size={24} /><strong>مشتری انتخاب نشده است</strong></div></Panel>
          )}
        </div>
      </div>

      <Modal open={customerModal} onClose={() => setCustomerModal(false)} title="ثبت مشتری جدید" subtitle="اطلاعات هویتی و ارتباطی مشتری را وارد کنید" width="720px">
        <form onSubmit={submitCustomer} className="form-stack">
          <div className="form-grid two-columns">
            <Field label="نام و نام خانوادگی" required><input value={customerForm.name} onChange={(event) => setCustomerForm({ ...customerForm, name: event.target.value })} /></Field>
            <Field label="شماره تماس" required><input value={customerForm.phone} onChange={(event) => setCustomerForm({ ...customerForm, phone: event.target.value })} dir="ltr" /></Field>
            <Field label="اینستاگرام"><input value={customerForm.instagram} onChange={(event) => setCustomerForm({ ...customerForm, instagram: event.target.value })} dir="ltr" /></Field>
            <Field label="کدپستی"><input value={customerForm.postalCode} onChange={(event) => setCustomerForm({ ...customerForm, postalCode: event.target.value })} /></Field>
          </div>
          <Field label="آدرس"><textarea rows="3" value={customerForm.address} onChange={(event) => setCustomerForm({ ...customerForm, address: event.target.value })} /></Field>
          <FormMessage result={customerResult} />
          <div className="modal-actions">
            <button className="button ghost" type="button" onClick={() => setCustomerModal(false)}>انصراف</button>
            <button className="button primary" type="submit"><UserPlus size={16} /> ثبت مشتری</button>
          </div>
        </form>
      </Modal>

      <Modal open={settleModal} onClose={() => setSettleModal(false)} title="ثبت تسویه بدهی" subtitle="مبلغ دریافتی به حساب ریالی اضافه می‌شود">
        <form onSubmit={submitSettlement} className="form-stack">
          <Field label="مشتری">
            <select value={settleForm.customerId} onChange={(event) => {
              const customer = customers.find((item) => item.id === Number(event.target.value));
              setSettleForm({ customerId: event.target.value, amount: customer?.debt ?? 0 });
            }}>
              {customers.filter((customer) => customer.debt > 0).map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — بدهی {formatToman(customer.debt)}</option>)}
            </select>
          </Field>
          <Field label="مبلغ دریافتی" required><input type="number" min="1" value={settleForm.amount} onChange={(event) => setSettleForm({ ...settleForm, amount: event.target.value })} /></Field>
          <FormMessage result={settleResult} />
          <div className="modal-actions">
            <button className="button ghost" type="button" onClick={() => setSettleModal(false)}>انصراف</button>
            <button className="button primary" type="submit"><CreditCard size={16} /> ثبت پرداخت</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
