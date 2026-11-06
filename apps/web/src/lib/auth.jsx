// Utilisateur connecté et pages privées.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { api, bootstrap, setCsrfToken, setUnauthorizedHandler } from './api.js';
import { Loading } from '../components/ui.jsx';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, error: null });

  useEffect(() => {
    setUnauthorizedHandler(() => setState((s) => ({ ...s, user: null })));
    bootstrap()
      .then(({ user }) => setState({ loading: false, user, error: null }))
      .catch((error) => setState({ loading: false, user: null, error }));
  }, []);

  const signedIn = useCallback(({ user, csrfToken }) => {
    setCsrfToken(csrfToken);
    setState({ loading: false, user, error: null });
  }, []);

  const setUser = useCallback((user) => setState((s) => ({ ...s, user })), []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setCsrfToken(null);
    setState({ loading: false, user: null, error: null });
  }, []);

  const value = useMemo(() => ({ ...state, signedIn, setUser, logout }), [state, signedIn, setUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({ children, admin = false }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to={`/connexion?retour=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && user.role !== 'ADMIN') return <Navigate to="/" replace />;
  return children;
}
