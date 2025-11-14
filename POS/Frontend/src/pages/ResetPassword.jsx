import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/ToastContext';

function useQuery() {
  return new URLSearchParams(useLocation().search);
}

export default function ResetPassword() {
  const query = useQuery();
  const token = query.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) {
      toast.push('Missing reset token', 'error');
      navigate('/forgot-password');
    }
  }, [token, toast, navigate]);

  async function submit(e) {
    e.preventDefault();
    if (password.length < 6) return toast.push('Password should be at least 6 characters', 'error');
    if (password !== confirm) return toast.push('Passwords do not match', 'error');
    setLoading(true);
    try {
      // Use vendor endpoint when reset token was issued for vendor flow
      const isVendorPath = window.location.pathname.startsWith('/vendor');
      const endpoint = isVendorPath ? '/vendors/password-reset/confirm' : '/password-reset/confirm';
      await api.post(endpoint, { token, password });
      toast.push('Password updated. You can now sign in.', 'success');
      navigate('/login');
    } catch (err) {
      toast.push('Failed to reset password. The token may be invalid or expired.', 'error');
      console.debug('Failed to reset password', err?.message || err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[rgba(124,58,237,0.03)] to-[rgba(124,58,237,0.0)]">
      <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow">
        <h2 className="text-xl font-semibold mb-3">Reset password</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-muted)] mb-1">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--color-muted)] mb-1">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm"
            />
          </div>
          <div className="flex items-center justify-between">
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save new password'}</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/login')}>Back to sign in</button>
          </div>
        </form>
      </div>
    </div>
  );
}
