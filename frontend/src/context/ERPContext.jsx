import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { initialData } from '../data/initialData';
import {
  irrToToman,
  makeId,
  nowISO,
  tomanToIrr,
} from '../utils/formatters';

import {
  createCustomer,
  createSupplier,
  getCustomers,
  getSuppliers,
  getFinancialAccounts,
} from '../api/parties';

import {
  createProduct,
  getProducts,
} from '../api/products';

import {
  createStockTransfer,
  getInventory,
  getStockTransfers,
  getWarehouses,
  createWarehouse,
} from '../api/inventory';

import {
  createSale,
  getSales,
  settleCustomerDebtApi,
} from '../api/sales';

import {
  useAuth,
} from './AuthContext';

import {
  ROLE,
} from '../auth/access';

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

const mapFinancialAccountFromApi = (
  account,
) => ({
  id: Number(account.id),

  name: account.name,

  accountType:
    account.account_type,

  currencyCode:
    account.currency_code,

  currentBalance:
    irrToToman(
      account.current_balance
    ),

  isActive:
    account.is_active,
});

const mapTransferFromApi = (transfer) => ({
  id: transfer.id,

  productId:
    Number(transfer.product),

  productName:
    transfer.product_name,

  qty:
    Number(transfer.quantity),

  fromWarehouseId:
    Number(transfer.source_warehouse),

  fromWarehouseName:
    transfer.source_warehouse_name,

  toWarehouseId:
    Number(transfer.destination_warehouse),

  toWarehouseName:
    transfer.destination_warehouse_name,

  date:
    transfer.transfer_date,

  notes:
    transfer.notes || '',
});
const mapCustomerFromApi = (customer) => ({
  id: Number(customer.id),

  name: customer.full_name,
  phone: customer.phone,
  instagram: customer.instagram_handle,
  postalCode: customer.postal_code,
  address: customer.address,

  totalPurchases: 0,
  totalPaid: 0,
  debt: 0,
});


const mapSaleFromApi = (
  sale,
  customersById,
) => {
  const customerId =
    Number(sale.customer);

  const customer =
    customersById.get(customerId);

  return {
    /*
     * در UI شماره فاکتور را نشان می‌دهیم،
     * ولی ID واقعی دیتابیس را هم نگه می‌داریم.
     */
    id: sale.invoice_number,
    backendId: Number(sale.id),

    customerId,

    customerName:
      customer?.name ??
      `مشتری #${customerId}`,

    date: sale.sale_date,

    /*
     * Backend = IRR
     * Frontend = Toman
     */
    total: irrToToman(
      sale.total_amount
    ),

    paid: irrToToman(
      sale.total_paid
    ),

    debt: irrToToman(
      sale.total_debt
    ),

    status:
      sale.settlement_status === 'PAID'
        ? 'paid'
        : sale.settlement_status === 'PARTIAL'
          ? 'partial'
          : 'unpaid',

    items: (sale.items || []).map(
      (item) => ({
        id: Number(item.id),

        productId:
          Number(item.product),

        warehouseId:
          Number(item.warehouse),

        qty:
          Number(item.quantity),

        unitPrice:
          irrToToman(
            item.unit_price_irr
          ),

        lineTotal:
          irrToToman(
            item.line_total_irr
          ),
      }),
    ),
  };
};

const buildProductsFromApi = (
  apiProducts,
  apiInventory,
  warehouses,
) => {
  return apiProducts.map((product) => {
    const productInventory =
      apiInventory
        .filter(
          (row) =>
            Number(row.product) ===
            Number(product.id)
        )
        .map((row) => ({
          id: row.id,

          warehouseId:
            Number(row.warehouse),

          warehouseName:
            row.warehouse_name,

          qtyOnHand:
            Number(row.qty_on_hand),

          qtyReserved:
            Number(row.qty_reserved),

          qtyAvailable:
            Number(row.qty_available),

          avgCostCAD:
            Number(row.avg_cost_cad),
        }));

    const totalOnHand =
      productInventory.reduce(
        (sum, row) =>
          sum + row.qtyOnHand,
        0,
      );

    const totalReserved =
      productInventory.reduce(
        (sum, row) =>
          sum + row.qtyReserved,
        0,
      );

    const totalAvailable =
      productInventory.reduce(
        (sum, row) =>
          sum + row.qtyAvailable,
        0,
      );

    const inventoryValue =
      productInventory.reduce(
        (sum, row) =>
          sum +
          row.qtyOnHand *
            row.avgCostCAD,
        0,
      );

    const weightedCost =
      totalOnHand > 0
        ? inventoryValue / totalOnHand
        : Number(
            product.default_cost_cad
          );

    /*
     * qtyW1 / qtyW2 را فعلاً نگه می‌داریم
     * تا Sales/Purchases قدیمی نشکنند.
     * بعداً آن صفحات را هم API-based می‌کنیم.
     */
    const firstWarehouse =
      warehouses[0];

    const secondWarehouse =
      warehouses[1];

    const firstInventory =
      productInventory.find(
        (row) =>
          row.warehouseId ===
          Number(firstWarehouse?.id),
      );

    const secondInventory =
      productInventory.find(
        (row) =>
          row.warehouseId ===
          Number(secondWarehouse?.id),
      );

    return {
      id: product.id,

      name: product.name,
      sku: product.sku,

      category:
        product.category_name,

      brand:
        product.brand_name,

      categoryId:
        product.category,

      brandId:
        product.brand,

      minStock:
        Number(product.reorder_level),

      costCAD:
        weightedCost,

      /*
       * Backend = IRR
       * Frontend = Toman
       */
      priceIRR:
        irrToToman(
          product.sales_price_irr
        ),

      isActive:
        product.is_active,

      inventories:
        productInventory,

      totalOnHand,
      reserved:
        totalReserved,

      available:
        totalAvailable,

      qtyW1:
        firstInventory?.qtyOnHand ?? 0,

      qtyW2:
        secondInventory?.qtyOnHand ?? 0,
    };
  });
};

export function ERPProvider({ children }) {
  const { user } = useAuth();

  const roleCode = user?.role_code ?? null;

  const isStoreManager =
    roleCode === ROLE.STORE_MANAGER;

  const canUseSales =
    roleCode === ROLE.STORE_MANAGER ||
    roleCode === ROLE.SALES_MANAGER;

  const canUsePurchases =
    roleCode === ROLE.STORE_MANAGER ||
    roleCode === ROLE.PURCHASE_MANAGER;

  const [data, setData] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : cloneInitialData();
    } catch {
      return cloneInitialData();
    }
  });

  const refreshInventory = useCallback(async () => {
    if (!roleCode) {
      return;
    }

    const [
      apiProducts,
      apiInventory,
      apiWarehouses,
      apiTransfers,
    ] = await Promise.all([
      getProducts(),
      getInventory(),
      getWarehouses(),
      isStoreManager
        ? getStockTransfers()
        : Promise.resolve([]),
    ]);

    const products = buildProductsFromApi(
      apiProducts,
      apiInventory,
      apiWarehouses,
    );

    const transfers = apiTransfers.map(
      mapTransferFromApi,
    );

    setData((prev) => ({
      ...prev,
      products,
      warehouses: apiWarehouses,
      inventoryRecords: apiInventory,
      transfers,
    }));
  }, [isStoreManager, roleCode]);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data),
    );
  }, [data]);

  useEffect(() => {
    if (!canUseSales) {
      setData((prev) => ({
        ...prev,
        customers: [],
        sales: [],
      }));
  
      return;
    }
  
    async function loadCustomersAndSales() {
      try {
        const [
          apiCustomers,
          apiSales,
          apiAccounts,
        ] = await Promise.all([
          getCustomers(),
          getSales(),
          getFinancialAccounts(),
        ]);
  
        
        const baseCustomers =
          apiCustomers.map(
            mapCustomerFromApi,
          );
  
        
        const customersById =
          new Map(
            baseCustomers.map(
              (customer) => [
                customer.id,
                customer,
              ],
            ),
          );
  
        
        const sales =
          apiSales
            .map(
              (sale) =>
                mapSaleFromApi(
                  sale,
                  customersById,
                ),
            )
            .sort(
              (a, b) =>
                b.backendId -
                a.backendId,
            );
  
        
        const customers =
          baseCustomers.map(
            (customer) => {
              const customerSales =
                sales.filter(
                  (sale) =>
                    sale.customerId ===
                    customer.id,
                );
  
              const totalPurchases =
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.total,
                  0,
                );
  
              const totalPaid =
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.paid,
                  0,
                );
  
              const debt =
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.debt,
                  0,
                );
  
              return {
                ...customer,
                totalPurchases,
                totalPaid,
                debt,
              };
            },
          );
  
          const financialAccounts =
          apiAccounts.map(
            mapFinancialAccountFromApi,
          );

        setData((prev) => ({
          ...prev,
          customers,
          sales,
          financialAccounts,
        }));
  
      } catch (error) {
        console.error(
          'Failed to load customers and sales from Django API:',
          error,
        );
      }
    }
  
    loadCustomersAndSales();
  
  }, [canUseSales]);

  useEffect(() => {
    if (!canUsePurchases) {
      setData((prev) => ({
        ...prev,
        suppliers: [],
      }));
      return;
    }

    async function loadSuppliers() {
      try {
        const apiSuppliers =
          await getSuppliers();

        const suppliers =
          apiSuppliers.map(
            mapSupplierFromApi,
          );

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
  }, [canUsePurchases]);

  useEffect(() => {
    if (!roleCode) {
      return;
    }

    refreshInventory().catch(
      (error) => {
        console.error(
          'Failed to load inventory:',
          error,
        );
      },
    );
  }, [
    roleCode,
    refreshInventory,
  ]);

  const addProduct = async (payload) => {
    if (!isStoreManager) {
      return {
        ok: false,
        message:
          'فقط مدیر فروشگاه اجازه تعریف کالا دارد.',
      };
    }

    const normalizedSku =
      payload.sku
        .trim()
        .toUpperCase();
  
    if (!payload.name.trim()) {
      return {
        ok: false,
        message:
          'نام کالا الزامی است.',
      };
    }
  
    if (!normalizedSku) {
      return {
        ok: false,
        message:
          'کد SKU الزامی است.',
      };
    }
  
    if (!payload.category.trim()) {
      return {
        ok: false,
        message:
          'دسته‌بندی الزامی است.',
      };
    }
  
    if (!payload.brand.trim()) {
      return {
        ok: false,
        message:
          'برند الزامی است.',
      };
    }
  
    try {
      const openingStocks =
        (data.warehouses || [])
          .map((warehouse) => ({
            warehouse:
              warehouse.id,
  
            quantity:
              Number(
                payload.openingStocks?.[
                  warehouse.id
                ] ?? 0
              ),
          }));
  
      await createProduct({
        name:
          payload.name.trim(),
  
        sku:
          normalizedSku,
  
        category_name:
          payload.category.trim(),
  
        brand_name:
          payload.brand.trim(),
  
        sales_price_irr:
          tomanToIrr(
            payload.priceToman
          ),
  
        default_cost_cad:
          Number(
            payload.costCAD
          ) || 0,
  
        reorder_level:
          Number(
            payload.minStock
          ) || 0,
  
        opening_stocks:
          openingStocks,
      });
  
      await refreshInventory();
  
      return {
        ok: true,
        message:
          'کالا و موجودی اولیه با موفقیت ثبت شد.',
      };
    } catch (error) {
      console.error(
        'Failed to create product:',
        error,
      );
  
      return {
        ok: false,
        message:
          error.message ||
          'ثبت کالا انجام نشد.',
      };
    }
  };

  const addWarehouse = async (payload) => {

    if (!payload.name.trim()) {
      return {
        ok: false,
        message: 'نام انبار الزامی است.',
      };
    }
  
    try {
  
      await createWarehouse({
        name: payload.name.trim(),
        location: payload.location.trim(),
      });
  
      await refreshInventory();
  
      return {
        ok: true,
        message: 'انبار با موفقیت ثبت شد.',
      };
  
    } catch(error) {
  
      console.error(
        'Failed to create warehouse:',
        error,
      );
  
      return {
        ok:false,
        message:'ثبت انبار انجام نشد.',
      };
    }
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
        id: Number(apiCustomer.id),
      
        name: apiCustomer.full_name,
        phone: apiCustomer.phone,
        instagram: apiCustomer.instagram_handle,
        postalCode: apiCustomer.postal_code,
        address: apiCustomer.address,
      
        totalPurchases: 0,
        totalPaid: 0,
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
  
  const recordSale = async ({
    customerId,
    items,
    paidAmount,
    paymentAccountId,
  }) => {
    const customer =
      data.customers.find(
        (item) =>
          item.id ===
          Number(customerId),
      );
  
    if (!customer) {
      return {
        ok: false,
        message:
          'مشتری معتبر انتخاب نشده است.',
      };
    }
  
    if (!items.length) {
      return {
        ok: false,
        message:
          'حداقل یک کالا به فاکتور اضافه کنید.',
      };
    }
  
    const normalizedItems =
      items.map((item) => ({
        product:
          Number(item.productId),
  
        warehouse:
          Number(item.warehouseId),
  
        quantity:
          Number(item.qty),
  
        unit_price_irr:
          tomanToIrr(
            item.unitPrice
          ),
      }));
  
    for (
      const item of normalizedItems
    ) {
      if (
        !item.product ||
        !item.warehouse
      ) {
        return {
          ok: false,
          message:
            'کالا و انبار همه ردیف‌ها الزامی است.',
        };
      }
  
      if (
        item.quantity <= 0 ||
        item.unit_price_irr < 0
      ) {
        return {
          ok: false,
          message:
            'تعداد یا قیمت یکی از ردیف‌ها معتبر نیست.',
        };
      }
    }
  
    const totalToman =
      items.reduce(
        (sum, item) =>
          sum +
          Number(item.qty) *
          Number(item.unitPrice),
        0,
      );
  
    const paidToman =
      Number(paidAmount) || 0;
  
    if (
      paidToman < 0 ||
      paidToman > totalToman
    ) {
      return {
        ok: false,
        message:
          'مبلغ پرداختی معتبر نیست.',
      };
    }
  
    if (
      paidToman > 0 &&
      !paymentAccountId
    ) {
      return {
        ok: false,
        message:
          'حساب دریافت وجه را انتخاب کنید.',
      };
    }
  
    try {
      const createdSale =
        await createSale({
          customer:
            Number(customerId),
  
          sale_date:
            new Date()
              .toISOString()
              .slice(0, 10),
  
          items:
            normalizedItems,
  
          paid_amount:
            tomanToIrr(
              paidToman
            ),
  
          payment_account:
            paidToman > 0
              ? Number(
                  paymentAccountId
                )
              : null,
  
          payment_method:
            'CASH',
  
          notes:
            '',
        });
  
      const [
        apiCustomers,
        apiSales,
        apiAccounts,
      ] = await Promise.all([
        getCustomers(),
        getSales(),
        getFinancialAccounts(),
      ]);
  
      const baseCustomers =
        apiCustomers.map(
          mapCustomerFromApi,
        );
  
      const customersById =
        new Map(
          baseCustomers.map(
            (customer) => [
              customer.id,
              customer,
            ],
          ),
        );
  
      const sales =
        apiSales.map(
          (sale) =>
            mapSaleFromApi(
              sale,
              customersById,
            ),
        );
  
      const customers =
        baseCustomers.map(
          (customer) => {
            const customerSales =
              sales.filter(
                (sale) =>
                  sale.customerId ===
                  customer.id,
              );
  
            return {
              ...customer,
  
              totalPurchases:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.total,
                  0,
                ),
  
              totalPaid:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.paid,
                  0,
                ),
  
              debt:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.debt,
                  0,
                ),
            };
          },
        );
  
      setData((prev) => ({
        ...prev,
  
        customers,
        sales,
  
        financialAccounts:
          apiAccounts.map(
            mapFinancialAccountFromApi,
          ),
      }));
  
      await refreshInventory();
  
      return {
        ok: true,
        message:
          `فاکتور ${createdSale.invoice_number} با موفقیت ثبت شد.`,
      };
  
    } catch (error) {
      console.error(
        'Failed to create sale:',
        error,
      );
  
      return {
        ok: false,
        message:
          error.message ||
          'ثبت فروش انجام نشد.',
      };
    }
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

  const transferStock = async (
    payload,
  ) => {
    if (!isStoreManager) {
      return {
        ok: false,
        message:
          'فقط مدیر فروشگاه اجازه انتقال موجودی دارد.',
      };
    }
  
    const productId =
      Number(payload.productId);
  
    const sourceWarehouseId =
      Number(
        payload.sourceWarehouseId
      );
  
    const destinationWarehouseId =
      Number(
        payload.destinationWarehouseId
      );
  
    const quantity =
      Number(payload.qty);
  
    if (!productId) {
      return {
        ok: false,
        message:
          'کالا انتخاب نشده است.',
      };
    }
  
    if (
      !sourceWarehouseId ||
      !destinationWarehouseId
    ) {
      return {
        ok: false,
        message:
          'انبار مبدأ و مقصد را انتخاب کنید.',
      };
    }
  
    if (
      sourceWarehouseId ===
      destinationWarehouseId
    ) {
      return {
        ok: false,
        message:
          'انبار مبدأ و مقصد نمی‌توانند یکسان باشند.',
      };
    }
  
    if (
      !Number.isFinite(quantity) ||
      quantity <= 0
    ) {
      return {
        ok: false,
        message:
          'تعداد انتقال معتبر نیست.',
      };
    }
  
    try {
      await createStockTransfer({
        product:
          productId,
  
        source_warehouse:
          sourceWarehouseId,
  
        destination_warehouse:
          destinationWarehouseId,
  
        quantity,
  
        notes:
          payload.notes?.trim() || '',
      });
  
      await refreshInventory();
  
      return {
        ok: true,
        message:
          'انتقال موجودی با موفقیت ثبت شد.',
      };
    } catch (error) {
      console.error(
        'Failed to transfer stock:',
        error,
      );
  
      return {
        ok: false,
        message:
          error.message ||
          'انتقال موجودی انجام نشد.',
      };
    }
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

  const settleCustomerDebt =
  async ({
    customerId,
    amount,
    accountId,
  }) => {

    const customer =
      data.customers.find(
        (item) =>
          item.id ===
          Number(customerId),
      );

    const payment =
      Number(amount);

    if (!customer) {
      return {
        ok: false,
        message:
          'مشتری معتبر نیست.',
      };
    }

    if (
      payment <= 0 ||
      payment > customer.debt
    ) {
      return {
        ok: false,
        message:
          'مبلغ تسویه معتبر نیست.',
      };
    }

    if (!accountId) {
      return {
        ok: false,
        message:
          'حساب دریافت وجه را انتخاب کنید.',
      };
    }

    try {
      await settleCustomerDebtApi({
        customer:
          Number(customerId),

        account:
          Number(accountId),

        payment_date:
          new Date()
            .toISOString()
            .slice(0, 10),

        amount:
          tomanToIrr(payment),

        payment_method:
          'CASH',

        notes:
          `تسویه بدهی ${customer.name}`,
      });

      /*
       * بعد از پرداخت دوباره
       * داده واقعی Backend را بخوان.
       */

      const [
        apiCustomers,
        apiSales,
        apiAccounts,
      ] = await Promise.all([
        getCustomers(),
        getSales(),
        getFinancialAccounts(),
      ]);

      const baseCustomers =
        apiCustomers.map(
          mapCustomerFromApi,
        );

      const customersById =
        new Map(
          baseCustomers.map(
            (item) => [
              item.id,
              item,
            ],
          ),
        );

      const sales =
        apiSales.map(
          (sale) =>
            mapSaleFromApi(
              sale,
              customersById,
            ),
        );

      const customers =
        baseCustomers.map(
          (item) => {

            const customerSales =
              sales.filter(
                (sale) =>
                  sale.customerId ===
                  item.id,
              );

            return {
              ...item,

              totalPurchases:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.total,
                  0,
                ),

              totalPaid:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.paid,
                  0,
                ),

              debt:
                customerSales.reduce(
                  (sum, sale) =>
                    sum + sale.debt,
                  0,
                ),
            };
          },
        );

      setData((prev) => ({
        ...prev,
        customers,
        sales,

        financialAccounts:
          apiAccounts.map(
            mapFinancialAccountFromApi,
          ),
      }));

      return {
        ok: true,
        message:
          'پرداخت بدهی با موفقیت ثبت شد.',
      };

    } catch (error) {
      console.error(
        'Failed to settle customer debt:',
        error,
      );

      return {
        ok: false,
        message:
          error.message ||
          'ثبت پرداخت انجام نشد.',
      };
    }
  };
  
  const resetDemo = () => {
    setData((prev) => {
      const demo = cloneInitialData();

      return {
        ...demo,

        // داده‌های متصل به API را ریست نکن
        products: prev.products,
        customers: prev.customers,
        suppliers: prev.suppliers,
        warehouses: prev.warehouses || [],
        inventoryRecords:
          prev.inventoryRecords || [],
        transfers: prev.transfers || [],
      };
    });
  };

  const metrics = useMemo(() => {
    const totalSales = data.sales.reduce((sum, item) => sum + item.total, 0);
    const collectedSales = data.sales.reduce((sum, item) => sum + item.paid, 0);
    const totalDebt = data.customers.reduce((sum, item) => sum + item.debt, 0);
    const inventoryCAD = data.products.reduce(
      (sum, product) => {
        const totalOnHand =
          Number(
            product.totalOnHand ??
              (
                (Number(product.qtyW1) || 0) +
                (Number(product.qtyW2) || 0)
              ),
          ) || 0;

        return (
          sum +
          totalOnHand *
            (Number(product.costCAD) || 0)
        );
      },
      0,
    );

    const inventoryUnits = data.products.reduce(
      (sum, product) =>
        sum +
        (
          Number(
            product.totalOnHand ??
              (
                (Number(product.qtyW1) || 0) +
                (Number(product.qtyW2) || 0)
              ),
          ) || 0
        ),
      0,
    );

    const lowStockCount = data.products.filter(
      (product) => {
        const available =
          Number(
            product.available ??
              (
                (Number(product.qtyW1) || 0) +
                (Number(product.qtyW2) || 0) -
                (Number(product.reserved) || 0)
              ),
          ) || 0;

        return (
          available <=
          (Number(product.minStock) || 0)
        );
      },
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
  
    products: data.products,
    warehouses: data.warehouses || [],
    inventoryRecords: data.inventoryRecords || [],
    transfers: data.transfers || [],
  
    metrics,
  
    addProduct,
    addCustomer,
    addSupplier,
    addWarehouse,
    recordSale,
    recordPurchase,
  
    transferStock,
    refreshInventory,
  
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
