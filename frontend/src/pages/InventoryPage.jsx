import { useMemo, useState } from 'react';
import { ArrowRightLeft, Boxes, PackagePlus, Search } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { Field, FormMessage, Modal, PageHeader, Panel, StatusBadge } from '../components/UI';
import { formatCAD, formatDate, formatToman } from '../utils/formatters';

const blankProduct = {
  name: '',
  sku: '',
  category: '',
  brand: '',
  qtyW1: 0,
  qtyW2: 0,
  reserved: 0,
  minStock: 5,
  costCAD: 0,
  priceIRR: 0,
};

export default function InventoryPage() {
  const { products, transfers, addProduct, transferStock } = useERP();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [productModal, setProductModal] = useState(false);
  const [transferModal, setTransferModal] = useState(false);
  const [productForm, setProductForm] = useState(blankProduct);
  const [transferForm, setTransferForm] = useState({ productId: products[0]?.id ?? '', qty: 1, from: 'w1' });
  const [productResult, setProductResult] = useState(null);
  const [transferResult, setTransferResult] = useState(null);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const query = search.trim().toLowerCase();
      const available = product.qtyW1 + product.qtyW2 - product.reserved;
      const status = available <= 0 ? 'critical' : available <= product.minStock ? 'low' : 'healthy';
      const matchesSearch = !query || product.name.toLowerCase().includes(query) || product.sku.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
      const matchesStatus = statusFilter === 'all' || status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [products, search, statusFilter]);

  const submitProduct = (event) => {
    event.preventDefault();
    const response = addProduct(productForm);
    setProductResult(response);
    if (response.ok) {
      setProductForm(blankProduct);
      setTimeout(() => setProductModal(false), 500);
    }
  };

  const submitTransfer = (event) => {
    event.preventDefault();
    const response = transferStock(transferForm);
    setTransferResult(response);
    if (response.ok) {
      setTransferForm((prev) => ({ ...prev, qty: 1 }));
      setTimeout(() => setTransferModal(false), 500);
    }
  };

  return (
    <div className="page-stack">
      <PageHeader
        title="انبار و مدیریت کالا"
        subtitle="کنترل موجودی دو انبار، رزرو، نقطه سفارش و انتقال داخلی"
        actions={(
          <>
            <button className="button secondary" type="button" onClick={() => setTransferModal(true)}>
              <ArrowRightLeft size={17} /> انتقال بین انبارها
            </button>
            <button className="button primary" type="button" onClick={() => setProductModal(true)}>
              <PackagePlus size={17} /> تعریف کالای جدید
            </button>
          </>
        )}
      />

      <Panel>
        <div className="toolbar-row">
          <div className="search-box wide">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="جست‌وجو بر اساس نام، SKU یا دسته‌بندی" />
          </div>
          <div className="segmented-control compact">
            {[
              ['all', 'همه'],
              ['healthy', 'مناسب'],
              ['low', 'کم'],
              ['critical', 'بحرانی'],
            ].map(([key, label]) => (
              <button key={key} type="button" className={statusFilter === key ? 'active' : ''} onClick={() => setStatusFilter(key)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>کالا</th><th>SKU</th><th>دسته‌بندی</th><th>انبار ۱</th><th>انبار ۲</th><th>رزرو</th><th>قابل فروش</th><th>بهای CAD</th><th>قیمت فروش</th><th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const available = product.qtyW1 + product.qtyW2 - product.reserved;
                const status = available <= 0 ? 'critical' : available <= product.minStock ? 'low' : 'healthy';
                return (
                  <tr key={product.id}>
                    <td>
                      <div className="product-cell">
                        <div className="product-avatar"><Boxes size={17} /></div>
                        <div><strong>{product.name}</strong><span>{product.brand}</span></div>
                      </div>
                    </td>
                    <td className="mono accent-text">{product.sku}</td>
                    <td>{product.category}</td>
                    <td className="numeric-cell">{product.qtyW1}</td>
                    <td className="numeric-cell">{product.qtyW2}</td>
                    <td className="numeric-cell muted-text">{product.reserved}</td>
                    <td className="numeric-cell strong-cell">{available}</td>
                    <td>{formatCAD(product.costCAD)}</td>
                    <td>{formatToman(product.priceIRR)}</td>
                    <td><StatusBadge status={status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="تاریخچه انتقال داخلی" subtitle="انتقال کالا موجودی کل را تغییر نمی‌دهد">
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>شناسه</th><th>کالا</th><th>تعداد</th><th>مبدأ</th><th>مقصد</th><th>تاریخ</th></tr></thead>
            <tbody>
              {transfers.map((transfer) => (
                <tr key={transfer.id}>
                  <td className="mono accent-text">{transfer.id}</td>
                  <td>{transfer.productName}</td>
                  <td>{transfer.qty}</td>
                  <td>{transfer.from === 'w1' ? 'انبار ۱' : 'انبار ۲'}</td>
                  <td>{transfer.to === 'w1' ? 'انبار ۱' : 'انبار ۲'}</td>
                  <td>{formatDate(transfer.date)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Modal open={productModal} onClose={() => setProductModal(false)} title="تعریف کالای جدید" subtitle="اطلاعات پایه و نقطه شروع موجودی را ثبت کنید" width="760px">
        <form onSubmit={submitProduct} className="form-stack">
          <div className="form-grid two-columns">
            <Field label="نام کالا" required><input value={productForm.name} onChange={(event) => setProductForm({ ...productForm, name: event.target.value })} /></Field>
            <Field label="SKU" required><input value={productForm.sku} onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })} dir="ltr" /></Field>
            <Field label="دسته‌بندی"><input value={productForm.category} onChange={(event) => setProductForm({ ...productForm, category: event.target.value })} /></Field>
            <Field label="برند"><input value={productForm.brand} onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })} /></Field>
          </div>
          <div className="form-grid three-columns">
            <Field label="موجودی اولیه انبار ۱"><input type="number" min="0" value={productForm.qtyW1} onChange={(event) => setProductForm({ ...productForm, qtyW1: event.target.value })} /></Field>
            <Field label="موجودی اولیه انبار ۲"><input type="number" min="0" value={productForm.qtyW2} onChange={(event) => setProductForm({ ...productForm, qtyW2: event.target.value })} /></Field>
            <Field label="مقدار رزرو"><input type="number" min="0" value={productForm.reserved} onChange={(event) => setProductForm({ ...productForm, reserved: event.target.value })} /></Field>
            <Field label="نقطه سفارش"><input type="number" min="0" value={productForm.minStock} onChange={(event) => setProductForm({ ...productForm, minStock: event.target.value })} /></Field>
            <Field label="بهای واحد CAD"><input type="number" min="0" step="0.01" value={productForm.costCAD} onChange={(event) => setProductForm({ ...productForm, costCAD: event.target.value })} /></Field>
            <Field label="قیمت فروش تومان"><input type="number" min="0" value={productForm.priceIRR} onChange={(event) => setProductForm({ ...productForm, priceIRR: event.target.value })} /></Field>
          </div>
          <FormMessage result={productResult} />
          <div className="modal-actions">
            <button className="button ghost" type="button" onClick={() => setProductModal(false)}>انصراف</button>
            <button className="button primary" type="submit"><PackagePlus size={16} /> ذخیره کالا</button>
          </div>
        </form>
      </Modal>

      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="انتقال موجودی بین انبارها" subtitle="موجودی انبار مبدأ قبل از ثبت کنترل می‌شود">
        <form onSubmit={submitTransfer} className="form-stack">
          <Field label="کالا" required>
            <select value={transferForm.productId} onChange={(event) => setTransferForm({ ...transferForm, productId: event.target.value })}>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name} — انبار۱: {product.qtyW1} | انبار۲: {product.qtyW2}</option>)}
            </select>
          </Field>
          <div className="form-grid two-columns">
            <Field label="جهت انتقال" required>
              <select value={transferForm.from} onChange={(event) => setTransferForm({ ...transferForm, from: event.target.value })}>
                <option value="w1">از انبار ۱ به انبار ۲</option>
                <option value="w2">از انبار ۲ به انبار ۱</option>
              </select>
            </Field>
            <Field label="تعداد" required><input type="number" min="1" value={transferForm.qty} onChange={(event) => setTransferForm({ ...transferForm, qty: event.target.value })} /></Field>
          </div>
          <FormMessage result={transferResult} />
          <div className="modal-actions">
            <button className="button ghost" type="button" onClick={() => setTransferModal(false)}>انصراف</button>
            <button className="button primary" type="submit"><ArrowRightLeft size={16} /> ثبت انتقال</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
