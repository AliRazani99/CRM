import {
    createContext,
    useContext,
    useEffect,
    useState,
  } from 'react';
  
  import {
    getMe,
    loginApi,
    logoutApi,
  } from '../api/auth';
  
  import {
    clearApiToken,
    getApiToken,
  } from '../api/client';
  
  
  const AuthContext = createContext(null);
  
  
  export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
  
    const loadCurrentUser = async () => {
      try {
        const currentUser = await getMe();
        setUser(currentUser);
        return currentUser;
      } catch {
        clearApiToken();
        setUser(null);
        return null;
      }
    };
  
    useEffect(() => {
      async function initialize() {
        if (getApiToken()) {
          await loadCurrentUser();
        }
  
        setLoading(false);
      }
  
      initialize();
    }, []);
  
    useEffect(() => {
      const handleExpired = () => {
        setUser(null);
      };
  
      window.addEventListener(
        'nexus-auth-expired',
        handleExpired,
      );
  
      return () => {
        window.removeEventListener(
          'nexus-auth-expired',
          handleExpired,
        );
      };
    }, []);
  
    const login = async (
      username,
      password,
    ) => {
      await loginApi(
        username,
        password,
      );
  
      return loadCurrentUser();
    };
  
    const logout = async () => {
      await logoutApi();
      setUser(null);
    };
  
    return (
      <AuthContext.Provider
        value={{
          user,
          loading,
          authenticated: Boolean(user),
          login,
          logout,
        }}
      >
        {children}
      </AuthContext.Provider>
    );
  }
  
  
  export function useAuth() {
    const context = useContext(AuthContext);
  
    if (!context) {
      throw new Error(
        'useAuth must be used within AuthProvider'
      );
    }
  
    return context;
  }