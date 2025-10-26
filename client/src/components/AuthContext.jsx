import { createContext, useContext, useEffect, useState } from 'react';
import api, { setAuthToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const t = localStorage.getItem('irnvend_token');
    if (t) {
      setAuthToken(t);
      // We don't have a user endpoint; token stored with role in localStorage optionally
      const role = localStorage.getItem('irnvend_role');
      setUser({ role, token: t });
    }
  }, []);

  async function login(username, password) {
    const res = await api.post('/login', { username, password });
    // res contains { token, role }
    setAuthToken(res.token);
    localStorage.setItem('irnvend_role', res.role);
    setUser({ token: res.token, role: res.role, username });
    return res;
  }

  function logout() {
    setAuthToken(null);
    localStorage.removeItem('irnvend_role');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
