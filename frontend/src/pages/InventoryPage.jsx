import {
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  ArrowRightLeft,
  Boxes,
  PackagePlus,
  Search,
} from 'lucide-react';

import {
  useERP,
} from '../context/ERPContext';

import {
  useAuth,
} from '../context/AuthContext';

import {
  ROLE,
} from '../auth/access';

import {
  Field,
  FormMessage,
  Modal,
  PageHeader,
  Panel,
  StatusBadge,
} from '../components/UI';

import {
  formatCAD,
  formatDate,
  formatToman,
} from '../utils/formatters';


const createBlankProduct = (
  warehouses = [],
) => ({
  name: '',
  sku: '',
  category: '',
  brand: '',

  minStock: 5,
  costCAD: 0,
  priceToman: 0,

  openingStocks:
    Object.fromEntries(
      warehouses.map(
        (warehouse) => [
          warehouse.id,
          0,
        ],
      ),
    ),
});


export default function InventoryPage() {
  const {
    products,
    warehouses,
    transfers,
  
    stockMovements = [],
  
    addProduct,
    transferStock,
    addWarehouse,
  } = useERP();

  const { user } = useAuth();

  const canManageInventory =
    user?.role_code ===
    ROLE.STORE_MANAGER;


  const [search, setSearch] =
    useState('');

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('all');

  const [
    productModal,
    setProductModal,
  ] = useState(false);
  const [
    warehouseModal,
    setWarehouseModal,
  ] = useState(false);
  
  
  const [
    warehouseForm,
    setWarehouseForm,
  ] = useState({
    name:'',
    location:'',
  });
  
  
  const [
    warehouseResult,
    setWarehouseResult,
  ] = useState(null);
  const [
    transferModal,
    setTransferModal,
  ] = useState(false);

  const [
    productForm,
    setProductForm,
  ] = useState(
    createBlankProduct(
      warehouses
    )
  );

  const [
    transferForm,
    setTransferForm,
  ] = useState({
    productId: '',
    qty: 1,

    sourceWarehouseId: '',
    destinationWarehouseId: '',

    notes: '',
  });

  const [
    productResult,
    setProductResult,
  ] = useState(null);

  const [
    transferResult,
    setTransferResult,
  ] = useState(null);

  const [
    productSubmitting,
    setProductSubmitting,
  ] = useState(false);

  const [
    transferSubmitting,
    setTransferSubmitting,
  ] = useState(false);


  useEffect(() => {
    setProductForm(
      (prev) => ({
        ...prev,

        openingStocks:
          Object.fromEntries(
            warehouses.map(
              (warehouse) => [
                warehouse.id,

                prev.openingStocks?.[
                  warehouse.id
                ] ?? 0,
              ],
            ),
          ),
      }),
    );
  }, [warehouses]);


  useEffect(() => {
    setTransferForm(
      (prev) => ({
        ...prev,

        productId:
          prev.productId ||
          products[0]?.id ||
          '',

        sourceWarehouseId:
          prev.sourceWarehouseId ||
          warehouses[0]?.id ||
          '',

        destinationWarehouseId:
          prev.destinationWarehouseId ||
          warehouses[1]?.id ||
          '',
      }),
    );
  }, [
    products,
    warehouses,
  ]);


  const filteredProducts =
    useMemo(() => {
      return products.filter(
        (product) => {
          const query =
            search
              .trim()
              .toLowerCase();

          const available =
            Number(
              product.available
            ) || 0;

          const status =
            available <= 0
              ? 'critical'
              : available <=
                  product.minStock
                ? 'low'
                : 'healthy';

          const matchesSearch =
            !query ||
            product.name
              .toLowerCase()
              .includes(query) ||
            product.sku
              .toLowerCase()
              .includes(query) ||
            product.category
              .toLowerCase()
              .includes(query) ||
            product.brand
              .toLowerCase()
              .includes(query);

          const matchesStatus =
            statusFilter ===
              'all' ||
            status ===
              statusFilter;

          return (
            matchesSearch &&
            matchesStatus
          );
        },
      );
    }, [
      products,
      search,
      statusFilter,
    ]);


  const submitProduct =
    async (event) => {
      event.preventDefault();

      setProductSubmitting(true);
      setProductResult(null);

      const response =
        await addProduct(
          productForm
        );

      setProductResult(
        response
      );

      if (response.ok) {
        setProductForm(
          createBlankProduct(
            warehouses
          )
        );

        setTimeout(() => {
          setProductModal(false);
          setProductResult(null);
        }, 600);
      }

      setProductSubmitting(false);
    };


  const submitTransfer =
    async (event) => {
      event.preventDefault();

      setTransferSubmitting(true);
      setTransferResult(null);

      const response =
        await transferStock(
          transferForm
        );

      setTransferResult(
        response
      );

      if (response.ok) {
        setTransferForm(
          (prev) => ({
            ...prev,
            qty: 1,
            notes: '',
          }),
        );

        setTimeout(() => {
          setTransferModal(false);
          setTransferResult(null);
        }, 600);
      }

      setTransferSubmitting(false);
    };


  const getInventoryForWarehouse = (
    product,
    warehouseId,
  ) => {
    return (
      product.inventories?.find(
        (inventory) =>
          Number(
            inventory.warehouseId
          ) ===
          Number(
            warehouseId
          ),
      ) || null
    );
  };
  const warehouseSummaries = useMemo(() => { return warehouses.map( (warehouse) => { const rows = products.flatMap( (product) => ( product.inventories || [] ).filter( (inventory) => Number( inventory.warehouseId ) === Number( warehouse.id ), ), ); return { ...warehouse, productCount: rows.filter( (row) => row.qtyOnHand > 0 || row.qtyReserved > 0 ).length, totalOnHand: rows.reduce( (sum, row) => sum + Number( row.qtyOnHand ), 0, ), totalReserved: rows.reduce( (sum, row) => sum + Number( row.qtyReserved ), 0, ), totalAvailable: rows.reduce( (sum, row) => sum + Number( row.qtyAvailable ), 0, ), }; }, ); }, [ warehouses, products, ]);
  const selectedTransferProduct =
  products.find(
    (product) =>
      Number(product.id) ===
      Number(
        transferForm.productId
      ),
  );

const selectedSourceInventory =
  selectedTransferProduct
    ? getInventoryForWarehouse(
        selectedTransferProduct,
        transferForm
          .sourceWarehouseId,
      )
    : null;

const sourceAvailable =
  selectedSourceInventory
    ?.qtyAvailable ?? 0;

  return (
    <div className="page-stack">
      <PageHeader
        title="انبار و مدیریت کالا"
        subtitle="موجودی واقعی کالاها بر اساس انبارهای ثبت‌شده در سیستم"
        actions={
          canManageInventory ? (
            <>
            <button
            className="button primary"
            type="button"
            onClick={()=>{
              setWarehouseResult(null);
              setWarehouseModal(true);
            }}
            >
            افزودن انبار
            </button>
              <button
                className="button secondary"
                type="button"
                disabled={
                  warehouses.length < 2 ||
                  products.length === 0
                }
                onClick={() => {
                  setTransferResult(
                    null
                  );

                  setTransferModal(
                    true
                  );
                }}
              >
                <ArrowRightLeft
                  size={17}
                />

                انتقال بین انبارها
              </button>

              <button
                className="button primary"
                type="button"
                disabled={
                  warehouses.length === 0
                }
                onClick={() => {
                  setProductResult(
                    null
                  );

                  setProductForm(
                    createBlankProduct(
                      warehouses
                    )
                  );

                  setProductModal(
                    true
                  );
                }}
              >
                <PackagePlus
                  size={17}
                />

                تعریف کالای جدید
              </button>
            </>
          ) : null
        }
      />

      {warehouses.length === 0 && (
        <Panel>
          <div>
            هنوز هیچ انباری در سیستم
            تعریف نشده است. ابتدا مدیر
            فروشگاه باید حداقل یک Warehouse
            ایجاد کند.
          </div>
        </Panel>
      )}
      <Panel
        title="فهرست انبارها"
        subtitle="نمای کلی موجودی هر انبار"
      >
        <div className="table-wrap">

          <table className="data-table">

            <thead>
              <tr>
                <th>انبار</th>
                <th>موقعیت</th>
                <th>
                  کالاهای دارای موجودی
                </th>
                <th>موجودی کل</th>
                <th>رزرو</th>
                <th>قابل فروش</th>
              </tr>
            </thead>

            <tbody>

              {warehouseSummaries.map(
                (warehouse) => (

                  <tr
                    key={warehouse.id}
                  >

                    <td>
                      <strong>
                        {warehouse.name}
                      </strong>
                    </td>

                    <td>
                      {
                        warehouse.location ||
                        '—'
                      }
                    </td>

                    <td>
                      {
                        warehouse.productCount
                      }
                    </td>

                    <td>
                      {
                        warehouse.totalOnHand
                      }
                    </td>

                    <td>
                      {
                        warehouse.totalReserved
                      }
                    </td>

                    <td>
                      {
                        warehouse.totalAvailable
                      }
                    </td>

                  </tr>

                )
              )}

            </tbody>

          </table>

        </div>
      </Panel>

      <Panel>
        <div className="toolbar-row">
          <div className="search-box wide">
            <Search size={16} />

            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="جست‌وجو بر اساس نام، SKU، دسته‌بندی یا برند"
            />
          </div>

          <div className="segmented-control compact">
            {[
              ['all', 'همه'],
              ['healthy', 'مناسب'],
              ['low', 'کم'],
              ['critical', 'بحرانی'],
            ].map(
              ([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    statusFilter ===
                    key
                      ? 'active'
                      : ''
                  }
                  onClick={() =>
                    setStatusFilter(
                      key
                    )
                  }
                >
                  {label}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table inventory-table">
            <thead>
              <tr>
                <th>کالا</th>
                <th>SKU</th>
                <th>دسته‌بندی</th>

                {warehouses.map(
                  (warehouse) => (
                    <th
                      key={
                        warehouse.id
                      }
                    >
                      {warehouse.name}
                    </th>
                  ),
                )}

                <th>کل موجودی</th>
                <th>رزرو</th>
                <th>قابل فروش</th>
                <th>بهای CAD</th>
                <th>قیمت فروش</th>
                <th>وضعیت</th>
              </tr>
            </thead>

            <tbody>
              {filteredProducts.length ===
              0 ? (
                <tr>
                  <td
                    colSpan={
                      10 +
                      warehouses.length
                    }
                    className="muted-text"
                  >
                    کالایی برای نمایش
                    وجود ندارد.
                  </td>
                </tr>
              ) : (
                filteredProducts.map(
                  (product) => {
                    const available =
                      Number(
                        product.available
                      ) || 0;

                    const status =
                      available <= 0
                        ? 'critical'
                        : available <=
                            product.minStock
                          ? 'low'
                          : 'healthy';

                    return (
                      <tr
                        key={
                          product.id
                        }
                      >
                        <td>
                          <div className="product-cell">
                            <div className="product-avatar">
                              <Boxes
                                size={
                                  17
                                }
                              />
                            </div>

                            <div>
                              <strong>
                                {
                                  product.name
                                }
                              </strong>

                              <span>
                                {
                                  product.brand
                                }
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="mono accent-text">
                          {
                            product.sku
                          }
                        </td>

                        <td>
                          {
                            product.category
                          }
                        </td>

                        {warehouses.map(
                          (
                            warehouse
                          ) => {
                            const inventory =
                              getInventoryForWarehouse(
                                product,
                                warehouse.id
                              );

                            return (
                              <td
                                key={
                                  warehouse.id
                                }
                                className="numeric-cell"
                                title={
                                  inventory
                                    ? `قابل فروش: ${inventory.qtyAvailable} | رزرو: ${inventory.qtyReserved}`
                                    : 'بدون موجودی'
                                }
                              >
                                {inventory?.qtyOnHand ??
                                  0}
                              </td>
                            );
                          },
                        )}

                        <td className="numeric-cell strong-cell">
                          {
                            product.totalOnHand
                          }
                        </td>

                        <td className="numeric-cell muted-text">
                          {
                            product.reserved
                          }
                        </td>

                        <td className="numeric-cell strong-cell">
                          {available}
                        </td>

                        <td>
                          {formatCAD(
                            product.costCAD
                          )}
                        </td>

                        <td>
                          {formatToman(
                            product.priceIRR
                          )}
                        </td>

                        <td>
                          <StatusBadge
                            status={
                              status
                            }
                          />
                        </td>
                      </tr>
                    );
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {canManageInventory && (
        <Panel
          title="تاریخچه انتقال داخلی"
          subtitle="انتقال بین انبارها موجودی کل فروشگاه را تغییر نمی‌دهد"
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>شناسه</th>
                  <th>کالا</th>
                  <th>تعداد</th>
                  <th>مبدأ</th>
                  <th>مقصد</th>
                  <th>تاریخ</th>
                </tr>
              </thead>

              <tbody>
                {transfers.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="muted-text"
                    >
                      هنوز انتقالی ثبت
                      نشده است.
                    </td>
                  </tr>
                ) : (
                  transfers.map(
                    (transfer) => (
                      <tr
                        key={
                          transfer.id
                        }
                      >
                        <td className="mono accent-text">
                          {
                            transfer.id
                          }
                        </td>

                        <td>
                          {
                            transfer.productName
                          }
                        </td>

                        <td>
                          {
                            transfer.qty
                          }
                        </td>

                        <td>
                          {
                            transfer.fromWarehouseName
                          }
                        </td>

                        <td>
                          {
                            transfer.toWarehouseName
                          }
                        </td>

                        <td>
                          {formatDate(
                            transfer.date
                          )}
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </Panel>
        
      )}
      <Panel
  title="گردش موجودی"
  subtitle="موجودی اولیه، فروش و انتقال‌های ثبت‌شده"
>
  <div className="table-wrap">

    <table className="data-table">

      <thead>
        <tr>
          <th>تاریخ</th>
          <th>کالا</th>
          <th>انبار</th>
          <th>نوع</th>
          <th>تعداد</th>
          <th>مرجع</th>
        </tr>
      </thead>

      <tbody>

        {stockMovements.length === 0 ? (

          <tr>
            <td
              colSpan="6"
              className="muted-text"
            >
              هنوز گردش موجودی
              ثبت نشده است.
            </td>
          </tr>

        ) : (

          stockMovements
            .slice(0, 100)
            .map(
              (movement) => (

                <tr
                  key={movement.id}
                >

                  <td>
                    {formatDate(
                      movement.date
                    )}
                  </td>

                  <td>
                    {
                      movement
                        .productName
                    }
                  </td>

                  <td>
                    {
                      movement
                        .warehouseName
                    }
                  </td>

                  <td>
                    {movement.type}
                  </td>

                  <td
                    className={
                      movement.quantity < 0
                        ? 'danger-text'
                        : 'positive-text'
                    }
                  >
                    {movement.quantity}
                  </td>

                  <td>
                    {
                      movement
                        .referenceType ||
                      '—'
                    }

                    {
                      movement.referenceId
                        ? ` #${movement.referenceId}`
                        : ''
                    }
                  </td>

                </tr>

              )
            )

        )}

      </tbody>

    </table>

  </div>
</Panel>
      <Modal
        open={warehouseModal}
        onClose={()=>setWarehouseModal(false)}
        title="ایجاد انبار جدید"
        >

        <form
        className="form-stack"
        onSubmit={async(e)=>{

          e.preventDefault();

          const result =
            await addWarehouse(
              warehouseForm
            );

          setWarehouseResult(result);

          if(result.ok){
            setWarehouseForm({
              name:'',
              location:'',
            });

            setTimeout(()=>{
              setWarehouseModal(false);
            },600);
          }

        }}
        >

        <Field label="نام انبار" required>
        <input
        required
        value={warehouseForm.name}
        onChange={(e)=>
          setWarehouseForm({
          ...warehouseForm,
          name:e.target.value
          })
        }
        />
        </Field>


        <Field label="موقعیت">
        <input
        value={warehouseForm.location}
        onChange={(e)=>
          setWarehouseForm({
          ...warehouseForm,
          location:e.target.value
          })
        }
        />
        </Field>

        <FormMessage
        result={warehouseResult}
      />

        <button
        className="button primary"
        >
        ذخیره
        </button>


        </form>

        </Modal>
      <Modal
        open={productModal}
        onClose={() =>
          setProductModal(false)
        }
        title="تعریف کالای جدید"
        subtitle="محصول و موجودی اولیه آن در یک تراکنش ثبت می‌شوند"
        width="760px"
      >
        <form
          onSubmit={submitProduct}
          className="form-stack"
        >
          <div className="form-grid two-columns">
            <Field
              label="نام کالا"
              required
            >
              <input
                required
                value={
                  productForm.name
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    name:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <Field
              label="SKU"
              required
            >
              <input
                required
                dir="ltr"
                value={
                  productForm.sku
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    sku:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <Field
              label="دسته‌بندی"
              required
            >
              <input
                required
                value={
                  productForm.category
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    category:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <Field
              label="برند"
              required
            >
              <input
                required
                value={
                  productForm.brand
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    brand:
                      event.target
                        .value,
                  })
                }
              />
            </Field>
          </div>

          <div className="form-grid three-columns">
            <Field label="نقطه سفارش">
              <input
                type="number"
                min="0"
                value={
                  productForm.minStock
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    minStock:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <Field label="بهای واحد CAD">
              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  productForm.costCAD
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    costCAD:
                      event.target
                        .value,
                  })
                }
              />
            </Field>

            <Field label="قیمت فروش تومان">
              <input
                type="number"
                min="0"
                value={
                  productForm.priceToman
                }
                onChange={(
                  event
                ) =>
                  setProductForm({
                    ...productForm,
                    priceToman:
                      event.target
                        .value,
                  })
                }
              />
            </Field>
          </div>

          <Panel
            title="موجودی اولیه"
            subtitle="برای هر انبار مقدار اولیه را مشخص کنید"
          >
            <div className="form-grid two-columns">
              {warehouses.map(
                (warehouse) => (
                  <Field
                    key={
                      warehouse.id
                    }
                    label={
                      warehouse.name
                    }
                  >
                    <input
                      type="number"
                      min="0"
                      value={
                        productForm
                          .openingStocks?.[
                          warehouse.id
                        ] ?? 0
                      }
                      onChange={(
                        event
                      ) =>
                        setProductForm(
                          {
                            ...productForm,

                            openingStocks:
                              {
                                ...productForm.openingStocks,

                                [warehouse.id]:
                                  event
                                    .target
                                    .value,
                              },
                          }
                        )
                      }
                    />
                  </Field>
                ),
              )}
            </div>
          </Panel>

          <FormMessage
            result={productResult}
          />

          <div className="modal-actions">
            <button
              className="button ghost"
              type="button"
              onClick={() =>
                setProductModal(
                  false
                )
              }
            >
              انصراف
            </button>

            <button
              className="button primary"
              type="submit"
              disabled={
                productSubmitting
              }
            >
              <PackagePlus
                size={16}
              />

              {productSubmitting
                ? 'در حال ثبت...'
                : 'ذخیره کالا'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={transferModal}
        onClose={() =>
          setTransferModal(false)
        }
        title="انتقال موجودی بین انبارها"
        subtitle="موجودی مبدأ در بک‌اند و داخل تراکنش کنترل می‌شود"
      >
        <form
          onSubmit={submitTransfer}
          className="form-stack"
        >
          <Field
            label="کالا"
            required
          >
            <select
              required
              value={
                transferForm.productId
              }
              onChange={(event) =>
                setTransferForm({
                  ...transferForm,
                  productId:
                    event.target
                      .value,
                })
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
                    {product.name} —{' '}
                    {product.available}{' '}
                    قابل فروش
                  </option>
                ),
              )}
            </select>
          </Field>

          <div className="form-grid two-columns">
            <Field
              label="انبار مبدأ"
              required
            >
              <select
                required
                value={
                  transferForm.sourceWarehouseId
                }
                onChange={(event) => {
                  const sourceWarehouseId =
                    event.target.value;
                
                  setTransferForm({
                    ...transferForm,
                
                    sourceWarehouseId,
                
                    destinationWarehouseId:
                      Number(
                        transferForm
                          .destinationWarehouseId
                      ) ===
                      Number(
                        sourceWarehouseId
                      )
                        ? ''
                        : transferForm
                            .destinationWarehouseId,
                  });
                }}
              >
                <option value="">
                  انتخاب مبدأ
                </option>

                {warehouses.map(
                  (warehouse) => {

                    const inventory =
                      selectedTransferProduct
                        ? getInventoryForWarehouse(
                            selectedTransferProduct,
                            warehouse.id,
                          )
                        : null;

                    return (
                      <option
                        key={warehouse.id}
                        value={warehouse.id}
                      >
                        {warehouse.name}
                        {' — '}
                        {
                          inventory
                            ?.qtyAvailable ?? 0
                        }
                        {' قابل فروش'}
                      </option>
                    );
                  },
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
                  transferForm.destinationWarehouseId
                }
                onChange={(
                  event
                ) =>
                  setTransferForm({
                    ...transferForm,
                    destinationWarehouseId:
                      event.target
                        .value,
                  })
                }
              >
                <option value="">
                  انتخاب مقصد
                </option>

                {warehouses
                  .filter(
                    (warehouse) =>
                      Number(
                        warehouse.id
                      ) !==
                      Number(
                        transferForm
                          .sourceWarehouseId
                      ),
                  )
                  .map(
                    (warehouse) => (
                      <option
                        key={warehouse.id}
                        value={warehouse.id}
                      >
                        {warehouse.name}
                      </option>
                    ),
                  )}
              </select>
            </Field>
          </div>

          <Field
          label={
            `تعداد — حداکثر قابل انتقال: ${sourceAvailable}`
          }
          required
        >
          <input
            required
            type="number"
            min="1"

            max={
              sourceAvailable > 0
                ? sourceAvailable
                : undefined
            }

            value={
              transferForm.qty
            }

            onChange={(event) =>
              setTransferForm({
                ...transferForm,

                qty:
                  event.target.value,
              })
            }
          />
        </Field>
          <Field label="توضیحات">
            <textarea
              value={
                transferForm.notes
              }
              onChange={(event) =>
                setTransferForm({
                  ...transferForm,
                  notes:
                    event.target
                      .value,
                })
              }
            />
          </Field>

          <FormMessage
            result={transferResult}
          />

          <div className="modal-actions">
            <button
              className="button ghost"
              type="button"
              onClick={() =>
                setTransferModal(
                  false
                )
              }
            >
              انصراف
            </button>

            <button
              className="button primary"
              type="submit"
              disabled={
                transferSubmitting ||
                sourceAvailable <= 0
              }
            >
              <ArrowRightLeft
                size={16}
              />

              {transferSubmitting
                ? 'در حال انتقال...'
                : 'ثبت انتقال'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}