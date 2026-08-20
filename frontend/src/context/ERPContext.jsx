import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { initialData } from '../data/initialData';
import { makeId, nowISO } from '../utils/formatters';
import {
  createCustomer,
  createSupplier,
  getCustomers,
  getSuppliers,
} from '../api/parties';

const STORAGE_KEY = 'nexus-erp-state-v1';
const ERPContext = createContext(null);

const cloneInitialData = () => JSON.parse(JSON.stringify(initialData));

const mapSupplierFromApi = (supplier) => ({
  id: supplier.id,
  name: supplier.name,
  country: supplier.country,
  phone: supplier.phone,
  email: supplier.email,
  isActive: supplier.is_active,

  purchaseCount: 0,
  totalPurchaseCAD: 0,
});

export function ERPProvider({ children }) {
  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : cloneInitialData();
    } catch {
      return cloneInitialData();
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);
  useEffect(() => {
    async function loadCustomers() {
      try {
        const apiCustomers = await getCustomers();
  
        const customers = apiCustomers.map((customer) => ({
          id: customer.id,
          name: customer.full_name,
          phone: customer.phone,
          instagram: customer.instagram_handle,
          postalCode: customer.postal_code,
          address: customer.address,
  
          // فعلاً تا زمانی که Sales/Receivables به API وصل شوند
          totalPurchases: 0,
          debt: 0,
        }));
  
        setData((prev) => ({
          ...prev,
          customers,
        }));
      } catch (error) {
        console.error('Failed to load customers from Django API:', error);
      }
    }
  
    loadCustomers();
  }, []);
  useEffect(() => {
    async function loadSuppliers() {
      try {
        const apiSuppliers = await getSuppliers();
  
        const suppliers = apiSuppliers.map(mapSupplierFromApi);
  
        setData((prev) => ({
          ...prev,
          suppliers,
        }));
      } catch (error) {
        console.error(
          'Failed to load suppliers from Django API:',
          error,
        );
      }
    }
  
    loadSuppliers();
  }, []);
  const addProduct = (payload) => {
    const normalizedSku = payload.sku.trim().toUpperCase();
    if (!payload.name.trim()) return { ok: false, message: 'نام کالا الزامی است.' };
    if (!normalizedSku) return { ok: false, message: 'کد SKU الزامی است.' };
    if (data.products.some((item) => item.sku.toUpperCase() === normalizedSku)) {
      return { ok: false, message: 'این SKU قبلاً ثبت شده است.' };
    }

    const product = {
      id: Date.now(),
      name: payload.name.trim(),
      sku: normalizedSku,
      category: payload.category.trim() || 'بدون دسته‌بندی',
      brand: payload.brand.trim() || '—',
      qtyW1: Number(payload.qtyW1) || 0,
      qtyW2: Number(payload.qtyW2) || 0,
      reserved: Number(payload.reserved) || 0,
      minStock: Number(payload.minStock) || 0,
      costCAD: Number(payload.costCAD) || 0,
      priceIRR: Number(payload.priceIRR) || 0,
    };

    setData((prev) => ({ ...prev, products: [product, ...prev.products] }));
    return { ok: true, message: 'کالا با موفقیت ثبت شد.' };
  };

  const addCustomer = async (payload) => {
    if (!payload.name.trim() || !payload.phone.trim()) {
      return {
        ok: false,
        message: 'نام و شماره تماس مشتری الزامی است.',
      };
    }
  
    if (
      data.customers.some(
        (customer) => customer.phone === payload.phone.trim(),
      )
    ) {
      return {
        ok: false,
        message: 'مشتری دیگری با این شماره تماس وجود دارد.',
      };
    }
  
    try {
      const apiCustomer = await createCustomer(payload);
  
      const customer = {
        id: apiCustomer.id,
        name: apiCustomer.full_name,
        phone: apiCustomer.phone,
        instagram: apiCustomer.instagram_handle,
        postalCode: apiCustomer.postal_code,
        address: apiCustomer.address,
  
        // فعلاً تا اتصال Sales و Receivables
        totalPurchases: 0,
        debt: 0,
      };
  
      setData((prev) => ({
        ...prev,
        customers: [customer, ...prev.customers],
      }));
  
      return {
        ok: true,
        message: 'مشتری جدید با موفقیت ثبت شد.',
      };
    } catch (error) {
      console.error(
        'Failed to create customer in Django API:',
        error,
      );
  
      return {
        ok: false,
        message: 'ثبت مشتری در سرور انجام نشد.',
      };
    }
  };

  const addSupplier = async (payload) => {
    if (!payload.name.trim()) {
      return {
        ok: false,
        message: 'نام تأمین‌کننده الزامی است.',
      };
    }
  
    try {
      const createdSupplier = await createSupplier(payload);
  
      const supplier = mapSupplierFromApi(createdSupplier);
  
      setData((prev) => ({
        ...prev,
        suppliers: [supplier, ...prev.suppliers],
      }));
  
      return {
        ok: true,
        message: 'تأمین‌کننده ثبت شد.',
      };
    } catch (error) {
      console.error(
        'Failed to create supplier in Django API:',
        error,
      );
  
      return {
        ok: false,
        message: 'ثبت تأمین‌کننده در سرور انجام نشد.',
      };
    }
  };
  const recordSale = ({ customerId, items, paidAmount }) => {
    const customer = data.customers.find((item) => item.id === Number(customerId));
    if (!customer) return { ok: false, message: 'مشتری معتبر انتخاب نشده است.' };
    if (!items.length) return { ok: false, message: 'حداقل یک کالا به فاکتور اضافه کنید.' };

    const normalizedItems = items.map((item) => ({
      productId: Number(item.productId),
      qty: Number(item.qty),
      unitPrice: Number(item.unitPrice),
    }));

    for (const item of normalizedItems) {
      const product = data.products.find((p) => p.id === item.productId);
      if (!product) return { ok: false, message: 'یکی از کالاهای انتخاب‌شده معتبر نیست.' };
      if (item.qty <= 0 || item.unitPrice < 0) {
        return { ok: false, message: 'تعداد و قیمت کالا باید معتبر باشند.' };
      }
      const available = product.qtyW1 + product.qtyW2 - product.reserved;
      if (item.qty > available) {
        return { ok: false, message: `موجودی قابل فروش «${product.name}» کافی نیست.` };
      }
    }

    const total = normalizedItems.reduce((sum, item) => sum + item.qty * item.unitPrice, 0);
    const paid = Number(paidAmount) || 0;
    if (paid < 0 || paid > total) return { ok: false, message: 'مبلغ پرداختی باید بین صفر و مبلغ کل باشد.' };
    const debt = total - paid;
    const saleId = `INV-${1000 + data.sales.length + 1}`;
    const date = nowISO();

    setData((prev) => {
      const updatedProducts = prev.products.map((product) => {
        const line = normalizedItems.find((item) => item.productId === product.id);
        if (!line) return product;

        let remaining = line.qty;
        let qtyW1 = product.qtyW1;
        let qtyW2 = product.qtyW2;
        if (qtyW1 >= remaining) {
          qtyW1 -= remaining;
        } else {
          remaining -= qtyW1;
          qtyW1 = 0;
          qtyW2 -= remaining;
        }
        return { ...product, qtyW1, qtyW2 };
      });

      const saleItems = normalizedItems.map((line) => {
        const product = prev.products.find((item) => item.id === line.productId);
        return {
          ...line,
          productName: product?.name ?? 'کالای حذف‌شده',
          lineTotal: line.qty * line.unitPrice,
        };
      });

      const sale = {
        id: saleId,
        customerId: customer.id,
        customerName: customer.name,
        date,
        total,
        paid,
        debt,
        status: debt === 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid',
        items: saleItems,
      };

      const updatedCustomers = prev.customers.map((item) =>
        item.id === customer.id
          ? { ...item, totalPurchases: item.totalPurchases + total, debt: item.debt + debt }
          : item,
      );

      const transaction = paid > 0
        ? {
            id: makeId('TX'),
            date,
            type: 'sale',
            title: `دریافت فروش ${saleId}`,
            account: 'IRR',
            amount: paid,
          }
        : null;

      return {
        ...prev,
        products: updatedProducts,
        customers: updatedCustomers,
        sales: [sale, ...prev.sales],
        accounts: { ...prev.accounts, irrBalance: prev.accounts.irrBalance + paid },
        transactions: transaction ? [transaction, ...prev.transactions] : prev.transactions,
      };
    });

    return { ok: true, message: `فاکتور ${saleId} ثبت شد.` };
  };

  const recordPurchase = ({ supplierId, warehouse, items, shippingIRR, customsIRR, taxIRR, otherIRR, discountIRR }) => {
    const supplier = data.suppliers.find((item) => item.id === Number(supplierId));
    if (!supplier) return { ok: false, message: 'تأمین‌کننده معتبر انتخاب نشده است.' };
    if (!['w1', 'w2'].includes(warehouse)) return { ok: false, message: 'انبار مقصد معتبر نیست.' };
    if (!items.length) return { ok: false, message: 'حداقل یک ردیف کالا ثبت کنید.' };

    const normalizedItems = items.map((item) => ({
      productId: Number(item.productId),
      qty: Number(item.qty),
      unitCostCAD: Number(item.unitCostCAD),
    }));

    for (const item of normalizedItems) {
      if (!data.products.some((product) => product.id === item.productId)) {
        return { ok: false, message: 'یکی از کالاهای خرید معتبر نیست.' };
      }
      if (item.qty <= 0 || item.unitCostCAD < 0) {
        return { ok: false, message: 'تعداد و قیمت خرید باید معتبر باشند.' };
      }
    }

    const subtotalCAD = normalizedItems.reduce((sum, item) => sum + item.qty * item.unitCostCAD, 0);
    const extraCostsIRR = Math.max(
      0,
      (Number(shippingIRR) || 0) +
        (Number(customsIRR) || 0) +
        (Number(taxIRR) || 0) +
        (Number(otherIRR) || 0) -
        (Number(discountIRR) || 0),
    );

    if (data.accounts.cadBalance < subtotalCAD) {
      return { ok: false, message: 'موجودی حساب CAD برای مبلغ خرید کافی نیست.' };
    }
    if (data.accounts.irrBalance < extraCostsIRR) {
      return { ok: false, message: 'موجودی ریالی برای هزینه‌های جانبی کافی نیست.' };
    }

    const purchaseId = `PUR-${5000 + data.purchases.length + 1}`;
    const date = nowISO();
    const extraCostsCAD = extraCostsIRR / data.accounts.cadRate;

    setData((prev) => {
      const purchaseItems = normalizedItems.map((line) => {
        const product = prev.products.find((item) => item.id === line.productId);
        const lineSubtotal = line.qty * line.unitCostCAD;
        const share = subtotalCAD > 0 ? lineSubtotal / subtotalCAD : 1 / normalizedItems.length;
        const allocatedExtraCAD = extraCostsCAD * share;
        const landedUnitCostCAD = line.qty > 0 ? (lineSubtotal + allocatedExtraCAD) / line.qty : 0;
        return {
          ...line,
          productName: product?.name ?? 'کالای حذف‌شده',
          landedUnitCostCAD,
        };
      });

      const updatedProducts = prev.products.map((product) => {
        const line = purchaseItems.find((item) => item.productId === product.id);
        if (!line) return product;
        const currentQty = product.qtyW1 + product.qtyW2;
        const newTotalQty = currentQty + line.qty;
        const weightedCost = newTotalQty > 0
          ? (currentQty * product.costCAD + line.qty * line.landedUnitCostCAD) / newTotalQty
          : line.landedUnitCostCAD;
        return {
          ...product,
          qtyW1: warehouse === 'w1' ? product.qtyW1 + line.qty : product.qtyW1,
          qtyW2: warehouse === 'w2' ? product.qtyW2 + line.qty : product.qtyW2,
          costCAD: weightedCost,
        };
      });

      const purchase = {
        id: purchaseId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        date,
        warehouse,
        subtotalCAD,
        extraCostsIRR,
        totalLandedIRR: subtotalCAD * prev.accounts.cadRate + extraCostsIRR,
        items: purchaseItems,
      };

      const updatedSuppliers = prev.suppliers.map((item) =>
        item.id === supplier.id
          ? {
              ...item,
              purchaseCount: item.purchaseCount + 1,
              totalPurchaseCAD: item.totalPurchaseCAD + subtotalCAD,
            }
          : item,
      );

      const transactions = [
        {
          id: makeId('TX-CAD'),
          date,
          type: 'purchase',
          title: `پرداخت خرید ${purchaseId}`,
          account: 'CAD',
          amount: -subtotalCAD,
        },
        ...(extraCostsIRR > 0
          ? [
              {
                id: makeId('TX-IRR'),
                date,
                type: 'expense',
                title: `هزینه‌های جانبی ${purchaseId}`,
                account: 'IRR',
                amount: -extraCostsIRR,
              },
            ]
          : []),
      ];

      return {
        ...prev,
        products: updatedProducts,
        suppliers: updatedSuppliers,
        purchases: [purchase, ...prev.purchases],
        accounts: {
          ...prev.accounts,
          cadBalance: prev.accounts.cadBalance - subtotalCAD,
          irrBalance: prev.accounts.irrBalance - extraCostsIRR,
        },
        transactions: [...transactions, ...prev.transactions],
      };
    });

    return { ok: true, message: `خرید ${purchaseId} و بهای تمام‌شده ثبت شد.` };
  };

  const transferStock = ({ productId, qty, from }) => {
    const product = data.products.find((item) => item.id === Number(productId));
    const amount = Number(qty);
    if (!product) return { ok: false, message: 'کالا معتبر نیست.' };
    if (amount <= 0) return { ok: false, message: 'تعداد انتقال باید بیشتر از صفر باشد.' };
    const sourceQty = from === 'w1' ? product.qtyW1 : product.qtyW2;
    if (sourceQty < amount) return { ok: false, message: 'موجودی انبار مبدأ کافی نیست.' };

    const transfer = {
      id: `TRF-${7000 + data.transfers.length + 1}`,
      productId: product.id,
      productName: product.name,
      qty: amount,
      from,
      to: from === 'w1' ? 'w2' : 'w1',
      date: nowISO(),
    };

    setData((prev) => ({
      ...prev,
      products: prev.products.map((item) =>
        item.id !== product.id
          ? item
          : from === 'w1'
            ? { ...item, qtyW1: item.qtyW1 - amount, qtyW2: item.qtyW2 + amount }
            : { ...item, qtyW2: item.qtyW2 - amount, qtyW1: item.qtyW1 + amount },
      ),
      transfers: [transfer, ...prev.transfers],
    }));

    return { ok: true, message: 'انتقال موجودی ثبت شد.' };
  };

  const recordExchange = ({ partner, irrPaid, cadReceived }) => {
    const paid = Number(irrPaid);
    const received = Number(cadReceived);
    if (!partner.trim()) return { ok: false, message: 'نام صراف یا طرف معامله الزامی است.' };
    if (paid <= 0 || received <= 0) return { ok: false, message: 'مبالغ تبدیل باید بیشتر از صفر باشند.' };
    if (data.accounts.irrBalance < paid) return { ok: false, message: 'موجودی حساب ریالی کافی نیست.' };

    const date = nowISO();
    const exchange = {
      id: `EX-${9000 + data.exchanges.length + 1}`,
      partner: partner.trim(),
      date,
      irrPaid: paid,
      cadReceived: received,
      rate: paid / received,
    };

    setData((prev) => ({
      ...prev,
      exchanges: [exchange, ...prev.exchanges],
      accounts: {
        ...prev.accounts,
        irrBalance: prev.accounts.irrBalance - paid,
        cadBalance: prev.accounts.cadBalance + received,
        cadRate: exchange.rate,
      },
      transactions: [
        {
          id: makeId('TX-EX-IRR'),
          date,
          type: 'exchange',
          title: `خرید ارز از ${exchange.partner}`,
          account: 'IRR',
          amount: -paid,
        },
        {
          id: makeId('TX-EX-CAD'),
          date,
          type: 'exchange',
          title: `افزایش موجودی CAD از ${exchange.partner}`,
          account: 'CAD',
          amount: received,
        },
        ...prev.transactions,
      ],
    }));

    return { ok: true, message: 'تبدیل ارز ثبت و حساب‌ها به‌روزرسانی شدند.' };
  };

  const settleCustomerDebt = ({ customerId, amount }) => {
    const customer = data.customers.find((item) => item.id === Number(customerId));
    const payment = Number(amount);
    if (!customer) return { ok: false, message: 'مشتری معتبر نیست.' };
    if (payment <= 0 || payment > customer.debt) {
      return { ok: false, message: 'مبلغ تسویه باید بیشتر از صفر و حداکثر برابر بدهی مشتری باشد.' };
    }

    const date = nowISO();
    setData((prev) => ({
      ...prev,
      customers: prev.customers.map((item) =>
        item.id === customer.id ? { ...item, debt: item.debt - payment } : item,
      ),
      accounts: { ...prev.accounts, irrBalance: prev.accounts.irrBalance + payment },
      transactions: [
        {
          id: makeId('TX-DEBT'),
          date,
          type: 'settlement',
          title: `تسویه بدهی ${customer.name}`,
          account: 'IRR',
          amount: payment,
        },
        ...prev.transactions,
      ],
    }));

    return { ok: true, message: 'پرداخت بدهی مشتری ثبت شد.' };
  };

  const resetDemo = () => setData(cloneInitialData());

  const metrics = useMemo(() => {
    const totalSales = data.sales.reduce((sum, item) => sum + item.total, 0);
    const collectedSales = data.sales.reduce((sum, item) => sum + item.paid, 0);
    const totalDebt = data.customers.reduce((sum, item) => sum + item.debt, 0);
    const inventoryCAD = data.products.reduce(
      (sum, product) => sum + (product.qtyW1 + product.qtyW2) * product.costCAD,
      0,
    );
    const inventoryUnits = data.products.reduce((sum, product) => sum + product.qtyW1 + product.qtyW2, 0);
    const lowStockCount = data.products.filter(
      (product) => product.qtyW1 + product.qtyW2 - product.reserved <= product.minStock,
    ).length;
    const totalPurchasesCAD = data.purchases.reduce((sum, item) => sum + item.subtotalCAD, 0);
    const cogsIRR = data.sales.reduce((sum, sale) => {
      return sum + sale.items.reduce((lineSum, line) => {
        const product = data.products.find((item) => item.id === line.productId);
        return lineSum + (product?.costCAD ?? 0) * data.accounts.cadRate * line.qty;
      }, 0);
    }, 0);
    const grossProfit = totalSales - cogsIRR;

    return {
      totalSales,
      collectedSales,
      totalDebt,
      inventoryCAD,
      inventoryUnits,
      lowStockCount,
      totalPurchasesCAD,
      grossProfit,
    };
  }, [data]);

  const value = {
    ...data,
    metrics,
    addProduct,
    addCustomer,
    addSupplier,
    recordSale,
    recordPurchase,
    transferStock,
    recordExchange,
    settleCustomerDebt,
    resetDemo,
  };

  return <ERPContext.Provider value={value}>{children}</ERPContext.Provider>;
}

export function useERP() {
  const context = useContext(ERPContext);
  if (!context) throw new Error('useERP must be used within ERPProvider');
  return context;
}
