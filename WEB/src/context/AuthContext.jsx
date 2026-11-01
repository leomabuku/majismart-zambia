import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const USER_CACHE_KEY = 'majismart_user';

function readCachedUser() {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function cacheUser(user) {
  if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_CACHE_KEY);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const bootstrapped = useRef(false);

  // Restore the last known session. A cached profile is shown immediately so a
  // cold-starting free-tier API does not look like a logout, then /auth/me
  // confirms it in the background.
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;

    const token = api.getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    const cached = readCachedUser();
    if (cached) setUser(cached);

    api.get('/auth/me')
      .then((res) => {
        if (res.success && res.user) {
          setUser(res.user);
          cacheUser(res.user);
          return;
        }
        // Only a definitive rejection ends the session; a network error or a
        // sleeping server keeps the cached profile.
        if (res.status === 401 || res.status === 403) {
          api.setToken(null);
          cacheUser(null);
          setUser(null);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const applySession = useCallback((res) => {
    if (res?.success && res.token) {
      api.setToken(res.token);
      setUser(res.user);
      cacheUser(res.user);
      return { success: true, user: res.user };
    }
    return { success: false, error: res?.error || 'Sign-in failed' };
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    return applySession(res);
  }, [applySession]);

  /** Exchange a Google ID token (from Google Identity Services) for a session. */
  const loginWithGoogle = useCallback(async (credential) => {
    const res = await api.post('/auth/google', { credential });
    return applySession(res);
  }, [applySession]);

  const register = useCallback(async (payload) => {
    const res = await api.post('/auth/register', payload);
    return applySession(res);
  }, [applySession]);

  const logout = useCallback(() => {
    // Stateless JWT: the server is told for the audit trail, the token is dropped
    // here, and Google is asked not to auto-select the account next time.
    api.post('/auth/logout', {}).catch(() => {});
    api.setToken(null);
    cacheUser(null);
    setUser(null);
    try {
      window.google?.accounts?.id?.disableAutoSelect();
    } catch {
      // GIS not loaded — nothing to clear.
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        loginWithGoogle,
        register,
        logout,
        isAdmin: user?.role === 'admin'
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
