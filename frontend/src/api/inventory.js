import { apiRequest } from './client';


export function getWarehouses() {
  return apiRequest('/warehouses/');
}
export function createWarehouse(payload) {
  return apiRequest('/warehouses/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getInventory() {
  return apiRequest('/inventory/');
}


export function getStockMovements() {
  return apiRequest('/stock-movements/');
}


export function getStockTransfers() {
  return apiRequest('/stock-transfers/');
}


export function createStockTransfer(payload) {
  return apiRequest('/stock-transfers/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}