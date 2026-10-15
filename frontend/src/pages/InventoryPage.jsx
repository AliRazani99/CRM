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
import { getProductBuyers } from '../api/products';
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

import '../warehouse-details.css';

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


export default function InventoryPage({ onNavigate, navigationRequest }) {
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
  const canViewBuyers =
    user?.role_code === ROLE.STORE_MANAGER ||
    user?.role_code === ROLE.SALES_MANAGER;


  // Warehouse details state
  const [selectedWarehouseId, setSelectedWarehouseId] =
    useState(null);

  const [warehouseProductQuery, setWarehouseProductQuery] =
    useState('');

  const [search, setSearch] =
    useState(navigationRequest?.search ?? '');

  useEffect(() => {
    if (typeof navigationRequest?.search === 'string') {
      setSearch(navigationRequest.search);
    }
  }, [navigationRequest]);

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

  // ورود از عملیات اصلی «انتقال بین انبارها» مستقیماً فرم را باز می‌کند.
  // مسیر عادی «کالاها و موجودی» همان صفحه موجودی قبلی است.
  useEffect(() => {
    if (navigationRequest?.openTransfer === false) {
      setTransferModal(false);
      return;
    }

    if (
      navigationRequest?.openTransfer === true &&
      canManageInventory &&
      warehouses.length >= 2 &&
      products.length > 0
    ) {
      setTransferResult(null);
      setTransferModal(true);
    }
  }, [
    navigationRequest,
    canManageInventory,
    warehouses.length,
    products.length,
  ]);

  const [
    productSubmitting,
    setProductSubmitting,
  ] = useState(false);

  const [
    transferSubmitting,
    setTransferSubmitting,
  ] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [productBuyers, setProductBuyers] = useState([]);
  const [buyersLoading, setBuyersLoading] = useState(false);
  const [buyersError, setBuyersError] = useState('');

  const selectedProduct = products.find(
    (product) => Number(product.id) === Number(selectedProductId),
  );

  useEffect(() => {
    if (selectedProductId == null || !canViewBuyers) {
      return undefined;
    }

    let cancelled = false;

    setProductBuyers([]);
    setBuyersError('');
    setBuyersLoading(true);

    getProductBuyers(selectedProductId)
      .then((response) => {
        if (!cancelled) {
          setProductBuyers(response.buyers || []);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBuyersError(error.message || 'دریافت خریداران انجام نشد.');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBuyersLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProductId, canViewBuyers]);

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
  // Warehouse details from existing API data
  const selectedWarehouse = selectedWarehouseId == null
    ? null
    : warehouseSummaries.find(
        (warehouse) =>
          String(warehouse.id) ===
          String(selectedWarehouseId),
      ) || null;

  const warehouseProducts = useMemo(() => {
    if (selectedWarehouseId == null) return [];

    return products
      .map((product) => {
        const inventory = (
          product.inventories || []
        ).find(
          (row) =>
            String(row.warehouseId) ===
            String(selectedWarehouseId),
        );

        if (
          !inventory ||
          Number(inventory.qtyOnHand) <= 0
        ) {
          return null;
        }

        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          qtyOnHand:
            Number(inventory.qtyOnHand) || 0,
          qtyReserved:
            Number(inventory.qtyReserved) || 0,
          qtyAvailable:
            Number(inventory.qtyAvailable) || 0,
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.name.localeCompare(b.name, 'fa')
      );
  }, [products, selectedWarehouseId]);

  const visibleWarehouseProducts = useMemo(() => {
    const query = warehouseProductQuery
      .trim()
      .toLocaleLowerCase();

    if (!query) return warehouseProducts;

    return warehouseProducts.filter(
      (product) =>
        `${product.name} ${product.sku ?? ''}`
          .toLocaleLowerCase()
          .includes(query),
    );
  }, [warehouseProducts, warehouseProductQuery]);

  const openWarehouseDetails = (warehouseId) => {
    setSelectedWarehouseId(warehouseId);
    setWarehouseProductQuery('');
  };

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
        subtitle="برای نمایش مشخصات و فهرست کالاها روی هر انبار کلیک کنید"
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
  className="warehouse-summary-row"
  onClick={() => openWarehouseDetails(warehouse.id)}
>
  <td>
    <button
      type="button"
      className="warehouse-detail-link"
      onClick={(event) => {
        event.stopPropagation();
        openWarehouseDetails(warehouse.id);
      }}
      aria-label={`مشاهده جزئیات انبار ${warehouse.name}`}
    >
      {warehouse.name}
    </button>
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
                          <button
                            type="button"
                            className="product-name-button"
                            onClick={() => setSelectedProductId(product.id)}
                            aria-label={`مشاهده جزئیات ${product.name}`}
                          >
                            <div className="product-cell">
                              <div className="product-avatar">
                                <Boxes size={17} />
                              </div>

                              <div>
                                <strong>{product.name}</strong>
                                <span>{product.brand}</span>
                              </div>
                            </div>
                          </button>
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
      {/* Warehouse information and inventory details */}
      <Modal
        open={Boolean(selectedWarehouse)}
        onClose={() => setSelectedWarehouseId(null)}
        title={
          selectedWarehouse
            ? `جزئیات انبار ${selectedWarehouse.name}`
            : 'جزئیات انبار'
        }
        subtitle="مشخصات انبار و موجودی کالاها به تفکیک تعداد"
        width="900px"
      >
        {selectedWarehouse && (
          <div className="warehouse-details">

            <div className="warehouse-details-info">
              <div>
                <span>نام انبار</span>
                <strong>{selectedWarehouse.name}</strong>
              </div>

              <div>
                <span>آدرس / موقعیت</span>
                <strong>
                  {selectedWarehouse.location || 'ثبت نشده'}
                </strong>
              </div>

              <div>
                <span>تاریخ ثبت</span>
                <strong>
                  {selectedWarehouse.created_at
                    ? formatDate(selectedWarehouse.created_at)
                    : '—'}
                </strong>
              </div>
            </div>

            <div className="warehouse-details-totals">
              <div>
                <span>مدل کالای موجود</span>
                <strong>
                  {selectedWarehouse.productCount}
                </strong>
              </div>

              <div>
                <span>تعداد کل</span>
                <strong>
                  {selectedWarehouse.totalOnHand}
                </strong>
              </div>

              <div>
                <span>رزروشده</span>
                <strong>
                  {selectedWarehouse.totalReserved}
                </strong>
              </div>

              <div>
                <span>قابل فروش</span>
                <strong>
                  {selectedWarehouse.totalAvailable}
                </strong>
              </div>
            </div>

            <div className="warehouse-details-head">
              <h3>کالاهای موجود در این انبار</h3>

              <div className="search-box wide warehouse-details-search">
                <Search size={16} />

                <input
                  value={warehouseProductQuery}
                  onChange={(event) =>
                    setWarehouseProductQuery(event.target.value)
                  }
                  placeholder="جست‌وجو با نام یا SKU کالا"
                  aria-label="جست‌وجوی کالاهای این انبار"
                />
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>کالا</th>
                    <th>SKU</th>
                    <th>موجودی کل</th>
                    <th>رزروشده</th>
                    <th>قابل فروش</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleWarehouseProducts.length > 0 ? (
                    visibleWarehouseProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <strong>{product.name}</strong>
                        </td>
                        <td className="mono">
                          {product.sku || '—'}
                        </td>
                        <td>{product.qtyOnHand}</td>
                        <td>{product.qtyReserved}</td>
                        <td>{product.qtyAvailable}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="empty-cell">
                        {warehouseProducts.length === 0
                          ? 'کالایی با موجودی مثبت در این انبار ثبت نشده است.'
                          : 'کالایی مطابق جست‌وجو پیدا نشد.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="warehouse-details-note">
              تعدادها از موجودی فعلی ثبت‌شده در سیستم خوانده می‌شوند.
            </p>

          </div>
        )}
      </Modal>
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
      <Modal
  open={selectedProductId != null}
  onClose={() => setSelectedProductId(null)}
  title={
    selectedProduct
      ? `خریداران ${selectedProduct.name}`
      : 'جزئیات کالا'
  }
  subtitle={
    selectedProduct
      ? `کد SKU: ${selectedProduct.sku}`
      : ''
  }
  width="900px"
>
  {selectedProduct && (
    <div className="form-stack">
      <div className="profile-kpis">
        <div>
          <span>موجودی کل</span>
          <strong>{selectedProduct.totalOnHand ?? 0}</strong>
        </div>

        <div>
          <span>قابل فروش</span>
          <strong>{selectedProduct.available ?? 0}</strong>
        </div>

        <div>
          <span>قیمت فروش فعلی</span>
          <strong>
            {formatToman(selectedProduct.priceIRR)}
          </strong>
        </div>

        {canViewBuyers && !buyersLoading && !buyersError && (
          <div>
            <span>تعداد خریداران</span>
            <strong>{productBuyers.length}</strong>
          </div>
        )}
      </div>

      {!canViewBuyers ? (
        <p className="muted-text">
          نمایش اطلاعات خریداران فقط برای مدیر فروشگاه
          و مدیر فروش مجاز است.
        </p>
      ) : buyersLoading ? (
        <p className="muted-text" role="status">
          در حال دریافت خریداران...
        </p>
      ) : buyersError ? (
        <p className="danger-text" role="alert">
          {buyersError}
        </p>
      ) : productBuyers.length === 0 ? (
        <p className="muted-text">
          هنوز خریدی برای این محصول ثبت نشده است.
        </p>
      ) : (
        <>
          <p className="muted-text">
            {productBuyers.length} مشتری،{' '}
            {productBuyers.reduce(
              (sum, buyer) => sum + buyer.total_quantity,
              0,
            )}{' '}
            عدد خریداری‌شده
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>مشتری</th>
                  <th>شماره تماس</th>
                  <th>تعداد فاکتور</th>
                  <th>تعداد کالا</th>
                  <th>مبلغ این محصول</th>
                  <th>آخرین خرید</th>
                  <th>جزئیات</th>
                </tr>
              </thead>

              <tbody>
                {productBuyers.map((buyer) => (
                  <tr key={buyer.customer_id}>
                    <td>{buyer.customer_name}</td>
                    <td dir="ltr">{buyer.phone || '—'}</td>
                    <td>{buyer.invoice_count}</td>
                    <td>{buyer.total_quantity}</td>

                    <td>
                      {formatToman(
                        Number(buyer.total_amount_irr) / 10,
                      )}
                    </td>

                    <td>
                      {formatDate(buyer.last_purchase_date)}
                    </td>

                    <td>
                      <button
                        type="button"
                        className="button small secondary"
                        onClick={() =>
                          onNavigate?.('customers', {
                            customerId: buyer.customer_id,
                          })
                        }
                      >
                        مشاهده مشتری
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )}
</Modal>
    </div>
  );
}