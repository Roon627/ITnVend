import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../../lib/api';
import { useAuth } from '../../components/AuthContext';
import { parseJwt } from '../../lib/authHelpers';
import { useToast } from '../../components/ToastContext';
import { useSettings } from '../../components/SettingsContext';

export default function VendorLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { switchUser } = useAuth();
  const toast = useToast();
  const { settings, brandLogoUrl } = useSettings();
  const portalLogo = brandLogoUrl || '/images/logo.png';
  const outletName = settings?.outlet?.name || settings?.outlet_name || settings?.branding?.name || 'ITnVend';

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
    <section className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 py-20 px-4">
      <div className="mx-auto w-full max-w-md rounded-3xl border border-white/80 bg-white/90 p-8 text-slate-700 shadow-2xl shadow-rose-100/70 backdrop-blur">
        <div className="text-center">
          <img
            src={portalLogo}
            alt={`${outletName} logo`}
            className="mx-auto h-14 w-14 rounded-2xl border border-white/70 bg-white p-2 shadow-md object-contain"
            loading="lazy"
          />
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.35em] text-rose-300">Vendor console</p>
          <h1 className="mt-2 text-3xl font-black text-slate-900">Sign in to ITnVend</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage your catalog, purchase orders, and payouts from a single dashboard.
          </p>
        </div>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-inner focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              placeholder="you@vendor.com"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-inner focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            className={`w-full rounded-full bg-rose-500 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600 ${
              loading ? 'opacity-70' : ''
            }`}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="text-center text-xs text-slate-500">
            <a href="/vendor/forgot-password" className="font-semibold text-rose-500 hover:underline">
              Forgot password?
            </a>
          </div>
        </form>

        <div className="mt-8 rounded-2xl border border-amber-100 bg-amber-50/80 p-4 text-xs text-amber-700">
          <p className="font-semibold text-amber-800">Need help?</p>
          <p className="mt-1">
            Contact our marketplace team via <a href="mailto:marketplace@itnvend.com" className="font-semibold text-amber-900">marketplace@itnvend.com</a> or open a support ticket from the vendor onboarding page.
          </p>
        </div>
      </div>
    </section>
  );
}
