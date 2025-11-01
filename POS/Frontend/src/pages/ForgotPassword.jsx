import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/password-reset/request', { email });
      toast.push('If an account exists we sent password reset instructions to that email.', 'success');
      navigate('/login');
    } catch (err) {
      toast.push('Failed to request password reset. Try again later.', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[rgba(124,58,237,0.03)] to-[rgba(124,58,237,0.0)]">
      <div className="w-full max-w-md bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow">
        <h2 className="text-xl font-semibold mb-3">Forgot password</h2>
        <p className="text-sm text-[var(--color-muted)] mb-4">Enter your account email and we'll send a link to reset your password.</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--color-muted)] mb-1">Email</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} required type="email" className="w-full px-3 py-2 border rounded" />
          </div>
          <div className="flex items-center justify-between">
            <button type="submit" className="btn-primary" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/login')}>Back to sign in</button>
          </div>
        </form>
      </div>
    </div>
  );
}
