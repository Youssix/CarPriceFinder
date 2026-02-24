import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
      api.checkSubscription()
        .then(data => {
          if (data.active) {
            setUser({ email: data.email, status: data.status, apiKey });
          } else {
            localStorage.removeItem('apiKey');
          }
        })
        .catch(() => localStorage.removeItem('apiKey'))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((apiKey, email) => {
    localStorage.setItem('apiKey', apiKey);
    setUser({ email, apiKey, status: 'active' });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('apiKey');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
