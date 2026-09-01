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

  createFinancialAccount
    as createFinancialAccountApi,

  updateFinancialAccount
    as updateFinancialAccountApi,
} from '../api/parties';

import {
  createCurrencyExchange
    as createCurrencyExchangeApi,

  getAccountTransactions,
  getCurrencyExchanges,
} from '../api/finance';

import {
  createProduct,
  getProducts,
} from '../api/products';

import {
  createStockTransfer,
  getInventory,
  getStockMovements,
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
  createPurchase,
  getPurchases,
} from '../api/procurement';

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
  id:
    Number(account.id),

  name:
    account.name,

  accountType:
    account.account_type,

  currencyCode:
    account.currency_code,

  currentBalance:
    account.currency_code === 'IRR'
      ? irrToToman(
          account.current_balance
        )
      : Number(
          account.current_balance
        ),

  isActive:
    account.is_active,
});

const mapTransactionFromApi = (
  transaction,
) => {
  const rawAmount =
    Number(
      transaction.amount
    );

  const displayAmount =
    transaction.currency_code ===
    'IRR'
      ? irrToToman(
          rawAmount
        )
      : rawAmount;

  return {
    id:
      `TX-${transaction.id}`,

    backendId:
      Number(
        transaction.id
      ),

    date:
      transaction.transaction_date,

    type:
      transaction.transaction_type,

    title:
      transaction.description ||
      transaction.transaction_type,

    accountId:
      Number(
        transaction.account
      ),

    accountName:
      transaction.account_name,

    currencyCode:
      transaction.currency_code,

    direction:
      transaction.direction,

    amount:
      transaction.direction === 'OUT'
        ? -displayAmount
        : displayAmount,

    referenceType:
      transaction.reference_type ||
      '',

    referenceId:
      transaction.reference_id ==
      null
        ? null
        : Number(
            transaction.reference_id
          ),
  };
};

const mapExchangeFromApi = (
  exchange,
) => {
  const fromAmountRaw =
    Number(
      exchange.from_amount
    );

  const toAmountRaw =
    Number(
      exchange.to_amount
    );

  const fromAmount =
    exchange.from_currency_code ===
    'IRR'
      ? irrToToman(
          fromAmountRaw
        )
      : fromAmountRaw;

  const toAmount =
    exchange.to_currency_code ===
    'IRR'
      ? irrToToman(
          toAmountRaw
        )
      : toAmountRaw;

  const rateToman =
    exchange.from_currency_code ===
      'IRR' &&
    exchange.to_currency_code ===
      'CAD' &&
    toAmountRaw > 0
      ? irrToToman(
          fromAmountRaw
        ) / toAmountRaw
      : (
          exchange.from_currency_code ===
            'CAD' &&
          exchange.to_currency_code ===
            'IRR' &&
          fromAmountRaw > 0
        )
        ? irrToToman(
            toAmountRaw
          ) / fromAmountRaw
        : 0;

  return {
    id:
      `EX-${exchange.id}`,

    backendId:
      Number(
        exchange.id
      ),

    partner:
      exchange
        .exchange_partner_name,

    date:
      exchange.exchange_date,

    fromAccountId:
      Number(
        exchange.from_account
      ),

    fromAccountName:
      exchange.from_account_name,

    toAccountId:
      Number(
        exchange.to_account
      ),

    toAccountName:
      exchange.to_account_name,

    fromCurrencyCode:
      exchange.from_currency_code,

    toCurrencyCode:
      exchange.to_currency_code,

    fromAmount,

    toAmount,

    irrPaid:
      exchange.from_currency_code ===
      'IRR'
        ? fromAmount
        : (
            exchange.to_currency_code ===
            'IRR'
          )
          ? toAmount
          : 0,

    cadReceived:
      exchange.to_currency_code ===
      'CAD'
        ? toAmount
        : (
            exchange.from_currency_code ===
            'CAD'
          )
          ? fromAmount
          : 0,

    rateToman,

    notes:
      exchange.notes || '',
  };
};

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

const mapMovementFromApi = (
  movement,
) => ({
  id:
    Number(movement.id),

  productId:
    Number(movement.product),

  productName:
    movement.product_name,

  warehouseId:
    Number(movement.warehouse),

  warehouseName:
    movement.warehouse_name,

  type:
    movement.movement_type,

  quantity:
    Number(movement.quantity),

  referenceType:
    movement.reference_type || '',

  referenceId:
    movement.reference_id == null
      ? null
      : Number(
          movement.reference_id
        ),

  date:
    movement.movement_date,

  notes:
    movement.notes || '',
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

    cadRateToman:
    sale.cad_rate_irr_per_cad ==
    null
      ? null
      : irrToToman(
          sale.cad_rate_irr_per_cad
        ),
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
          unitCostCADSnapshot:
          Number(
            item.unit_cost_cad_snapshot
          ),

        lineCogsCAD:
          Number(
            item.line_cogs_cad
          ),

        lineCogsToman:
          item.line_cogs_irr == null
            ? null
            : irrToToman(
                item.line_cogs_irr
              ),
      }),
    ),
  };
};

const mapPurchaseFromApi = (
  purchase,
) => ({
  id:
    purchase.purchase_number,

  backendId:
    Number(
      purchase.id
    ),

  supplierId:
    Number(
      purchase.supplier
    ),

  supplierName:
    purchase.supplier_name,

  warehouseId:
    Number(
      purchase.warehouse
    ),

  warehouseName:
    purchase.warehouse_name,

  date:
    purchase.purchase_date,

  cadRateToman:
    irrToToman(
      purchase.irr_per_cad
    ),

  subtotalCAD:
    Number(
      purchase.subtotal_cad
    ),

  extraCostsToman:
    irrToToman(
      purchase.extra_costs_irr
    ),

  extraCostsCAD:
    Number(
      purchase.extra_costs_cad
    ),

  totalLandedCAD:
    Number(
      purchase.total_landed_cad
    ),

  items:
    (
      purchase.items || []
    ).map(
      (item) => ({
        id:
          Number(
            item.id
          ),

        productId:
          Number(
            item.product
          ),

        productName:
          item.product_name,

        qty:
          Number(
            item.quantity
          ),

        unitCostCAD:
          Number(
            item.unit_cost
          ),

        landedUnitCostCAD:
          Number(
            item.landed_cost_per_unit
          ),

        lineTotalCAD:
          Number(
            item.line_total
          ),
      }),
    ),

  payments:
    (
      purchase.payments || []
    ).map(
      (payment) => ({
        id:
          Number(
            payment.id
          ),

        accountId:
          Number(
            payment.account
          ),

        accountName:
          payment.account_name,

        amount:
          Number(
            payment.amount
          ),

        currencyCode:
          payment.currency_code,

        paymentType:
          payment.payment_type,
      }),
    ),
});

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

const buildAccountSummary = (
  financialAccounts,
  exchanges,
  fallbackRate = 0,
) => {
  const activeAccounts =
    financialAccounts.filter(
      (account) =>
        account.isActive
    );

  const irrBalance =
    activeAccounts
      .filter(
        (account) =>
          account.currencyCode ===
          'IRR'
      )
      .reduce(
        (sum, account) =>
          sum +
          Number(
            account.currentBalance
          ),
        0
      );

  const cadBalance =
    activeAccounts
      .filter(
        (account) =>
          account.currencyCode ===
          'CAD'
      )
      .reduce(
        (sum, account) =>
          sum +
          Number(
            account.currentBalance
          ),
        0
      );

  const latestRate =
    exchanges.find(
      (exchange) =>
        exchange.rateToman > 0
    )?.rateToman;

  return {
    irrBalance,

    cadBalance,

    cadRate:
      latestRate ||
      Number(
        fallbackRate
      ) ||
      0,
  };
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
      apiMovements,
    ] = await Promise.all([
      getProducts(),

      getInventory(),

      getWarehouses(),

      isStoreManager
        ? getStockTransfers()
        : Promise.resolve([]),

      getStockMovements(),
    ]);

    const products = buildProductsFromApi(
      apiProducts,
      apiInventory,
      apiWarehouses,
    );

    const transfers = apiTransfers.map(
      mapTransferFromApi,
    );
    const stockMovements =
  apiMovements.map(
    mapMovementFromApi,
  );

  setData((prev) => ({
    ...prev,
  
    products,
  
    warehouses:
      apiWarehouses,
  
    inventoryRecords:
      apiInventory,
  
    transfers,
  
    stockMovements,
  }));
  
  }, [
    isStoreManager,
    roleCode,
  ]);

  const refreshFinance =
  useCallback(async () => {
    if (!roleCode) {
      return;
    }

    const apiAccounts =
      await getFinancialAccounts();

    const financialAccounts =
      apiAccounts.map(
        mapFinancialAccountFromApi
      );

    let transactions = [];
    let exchanges = [];

  
    if (isStoreManager) {
      const [
        apiTransactions,
        apiExchanges,
      ] = await Promise.all([
        getAccountTransactions(),
        getCurrencyExchanges(),
      ]);

      transactions =
        apiTransactions.map(
          mapTransactionFromApi
        );

      exchanges =
        apiExchanges.map(
          mapExchangeFromApi
        );
    }

    setData((prev) => ({
      ...prev,

      financialAccounts,

      transactions:
        isStoreManager
          ? transactions
          : [],

      exchanges:
        isStoreManager
          ? exchanges
          : [],

          accounts:
          buildAccountSummary(
            financialAccounts,
            exchanges,
            0
          ),
    }));
  }, [
    roleCode,
    isStoreManager,
  ]);
  
  

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(data),
    );
  }, [data]);
  useEffect(() => {
    if (!roleCode) {
      return;
    }
  
    refreshFinance().catch(
      (error) => {
        console.error(
          'Failed to load finance:',
          error,
        );
      },
    );
  
  }, [
    roleCode,
    refreshFinance,
  ]);

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
        purchases: [],
      }));
  
      return;
    }
  
    async function loadPurchasingData() {
      try {
        const [
          apiSuppliers,
          apiPurchases,
        ] = await Promise.all([
          getSuppliers(),
          getPurchases(),
        ]);
  
        const purchases =
          apiPurchases
            .map(
              mapPurchaseFromApi
            )
            .sort(
              (a, b) =>
                b.backendId -
                a.backendId
            );
  
        const suppliers =
          apiSuppliers.map(
            (supplier) => {
              const base =
                mapSupplierFromApi(
                  supplier
                );
  
              const supplierPurchases =
                purchases.filter(
                  (purchase) =>
                    purchase.supplierId ===
                    Number(
                      supplier.id
                    )
                );
  
              return {
                ...base,
  
                purchaseCount:
                  supplierPurchases.length,
  
                totalPurchaseCAD:
                  supplierPurchases.reduce(
                    (
                      sum,
                      purchase
                    ) =>
                      sum +
                      purchase.subtotalCAD,
                    0
                  ),
              };
            }
          );
  
        setData((prev) => ({
          ...prev,
  
          suppliers,
          purchases,
        }));
  
      } catch (error) {
        console.error(
          'Failed to load purchasing data:',
          error,
        );
      }
    }
  
    loadPurchasingData();
  
  }, [
    canUsePurchases,
  ]);

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
              cad_rate_irr_per_cad:
              Number(
                data.accounts?.cadRate
              ) > 0
                ? tomanToIrr(
                    data.accounts.cadRate
                  )
                : null,
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

      await refreshFinance();

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

  const recordPurchase =
  async ({
    supplierId,
    warehouseId,

    items,

    cadRateToman,

    shippingToman,
    customsToman,
    taxToman,
    otherToman,
    discountToman,

    purchaseAccountId,
    costAccountId,
  }) => {

    const supplier =
      data.suppliers.find(
        (item) =>
          Number(item.id) ===
          Number(supplierId)
      );

    if (!supplier) {
      return {
        ok: false,
        message:
          'تأمین‌کننده معتبر انتخاب نشده است.',
      };
    }

    if (!warehouseId) {
      return {
        ok: false,
        message:
          'انبار مقصد را انتخاب کنید.',
      };
    }

    if (
      !items ||
      !items.length
    ) {
      return {
        ok: false,
        message:
          'حداقل یک ردیف کالا ثبت کنید.',
      };
    }

    const rateToman =
      Number(
        cadRateToman
      );

    if (
      !Number.isFinite(
        rateToman
      ) ||
      rateToman <= 0
    ) {
      return {
        ok: false,
        message:
          'نرخ CAD معتبر نیست.',
      };
    }

    if (!purchaseAccountId) {
      return {
        ok: false,
        message:
          'حساب پرداخت CAD را انتخاب کنید.',
      };
    }

    const normalizedItems =
      items.map(
        (item) => ({
          product:
            Number(
              item.productId
            ),

          quantity:
            Number(
              item.qty
            ),

          unit_cost_cad:
            Number(
              item.unitCostCAD
            ),
        })
      );

    for (
      const item
      of normalizedItems
    ) {
      if (!item.product) {
        return {
          ok: false,
          message:
            'کالای یکی از ردیف‌ها معتبر نیست.',
        };
      }

      if (
        !Number.isFinite(
          item.quantity
        ) ||
        item.quantity <= 0
      ) {
        return {
          ok: false,
          message:
            'تعداد خرید باید بیشتر از صفر باشد.',
        };
      }

      if (
        !Number.isFinite(
          item.unit_cost_cad
        ) ||
        item.unit_cost_cad <= 0
      ) {
        return {
          ok: false,
          message:
            'قیمت خرید باید بیشتر از صفر باشد.',
        };
      }
    }

    const grossExtrasToman =
      (
        Number(
          shippingToman
        ) || 0
      ) +
      (
        Number(
          customsToman
        ) || 0
      ) +
      (
        Number(
          taxToman
        ) || 0
      ) +
      (
        Number(
          otherToman
        ) || 0
      );

    const discountValue =
      Number(
        discountToman
      ) || 0;

    if (
      discountValue < 0
    ) {
      return {
        ok: false,
        message:
          'تخفیف نمی‌تواند منفی باشد.',
      };
    }

    if (
      discountValue >
      grossExtrasToman
    ) {
      return {
        ok: false,
        message:
          'تخفیف نمی‌تواند از هزینه‌های جانبی بیشتر باشد.',
      };
    }

    const netExtraToman =
      grossExtrasToman -
      discountValue;

    if (
      netExtraToman > 0 &&
      !costAccountId
    ) {
      return {
        ok: false,
        message:
          'حساب ریالی هزینه‌های جانبی را انتخاب کنید.',
      };
    }

    try {
      const created =
        await createPurchase({
          supplier:
            Number(
              supplierId
            ),

          warehouse:
            Number(
              warehouseId
            ),

          purchase_date:
            new Date()
              .toISOString()
              .slice(0, 10),

          items:
            normalizedItems,

          irr_per_cad:
            tomanToIrr(
              rateToman
            ),

          shipping_cost_irr:
            tomanToIrr(
              Number(
                shippingToman
              ) || 0
            ),

          customs_cost_irr:
            tomanToIrr(
              Number(
                customsToman
              ) || 0
            ),

          tax_irr:
            tomanToIrr(
              Number(
                taxToman
              ) || 0
            ),

          other_costs_irr:
            tomanToIrr(
              Number(
                otherToman
              ) || 0
            ),

          overall_discount_irr:
            tomanToIrr(
              discountValue
            ),

          purchase_account:
            Number(
              purchaseAccountId
            ),

          cost_account:
            netExtraToman > 0
              ? Number(
                  costAccountId
                )
              : null,

          notes:
            '',
        });

      const [
        apiSuppliers,
        apiPurchases,
      ] = await Promise.all([
        getSuppliers(),
        getPurchases(),
      ]);

      const purchases =
        apiPurchases
          .map(
            mapPurchaseFromApi
          )
          .sort(
            (a, b) =>
              b.backendId -
              a.backendId
          );

      const suppliers =
        apiSuppliers.map(
          (supplierRow) => {
            const base =
              mapSupplierFromApi(
                supplierRow
              );

            const supplierPurchases =
              purchases.filter(
                (purchase) =>
                  purchase.supplierId ===
                  Number(
                    supplierRow.id
                  )
              );

            return {
              ...base,

              purchaseCount:
                supplierPurchases.length,

              totalPurchaseCAD:
                supplierPurchases.reduce(
                  (
                    sum,
                    purchase
                  ) =>
                    sum +
                    purchase.subtotalCAD,
                  0
                ),
            };
          }
        );

      setData((prev) => ({
        ...prev,

        suppliers,
        purchases,
      }));

      await refreshInventory();

      await refreshFinance();

      return {
        ok: true,

        message:
          `خرید ${created.purchase_number} ثبت و وارد انبار شد.`,
      };

    } catch (error) {
      console.error(
        'Failed to create purchase:',
        error,
      );

      return {
        ok: false,

        message:
          error.message ||
          'ثبت خرید انجام نشد.',
      };
    }
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
  
    // -----------------------------
    // Normalize IDs / quantity
    // -----------------------------
  
    const productId =
      Number(
        payload.productId
      );
  
    const sourceWarehouseId =
      Number(
        payload.sourceWarehouseId
      );
  
    const destinationWarehouseId =
      Number(
        payload.destinationWarehouseId
      );
  
    const quantity =
      Number(
        payload.qty
      );
  
    // -----------------------------
    // Basic validations
    // -----------------------------
  
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
  
    // -----------------------------
    // Check source inventory in UI
    // -----------------------------
  
    const product =
      data.products.find(
        (item) =>
          Number(item.id) ===
          productId,
      );
  
    if (!product) {
      return {
        ok: false,
        message:
          'کالای انتخاب‌شده معتبر نیست.',
      };
    }
  
    const sourceInventory =
      product.inventories?.find(
        (inventory) =>
          Number(
            inventory.warehouseId
          ) ===
          sourceWarehouseId,
      );
  
    if (!sourceInventory) {
      return {
        ok: false,
        message:
          'برای این کالا در انبار مبدأ موجودی تعریف نشده است.',
      };
    }
  
    if (
      quantity >
      Number(
        sourceInventory.qtyAvailable
      )
    ) {
      return {
        ok: false,
        message:
          'موجودی قابل فروش انبار مبدأ برای این انتقال کافی نیست.',
      };
    }
  
    // -----------------------------
    // Backend transfer
    // -----------------------------
  
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
  
      // دوباره از Backend بخوان
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
  const addFinancialAccount =
  async (payload) => {
    if (!isStoreManager) {
      return {
        ok: false,
        message:
          'فقط مدیر فروشگاه اجازه ایجاد حساب مالی دارد.',
      };
    }

    const name =
      payload.name?.trim();

    const accountType =
      payload.accountType;

    const currencyCode =
      payload.currencyCode;

    const openingBalance =
      Number(
        payload.openingBalance
      ) || 0;

    if (!name) {
      return {
        ok: false,
        message:
          'نام حساب الزامی است.',
      };
    }

    if (
      ![
        'BANK',
        'CASH',
      ].includes(
        accountType
      )
    ) {
      return {
        ok: false,
        message:
          'نوع حساب معتبر نیست.',
      };
    }

    if (
      ![
        'IRR',
        'CAD',
      ].includes(
        currencyCode
      )
    ) {
      return {
        ok: false,
        message:
          'ارز حساب معتبر نیست.',
      };
    }

    if (
      openingBalance < 0
    ) {
      return {
        ok: false,
        message:
          'مانده اولیه نمی‌تواند منفی باشد.',
      };
    }

    try {
      await createFinancialAccountApi({
        name,

        account_type:
          accountType,

        currency_code:
          currencyCode,

        opening_balance:
          currencyCode === 'IRR'
            ? tomanToIrr(
                openingBalance
              )
            : openingBalance,

        is_active:
          true,
      });

      await refreshFinance();

      return {
        ok: true,
        message:
          'حساب مالی با موفقیت ایجاد شد.',
      };

    } catch (error) {
      console.error(
        'Failed to create financial account:',
        error,
      );

      return {
        ok: false,
        message:
          error.message ||
          'ایجاد حساب مالی انجام نشد.',
      };
    }
  };

  const updateFinancialAccount =
  async (
    accountId,
    payload,
  ) => {
    if (!isStoreManager) {
      return {
        ok: false,
        message:
          'فقط مدیر فروشگاه اجازه تغییر حساب مالی دارد.',
      };
    }

    const apiPayload = {};

    if (
      payload.name !==
      undefined
    ) {
      apiPayload.name =
        payload.name.trim();
    }

    if (
      payload.accountType !==
      undefined
    ) {
      apiPayload.account_type =
        payload.accountType;
    }

    if (
      payload.isActive !==
      undefined
    ) {
      apiPayload.is_active =
        Boolean(
          payload.isActive
        );
    }

    try {
      await updateFinancialAccountApi(
        accountId,
        apiPayload,
      );

      await refreshFinance();

      return {
        ok: true,
        message:
          'حساب مالی به‌روزرسانی شد.',
      };

    } catch (error) {
      console.error(
        'Failed to update financial account:',
        error,
      );

      return {
        ok: false,
        message:
          error.message ||
          'به‌روزرسانی حساب انجام نشد.',
      };
    }
  };

  const recordExchange =
  async ({
    partner,

    fromAccountId,
    toAccountId,

    irrPaid,
    cadReceived,
  }) => {
    if (!isStoreManager) {
      return {
        ok: false,
        message:
          'فقط مدیر فروشگاه اجازه ثبت تبدیل ارز دارد.',
      };
    }

    const normalizedPartner =
      partner.trim();

    const paidToman =
      Number(
        irrPaid
      );

    const receivedCad =
      Number(
        cadReceived
      );

    const fromAccount =
      data.financialAccounts
        ?.find(
          (account) =>
            Number(
              account.id
            ) ===
            Number(
              fromAccountId
            )
        );

    const toAccount =
      data.financialAccounts
        ?.find(
          (account) =>
            Number(
              account.id
            ) ===
            Number(
              toAccountId
            )
        );

    if (!normalizedPartner) {
      return {
        ok: false,
        message:
          'نام صراف یا طرف معامله الزامی است.',
      };
    }

    if (
      !fromAccount ||
      !toAccount
    ) {
      return {
        ok: false,
        message:
          'حساب مبدأ و مقصد را انتخاب کنید.',
      };
    }

    if (
      fromAccount.currencyCode !==
      'IRR'
    ) {
      return {
        ok: false,
        message:
          'حساب مبدأ باید IRR باشد.',
      };
    }

    if (
      toAccount.currencyCode !==
      'CAD'
    ) {
      return {
        ok: false,
        message:
          'حساب مقصد باید CAD باشد.',
      };
    }

    if (
      !Number.isFinite(
        paidToman
      ) ||
      paidToman <= 0 ||
      !Number.isFinite(
        receivedCad
      ) ||
      receivedCad <= 0
    ) {
      return {
        ok: false,
        message:
          'مبالغ تبدیل باید بیشتر از صفر باشند.',
      };
    }

    if (
      paidToman >
      Number(
        fromAccount.currentBalance
      )
    ) {
      return {
        ok: false,
        message:
          'موجودی حساب IRR کافی نیست.',
      };
    }

    try {
      const created =
        await createCurrencyExchangeApi({
          exchange_partner_name:
            normalizedPartner,

          exchange_date:
            new Date()
              .toISOString()
              .slice(0, 10),

          from_account:
            Number(
              fromAccountId
            ),

          to_account:
            Number(
              toAccountId
            ),

          from_amount:
            tomanToIrr(
              paidToman
            ),

          to_amount:
            receivedCad,

          notes:
            '',
        });

      await refreshFinance();

      return {
        ok: true,
        message:
          `تبدیل ارز EX-${created.id} با موفقیت ثبت شد.`,
      };

    } catch (error) {
      console.error(
        'Failed to create currency exchange:',
        error,
      );

      return {
        ok: false,
        message:
          error.message ||
          'ثبت تبدیل ارز انجام نشد.',
      };
    }
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
        
        await refreshFinance();
        
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
      const demo =
        cloneInitialData();
  
      return {
        ...demo,
  
        products:
          prev.products || [],
  
        customers:
          prev.customers || [],
  
        suppliers:
          prev.suppliers || [],
  
        purchases:
          prev.purchases || [],
  
        sales:
          prev.sales || [],
  
        warehouses:
          prev.warehouses || [],
  
        stockMovements:
          prev.stockMovements || [],
  
        inventoryRecords:
          prev.inventoryRecords || [],
  
        transfers:
          prev.transfers || [],
  
        financialAccounts:
          prev.financialAccounts || [],
  
        transactions:
          prev.transactions || [],
  
        exchanges:
          prev.exchanges || [],
  
        accounts:
          prev.accounts || {
            irrBalance: 0,
            cadBalance: 0,
            cadRate: 0,
          },
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
    const cogsComplete =
  data.sales.every(
    (sale) =>
      sale.items.every(
        (line) =>
          line.lineCogsToman != null
      )
  );

const historicalCogsToman =
  data.sales.reduce(
    (sum, sale) =>
      sum +
      sale.items.reduce(
        (lineSum, line) =>
          lineSum +
          (
            line.lineCogsToman ??
            0
          ),
        0
      ),
    0
  );

const grossProfit =
  cogsComplete
    ? totalSales -
      historicalCogsToman
    : null;

    return {
      totalSales,
      collectedSales,
      totalDebt,
    
      inventoryCAD,
      inventoryUnits,
      lowStockCount,
    
      totalPurchasesCAD,
    
      historicalCogsToman,
      cogsComplete,
      grossProfit,
    };
  }, [data]);

  const value = {
    ...data,
  
    products:
      data.products || [],
  
    customers:
      data.customers || [],
  
    suppliers:
      data.suppliers || [],
  
    sales:
      data.sales || [],
  
    purchases:
      data.purchases || [],
  
    warehouses:
      data.warehouses || [],
  
    inventoryRecords:
      data.inventoryRecords || [],
  
    transfers:
      data.transfers || [],
  
    stockMovements:
      data.stockMovements || [],
  
    financialAccounts:
      data.financialAccounts || [],
  
    transactions:
      data.transactions || [],
  
    exchanges:
      data.exchanges || [],
  
    accounts:
      data.accounts || {
        irrBalance: 0,
        cadBalance: 0,
        cadRate: 0,
      },
  
    metrics,
  
    addProduct,
    addCustomer,
    addSupplier,
    addWarehouse,
  
    addFinancialAccount,
    updateFinancialAccount,
  
    recordSale,
    recordPurchase,
  
    transferStock,
    refreshInventory,
  
    recordExchange,
    refreshFinance,
  
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
