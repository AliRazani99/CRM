import {
  useEffect,
  useState,
} from 'react';

import SaleInvoicePage from './pages/SaleInvoicePage';

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
  saleInvoice: SaleInvoicePage,
};


function ERPApp() {
  const { user } = useAuth();

  const [activePage, setActivePage] =
    useState(() =>
      getDefaultPage(user)
    );
    const [
      selectedData,
      setSelectedData
     ] = useState(null);

     useEffect(() => {

      if (
        activePage === "saleInvoice"
      ) {
        return;
      }
    
    
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


  const navigate = (
    pageId,
    payload=null
  ) => {
  
    console.log(
      "NAVIGATE",
      pageId,
      payload
    );
  
    setActivePage(pageId);
    setSelectedData(payload);
  
  };


  const Page =
    pages[activePage] ||
    pages[getDefaultPage(user)];
    

    console.log(
      "ACTIVE PAGE:",
      activePage,
      "COMPONENT:",
      Page?.name
    );

  return (
    <MainLayout
      activePage={activePage}
      onNavigate={navigate}
    >
      <Page
      onNavigate={navigate}
      sale={selectedData}
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