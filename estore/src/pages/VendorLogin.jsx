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
    <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-10 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="rounded-[32px] bg-white/90 px-5 py-8 sm:px-10 sm:py-12 shadow-2xl shadow-rose-100/70 backdrop-blur">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                <img
                  src={brandLogo}
                  alt={`${brandName} Logo`}
                  className="h-14 w-14 rounded-2xl border border-white/80 bg-white p-2 shadow-md shadow-rose-100"
                  loading="lazy"
                />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-rose-300">Vendor console</p>
                  <h1 className="text-3xl font-black text-slate-800 sm:text-4xl">Secure partner access</h1>
                  <p className="mt-2 text-sm text-slate-600">
                    Approved vendors manage catalog, orders, and payouts inside the POS portal. Keep this page open—your login launches in a new tab so you can hop back to the store without losing context.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/95 p-6 text-center shadow-inner sm:text-left">
                <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
                  <div className="rounded-2xl bg-rose-50 p-3">
                    <FaLock className="h-6 w-6 text-rose-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">
                      Use the secure POS vendor login. Your session opens in a fresh window and inherits all the security controls from HQ.
                    </p>
                  </div>
                </div>
                <a
                  href={vendorPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/80 transition hover:-translate-y-0.5 hover:bg-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-200"
                >
                  Launch vendor login
                  <FaArrowRight className="h-4 w-4" />
                </a>
                <p className="mt-2 text-xs text-slate-400 text-center sm:text-left">
                  Tip: bookmark the next tab. This splash screen stays put for quick re-entry.
                </p>
              </div>

              <div className="grid gap-4 rounded-2xl bg-emerald-50/70 p-5 sm:grid-cols-3">
                {[
                  { title: 'Trusted sessions', body: '2FA + IP guardrails keep intruders out.' },
                  { title: 'POS synced', body: 'Inventory, orders, and payouts stay live.' },
                  { title: 'Fast support', body: '24/7 inbox with human escalation.' },
                ].map((card) => (
                  <div key={card.title} className="rounded-xl border border-emerald-100 bg-white/70 p-3 text-center text-xs font-medium text-emerald-700 shadow-sm">
                    <p className="uppercase tracking-wide text-[10px] text-emerald-500">{card.title}</p>
                    <p className="mt-1 text-emerald-800">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              <div className="rounded-2xl border border-blue-100 bg-blue-50/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <FaShieldAlt className="h-5 w-5 text-blue-600 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900">How to access</h3>
                    <ul className="mt-3 space-y-2 text-sm text-blue-800">
                      <li><strong>1.</strong> Find the onboarding email with your username.</li>
                      <li><strong>2.</strong> Use the “Launch vendor login” button or the secure link inside the email.</li>
                      <li><strong>3.</strong> Update your password + enable MFA on first login.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-100 bg-amber-50/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <FaEnvelope className="h-5 w-5 text-amber-600 flex-shrink-0" />
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-amber-900">Need a reset?</h3>
                      <p className="text-sm text-amber-800">
                        Lost credentials or waiting for approval? Ping the operations desk—we reply with a reset link or onboarding ETA.
                      </p>
                    </div>
                    <a
                      href="/contact?topic=support"
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-amber-200 transition hover:-translate-y-0.5 hover:bg-amber-700"
                    >
                      Contact support
                      <FaArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-white/80 p-5 text-center sm:text-left">
                <p className="text-sm text-slate-600">
                  Want to sell with ITnVend but don’t have credentials yet?
                </p>
                <a
                  href="/sell"
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-sky-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200/80 transition hover:-translate-y-0.5 sm:w-auto"
                >
                  Apply to become a vendor
                  <FaArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
