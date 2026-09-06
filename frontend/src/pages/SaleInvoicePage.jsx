import {
    ArrowRight,
  } from "lucide-react";
  
  import {
    PageHeader,
    Panel,
    StatusBadge,
  } from "../components/UI";
  
  import {
    formatDate,
    formatToman,
  } from "../utils/formatters";
  
  
  export default function SaleInvoicePage({
    sale,
    onNavigate,
  }) {
  
  
    if (!sale) {
      return (
        <div className="page-stack">
  
          <Panel title="فاکتور پیدا نشد">
            <p>
              اطلاعات این فاکتور موجود نیست.
            </p>
          </Panel>
  
        </div>
      );
    }
  
  
    return (
  
      <div className="page-stack">
  
  
        <PageHeader
  
          title={`فاکتور ${sale.id || "-"}`}
  
          subtitle="جزئیات کامل فروش مشتری"
  
          actions={
  
            <button
  
              className="button secondary"
  
              onClick={() =>
                onNavigate("sales")
              }
  
            >
  
              <ArrowRight size={16}/>
  
              بازگشت
  
            </button>
  
          }
  
        />
  
  
  
  
        <Panel title="اطلاعات مشتری">
  
  
          <div className="summary-numbers">
  
  
            <div>
  
              <span>
                مشتری
              </span>
  
  
              <strong>
                {sale.customerName || "-"}
              </strong>
  
            </div>
  
  
  
  
            <div>
  
              <span>
                تاریخ
              </span>
  
  
              <strong>
                {
                  sale.date
                    ? formatDate(sale.date)
                    : "-"
                }
              </strong>
  
            </div>
  
  
  
  
            <div>
  
              <span>
                وضعیت
              </span>
  
  
              <StatusBadge
                status={
                  sale.status ||
                  "unpaid"
                }
              />
  
            </div>
  
  
          </div>
  
  
        </Panel>
  
  
  
  
  
        <Panel title="اقلام فاکتور">
  
  
          <div className="table-wrap">
  
  
            <table className="data-table">
  
  
              <thead>
  
                <tr>
  
                  <th>
                    کالا
                  </th>
  
  
                  <th>
                    انبار
                  </th>
  
  
                  <th>
                    تعداد
                  </th>
  
  
                  <th>
                    قیمت واحد
                  </th>
  
  
                  <th>
                    مبلغ
                  </th>
  
  
                </tr>
  
  
              </thead>
  
  
  
              <tbody>
  
  
              {
                sale.items &&
                sale.items.length > 0
  
                ?
  
                sale.items.map(
                  (
                    item,
                    index
                  ) => (
  
                    <tr key={item.id || index}>
  
  
                      <td>
  
                        {
                          item.productName ||
                          `کالا #${item.productId}`
                        }
  
                      </td>
  
  
  
                      <td>
  
                        {
                          item.warehouseName ||
                          `انبار #${item.warehouseId}`
                        }
  
                      </td>
  
  
  
                      <td>
  
                        {
                          item.qty ?? 0
                        }
  
                      </td>
  
  
  
                      <td>
  
                        {
                          formatToman(
                            item.unitPrice || 0
                          )
                        }
  
                      </td>
  
  
  
                      <td>
  
                        {
                          formatToman(
                            item.lineTotal || 0
                          )
                        }
  
                      </td>
  
  
                    </tr>
  
                  )
  
                )
  
                :
  
                (
  
                  <tr>
  
                    <td colSpan="5">
  
                      آیتمی برای این فاکتور ثبت نشده است.
  
                    </td>
  
                  </tr>
  
                )
  
              }
  
  
              </tbody>
  
  
            </table>
  
  
          </div>
  
  
        </Panel>
  
  
  
  
  
        <Panel title="خلاصه مالی">
  
  
          <div className="summary-numbers">
  
  
  
            <div>
  
              <span>
                مبلغ کل
              </span>
  
  
              <strong>
  
                {
                  formatToman(
                    sale.total || 0
                  )
                }
  
              </strong>
  
            </div>
  
  
  
  
  
            <div>
  
              <span>
                پرداخت شده
              </span>
  
  
              <strong>
  
                {
                  formatToman(
                    sale.paid || 0
                  )
                }
  
              </strong>
  
            </div>
  
  
  
  
  
            <div>
  
              <span>
                بدهی
              </span>
  
  
              <strong>
  
                {
                  formatToman(
                    sale.debt || 0
                  )
                }
  
              </strong>
  
            </div>
  
  
  
          </div>
  
  
        </Panel>
  
  
  
  
        <Panel title="اطلاعات تکمیلی">
  
  
          <div className="summary-numbers">
  
  
            <div>
  
              <span>
                شماره داخلی
              </span>
  
  
              <strong>
                {
                  sale.backendId ||
                  "-"
                }
              </strong>
  
            </div>
  
  
  
            <div>
  
              <span>
                نرخ CAD
              </span>
  
  
              <strong>
  
                {
                  sale.cadRateToman
                    ? formatToman(
                        sale.cadRateToman
                      )
                    : "-"
                }
  
              </strong>
  
  
            </div>
  
  
          </div>
  
  
        </Panel>
  
  
  
      </div>
  
    );
  
  }