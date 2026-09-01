import { apiRequest } from './client';


export function getPurchases() {
  return apiRequest(
    '/procurement/purchases/'
  );
}


export function createPurchase(payload) {
  return apiRequest(
    '/procurement/purchases/',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  );
}