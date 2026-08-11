import { Bell, RotateCcw, Search, UserRound } from 'lucide-react';
import { useERP } from '../context/ERPContext';
import { formatCAD, formatCompactToman } from '../utils/formatters';

export default function Topbar({ title, onReset }) {
  const { accounts, metrics } = useERP();

  return (
    <header className="topbar">
      <div className="topbar-title">
        <span>فضای کاری فروشگاه</span>
        <strong>{title}</strong>
      </div>

      <div className="topbar-center">
        <Search size={16} />
        <input placeholder="جست‌وجوی سریع در محصول، مشتری یا فاکتور..." aria-label="جست‌وجوی سریع" />
        <kbd>⌘ K</kbd>
      </div>

      <div className="topbar-actions">
        <div className="topbar-balance desktop-only">
          <span>ریالی</span>
          <strong>{formatCompactToman(accounts.irrBalance)}</strong>
        </div>
        <div className="topbar-balance desktop-only">
          <span>ارزی</span>
          <strong>{formatCAD(accounts.cadBalance)}</strong>
        </div>
        <button className="icon-button" type="button" title="بازنشانی داده نمونه" onClick={onReset}>
          <RotateCcw size={17} />
        </button>
        <button className="icon-button has-dot" type="button" title={`${metrics.lowStockCount} هشدار موجودی`}>
          <Bell size={18} />
        </button>
        <button className="user-chip" type="button">
          <div><UserRound size={17} /></div>
          <span className="desktop-only">مدیر فروشگاه</span>
        </button>
      </div>
    </header>
  );
}
