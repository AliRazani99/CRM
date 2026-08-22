import { apiRequest } from './client';


export function getProducts() {
  return apiRequest('/products/');
}


export function createProduct(payload) {
  return apiRequest('/products/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}


export function getCategories() {
  return apiRequest('/categories/');
}


export function getBrands() {
  return apiRequest('/brands/');
}