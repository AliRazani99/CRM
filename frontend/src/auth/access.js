export const ROLE = {
    STORE_MANAGER: 'STORE_MANAGER',
    SALES_MANAGER: 'SALES_MANAGER',
    PURCHASE_MANAGER: 'PURCHASE_MANAGER',
  };
  
  
  export const PAGE_ACCESS = {
    dashboard: [
      ROLE.STORE_MANAGER,
    ],
  
    users: [
      ROLE.STORE_MANAGER,
    ],
  
    sales: [
      ROLE.STORE_MANAGER,
      ROLE.SALES_MANAGER,
    ],
  
    customers: [
      ROLE.STORE_MANAGER,
      ROLE.SALES_MANAGER,
    ],
  
    purchases: [
      ROLE.STORE_MANAGER,
      ROLE.PURCHASE_MANAGER,
    ],
  
    suppliers: [
      ROLE.STORE_MANAGER,
      ROLE.PURCHASE_MANAGER,
    ],
  
    inventory: [
      ROLE.STORE_MANAGER,
      ROLE.SALES_MANAGER,
      ROLE.PURCHASE_MANAGER,
    ],
  
    finance: [
      ROLE.STORE_MANAGER,
    ],
  
    exchange: [
      ROLE.STORE_MANAGER,
    ],
  };
  
  
  export function canAccessPage(
    user,
    pageId,
  ) {
    if (!user) return false;
  
    return (
      PAGE_ACCESS[pageId]?.includes(
        user.role_code
      ) ?? false
    );
  }
  
  
  export function getDefaultPage(user) {
    switch (user?.role_code) {
      case ROLE.SALES_MANAGER:
        return 'sales';
  
      case ROLE.PURCHASE_MANAGER:
        return 'purchases';
  
      default:
        return 'dashboard';
    }
  }