import {
  apiRequest,
} from './client';


export function getCustomers() {
  return apiRequest(
    '/customers/'
  );
}


function customerToApiPayload(customer) {
  return {
    full_name: customer.name.trim(),
    phone: (customer.phone ?? '').trim(),
    email: (customer.email ?? '').trim(),
    instagram_handle: (customer.instagram ?? '').trim(),
    birth_date: customer.birthDate || null,
    postal_code: (customer.postalCode ?? '').trim(),
    address: (customer.address ?? '').trim(),
  };
}

export function createCustomer(customer) {
  return apiRequest('/customers/', {
    method: 'POST',
    body: JSON.stringify(
      customerToApiPayload(customer),
    ),
  });
}

export function updateCustomer(customerId, customer) {
  return apiRequest(`/customers/${customerId}/`, {
    method: 'PATCH',
    body: JSON.stringify(
      customerToApiPayload(customer),
    ),
  });
}


export function getSuppliers() {
  return apiRequest(
    '/suppliers/'
  );
}


export function createSupplier(
  supplier,
) {
  return apiRequest(
    '/suppliers/',
    {
      method: 'POST',

      body: JSON.stringify({
        name:
          supplier.name.trim(),

        country:
          supplier.country.trim(),

        phone:
          supplier.phone.trim(),

        email:
          supplier.email.trim(),
      }),
    },
  );
}


export function getFinancialAccounts() {
  return apiRequest(
    '/financial-accounts/'
  );
}


export function createFinancialAccount(
  payload,
) {
  return apiRequest(
    '/financial-accounts/',
    {
      method: 'POST',

      body: JSON.stringify(
        payload
      ),
    },
  );
}


export function updateFinancialAccount(
  accountId,
  payload,
) {
  return apiRequest(
    `/financial-accounts/${accountId}/`,
    {
      method: 'PATCH',

      body: JSON.stringify(
        payload
      ),
    },
  );
}