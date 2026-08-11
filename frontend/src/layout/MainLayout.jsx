import { useMemo, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useERP } from '../context/ERPContext';

const pageTitles = {
  dashboard: 'داشبورد هوش تجاری',
  sales: 'فروش و صدور فاکتور',
  purchases: 'خرید و بهای تمام‌شده',
  inventory: 'مدیریت انبار و کالا',
  customers: 'مشتریان و مطالبات',
  suppliers: 'تأمین‌کنندگان',
  exchange: 'تبدیل ارز',
  finance: 'حساب‌ها و گردش مالی',
};

export default function MainLayout({ activePage, onNavigate, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const { resetDemo } = useERP();
  const title = useMemo(() => pageTitles[activePage] ?? 'NEXUS ERP', [activePage]);

  const handleReset = () => {
    const shouldReset = window.confirm('تمام تغییرات محلی حذف و داده‌های نمونه بازیابی شوند؟');
    if (shouldReset) resetDemo();
  };

  return (
    <div className="app-shell" dir="rtl">
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
      />
      <div className="app-main">
        <Topbar title={title} onReset={handleReset} />
        <main className="page-container">{children}</main>
      </div>
    </div>
  );
}
