import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Calculator,
  PackagePlus,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react';

import {
  useERP,
} from '../context/ERPContext';

import {
  Field,
  FormMessage,
  PageHeader,
  Panel,
} from '../components/UI';

import {
  formatCAD,
  formatDate,
  formatToman,
} from '../utils/formatters';


function createLine(products) {
  const product = products[0];

  return product
    ? {
        rowId:
          Date.now() +
          Math.random(),

        productId:
          product.id,

        qty:
          1,

        unitCostCAD:
          product.costCAD,
      }
    : {
        rowId:
          Date.now() +
          Math.random(),

        productId:
          '',

        qty:
          1,

        unitCostCAD:
          0,
      };
}


export default function PurchasesPage({
  onNavigate,
}) {
  const {
    products,
    suppliers,
    purchases,
    warehouses,
    financialAccounts = [],
    recordPurchase,
  } = useERP();

  const cadAccounts =
    financialAccounts.filter(
      (account) =>
        account.currencyCode ===
          'CAD' &&
        account.isActive,
    );

  const irrAccounts =
    financialAccounts.filter(
      (account) =>
        account.currencyCode ===
          'IRR' &&
        account.isActive,
    );

  const [
    supplierId,
    setSupplierId,
  ] = useState('');

  const [
    warehouseId,
    setWarehouseId,
  ] = useState('');

  const [
    purchaseAccountId,
    setPurchaseAccountId,
  ] = useState('');

  const [
    costAccountId,
    setCostAccountId,
  ] = useState('');

  const [
    cadRateToman,
    setCadRateToman,
  ] = useState(0);

  const [
    items,
    setItems,
  ] = useState(() => [
    createLine(products),
  ]);

  const [
    shippingToman,
    setShippingToman,
  ] = useState(0);

  const [
    customsToman,
    setCustomsToman,
  ] = useState(0);

  const [
    taxToman,
    setTaxToman,
  ] = useState(0);

  const [
    otherToman,
    setOtherToman,
  ] = useState(0);

  const [
    discountToman,
    setDiscountToman,
  ] = useState(0);

  const [
    result,
    setResult,
  ] = useState(null);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);


  useEffect(() => {
    setSupplierId(
      (current) =>
        current ||
        suppliers[0]?.id ||
        '',
    );
  }, [suppliers]);


  useEffect(() => {
    setWarehouseId(
      (current) =>
        current ||
        warehouses[0]?.id ||
        '',
    );
  }, [warehouses]);


  useEffect(() => {
    setPurchaseAccountId(
      (current) =>
        current ||
        cadAccounts[0]?.id ||
        '',
    );
  }, [cadAccounts]);


  useEffect(() => {
    setCostAccountId(
      (current) =>
        current ||
        irrAccounts[0]?.id ||
        '',
    );
  }, [irrAccounts]);


  const subtotalCAD =
    useMemo(
      () =>
        items.reduce(
          (sum, line) =>
            sum +
            Number(
              line.qty || 0
            ) *
            Number(
              line.unitCostCAD ||
                0
            ),
          0,
        ),
      [items],
    );


  const grossExtrasToman =
    (
      Number(
        shippingToman
      ) || 0
    )
    +
    (
      Number(
        customsToman
      ) || 0
    )
    +
    (
      Number(
        taxToman
      ) || 0
    )
    +
    (
      Number(
        otherToman
      ) || 0
    );


  const discountValueToman =
    Number(
      discountToman
    ) || 0;


  const discountIsInvalid =
    discountValueToman >
    grossExtrasToman;


  const netExtrasToman =
    Math.max(
      0,
      grossExtrasToman -
        discountValueToman,
    );


  const rateToman =
    Number(
      cadRateToman
    ) || 0;


  const extraCostsCAD =
    rateToman > 0
      ? netExtrasToman /
        rateToman
      : 0;


  const totalLandedCAD =
    subtotalCAD +
    extraCostsCAD;


  const totalQty =
    items.reduce(
      (sum, line) =>
        sum +
        Number(
          line.qty || 0
        ),
      0,
    );


  const averageLandedCAD =
    totalQty > 0
      ? totalLandedCAD /
        totalQty
      : 0;


  const selectedCadAccount =
    cadAccounts.find(
      (account) =>
        Number(account.id) ===
        Number(
          purchaseAccountId
        ),
    );


  const selectedIrrAccount =
    irrAccounts.find(
      (account) =>
        Number(account.id) ===
        Number(
          costAccountId
        ),
    );


  const updateLine = (
    rowId,
    patch,
  ) => {
    setItems(
      (prev) =>
        prev.map(
          (line) => {
            if (
              line.rowId !== rowId
            ) {
              return line;
            }

            const next = {
              ...line,
              ...patch,
            };

            if (
              patch.productId !==
              undefined
            ) {
              const product =
                products.find(
                  (item) =>
                    item.id ===
                    Number(
                      patch.productId
                    ),
                );

              next.unitCostCAD =
                product?.costCAD ??
                0;
            }

            return next;
          },
        ),
    );
  };


  const submit =
    async (event) => {
      event.preventDefault();

      if (
        discountIsInvalid
      ) {
        setResult({
          ok: false,
          message:
            'تخفیف کل نمی‌تواند از مجموع هزینه‌های جانبی بیشتر باشد.',
        });

        return;
      }

      setSubmitting(true);
      setResult(null);

      const response =
        await recordPurchase({
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

          costAccountId:
            netExtrasToman > 0
              ? costAccountId
              : null,
        });

      setResult(
        response
      );

      if (response.ok) {
        setItems([
          createLine(
            products
          ),
        ]);

        setShippingToman(0);
        setCustomsToman(0);
        setTaxToman(0);
        setOtherToman(0);
        setDiscountToman(0);
      }

      setSubmitting(false);
    };


  return (
    <div className="page-stack">

      <PageHeader
        title="خرید و ورود کالا"
        subtitle="ثبت فاکتور خرید، هزینه‌های ورود، پرداخت و افزایش موجودی انبار مقصد"
        actions={(
          <button
            className="button secondary"
            type="button"
            onClick={() =>
              onNavigate(
                'suppliers'
              )
            }
          >
            <Truck size={17} />
            مدیریت تأمین‌کنندگان
          </button>
        )}
      />

      <div className="split-layout purchase-layout">

        <Panel
          title="فاکتور خرید جدید"
          subtitle="کالاها پس از ثبت موفق، به موجودی واقعی انبار مقصد اضافه می‌شوند"
          className="form-panel"
        >

          <form
            onSubmit={submit}
            className="form-stack"
          >

            <div className="form-grid two-columns">

              <Field
                label="تأمین‌کننده"
                required
              >
                <select
                  required
                  value={
                    supplierId
                  }
                  onChange={(
                    event
                  ) =>
                    setSupplierId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب تأمین‌کننده
                  </option>

                  {suppliers.map(
                    (supplier) => (
                      <option
                        key={
                          supplier.id
                        }
                        value={
                          supplier.id
                        }
                      >
                        {supplier.name}
                        {' — '}
                        {supplier.country}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              <Field
                label="انبار مقصد"
                required
              >
                <select
                  required
                  value={
                    warehouseId
                  }
                  onChange={(
                    event
                  ) =>
                    setWarehouseId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب انبار
                  </option>

                  {warehouses.map(
                    (warehouse) => (
                      <option
                        key={
                          warehouse.id
                        }
                        value={
                          warehouse.id
                        }
                      >
                        {
                          warehouse.name
                        }
                      </option>
                    ),
                  )}
                </select>
              </Field>

            </div>


            <div className="form-grid three-columns">

              <Field
                label="نرخ هر CAD"
                hint="مبلغ را به تومان وارد کنید."
                required
              >
                <input
                  required
                  type="number"
                  min="1"
                  value={
                    cadRateToman
                  }
                  onChange={(
                    event
                  ) =>
                    setCadRateToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

              <Field
                label="حساب پرداخت CAD"
                required
              >
                <select
                  required
                  value={
                    purchaseAccountId
                  }
                  onChange={(
                    event
                  ) =>
                    setPurchaseAccountId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب حساب CAD
                  </option>

                  {cadAccounts.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {account.name}
                        {' — '}
                        {formatCAD(
                          account.currentBalance
                        )}
                      </option>
                    ),
                  )}
                </select>
              </Field>

              <Field
                label="حساب هزینه‌های ریالی"
                required={
                  netExtrasToman >
                  0
                }
              >
                <select
                  value={
                    costAccountId
                  }
                  onChange={(
                    event
                  ) =>
                    setCostAccountId(
                      event.target
                        .value
                    )
                  }
                >
                  <option value="">
                    انتخاب حساب IRR
                  </option>

                  {irrAccounts.map(
                    (account) => (
                      <option
                        key={
                          account.id
                        }
                        value={
                          account.id
                        }
                      >
                        {account.name}
                        {' — '}
                        {formatToman(
                          account.currentBalance
                        )}
                      </option>
                    ),
                  )}
                </select>
              </Field>

            </div>


            <div className="line-items-header">
              <div>
                <strong>
                  اقلام خرید
                </strong>

                <span>
                  قیمت واحد بر حسب CAD وارد می‌شود
                </span>
              </div>

              <button
                className="button ghost small"
                type="button"
                onClick={() =>
                  setItems(
                    (prev) => [
                      ...prev,
                      createLine(
                        products
                      ),
                    ],
                  )
                }
              >
                <Plus size={16} />
                افزودن ردیف
              </button>
            </div>


            <div className="line-items-table">

              <div className="line-items-head purchase-grid">
                <span>کالا</span>
                <span>تعداد</span>
                <span>
                  قیمت واحد CAD
                </span>
                <span>
                  جمع ردیف
                </span>
                <span />
              </div>

              {items.map(
                (line) => (
                  <div
                    className="line-item-row purchase-grid"
                    key={
                      line.rowId
                    }
                  >

                    <select
                      required
                      value={
                        line.productId
                      }
                      onChange={(
                        event
                      ) =>
                        updateLine(
                          line.rowId,
                          {
                            productId:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                    >
                      <option value="">
                        انتخاب کالا
                      </option>

                      {products.map(
                        (product) => (
                          <option
                            key={
                              product.id
                            }
                            value={
                              product.id
                            }
                          >
                            {
                              product.name
                            }
                            {' — '}
                            {
                              product.sku
                            }
                          </option>
                        ),
                      )}
                    </select>

                    <input
                      required
                      type="number"
                      min="1"
                      value={
                        line.qty
                      }
                      onChange={(
                        event
                      ) =>
                        updateLine(
                          line.rowId,
                          {
                            qty:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                    />

                    <input
                      required
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={
                        line.unitCostCAD
                      }
                      onChange={(
                        event
                      ) =>
                        updateLine(
                          line.rowId,
                          {
                            unitCostCAD:
                              event
                                .target
                                .value,
                          },
                        )
                      }
                    />

                    <strong className="line-total">
                      {formatCAD(
                        Number(
                          line.qty ||
                            0
                        )
                        *
                        Number(
                          line.unitCostCAD ||
                            0
                        )
                      )}
                    </strong>

                    <button
                      className="icon-button danger"
                      type="button"
                      onClick={() =>
                        setItems(
                          (prev) =>
                            prev.length ===
                            1
                              ? prev
                              : prev.filter(
                                  (
                                    item
                                  ) =>
                                    item.rowId !==
                                    line.rowId,
                                ),
                        )
                      }
                    >
                      <Trash2
                        size={16}
                      />
                    </button>

                  </div>
                ),
              )}

            </div>


            <div className="subsection-title">
              <Calculator size={17} />

              <div>
                <strong>
                  هزینه‌های جانبی ورود
                </strong>

                <span>
                  تمام مبالغ این بخش بر حسب تومان هستند
                </span>
              </div>
            </div>


            <div className="form-grid three-columns">

              <Field label="حمل‌ونقل">
                <input
                  type="number"
                  min="0"
                  value={
                    shippingToman
                  }
                  onChange={(
                    event
                  ) =>
                    setShippingToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

              <Field label="گمرک و عوارض">
                <input
                  type="number"
                  min="0"
                  value={
                    customsToman
                  }
                  onChange={(
                    event
                  ) =>
                    setCustomsToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

              <Field label="مالیات">
                <input
                  type="number"
                  min="0"
                  value={
                    taxToman
                  }
                  onChange={(
                    event
                  ) =>
                    setTaxToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

              <Field label="سایر هزینه‌ها">
                <input
                  type="number"
                  min="0"
                  value={
                    otherToman
                  }
                  onChange={(
                    event
                  ) =>
                    setOtherToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

              <Field
                label="تخفیف کل هزینه‌های ورود"
                hint={
                  discountIsInvalid
                    ? 'تخفیف از مجموع هزینه‌ها بیشتر است.'
                    : ''
                }
              >
                <input
                  type="number"
                  min="0"
                  max={
                    grossExtrasToman
                  }
                  value={
                    discountToman
                  }
                  onChange={(
                    event
                  ) =>
                    setDiscountToman(
                      event.target
                        .value
                    )
                  }
                />
              </Field>

            </div>


            <div className="landed-summary">

              <div>
                <span>
                  جمع خرید ارزی
                </span>

                <strong>
                  {formatCAD(
                    subtotalCAD
                  )}
                </strong>
              </div>

              <div>
                <span>
                  هزینه جانبی خالص
                </span>

                <strong>
                  {formatToman(
                    netExtrasToman
                  )}
                </strong>
              </div>

              <div>
                <span>
                  هزینه جانبی معادل CAD
                </span>

                <strong>
                  {formatCAD(
                    extraCostsCAD
                  )}
                </strong>
              </div>

              <div>
                <span>
                  کل landed cost
                </span>

                <strong>
                  {formatCAD(
                    totalLandedCAD
                  )}
                </strong>
              </div>

              <div className="highlight">
                <span>
                  میانگین landed cost هر واحد
                </span>

                <strong>
                  {formatCAD(
                    averageLandedCAD
                  )}
                </strong>
              </div>

            </div>


            <div className="balance-checks">

              <span
                className={
                  (
                    selectedCadAccount
                      ?.currentBalance ??
                    0
                  ) <
                  subtotalCAD
                    ? 'danger-text'
                    : ''
                }
              >
                موجودی حساب CAD:
                {' '}
                {formatCAD(
                  selectedCadAccount
                    ?.currentBalance ??
                    0
                )}
              </span>

              <span
                className={
                  (
                    selectedIrrAccount
                      ?.currentBalance ??
                    0
                  ) <
                  netExtrasToman
                    ? 'danger-text'
                    : ''
                }
              >
                موجودی حساب IRR:
                {' '}
                {formatToman(
                  selectedIrrAccount
                    ?.currentBalance ??
                    0
                )}
              </span>

            </div>


            <FormMessage
              result={result}
            />


            <button
              className="button primary full"
              type="submit"
              disabled={
                submitting
              }
            >
              <PackagePlus
                size={17}
              />

              {submitting
                ? 'در حال ثبت خرید...'
                : 'ثبت خرید و ورود به انبار'}
            </button>

          </form>

        </Panel>


        <Panel
          title="سوابق خرید"
          subtitle="آخرین ورودهای واقعی ثبت‌شده در انبار"
          className="side-panel"
        >

          <div className="purchase-history">

            {purchases.map(
              (purchase) => (
                <article
                  className="purchase-card"
                  key={
                    purchase.id
                  }
                >

                  <div className="purchase-card-top">

                    <div>
                      <strong>
                        {purchase.id}
                      </strong>

                      <span>
                        {
                          purchase.supplierName
                        }
                      </span>
                    </div>

                    <span className="warehouse-chip">
                      {
                        purchase.warehouseName
                      }
                    </span>

                  </div>

                  <div className="purchase-card-meta">
                    <span>
                      {formatDate(
                        purchase.date
                      )}
                    </span>

                    <span>
                      {
                        purchase.items
                          .length
                      }
                      {' '}
                      ردیف
                    </span>
                  </div>

                  <div className="purchase-card-values">

                    <div>
                      <span>
                        خرید ارزی
                      </span>

                      <strong>
                        {formatCAD(
                          purchase.subtotalCAD
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        هزینه جانبی
                      </span>

                      <strong>
                        {formatToman(
                          purchase.extraCostsToman
                        )}
                      </strong>
                    </div>

                    <div>
                      <span>
                        landed cost
                      </span>

                      <strong>
                        {formatCAD(
                          purchase.totalLandedCAD
                        )}
                      </strong>
                    </div>

                  </div>

                </article>
              ),
            )}

          </div>

        </Panel>

      </div>

    </div>
  );
}
