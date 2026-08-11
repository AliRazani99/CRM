import { useState } from 'react';
import { ERPProvider } from './context/ERPContext';
import MainLayout from './layout/MainLayout';
import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import PurchasesPage from './pages/PurchasesPage';
import InventoryPage from './pages/InventoryPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ExchangePage from './pages/ExchangePage';
import FinancePage from './pages/FinancePage';

const pages = {
  dashboard: DashboardPage,
  sales: SalesPage,
  purchases: PurchasesPage,
  inventory: InventoryPage,
  customers: CustomersPage,
  suppliers: SuppliersPage,
  exchange: ExchangePage,
  finance: FinancePage,
};

function ERPApp() {
  const [activePage, setActivePage] = useState('dashboard');
  const Page = pages[activePage] ?? DashboardPage;

  return (
    <MainLayout activePage={activePage} onNavigate={setActivePage}>
      <Page onNavigate={setActivePage} />
    </MainLayout>
  );
}

export default function App() {
  return (
    <ERPProvider>
      <ERPApp />
    </ERPProvider>
  );
}
