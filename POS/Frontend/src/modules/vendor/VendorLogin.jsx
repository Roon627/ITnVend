import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { parseJwt } from '../../lib/authHelpers';
import { useToast } from '../../components/ToastContext';

export default function VendorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { switchUser } = useAuth();
  const toast = useToast();

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const imp = q.get('impersonation_token') || q.get('token');
    if (imp) {
      try {
        const payload = parseJwt(imp);
        const username = payload?.username || null;
        switchUser(imp, 'vendor', username || null);
        navigate('/vendor/dashboard');
      } catch (e) {
        console.error('Failed to apply impersonation token', e);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/vendors/login', { email, password });
      if (res?.token) {
        switchUser(res.token, 'vendor', res.vendor?.email || email);
        toast.push('Signed in as vendor', 'success');
        navigate('/vendor/dashboard');
      } else {
        toast.push('Login failed', 'error');
      }
    } catch (err) {
      console.error('Vendor login failed', err);
      toast.push(err?.data?.error || err?.message || 'Login failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-20 p-6 bg-white rounded shadow">
      <div className="text-center mb-4">
        <img src="/images/vendor-logo.png" alt="Vendor Login" className="mx-auto h-12" />
        <h1 className="text-xl font-semibold mt-2">Vendor Login</h1>
        <p className="text-sm text-gray-600">Access your vendor dashboard and payout history</p>
      </div>
      <form onSubmit={submit}>
        <label className="block text-sm font-medium text-gray-700">Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm mb-3" type="email" required />
        <label className="block text-sm font-medium text-gray-700">Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm mb-4" type="password" required />
          <div className="mt-6">
            <button
              type="submit"
              className={`w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white ${loading ? 'opacity-70' : 'hover:bg-blue-500'}`}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </div>
          <div className="mt-3 text-center text-sm">
            <a href="/vendor/forgot-password" className="text-sm text-blue-600 hover:underline">Forgot password?</a>
          </div>
      </form>
    </div>
  );
}
