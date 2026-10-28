import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if token exists and fetch user profile
    const token = api.getToken();
    if (token) {
      api.get('/auth/me')
        .then(res => {
          if (res.success) {
            setUser(res.user);
          } else {
            api.setToken(null);
          }
        })
        .catch(() => api.setToken(null))
        .finally(() => setLoading(false));
    } else if (import.meta.env.DEV) {
      login('admin@majismart.zm', 'AdminPassword2026!').finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    if (res.success) {
      api.setToken(res.token);
      setUser(res.user);
      return { success: true };
    }
    return { success: false, error: res.error };
  };

  const logout = () => {
    api.setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
