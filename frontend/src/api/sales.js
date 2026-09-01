import {
  apiRequest,
} from './client';


export function getSales() {
  return apiRequest(
    '/sales/sales/'
  );
}


export function createSale(payload) {
  return apiRequest(
    '/sales/sales/',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}


export function settleCustomerDebtApi(
  payload,
) {
  return apiRequest(
    '/sales/payments/settle-customer/',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}