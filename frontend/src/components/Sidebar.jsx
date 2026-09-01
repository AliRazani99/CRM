import {
  BarChart3,
  Boxes,
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

import {
  useAuth,
} from '../context/AuthContext';

import {
  canAccessPage,
} from '../auth/access';


const groups = [
  {
    label: 'نمای مدیریتی',
    items: [
      {
        id: 'dashboard',
        label: 'داشبورد و BI',
        icon: LayoutDashboard,
      },
      {
        id: 'users',
        label: 'کاربران و دسترسی‌ها',
        icon: UserCog,
      },
    ],
  },

  {
    label: 'عملیات فروشگاه',
    items: [
      {
        id: 'sales',
        label: 'فروش و فاکتورها',
        icon: ShoppingCart,
      },
      {
        id: 'purchases',
        label: 'خرید و Landed Cost',
        icon: PackagePlus,
      },
      {
        id: 'inventory',
        label: 'انبار و کالاها',
        icon: Boxes,
      },
      {
        id: 'customers',
        label: 'مشتریان و مطالبات',
        icon: Users,
      },
      {
        id: 'suppliers',
        label: 'تأمین‌کنندگان',
        icon: Truck,
      },
    ],
  },

  {
    label: 'مالی',
    items: [
      {
        id: 'exchange',
        label: 'تبدیل ارز',
        icon: RefreshCw,
      },
      {
        id: 'finance',
        label: 'حساب‌ها و تراکنش‌ها',
        icon: WalletCards,
      },
    ],
  },
];


export default function Sidebar({
  activePage,
  onNavigate,
  collapsed,
  onToggle,
}) {
  const { user } = useAuth();

  return (
    <aside
      className={`sidebar ${
        collapsed ? 'collapsed' : ''
      }`}
    >
      <div className="brand-block">
        <div className="brand-mark">
          <BarChart3 size={22} />
        </div>

        {!collapsed && (
          <div>
            <strong>
              NEXUS ERP
            </strong>

            <span>
              Store Intelligence Suite
            </span>
          </div>
        )}
      </div>

      <nav className="sidebar-nav">
        {groups.map((group) => {
          const allowedItems =
            group.items.filter(
              (item) =>
                canAccessPage(
                  user,
                  item.id,
                )
            );

          if (
            allowedItems.length === 0
          ) {
            return null;
          }

          return (
            <div
              className="nav-group"
              key={group.label}
            >
              {!collapsed && (
                <span className="nav-group-label">
                  {group.label}
                </span>
              )}

              {allowedItems.map(
                (item) => {
                  const Icon =
                    item.icon;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`nav-item ${
                        activePage ===
                        item.id
                          ? 'active'
                          : ''
                      }`}
                      onClick={() =>
                        onNavigate(
                          item.id
                        )
                      }
                      title={
                        collapsed
                          ? item.label
                          : undefined
                      }
                    >
                      <Icon size={18} />

                      {!collapsed && (
                        <span>
                          {item.label}
                        </span>
                      )}

                      {!collapsed &&
                        activePage ===
                          item.id && (
                          <ChevronLeft
                            size={15}
                            className="nav-chevron"
                          />
                        )}
                    </button>
                  );
                }
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="system-health">
            <CircleDollarSign
              size={18}
            />

            <div>
              <strong>
                سیستم عملیاتی
              </strong>

              <span>
                متصل به Django API
              </span>
            </div>
          </div>
        )}

        <button
          className="collapse-button"
          type="button"
          onClick={onToggle}
          title="جمع‌کردن منو"
        >
          <ChevronLeft
            size={18}
            className={
              collapsed
                ? 'rotate-180'
                : ''
            }
          />
        </button>
      </div>
    </aside>
  );
}