import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { useAuth } from '../context/AuthContext';
import { canAccessPage } from '../auth/access';
import './global-search.css';

const normalize = (value) => String(value ?? '')
  .toLocaleLowerCase('fa-IR')
  .replace(/[ي]/g, 'ی')
  .replace(/[ك]/g, 'ک')
  .replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)))
  .replace(/[٠-٩]/g, (char) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(char)))
  .trim();

export default function GlobalSearch({ onNavigate }) {
  const { user } = useAuth();
  const { customers = [], products = [], suppliers = [], sales = [], purchases = [], financialAccounts = [] } = useERP();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    const onMouseDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, []);

  const records = useMemo(() => {
    const output = [];
    if (canAccessPage(user, 'customers')) {
      customers.forEach((customer) => output.push({
        id: `customer-${customer.id}`, category: 'مشتری',
        label: customer.name, detail: customer.phone || customer.email || customer.instagram || '',
        keywords: [customer.name, customer.phone, customer.email, customer.instagram],
        page: 'customers', payload: { customerId: customer.id },
      }));
    }
    if (canAccessPage(user, 'inventory')) {
      products.forEach((product) => output.push({
        id: `product-${product.id}`, category: 'کالا',
        label: product.name, detail: product.sku,
        keywords: [product.name, product.sku, product.category, product.brand],
        page: 'inventory', payload: { openTransfer: false, search: product.sku || product.name },
      }));
    }
    if (canAccessPage(user, 'suppliers')) {
      suppliers.forEach((supplier) => output.push({
        id: `supplier-${supplier.id}`, category: 'تأمین‌کننده',
        label: supplier.name, detail: supplier.phone || supplier.country || '',
        keywords: [supplier.name, supplier.phone, supplier.email, supplier.country],
        page: 'suppliers', payload: { supplierId: supplier.id },
      }));
    }
    if (canAccessPage(user, 'sales')) {
      sales.forEach((sale) => output.push({
        id: `sale-${sale.backendId || sale.id}`, category: 'فاکتور فروش',
        label: String(sale.id), detail: sale.customerName || '',
        keywords: [sale.id, sale.customerName],
        page: 'saleInvoice', payload: sale,
      }));
    }
    if (canAccessPage(user, 'purchases')) {
      purchases.forEach((purchase) => output.push({
        id: `purchase-${purchase.backendId || purchase.id}`, category: 'خرید',
        label: String(purchase.id), detail: purchase.supplierName || '',
        keywords: [purchase.id, purchase.supplierName],
        page: 'purchases', payload: { purchaseId: purchase.backendId },
      }));
    }
    if (canAccessPage(user, 'finance')) {
      financialAccounts.forEach((account) => output.push({
        id: `account-${account.id}`, category: 'حساب مالی',
        label: account.name, detail: account.currencyCode,
        keywords: [account.name, account.currencyCode],
        page: 'finance', payload: null,
      }));
    }
    return output;
  }, [user, customers, products, suppliers, sales, purchases, financialAccounts]);

  const results = useMemo(() => {
    const term = normalize(query);
    if (!term) return [];
    return records.filter((item) => item.keywords.some((key) => normalize(key).includes(term))).slice(0, 8);
  }, [query, records]);

  const goTo = (item) => {
    setQuery('');
    setOpen(false);
    onNavigate(item.page, item.payload || null);
  };

  return (
    <div className="topbar-center global-search" ref={containerRef}>
      <Search size={16} aria-hidden="true" />
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && results.length > 0) {
            event.preventDefault();
            goTo(results[0]);
          }
        }}
        aria-label="جست‌وجوی سراسری در سیستم"
        aria-expanded={open && Boolean(query.trim())}
        aria-controls="erp-global-search-results"
        placeholder="جست‌وجوی مشتری، کالا، فاکتور، تأمین‌کننده..."
        autoComplete="off"
      />
      {query ? (
        <button type="button" className="global-search-clear" onClick={() => { setQuery(''); inputRef.current?.focus(); }} aria-label="پاک‌کردن جست‌وجو"><X size={14} /></button>
      ) : <kbd>Ctrl K</kbd>}
      {open && query.trim() && (
        <div className="global-search-results" id="erp-global-search-results" role="listbox" aria-label="نتایج جست‌وجو">
          {results.length === 0 ? (
            <div className="global-search-empty">موردی پیدا نشد</div>
          ) : results.map((item) => (
            <button key={item.id} type="button" className="global-search-result" onClick={() => goTo(item)} role="option" aria-selected="false">
              <span className="global-search-result-category">{item.category}</span>
              <span className="global-search-result-title">{item.label}</span>
              <span className="global-search-result-detail">{item.detail}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
