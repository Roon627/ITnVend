import { createContext, useContext, useEffect, useState } from 'react';
import api, { setAuthToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Initialize synchronously from localStorage to avoid a render flash that redirects to /login
  const [user, setUser] = useState(() => {
    try {
      const t = localStorage.getItem('irnvend_token');
      const role = localStorage.getItem('irnvend_role');
      const username = localStorage.getItem('irnvend_username');
      if (t) {
        // ensure api wrapper has token immediately
        setAuthToken(t);
        return { token: t, role: role || null, username: username || null };
      }
    } catch (e) {
      // ignore
    }
    return null;
  });

  async function login(username, password) {
    const res = await api.post('/login', { username, password });
    // res contains { token, role }
    setAuthToken(res.token);
    localStorage.setItem('irnvend_role', res.role);
    localStorage.setItem('irnvend_username', username);
    // token is also stored by setAuthToken helper
    setUser({ token: res.token, role: res.role, username });
    return res;
  }

  // Switch to a different user token (impersonation)
  function switchUser(token, role, username) {
    setAuthToken(token);
    if (role) localStorage.setItem('irnvend_role', role);
    if (username) localStorage.setItem('irnvend_username', username);
    setUser({ token, role, username });
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem('irnvend_role');
    localStorage.removeItem('irnvend_username');
    setUser(null);
  }

  // expose switch helper on window for quick invocation from other pages
  useEffect(() => {
    window.__IRNVEND_SWITCH_USER__ = switchUser;
    return () => { try { delete window.__IRNVEND_SWITCH_USER__; } catch (e) {} };
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, switchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
