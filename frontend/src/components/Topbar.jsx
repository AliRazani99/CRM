import {
  Bell,
  LogOut,
  RotateCcw,
  Search,
  UserRound,
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
  formatCAD,
  formatCompactToman,
} from '../utils/formatters';


export default function Topbar({
  title,
  onReset,
}) {
  const {
    accounts,
    metrics,
  } = useERP();

  const {
    user,
    logout,
  } = useAuth();


  const isStoreManager =
    user?.role_code ===
    ROLE.STORE_MANAGER;


  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error(
        'Logout failed:',
        error,
      );
    }
  };


  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>
          فضای کاری فروشگاه
        </span>

        <strong>
          {title}
        </strong>
      </div>

      <div className="topbar-center">
        <Search size={16} />

        <input
          placeholder="جست‌وجوی سریع..."
          aria-label="جست‌وجوی سریع"
        />

        <kbd>⌘ K</kbd>
      </div>

      <div className="topbar-actions">
        {isStoreManager && (
          <>
            <div className="topbar-balance desktop-only">
              <span>ریالی</span>

              <strong>
                {formatCompactToman(
                  accounts.irrBalance
                )}
              </strong>
            </div>

            <div className="topbar-balance desktop-only">
              <span>ارزی</span>

              <strong>
                {formatCAD(
                  accounts.cadBalance
                )}
              </strong>
            </div>
          </>
        )}

        {isStoreManager && (
          <button
            className="icon-button"
            type="button"
            title="بازنشانی داده نمونه"
            onClick={onReset}
          >
            <RotateCcw size={17} />
          </button>
        )}

        <button
          className="icon-button has-dot"
          type="button"
          title={`${metrics.lowStockCount} هشدار موجودی`}
        >
          <Bell size={18} />
        </button>

        <div className="user-chip">
          <div>
            <UserRound size={17} />
          </div>

          <span className="desktop-only">
            {user?.full_name ||
              user?.username ||
              'کاربر'}

            {' — '}

            {user?.role_name ||
              'بدون سمت'}
          </span>
        </div>

        <button
          className="icon-button"
          type="button"
          title="خروج از حساب"
          onClick={handleLogout}
        >
          <LogOut size={17} />
        </button>
      </div>
    </header>
  );
}