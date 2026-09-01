import {
    apiRequest,
  } from './client';
  
  
  export function getCurrencyExchanges() {
    return apiRequest(
      '/finance/exchanges/'
    );
  }
  
  
  export function createCurrencyExchange(
    payload,
  ) {
    return apiRequest(
      '/finance/exchanges/',
      {
        method: 'POST',
  
        body: JSON.stringify(
          payload
        ),
      },
    );
  }
  
  
  export function getAccountTransactions() {
    return apiRequest(
      '/finance/transactions/'
    );
  }