import { FaArrowRight, FaShieldAlt, FaUser, FaEnvelope } from 'react-icons/fa';

export default function VendorLogin() {
  return (
    <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="mx-auto max-w-2xl px-6">
        <div className="rounded-3xl bg-white/80 p-8 shadow-xl shadow-rose-100/60 backdrop-blur">
          <div className="mb-6 text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <FaUser className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Vendor Portal Access</h1>
            <p className="mt-2 text-slate-600">
              Access your vendor account to manage products and track sales
            </p>
          </div>

          <div className="space-y-6">
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