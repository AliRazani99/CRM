import {
    apiRequest,
    clearApiToken,
    setApiToken,
  } from './client';
  
  
  export async function loginApi(
    username,
    password,
  ) {
    const response = await apiRequest(
      '/auth/token/',
      {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          username,
          password,
        }),
      },
    );
  
    setApiToken(response.token);
  
    return response;
  }
  
  
  export function getMe() {
    return apiRequest('/auth/me/');
  }
  
  
  export async function logoutApi() {
    try {
      await apiRequest(
        '/auth/logout/',
        {
          method: 'POST',
        },
      );
    } finally {
      clearApiToken();
    }
  }
  
  
  export function getUsers() {
    return apiRequest('/auth/users/');
  }
  
  
  export function getRoles() {
    return apiRequest('/auth/roles/');
  }
  
  
  export function createUser(payload) {
    return apiRequest(
      '/auth/users/',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  }
  
  
  export function updateUser(
    userId,
    payload,
  ) {
    return apiRequest(
      `/auth/users/${userId}/`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  }
  
  
  export function setUserPassword(
    userId,
    password,
  ) {
    return apiRequest(
      `/auth/users/${userId}/set-password/`,
      {
        method: 'POST',
        body: JSON.stringify({
          password,
        }),
      },
    );
  }
  export function deleteUser(userId) {
    return apiRequest(
      `/auth/users/${userId}/`,
      {
        method: 'DELETE',
      },
    );
  }