const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  'http://127.0.0.1:8000/api';

const TOKEN_KEY = 'nexus-erp-token';


export function getApiToken() {
  return localStorage.getItem(TOKEN_KEY);
}


export function setApiToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}


export function clearApiToken() {
  localStorage.removeItem(TOKEN_KEY);
}


export async function apiRequest(endpoint, options = {}) {
  const {
    skipAuth = false,
    headers = {},
    ...fetchOptions
  } = options;

  const token = getApiToken();

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',

      ...(
        token && !skipAuth
          ? { Authorization: `Token ${token}` }
          : {}
      ),

      ...headers,
    },
  });

  if (!response.ok) {
    let errorMessage =
      `API request failed: ${response.status}`;
  
    try {
      const errorData =
        await response.json();
  
      if (errorData?.detail) {
        errorMessage =
          errorData.detail;
      } else if (
        errorData &&
        typeof errorData === 'object'
      ) {
        const messages =
          Object.entries(errorData)
            .flatMap(([field, errors]) => {
              const values =
                Array.isArray(errors)
                  ? errors
                  : [errors];
  
              return values.map(
                (message) =>
                  `${field}: ${message}`
              );
            });
  
        if (messages.length) {
          errorMessage =
            messages.join(' | ');
        }
      }
    } catch {
      // response had no JSON body
    }
  
    if (
      response.status === 401 &&
      !skipAuth
    ) {
      clearApiToken();
  
      window.dispatchEvent(
        new Event(
          'nexus-auth-expired'
        ),
      );
    }
  
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}