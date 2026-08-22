import {
  useEffect,
  useState,
} from 'react';

import {
  AuthProvider,
  useAuth,
} from './context/AuthContext';

import {
  ERPProvider,
} from './context/ERPContext';

import AuthGate from './components/AuthGate';

import MainLayout from './layout/MainLayout';

import DashboardPage from './pages/DashboardPage';
import SalesPage from './pages/SalesPage';
import PurchasesPage from './pages/PurchasesPage';
import InventoryPage from './pages/InventoryPage';
import CustomersPage from './pages/CustomersPage';
import SuppliersPage from './pages/SuppliersPage';
import ExchangePage from './pages/ExchangePage';
import FinancePage from './pages/FinancePage';
import UsersPage from './pages/UsersPage';

import {
  canAccessPage,
  getDefaultPage,
} from './auth/access';


const pages = {
  dashboard: DashboardPage,
  users: UsersPage,
  sales: SalesPage,
  purchases: PurchasesPage,
  inventory: InventoryPage,
  customers: CustomersPage,
  suppliers: SuppliersPage,
  exchange: ExchangePage,
  finance: FinancePage,
};


function ERPApp() {
  const { user } = useAuth();

  const [activePage, setActivePage] =
    useState(() =>
      getDefaultPage(user)
    );


  useEffect(() => {
    if (
      !canAccessPage(
        user,
        activePage,
      )
    ) {
      setActivePage(
        getDefaultPage(user)
      );
    }
  }, [
    user,
    activePage,
  ]);


  const navigate = (pageId) => {
    if (
      canAccessPage(
        user,
        pageId,
      )
    ) {
      setActivePage(pageId);
    }
  };


  const Page =
    pages[activePage] ||
    pages[getDefaultPage(user)];


  return (
    <MainLayout
      activePage={activePage}
      onNavigate={navigate}
    >
      <Page
        onNavigate={navigate}
      />
    </MainLayout>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <AuthGate>
        <ERPProvider>
          <ERPApp />
        </ERPProvider>
      </AuthGate>
    </AuthProvider>
  );
}