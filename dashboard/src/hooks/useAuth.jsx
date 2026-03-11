import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import posthog from 'posthog-js';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const apiKey = localStorage.getItem('apiKey');
    if (apiKey) {
      // Safety timeout: never stay loading forever
      const safetyTimer = setTimeout(() => {
        console.warn('[Auth] Safety timeout — forcing loading=false');
        setLoading(false);
      }, 5000);

      api.checkSubscription()
        .then(data => {
          if (data.active) {
            setUser({ email: data.email, status: data.status, isPaid: data.isPaid, apiKey });
            posthog.identify(data.email, { plan: data.status });
          } else {
            localStorage.removeItem('apiKey');
          }
        })
        .catch(() => localStorage.removeItem('apiKey'))
        .finally(() => {
          clearTimeout(safetyTimer);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback((apiKey, email, status = 'active') => {
    localStorage.setItem('apiKey', apiKey);
    setUser({ email, apiKey, status, isPaid: status === 'active' });
    posthog.identify(email, { plan: status });
    posthog.capture('user_logged_in');
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('apiKey');
    setUser(null);
    posthog.reset();
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
