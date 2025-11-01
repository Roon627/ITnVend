import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const POS_PATH = '/pos';

  async function submit(e) {
    e.preventDefault();
    try {
      await auth.login(username, password, remember);
      toast.push('Logged in', 'success');
      navigate(POS_PATH, { replace: true });
    } catch (err) {
      toast.push('Login failed — check your credentials', 'error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-[rgba(124,58,237,0.06)] to-[rgba(124,58,237,0.0)]">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Left - Branding / Illustration */}
        <div className="hidden md:flex flex-col justify-center p-8 rounded-lg" aria-hidden="true">
          <div className="mb-6">
            <div className="w-28 h-28 rounded-lg flex items-center justify-center bg-white shadow-md overflow-hidden">
              <img src="/images/logo.png" alt="ITnVend" className="w-20 h-20 object-contain" />
            </div>
          </div>
          <h1 className="text-3xl font-extrabold text-[var(--color-heading)] mb-3">Welcome to ITnVend</h1>
          <p className="text-[var(--color-muted)] mb-6">A compact POS, inventory and invoicing system tailored for small businesses. Fast checkout, clean reports, and simple accounting.</p>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            <li>• Modern POS with cart & receipts</li>
            <li>• Inventory tracking & low-stock alerts</li>
            <li>• Invoicing with PDF export</li>
          </ul>
        </div>

        {/* Right - Login card */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-8 shadow-lg">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-[var(--color-heading)]">Sign in to your account</h2>
            <p className="text-sm text-[var(--color-muted)] mt-2">Enter your credentials to continue to the POS dashboard.</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--color-muted)] mb-1">Email or username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)] focus:border-[var(--color-primary)]"
                placeholder="you@company.com"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-[var(--color-muted)] mb-1">Password</label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-soft)] focus:border-[var(--color-primary)]"
                placeholder="Your secure password"
                autoComplete="current-password"
                required
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="w-4 h-4 rounded" />
                Remember me
              </label>
              <Link to="/forgot-password" className="text-sm text-[var(--color-primary)] hover:underline">Forgot password?</Link>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button type="submit" className="btn-primary w-full sm:w-auto">Sign in</button>
            </div>
          </form>

          <div className="mt-6 text-center text-sm text-[var(--color-muted)]">
            <span>Need help? </span>
            <a href="mailto:support@example.com" className="text-[var(--color-primary)] hover:underline">Contact support</a>
          </div>
        </div>
      </div>
    </div>
  );
}
