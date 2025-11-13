import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { FaArrowLeft } from 'react-icons/fa';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function ResetPassword() {
  const query = useQuery();
  const token = query.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      setError('Missing reset token. Please check your email for the complete link.');
    }
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password should be at least 6 characters');
      return;
    }

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      // Use vendor endpoint when reset token was issued for vendor flow
      const isVendorPath = window.location.pathname.startsWith('/vendor');
      const endpoint = isVendorPath ? '/vendors/password-reset/confirm' : '/password-reset/confirm';
      await api.post(endpoint, { token, password });
      setSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 3000);
    } catch (err) {
      setError('Failed to reset password. The token may be invalid or expired.');
      console.debug('Failed to reset password', err?.message || err);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
        <div className="mx-auto max-w-md px-6">
          <div className="rounded-3xl bg-white/80 p-8 shadow-xl shadow-rose-100/60 backdrop-blur text-center">
            <div className="mb-6">
              <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-800 mb-2">Password Updated!</h1>
              <p className="text-slate-600">Your password has been successfully reset. You can now sign in with your new password.</p>
            </div>
            <p className="text-sm text-slate-500">Redirecting to home page...</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="mx-auto max-w-md px-6">
        <div className="rounded-3xl bg-white/80 p-8 shadow-xl shadow-rose-100/60 backdrop-blur">
          <div className="mb-6">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-2 text-rose-500 hover:text-rose-600 transition mb-4"
            >
              <FaArrowLeft className="text-sm" />
              Back to home
            </button>
            <h1 className="text-2xl font-bold text-slate-800">Reset Your Password</h1>
            <p className="mt-2 text-slate-600">Enter your new password below.</p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-rose-700">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-6">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                New Password *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your new password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
              <p className="mt-1 text-xs text-slate-500">Must be at least 6 characters</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Confirm Password *
              </label>
              <input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                placeholder="Confirm your new password"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-sky-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}