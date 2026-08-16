import { apiRequest } from './client';


export function getCustomers() {
  return apiRequest('/customers/');
}