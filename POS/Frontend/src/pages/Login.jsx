import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import BrandLogo from '../components/BrandLogo';
import AccountLockedBanner from '../components/AccountLockedBanner';
import Modal from '../components/Modal';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [lockedMessage, setLockedMessage] = useState(null);
  const auth = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { settings, brandLogoUrl } = useSettings();
  const POS_PATH = '/pos';
  const outletName = settings?.outlet?.name || settings?.outlet_name || 'ITnVend';
  const supportPhone = settings?.support_phone || settings?.contact_phone || '1-800-555-0123';
  const supportEmail = settings?.support_email || settings?.contact_email || 'support@example.com';
  const [showSupportModal, setShowSupportModal] = useState(false);
  

  async function submit(e) {
    e.preventDefault();
    try {
      // clear any previous lock message before attempting
      setLockedMessage(null);
      await auth.login(username, password, remember);
      toast.push('Logged in', 'success');
      navigate(POS_PATH, { replace: true });
    } catch (err) {
      console.error('Login failed', err);
      // If server returned 403 (account locked) show the locked banner with server message
      if (err?.status === 403) {
        const msg = err?.data?.error || err?.message || 'Account is locked';
        setLockedMessage(msg);
        return;
      }
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
              {brandLogoUrl ? (
                <img src={brandLogoUrl} alt={`${outletName} logo`} className="w-20 h-20 object-contain" loading="lazy" />
              ) : (
                <BrandLogo size={72} square className="border-0 shadow-none bg-transparent" />
              )}
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

          {lockedMessage && <AccountLockedBanner message={lockedMessage} />}

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-[var(--color-muted)] mb-1">Email or username</label>
              <input
                id="username"
                value={username}
                onChange={(e) => { setUsername(e.target.value); setLockedMessage(null); }}
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
                onChange={(e) => { setPassword(e.target.value); setLockedMessage(null); }}
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
            <button type="button" onClick={() => setShowSupportModal(true)} className="text-[var(--color-primary)] hover:underline">Contact support</button>
            <div className="mt-2">For urgent enquiries call <a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="text-[var(--color-primary)] hover:underline">{supportPhone}</a></div>
          </div>

          <Modal open={showSupportModal} onClose={() => setShowSupportModal(false)} title="Contact support" message="Reach our support team via the channels below" primaryText="Close" onPrimary={() => setShowSupportModal(false)}>
            <div className="max-w-md mx-auto bg-white rounded-lg p-4 shadow">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white shadow animate-pulse">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h2.18a2 2 0 011.788 1.106l.72 1.44a2 2 0 01-.45 2.284l-1.2 1.2a11 11 0 005.516 5.516l1.2-1.2a2 2 0 012.284-.45l1.44.72A2 2 0 0121 18.82V21a2 2 0 01-2 2h-0" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-foreground">Contact Support</h4>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">We usually respond within minutes during business hours. Use any of the channels below to reach us.</p>
                  <div className="mt-3 space-y-2 text-sm text-[var(--color-muted)]">
                    <div className="flex items-center gap-2"><span className="w-5">✉️</span><div><div className="text-xs uppercase text-[var(--color-muted)]">Email</div><div className="font-semibold">{supportEmail}</div></div></div>
                    <div className="flex items-center gap-2"><span className="w-5">📱</span><div><div className="text-xs uppercase text-[var(--color-muted)]">Phone</div><div className="font-semibold"><a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="text-[var(--color-primary)] hover:underline">{supportPhone}</a></div></div></div>
                    <div className="flex items-center gap-2"><span className="w-5">💼</span><div><div className="text-xs uppercase text-[var(--color-muted)]">Hours</div><div className="font-semibold">{settings?.support_hours || settings?.contact_hours || ''}</div></div></div>
                  </div>
                </div>
              </div>
              <div className="mt-4 text-right">
                <button onClick={() => setShowSupportModal(false)} className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Close</button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    </div>
  );
}
