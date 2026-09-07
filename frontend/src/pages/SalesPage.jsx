import { useMemo, useState } from 'react';
import { CreditCard, Plus, ReceiptText, Search, ShoppingCart, Trash2, UserPlus } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { EmptyState, Field, FormMessage, PageHeader, Panel, SearchableSelect, StatusBadge } from '../components/UI';
import { formatDate, formatToman } from '../utils/formatters';

function createLine(products, warehouses = []) {
  const product = products[0];
  const warehouse = warehouses[0];

  return product
    ? {
        rowId: Date.now() + Math.random(),

        productId: product.id,

        warehouseId:
          warehouse?.id ?? '',

        qty: 1,

        unitPrice:
          product.priceIRR,
      }
    : {
        rowId: Date.now() + Math.random(),

        productId: '',

        warehouseId:
          warehouse?.id ?? '',

        qty: 1,

        unitPrice: 0,
      };
}
export default function SalesPage({ 
  onNavigate 
}) {
  const { products, customers, warehouses, sales, financialAccounts = [], recordSale, } = useERP();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [items, setItems] = useState(() => [createLine(products)]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minTotal, setMinTotal] = useState('');
  const [maxTotal, setMaxTotal] = useState('');
  const [debtOnly, setDebtOnly] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);

  const productStock = useMemo(() => {
    const map = new Map();
    products.forEach((product) => {
      const totalAvailable = (product.inventories ?? []).reduce((sum, inv) => sum + (inv.qtyAvailable ?? 0), 0);
      map.set(product.id, totalAvailable);
    });
    return map;
  }, [products]);

  const customerOptions = useMemo(
    () => customers.map((customer) => ({ value: customer.id, label: customer.name, sublabel: customer.phone })),
    [customers],
  );

  const productOptionsFor = (selectedProductId) => {
    const relevant = inStockOnly
      ? products.filter((item) => productStock.get(item.id) > 0 || item.id === Number(selectedProductId))
      : products;
    return relevant.map((item) => {
      const available = productStock.get(item.id) ?? 0;
      return {
        value: item.id,
        label: `${item.name} — ${item.sku}`,
        sublabel: available > 0 ? `موجود: ${available}` : 'ناموجود',
      };
    });
  };

  const total = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0),
    [items],
  );
  const debt = Math.max(0, total - Number(paidAmount || 0));
  const irrAccounts =
  financialAccounts.filter(
    (account) =>
      account.currencyCode === 'IRR' &&
      account.isActive
  );

const [
  paymentAccountId,
  setPaymentAccountId,
] = useState('');
  const updateLine = (rowId, patch) => {
    setItems((prev) => prev.map((line) => {
      if (line.rowId !== rowId) return line;
      const next = { ...line, ...patch };
      if (patch.productId !== undefined) {
        const product = products.find((item) => item.id === Number(patch.productId));
        next.unitPrice = product?.priceIRR ?? 0;
      }
      return next;
    }));
  };

  const addLine = () => setItems((prev) => [...prev, createLine(products)]);
  const removeLine = (rowId) => setItems((prev) => prev.length === 1 ? prev : prev.filter((line) => line.rowId !== rowId));

  const submit = async (event) => {
    event.preventDefault();
  
    const response =
      await recordSale({
        customerId,
        items,
        paidAmount,
        paymentAccountId,
      });
  
    setResult(response);
  
    if (response.ok) {
      setItems([
        createLine(
          products,
          warehouses,
        ),
      ]);
  
      setPaidAmount(0);
      setPaymentAccountId('');
    }
  };

  const filteredSales = sales.filter((sale) => {
    const query = search.trim().toLowerCase();
    if (query && !sale.id.toLowerCase().includes(query) && !sale.customerName.toLowerCase().includes(query)) {
      return false;
    }
    if (debtOnly && !(sale.debt > 0)) return false;
    if (minTotal && sale.total < Number(minTotal)) return false;
    if (maxTotal && sale.total > Number(maxTotal)) return false;
    if (dateFrom && new Date(sale.date) < new Date(dateFrom)) return false;
    if (dateTo && new Date(sale.date) > new Date(dateTo)) return false;
    return true;
  });

  return (
    <div className="page-stack">
      <PageHeader
        title="فروش و صدور فاکتور"
        subtitle="ثبت فروش نقدی یا نسیه، کنترل موجودی و ایجاد مطالبات مشتری"
        actions={(
          <button className="button secondary" type="button" onClick={() => onNavigate('customers')}>
            <UserPlus size={17} /> مدیریت مشتریان
          </button>
        )}
      />

      <div className="split-layout sales-layout">
        <Panel title="فاکتور فروش جدید" subtitle="موجودی کالا قبل از ثبت نهایی کنترل می‌شود" className="form-panel">
          <form onSubmit={submit} className="form-stack">
            <div className="form-grid two-columns">
              <Field label="مشتری" required>
                <SearchableSelect
                  value={customerId}
                  onChange={setCustomerId}
                  options={customerOptions}
                  placeholder="انتخاب مشتری"
                  searchPlaceholder="جستجوی نام یا شماره تماس..."
                  emptyLabel="مشتری‌ای یافت نشد"
                />
              </Field>
              <Field label="تاریخ ثبت">
                <input value={new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long' }).format(new Date())} disabled />
              </Field>
            </div>

            <div className="line-items-header">
              <div>
                <strong>اقلام فاکتور</strong>
                <span>قیمت فروش هر ردیف قابل ویرایش است</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={inStockOnly} onChange={(event) => setInStockOnly(event.target.checked)} />
                فقط کالاهای موجود
              </label>
              <button className="button ghost small" type="button" onClick={addLine}>
                <Plus size={16} /> افزودن ردیف
              </button>
            </div>

            <div className="line-items-table">
              <div className="line-items-head sale-grid">
              <span>کالا</span> <span>انبار</span> <span>تعداد</span> <span>قیمت واحد</span>
              </div>
              {items.map((line) => {

              const product =
                products.find(
                  (item) =>
                    item.id ===
                    Number(line.productId)
                );

              const selectedInventory =
                product?.inventories?.find(
                  (inventory) =>
                    Number(
                      inventory.warehouseId
                    ) ===
                    Number(
                      line.warehouseId
                    )
                );

              const available =
                selectedInventory
                  ?.qtyAvailable ?? 0;

              return (
                <div
                  className="line-item-row sale-grid"
                  key={line.rowId}
                >

                  <div>
                    <SearchableSelect
                      value={line.productId}
                      onChange={(newValue) => updateLine(line.rowId, { productId: newValue })}
                      options={productOptionsFor(line.productId)}
                      placeholder="انتخاب کالا"
                      searchPlaceholder="جستجوی نام یا کد کالا..."
                      emptyLabel={inStockOnly ? 'کالای موجودی یافت نشد' : 'کالایی یافت نشد'}
                    />

                    <small
                      className={
                        Number(line.qty) >
                        available
                          ? 'danger-text'
                          : ''
                      }
                    >
                      قابل فروش:
                      {' '}
                      {available}
                      {' '}
                      واحد
                    </small>
                  </div>

                  <select
                    value={
                      line.warehouseId
                    }
                    onChange={(event) =>
                      updateLine(
                        line.rowId,
                        {
                          warehouseId:
                            event.target.value,
                        }
                      )
                    }
                  >
                    <option value="">
                      انتخاب انبار
                    </option>

                    {warehouses.map(
                      (warehouse) => {

                        const warehouseInventory =
                          product
                            ?.inventories
                            ?.find(
                              (inventory) =>
                                Number(
                                  inventory
                                    .warehouseId
                                ) ===
                                Number(
                                  warehouse.id
                                )
                            );

                        const warehouseAvailable =
                          warehouseInventory
                            ?.qtyAvailable ?? 0;

                        return (
                          <option
                            key={
                              warehouse.id
                            }
                            value={
                              warehouse.id
                            }
                          >
                            {warehouse.name}
                            {' — '}
                            {warehouseAvailable}
                            {' قابل فروش'}
                          </option>
                        );
                      }
                    )}

                  </select>

                  <input
                    type="number"
                    min="1"
                    value={line.qty}
                    onChange={(event) =>
                      updateLine(
                        line.rowId,
                        {
                          qty:
                            event.target.value,
                        }
                      )
                    }
                  />

                  <input
                    type="number"
                    min="0"
                    value={
                      line.unitPrice
                    }
                    onChange={(event) =>
                      updateLine(
                        line.rowId,
                        {
                          unitPrice:
                            event.target.value,
                        }
                      )
                    }
                  />

                  <strong
                    className="line-total"
                  >
                    {formatToman(
                      Number(
                        line.qty || 0
                      ) *
                      Number(
                        line.unitPrice || 0
                      )
                    )}
                  </strong>

                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() =>
                      removeLine(
                        line.rowId
                      )
                    }
                    title="حذف ردیف"
                  >
                    <Trash2 size={16} />
                  </button>

                </div>
              );
            })}
            </div>

            <div className="invoice-summary">
              <div className="summary-numbers">
                <div><span>جمع کل فاکتور</span><strong>{formatToman(total)}</strong></div>
                <div><span>مبلغ دریافتی</span><strong className="positive-text">{formatToman(paidAmount)}</strong></div>
                <div><span>مانده بدهی</span><strong className={debt > 0 ? 'danger-text' : 'positive-text'}>{formatToman(debt)}</strong></div>
              </div>
              <Field label="مبلغ پرداخت‌شده (تومان)" hint="برای فروش نسیه می‌توانید عدد صفر یا بخشی از مبلغ را وارد کنید.">
                
                <input type="number" min="0" max={total} value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} />
              </Field>
              {Number(paidAmount) > 0 ? (
              <Field
                label="حساب دریافت وجه"
                required
              >
                <select
                  value={paymentAccountId}
                  onChange={(event) =>
                    setPaymentAccountId(
                      event.target.value
                    )
                  }
                >
                  <option value="">
                    انتخاب حساب
                  </option>

                  {irrAccounts.map(
                    (account) => (
                      <option
                        key={account.id}
                        value={account.id}
                      >
                        {account.name}
                      </option>
                    )
                  )}
                </select>
              </Field>
            ) : null}
            </div>

            <FormMessage result={result} />
            <button className="button primary full" type="submit">
              <ShoppingCart size={17} /> ثبت نهایی فروش و کسر موجودی
            </button>
          </form>
        </Panel>

        <Panel title="آخرین فاکتورها" subtitle="وضعیت پرداخت و بدهی هر سفارش" className="side-panel">
          <div className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="شماره فاکتور یا نام مشتری" />
          </div>
          <div className="invoice-list">
            {filteredSales.length === 0 ? (
              <EmptyState title="فاکتوری پیدا نشد" icon={<ReceiptText size={24} />} />
            ) : filteredSales.slice(0, 10).map((sale) => (
              <article className="invoice-card" key={sale.id}>
                <div className="invoice-card-top">
                  <div>
                    <strong>{sale.id}</strong>
                    <span>{sale.customerName}</span>
                  </div>
                  <StatusBadge status={sale.status} />
                </div>
                <div className="invoice-card-meta">
                  <span>{formatDate(sale.date)}</span>
                  <span>{sale.items.length} قلم</span>
                </div>
                <div className="invoice-card-values">
                  <div><span>مبلغ کل</span><strong>{formatToman(sale.total)}</strong></div>
                  <div><span>دریافتی</span><strong>{formatToman(sale.paid)}</strong></div>
                  <div><span>بدهی</span><strong className={sale.debt > 0 ? 'danger-text' : ''}>{formatToman(sale.debt)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="فهرست فروش‌ها" subtitle="نمای کامل فاکتورهای ثبت‌شده">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
          <Field label="از تاریخ">
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </Field>
          <Field label="تا تاریخ">
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </Field>
          <Field label="حداقل مبلغ (تومان)">
            <input type="number" min="0" value={minTotal} onChange={(event) => setMinTotal(event.target.value)} />
          </Field>
          <Field label="حداکثر مبلغ (تومان)">
            <input type="number" min="0" value={maxTotal} onChange={(event) => setMaxTotal(event.target.value)} />
          </Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 20 }}>
            <input type="checkbox" checked={debtOnly} onChange={(event) => setDebtOnly(event.target.checked)} />
            فقط فاکتورهای بدهکار
          </label>
        </div>
        <div className="table-wrap">
          <table className="data-table">
          <thead> <tr> <th>فاکتور</th> <th>مشتری</th> <th>تاریخ</th> <th>مبلغ کل</th> <th>پرداخت‌شده</th> <th>مانده</th> <th>وضعیت</th> <th>جزئیات</th> </tr> </thead>
            <tbody>
              {filteredSales.map((sale) => (
                <tr key={sale.id}>
                  <td className="mono accent-text">{sale.id}</td>
                  <td>{sale.customerName}</td>
                  <td>{formatDate(sale.date)}</td>
                  <td>{formatToman(sale.total)}</td>
                  <td>{formatToman(sale.paid)}</td>
                  <td>{formatToman(sale.debt)}</td>
                  <td><StatusBadge status={sale.status} /></td>
                  <button className="button small secondary" type="button" onClick={() => { console.log("CLICK SALE", sale); onNavigate( "saleInvoice", sale ); }} > مشاهده </button>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
