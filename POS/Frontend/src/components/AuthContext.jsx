import { createContext, useContext, useEffect, useState, useRef } from 'react';
import api, { setAuthToken } from '../lib/api';
import { parseJwt, LS_TOKEN_KEY, LS_ROLE_KEY, LS_USERNAME_KEY, LS_REFRESH_KEY } from '../lib/authHelpers';

const REFRESH_LEAD_MS = 6 * 60 * 60 * 1000; // refresh 6h before expiry
const MIN_REFRESH_DELAY_MS = 15 * 60 * 1000; // never schedule sooner than 15m to avoid thrash
const MAX_TIMER_MS = 0x7fffffff - 1000; // clamp to setTimeout limit (~24.8d)

const hasRefreshCookie = () => {
  if (typeof document === 'undefined') return false;
  const cookies = document.cookie || '';
  return cookies.includes('ITnvend_refresh=') || cookies.includes('irnvend_refresh=');
};

const getStoredRefreshToken = () => {
  try {
    return localStorage.getItem(LS_REFRESH_KEY);
  } catch (err) {
    console.warn('Failed to read refresh token from storage', err);
    return null;
  }
};

const persistRefreshToken = (value) => {
  try {
    if (value) {
      localStorage.setItem(LS_REFRESH_KEY, value);
    } else {
      localStorage.removeItem(LS_REFRESH_KEY);
    }
  } catch (err) {
    console.warn('Failed to persist refresh token', err);
  }
};

const getTokenExpiryTimestamp = () => {
  try {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    if (!token) return null;
    const payload = parseJwt(token);
    if (!payload?.exp) return null;
    return payload.exp * 1000;
  } catch (err) {
    console.warn('Failed to read token expiry', err);
    return null;
  }
};

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
    } catch (storageErr) {
      console.warn('Failed to bootstrap auth state from storage', storageErr);
    }
    return null;
  });
  const [reauthRequired, setReauthRequired] = useState(false);
  const refreshTimerRef = useRef(null);
  const attemptRefreshRef = useRef(null);
  const refreshInFlightRef = useRef(null);
  const lastRefreshAttemptRef = useRef(0);
  attemptRefreshRef.current = attemptRefresh;

  async function attemptRefresh({ force = false } = {}) {
    if (!force && reauthRequired) return false;
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    const now = Date.now();
    if (!force && now - lastRefreshAttemptRef.current < 5000) {
      return false;
    }
    lastRefreshAttemptRef.current = now;

    const refreshPromise = (async () => {
      try {
        const storedRefresh = getStoredRefreshToken();
        const payload = storedRefresh ? { refreshToken: storedRefresh } : {};
        const res = await api.post('/token/refresh', payload);
        if (res?.token) {
          setAuthToken(res.token);
          localStorage.setItem(LS_ROLE_KEY, res.role);
          localStorage.setItem(LS_USERNAME_KEY, res.username || localStorage.getItem(LS_USERNAME_KEY));
          setUser((u) => ({
            token: res.token,
            role: res.role,
            username: res.username || u?.username || localStorage.getItem(LS_USERNAME_KEY),
          }));
          if (res.refreshToken) persistRefreshToken(res.refreshToken);
          setReauthRequired(false);
          scheduleRefresh();
          return true;
        }
      } catch (err) {
        if (err?.status !== 401) {
          console.warn('Refresh failed', err?.message || err);
          try {
            const body = await err?.response?.json?.();
            if (body) console.warn('Refresh response body:', body);
          } catch (parseErr) {
            console.debug('No JSON body available for refresh failure', parseErr);
          }
        } else {
          persistRefreshToken(null);
        }
      }
      setReauthRequired(true);
      return false;
    })();

    refreshInFlightRef.current = refreshPromise.finally(() => {
      refreshInFlightRef.current = null;
    });

    return refreshPromise;
  }

  function scheduleRefresh(forceCheck = false) {
    try {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);

      const expiresAt = getTokenExpiryTimestamp();
      if (!expiresAt) return;

      const now = Date.now();
      const msUntilExpiry = expiresAt - now;

      if (msUntilExpiry <= 0) {
        attemptRefresh({ force: true });
        return;
      }

      if (forceCheck || msUntilExpiry <= REFRESH_LEAD_MS) {
        attemptRefresh({ force: true });
        return;
      }

      const delay = Math.min(
        Math.max(msUntilExpiry - REFRESH_LEAD_MS, MIN_REFRESH_DELAY_MS),
        MAX_TIMER_MS
      );

      refreshTimerRef.current = setTimeout(() => {
        attemptRefresh({ force: true });
      }, delay);
    } catch (scheduleErr) {
      console.warn('Failed to schedule auth token refresh', scheduleErr);
    }
  }

  async function login(username, password, remember = false) {
    void remember; // parameter reserved for future use (e.g., extended persistence toggles)
    const res = await api.post('/login', { username, password });
    // res contains { token, role }
    setAuthToken(res.token);
    localStorage.setItem(LS_ROLE_KEY, res.role);
    localStorage.setItem(LS_USERNAME_KEY, username);
    persistRefreshToken(res.refreshToken || null);
    // token is also stored by setAuthToken helper
    setUser({ token: res.token, role: res.role, username });
    setReauthRequired(false);
    scheduleRefresh();
    return res;
  }

  // Switch to a different user token (impersonation)
  function switchUser(token, role, username, refreshToken = null) {
    setAuthToken(token);
    if (role) localStorage.setItem(LS_ROLE_KEY, role);
    if (username) localStorage.setItem(LS_USERNAME_KEY, username);
    if (refreshToken) persistRefreshToken(refreshToken);
    setUser({ token, role, username });
    scheduleRefresh();
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem(LS_ROLE_KEY);
    localStorage.removeItem(LS_USERNAME_KEY);
    persistRefreshToken(null);
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    // clear refresh token cookie server-side
    try { api.post('/token/logout'); } catch (logoutErr) { console.warn('Failed to revoke refresh token cookie', logoutErr); }
    setUser(null);
    setReauthRequired(false);
  }

  // expose switch helper on window for quick invocation from other pages
  useEffect(() => {
    window.__ITNVEND_SWITCH_USER__ = switchUser;
    return () => { try { delete window.__ITNVEND_SWITCH_USER__; } catch (cleanupErr) { console.debug('Failed to cleanup switch helper', cleanupErr); } };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- switchUser identity is stable enough and reassigning every render is unnecessary
  }, []);

  // schedule refresh when AuthProvider mounts
  useEffect(() => {
    const token = localStorage.getItem(LS_TOKEN_KEY);
    if (token) {
      scheduleRefresh();
      const expiresAt = getTokenExpiryTimestamp();
      if (expiresAt && expiresAt - Date.now() <= REFRESH_LEAD_MS) {
        attemptRefresh({ force: true });
      }
    } else if ((hasRefreshCookie() || getStoredRefreshToken()) && !user) {
      attemptRefresh({ force: true });
    }

    return () => { if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- scheduleRefresh/attemptRefresh references would cause unnecessary re-runs that reset timers constantly
  }, []);

  useEffect(() => {
    const handleFocus = () => {
      const expiresAt = getTokenExpiryTimestamp();
      if (expiresAt && expiresAt - Date.now() <= REFRESH_LEAD_MS) {
        attemptRefreshRef.current?.({ force: true });
      }
    };
    const handleVisibility = () => {
      if (document.hidden) return;
      handleFocus();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
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
