import { apiRequest } from './client';


export function getCustomers() {
  return apiRequest('/customers/');
}


export function createCustomer(customer) {
  return apiRequest('/customers/', {
    method: 'POST',
    body: JSON.stringify({
      full_name: customer.name.trim(),
      phone: customer.phone.trim(),
      instagram_handle: customer.instagram.trim(),
      postal_code: customer.postalCode.trim(),
      address: customer.address.trim(),
    }),
  });
}

export function getSuppliers() {
  return apiRequest('/suppliers/');
}


export function createSupplier(supplier) {
  return apiRequest('/suppliers/', {
    method: 'POST',
    body: JSON.stringify({
      name: supplier.name.trim(),
      country: supplier.country.trim(),
      phone: supplier.phone.trim(),
      email: supplier.email.trim(),
    }),
  });
}