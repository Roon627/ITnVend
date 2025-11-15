import { FaArrowRight, FaShieldAlt, FaEnvelope, FaLock } from 'react-icons/fa';
import { useSettings } from '../components/SettingsContext';
import { resolveMediaUrl } from '../lib/media';

const vendorPortalUrl =
  (import.meta.env?.VITE_VENDOR_PORTAL_URL ||
    import.meta.env?.VITE_POS_VENDOR_URL ||
    'https://pos.itnvend.com/vendor/login').trim();

export default function VendorLogin() {
  const { settings, logoUrl } = useSettings() || {};
  const brandLogo = resolveMediaUrl(logoUrl) || '/images/logo.png';
  const brandName =
    settings?.branding?.name ||
    settings?.outlet?.name ||
    settings?.brand?.name ||
    'ITnVend';

  return (
    <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-3xl bg-white/85 p-10 text-center shadow-xl shadow-rose-100/60 backdrop-blur">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <img
              src={brandLogo}
              alt={`${brandName} Logo`}
              className="h-16 w-16 rounded-2xl border border-white/80 bg-white p-2 shadow-md shadow-rose-100"
              loading="lazy"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.45em] text-rose-300">Vendor console</p>
            <h1 className="text-3xl font-black text-slate-800">Secure partner access</h1>
            <p className="mt-2 text-sm text-slate-600 max-w-xl">
              Only approved ITnVend vendors can sign in here. Use the same credentials you received in your onboarding email.
              Keep this tab open; the login opens in a new window and will not interrupt your shopping session.
            </p>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
              <FaLock className="mx-auto mb-3 h-6 w-6 text-rose-500" />
              <p className="text-sm text-slate-500 mb-3">
                Vendor accounts live inside the secure POS console. Use the button below to launch the portal in a new tab.
              </p>
              <a
                href={vendorPortalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600"
              >
                Launch vendor login
                <FaArrowRight className="h-4 w-4" />
              </a>
              <p className="mt-2 text-xs text-slate-400">
                Tip: keep this tab open. Logging in no longer signs you out of the public store.
              </p>
            </div>
            <div className="p-6 bg-blue-50 rounded-xl border border-blue-200">
              <div className="flex items-start gap-3">
                <FaShieldAlt className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-blue-800 mb-2">How to Access Your Account</h3>
                  <div className="text-sm text-blue-700 space-y-2">
                    <p>1. <strong>Check your email</strong> - You should have received login credentials when your vendor account was approved.</p>
                    <p>2. <strong>Use the secure link</strong> - Your email contains a direct link to sign in to your vendor dashboard.</p>
                    <p>3. <strong>Change your password</strong> - After first login, update your password for security.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 bg-amber-50 rounded-xl border border-amber-200">
              <div className="flex items-start gap-3">
                <FaEnvelope className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-800 mb-2">Need Help?</h3>
                  <p className="text-sm text-amber-700 mb-3">
                    If you haven't received your login credentials or need assistance accessing your account:
                  </p>
                  <a
                    href="/contact?topic=support"
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition"
                  >
                    Contact Support
                    <FaArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            <div className="text-center">
              <p className="text-sm text-slate-600 mb-4">
                Don't have a vendor account yet?
              </p>
              <a
                href="/sell"
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-sky-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5"
              >
                Apply to Become a Vendor
                <FaArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
