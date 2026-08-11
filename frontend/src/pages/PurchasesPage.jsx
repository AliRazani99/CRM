import { useMemo, useState } from 'react';
import { Calculator, PackagePlus, Plus, Trash2, Truck } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Field, FormMessage, PageHeader, Panel } from '../components/UI';
import { formatCAD, formatDate, formatToman } from '../utils/formatters';

function createLine(products) {
  const product = products[0];
  return product
    ? { rowId: Date.now() + Math.random(), productId: product.id, qty: 10, unitCostCAD: product.costCAD }
    : { rowId: Date.now() + Math.random(), productId: '', qty: 1, unitCostCAD: 0 };
}

export default function PurchasesPage({ onNavigate }) {
  const { products, suppliers, purchases, accounts, recordPurchase } = useERP();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [warehouse, setWarehouse] = useState('w1');
  const [items, setItems] = useState(() => [createLine(products)]);
  const [shippingIRR, setShippingIRR] = useState(5_000_000);
  const [customsIRR, setCustomsIRR] = useState(3_000_000);
  const [taxIRR, setTaxIRR] = useState(0);
  const [otherIRR, setOtherIRR] = useState(0);
  const [discountIRR, setDiscountIRR] = useState(0);
  const [result, setResult] = useState(null);

  const subtotalCAD = useMemo(
    () => items.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unitCostCAD || 0), 0),
    [items],
  );
  const extrasIRR = Math.max(0, Number(shippingIRR || 0) + Number(customsIRR || 0) + Number(taxIRR || 0) + Number(otherIRR || 0) - Number(discountIRR || 0));
  const totalLandedIRR = subtotalCAD * accounts.cadRate + extrasIRR;
  const totalQty = items.reduce((sum, line) => sum + Number(line.qty || 0), 0);
  const averageLandedIRR = totalQty > 0 ? totalLandedIRR / totalQty : 0;

  const updateLine = (rowId, patch) => {
    setItems((prev) => prev.map((line) => {
      if (line.rowId !== rowId) return line;
      const next = { ...line, ...patch };
      if (patch.productId !== undefined) {
        const product = products.find((item) => item.id === Number(patch.productId));
        next.unitCostCAD = product?.costCAD ?? 0;
      }
      return next;
    }));
  };

  const submit = (event) => {
    event.preventDefault();
    const response = recordPurchase({
      supplierId,
      warehouse,
      items,
      shippingIRR,
      customsIRR,
      taxIRR,
      otherIRR,
      discountIRR,
    });
    setResult(response);
    if (response.ok) {
      setItems([createLine(products)]);
      setShippingIRR(0);
      setCustomsIRR(0);
      setTaxIRR(0);
      setOtherIRR(0);
      setDiscountIRR(0);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="خرید و محاسبه بهای تمام‌شده"
        subtitle="ثبت چند قلم کالا، تخصیص هزینه‌های جانبی و افزایش موجودی انبار"
        actions={(
          <button className="button secondary" type="button" onClick={() => onNavigate('suppliers')}>
            <Truck size={17} /> مدیریت تأمین‌کنندگان
          </button>
        )}
      />

      <div className="split-layout purchase-layout">
        <Panel title="فاکتور خرید جدید" subtitle="هزینه جانبی به نسبت ارزش هر ردیف میان اقلام تخصیص می‌یابد" className="form-panel">
          <form onSubmit={submit} className="form-stack">
            <div className="form-grid two-columns">
              <Field label="تأمین‌کننده" required>
                <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
                  <option value="">انتخاب تأمین‌کننده</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} — {supplier.country}</option>)}
                </select>
              </Field>
              <Field label="انبار مقصد" required>
                <select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
                  <option value="w1">انبار ۱ — اصلی</option>
                  <option value="w2">انبار ۲ — فرعی</option>
                </select>
              </Field>
            </div>

            <div className="line-items-header">
              <div><strong>اقلام خرید</strong><span>قیمت واحد بر حسب CAD وارد می‌شود</span></div>
              <button className="button ghost small" type="button" onClick={() => setItems((prev) => [...prev, createLine(products)])}>
                <Plus size={16} /> افزودن ردیف
              </button>
            </div>

            <div className="line-items-table">
              <div className="line-items-head purchase-grid"><span>کالا</span><span>تعداد</span><span>قیمت واحد CAD</span><span>جمع ردیف</span><span /></div>
              {items.map((line) => (
                <div className="line-item-row purchase-grid" key={line.rowId}>
                  <select value={line.productId} onChange={(event) => updateLine(line.rowId, { productId: event.target.value })}>
                    <option value="">انتخاب کالا</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} — {product.sku}</option>)}
                  </select>
                  <input type="number" min="1" value={line.qty} onChange={(event) => updateLine(line.rowId, { qty: event.target.value })} />
                  <input type="number" min="0" step="0.01" value={line.unitCostCAD} onChange={(event) => updateLine(line.rowId, { unitCostCAD: event.target.value })} />
                  <strong className="line-total">{formatCAD(Number(line.qty || 0) * Number(line.unitCostCAD || 0))}</strong>
                  <button className="icon-button danger" type="button" onClick={() => setItems((prev) => prev.length === 1 ? prev : prev.filter((item) => item.rowId !== line.rowId))}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="subsection-title">
              <Calculator size={17} />
              <div><strong>هزینه‌های جانبی ورود</strong><span>تمام مبالغ این بخش بر حسب تومان هستند</span></div>
            </div>
            <div className="form-grid three-columns">
              <Field label="حمل‌ونقل"><input type="number" min="0" value={shippingIRR} onChange={(event) => setShippingIRR(event.target.value)} /></Field>
              <Field label="گمرک و عوارض"><input type="number" min="0" value={customsIRR} onChange={(event) => setCustomsIRR(event.target.value)} /></Field>
              <Field label="مالیات"><input type="number" min="0" value={taxIRR} onChange={(event) => setTaxIRR(event.target.value)} /></Field>
              <Field label="سایر هزینه‌ها"><input type="number" min="0" value={otherIRR} onChange={(event) => setOtherIRR(event.target.value)} /></Field>
              <Field label="تخفیف کل"><input type="number" min="0" value={discountIRR} onChange={(event) => setDiscountIRR(event.target.value)} /></Field>
              <Field label="نرخ تسعیر CAD"><input value={formatToman(accounts.cadRate)} disabled /></Field>
            </div>

            <div className="landed-summary">
              <div><span>جمع خرید ارزی</span><strong>{formatCAD(subtotalCAD)}</strong></div>
              <div><span>هزینه جانبی خالص</span><strong>{formatToman(extrasIRR)}</strong></div>
              <div><span>کل بهای ورود</span><strong>{formatToman(totalLandedIRR)}</strong></div>
              <div className="highlight"><span>میانگین بهای تمام‌شده هر واحد</span><strong>{formatToman(averageLandedIRR)}</strong></div>
            </div>

            <div className="balance-checks">
              <span className={accounts.cadBalance < subtotalCAD ? 'danger-text' : ''}>موجودی CAD: {formatCAD(accounts.cadBalance)}</span>
              <span className={accounts.irrBalance < extrasIRR ? 'danger-text' : ''}>موجودی ریالی: {formatToman(accounts.irrBalance)}</span>
            </div>

            <FormMessage result={result} />
            <button className="button primary full" type="submit">
              <PackagePlus size={17} /> ثبت خرید، هزینه‌ها و افزایش موجودی
            </button>
          </form>
        </Panel>

        <Panel title="سوابق خرید" subtitle="آخرین ورودهای ثبت‌شده در انبار" className="side-panel">
          <div className="purchase-history">
            {purchases.map((purchase) => (
              <article className="purchase-card" key={purchase.id}>
                <div className="purchase-card-top">
                  <div><strong>{purchase.id}</strong><span>{purchase.supplierName}</span></div>
                  <span className="warehouse-chip">{purchase.warehouse === 'w1' ? 'انبار ۱' : 'انبار ۲'}</span>
                </div>
                <div className="purchase-card-meta"><span>{formatDate(purchase.date)}</span><span>{purchase.items.length} ردیف</span></div>
                <div className="purchase-card-values">
                  <div><span>خرید ارزی</span><strong>{formatCAD(purchase.subtotalCAD)}</strong></div>
                  <div><span>هزینه جانبی</span><strong>{formatToman(purchase.extraCostsIRR)}</strong></div>
                </div>
              </article>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
