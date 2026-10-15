import { useState } from 'react';
import {
  ArrowRightLeft,
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  LayoutDashboard,
  PackagePlus,
  RefreshCw,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  WalletCards,
} from 'lucide-react';

import { useAuth } from '../context/AuthContext';
import { canAccessPage, ROLE } from '../auth/access';
import '../workflow-navigation.css';

// هر فرآیند فقط یک درگاه اصلی دارد؛ سایر امکانات زیرمجموعه آن هستند.
// شناسه صفحه‌ها عمداً تغییری نکرده تا API، دسترسی‌ها و صفحات قدیمی سالم بمانند.
const workflows = [
  {
    id: 'sales',
    page: 'sales',
    title: 'فروش به مشتری',
    subtitle: 'ثبت فاکتور و دریافت وجه',
    icon: ShoppingCart,
    children: [
      { page: 'customers', label: 'مشتریان و مطالبات', icon: Users },
    ],
  },
  {
    id: 'purchases',
    page: 'purchases',
    title: 'خرید و Landed Cost',
    subtitle: 'ثبت خرید و بهای تمام‌شده',
    icon: PackagePlus,
    children: [
      { page: 'suppliers', label: 'تأمین‌کنندگان', icon: Truck },
    ],
  },
  {
    id: 'inventory',
    page: 'inventory',
    title: 'انتقال بین انبارها',
    subtitle: 'جابجایی کالا بین دو انبار',
    icon: ArrowRightLeft,
    storeOnly: true,
    payload: { openTransfer: true },
    children: [
      {
        page: 'inventory',
        label: 'کالاها، موجودی و گردش انبار',
        icon: Boxes,
        payload: { openTransfer: false },
      },
    ],
  },
  {
    id: 'exchange',
    page: 'exchange',
    title: 'انتقال ارز بین حساب‌ها',
    subtitle: 'تبدیل IRR و CAD',
    icon: RefreshCw,
    children: [
      { page: 'finance', label: 'حساب‌ها و گردش مالی', icon: WalletCards },
    ],
  },
];

const managerItems = [
  { page: 'dashboard', label: 'داشبورد و تحلیل‌ها', icon: LayoutDashboard },
  { page: 'users', label: 'کاربران و دسترسی‌ها', icon: UserCog },
];

export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggle,
}) {
  const { user } = useAuth();
  const [expanded, setExpanded] = useState({
    sales: true,
    purchases: true,
    inventory: true,
    exchange: true,
  });

  const availableWorkflows = workflows.filter((workflow) =>
    canAccessPage(user, workflow.page) &&
    (!workflow.storeOnly || user?.role_code === ROLE.STORE_MANAGER),
  );

  const availableManagerItems = managerItems.filter((item) =>
    canAccessPage(user, item.page),
  );

  // سایر نقش‌ها هم باید بتوانند موجودی را ببینند؛ فقط انتقال مجاز نیست.
  const showReadOnlyInventory =
    user?.role_code !== ROLE.STORE_MANAGER &&
    canAccessPage(user, 'inventory');

  const navigate = (page, payload = null) => {
    onNavigate(page, payload);
  };

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-block">
        <div className="brand-mark">
          <BarChart3 size={22} />
        </div>
        {!collapsed && (
          <div>
            <strong>NEXUS ERP</strong>
            <span>Store Intelligence Suite</span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav workflow-nav" aria-label="ناوبری ERP">
        {!collapsed && (
          <div className="workflow-section-heading">مرکز عملیات</div>
        )}

        {availableWorkflows.map((workflow) => {
          const Icon = workflow.icon;
          const children = workflow.children.filter((child) =>
            canAccessPage(user, child.page),
          );
          const isActive =
            activePage === workflow.page ||
            children.some((child) => child.page === activePage) ||
            (workflow.id === 'sales' && activePage === 'saleInvoice');
          const isExpanded = Boolean(expanded[workflow.id]);

          return (
            <section
              className={`workflow-group ${isActive ? 'current' : ''}`}
              key={workflow.id}
              aria-label={workflow.title}
            >
              <div className="workflow-heading">
                <button
                  className={`workflow-primary ${isActive ? 'active' : ''}`}
                  type="button"
                  onClick={() => navigate(workflow.page, workflow.payload ?? null)}
                  title={workflow.title}
                  aria-current={activePage === workflow.page ? 'page' : undefined}
                >
                  <span className="workflow-main-icon"><Icon size={19} /></span>
                  {!collapsed && (
                    <span className="workflow-primary-text">
                      <strong>{workflow.title}</strong>
                      <small>{workflow.subtitle}</small>
                    </span>
                  )}
                </button>

                {!collapsed && children.length > 0 && (
                  <button
                    type="button"
                    className={`workflow-toggle ${isExpanded ? 'expanded' : ''}`}
                    aria-label={`${isExpanded ? 'بستن' : 'نمایش'} زیرمجموعه‌های ${workflow.title}`}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [workflow.id]: !prev[workflow.id],
                      }))
                    }
                  >
                    <ChevronDown size={15} />
                  </button>
                )}
              </div>

              {children.length > 0 && (
                <div className={`workflow-children ${isExpanded ? '' : 'workflow-children-closed'}`}>
                  {children.map((child) => {
                    const ChildIcon = child.icon;
                    const childActive =
                      activePage === child.page &&
                      child.page !== workflow.page;
                    return (
                      <button
                        type="button"
                        key={`${workflow.id}-${child.label}`}
                        title={child.label}
                        className={`workflow-child ${childActive ? 'active' : ''}`}
                        onClick={() => navigate(child.page, child.payload ?? null)}
                        aria-current={childActive ? 'page' : undefined}
                      >
                        <ChildIcon size={16} />
                        <span className="workflow-child-label">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {(availableManagerItems.length > 0 || showReadOnlyInventory) && (
          <div className="workflow-utilities nav-group">
            {!collapsed && (
              <span className="nav-group-label">مدیریت و گزارش ها</span>
            )}
            {showReadOnlyInventory && (
              <button
                type="button"
                className={`nav-item ${activePage === 'inventory' ? 'active' : ''}`}
                onClick={() => navigate('inventory', { openTransfer: false })}
                title="مشاهده موجودی و کالاها"
              >
                <Boxes size={18} />
                {!collapsed && <span>موجودی و کالاها</span>}
              </button>
            )}
            {availableManagerItems.map((item) => {
              const ItemIcon = item.icon;
              return (
                <button
                  type="button"
                  key={item.page}
                  className={`nav-item ${activePage === item.page ? 'active' : ''}`}
                  onClick={() => navigate(item.page)}
                  title={item.label}
                  aria-current={activePage === item.page ? 'page' : undefined}
                >
                  <ItemIcon size={18} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && activePage === item.page && (
                    <ChevronLeft size={15} className="nav-chevron" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="system-health">
            <CircleDollarSign size={18} />
            <div>
              <strong>سیستم عملیاتی</strong>
              <span>متصل به Django API</span>
            </div>
          </div>
        )}
        <button
          type="button"
          className="collapse-button"
          onClick={onToggle}
          title={collapsed ? 'بازکردن منو' : 'جمع‌کردن منو'}
          aria-label={collapsed ? 'بازکردن منو' : 'جمع‌کردن منو'}
        >
          <ChevronLeft size={18} className={collapsed ? 'rotate-180' : ''} />
        </button>
      </div>
    </aside>
  );
}
