import { createContext, useContext, useEffect, useState, useRef } from 'react';
import api, { setAuthToken } from '../lib/api';
import { parseJwt, LS_TOKEN_KEY, LS_ROLE_KEY, LS_USERNAME_KEY } from '../lib/authHelpers';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialize synchronously from localStorage to avoid a render flash that redirects to /login
  const [user, setUser] = useState(() => {
    try {
      const t = localStorage.getItem(LS_TOKEN_KEY);
      const role = localStorage.getItem(LS_ROLE_KEY);
      const username = localStorage.getItem(LS_USERNAME_KEY);
      if (t) {
        // ensure api wrapper has token immediately
        setAuthToken(t);
        return { token: t, role: role || null, username: username || null };
      }
    } catch {
      // ignore
    }
    return null;
  });
  const [reauthRequired, setReauthRequired] = useState(false);
  const refreshTimerRef = useRef(null);
  const lastRefreshAttemptRef = useRef(0);

  // parseJwt moved to src/lib/authHelpers.js
  async function attemptRefresh() {
    // Don't attempt refresh if we're already refreshing or if reauth is required
    if (reauthRequired) return false;

    // Throttle refresh attempts to prevent spam
    const now = Date.now();
    if (now - lastRefreshAttemptRef.current < 5000) { // 5 second minimum between attempts
      return false;
    }
    lastRefreshAttemptRef.current = now;

    try {
      // call refresh endpoint; refresh token is sent via HttpOnly cookie
      const res = await api.post('/token/refresh', {});
      if (res && res.token) {
        setAuthToken(res.token);
        localStorage.setItem('ITnvend_role', res.role);
        localStorage.setItem('ITnvend_username', res.username || localStorage.getItem('ITnvend_username'));
        setUser((u) => ({ token: res.token, role: res.role, username: res.username || (u && u.username) || localStorage.getItem('ITnvend_username') }));
        setReauthRequired(false);
        scheduleRefresh();
        return true;
      }
    } catch (err) {
      // Only log if it's not a common 401 (which happens when no refresh token exists)
      if (err?.status !== 401) {
        console.warn('Refresh failed', err?.message || err);
        try {
          const body = await err?.response?.json?.();
          console.warn('Refresh response body:', body);
        } catch { /* ignore */ }
      }
    }
    setReauthRequired(true);
    return false;
  }

  function scheduleRefresh() {
    try {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

      const t = localStorage.getItem(LS_TOKEN_KEY);
      if (!t) return;

      const payload = parseJwt(t);
      if (!payload || !payload.exp) return;

      const expiresAt = payload.exp * 1000;
      const now = Date.now();

      // If token is already expired, don't schedule refresh
      if (expiresAt <= now) {
        setReauthRequired(true);
        return;
      }

      const msUntil = expiresAt - now;

      // schedule refresh when token has < 24 hours remaining, or at half the remaining time if shorter
      const threshold = 24 * 60 * 60 * 1000;
      const when = msUntil - threshold > 0 ? msUntil - threshold : Math.max(60 * 60 * 1000, Math.floor(msUntil / 2)); // Minimum 1 hour

      // Don't schedule if the refresh time is too soon (less than 1 hour)
      if (when < 60 * 60 * 1000) {
        setReauthRequired(true);
        return;
      }

      refreshTimerRef.current = setTimeout(() => {
        attemptRefresh();
      }, when);
    } catch {
      // ignore
      setReauthRequired(true);
    }
  }

  async function login(username, password) {
    const res = await api.post('/login', { username, password });
    // res contains { token, role }
    setAuthToken(res.token);
    localStorage.setItem(LS_ROLE_KEY, res.role);
    localStorage.setItem(LS_USERNAME_KEY, username);
    // token is also stored by setAuthToken helper
    setUser({ token: res.token, role: res.role, username });
    setReauthRequired(false);
    scheduleRefresh();
    return res;
  }

  // Switch to a different user token (impersonation)
  function switchUser(token, role, username) {
    setAuthToken(token);
    if (role) localStorage.setItem(LS_ROLE_KEY, role);
    if (username) localStorage.setItem(LS_USERNAME_KEY, username);
    // switch may also include a refresh token stored by caller
    // refresh token is stored as HttpOnly cookie set by server on impersonation/login
    setUser({ token, role, username });
    scheduleRefresh();
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem(LS_ROLE_KEY);
    localStorage.removeItem(LS_USERNAME_KEY);
    // clear refresh token cookie server-side
    try { api.post('/token/logout'); } catch { /* ignore */ }
    setUser(null);
  }

  // expose switch helper on window for quick invocation from other pages
  useEffect(() => {
    window.__ITNVEND_SWITCH_USER__ = switchUser;
    return () => { try { delete window.__ITNVEND_SWITCH_USER__; } catch { /* ignore */ } };
  }, []);

  // schedule refresh when AuthProvider mounts
  useEffect(() => {
    // Only try to refresh if we have a potentially valid token or refresh cookies
    const hasToken = localStorage.getItem(LS_TOKEN_KEY);
    const hasRefreshCookie = typeof document !== 'undefined' &&
      (document.cookie.includes('ITnvend_refresh=') || document.cookie.includes('irnvend_refresh='));

    if (hasToken) {
      // We have a token, schedule refresh based on its expiration
      scheduleRefresh();
    } else if (hasRefreshCookie && !user) {
      // We have refresh cookies but no user, try one refresh attempt
      attemptRefresh();
    }

    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, switchUser, reauthRequired, attemptRefresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// This hook is consumed across the app; exporting it alongside the provider is intentional.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
