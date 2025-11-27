import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaClipboardCheck, FaHandshake } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const STEP_CONTENT = [
  {
    title: 'Identity & branding',
    description: 'Primary contact, storefront copy, and logo.',
    icon: FaHandshake,
  },
  {
    title: 'Billing & compliance',
    description: 'Monthly fee, billing start, and payout notes.',
    icon: FaClipboardCheck,
  },
];

const CURRENCY_OPTIONS = ['MVR', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'AUD', 'CAD', 'SGD'];

const getNextBillingStart = () => {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return next.toISOString().slice(0, 10);
};

export default function VendorRegister() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    legal_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    tagline: '',
    public_description: '',
    capabilities: '',
    notes: '',
    bank_details: '',
    logo_file: null,
    monthlyFee: '',
    billingStartDate: getNextBillingStart(),
    currency: 'USD',
    salesFeePercent: '5',
  });
  const toast = useToast();
  const navigate = useNavigate();

  function change(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function uploadLogo() {
    if (!form.logo_file) return null;
    const file = form.logo_file;
    // client-side validation: image and max 3MB
    if (!file.type.startsWith('image/')) {
      throw new Error('Logo must be an image file');
    }
    if (file.size > 3 * 1024 * 1024) {
      throw new Error('Logo must be smaller than 3 MB');
    }
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload('/uploads?category=logos', fd);
      if (res && res.path) return res.path;
      if (res && res.url) return res.url;
      return null;
    } catch (err) {
      console.warn('Logo upload failed', err?.message || err);
      throw err;
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.legal_name || !form.email) {
      return toast.push('Legal name and email are required', 'error');
    }
    setLoading(true);
    try {
      const logo_url = await uploadLogo();
      const payload = { ...form, logo_url };
      // remove local file
      delete payload.logo_file;
      const monthlyFeeValue = form.monthlyFee === '' ? null : Number(form.monthlyFee);
      payload.monthly_fee = Number.isFinite(monthlyFeeValue) ? monthlyFeeValue : null;
      payload.billing_start_date = form.billingStartDate || null;
      payload.currency = form.currency;
      const salesFeeValue = form.salesFeePercent === '' ? null : Number(form.salesFeePercent);
      payload.sales_fee_percent = Number.isFinite(salesFeeValue) ? salesFeeValue : undefined;
      delete payload.monthlyFee;
      delete payload.billingStartDate;
      delete payload.salesFeePercent;
      const result = await api.post('/vendors/register', payload);
      toast.push(result?.message || 'Vendor registered', 'success');
      navigate('/vendors');
    } catch (err) {
      console.error('Vendor register failed', err);
      toast.push(err?.message || err?.data?.error || 'Failed to register vendor', 'error');
    } finally {
      setLoading(false);
    }
  }

  const currentStepMeta = STEP_CONTENT[step - 1];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/40 backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                Sell with us
              </span>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Vendor onboarding</h1>
                <p className="text-sm text-slate-500">
                  Join the marketplace, sync inventory, and get paid without extra back-and-forth.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              {[
                { label: 'Avg. approval', value: '48h' },
                { label: 'Partners live', value: '120+' },
                { label: 'Regions', value: '4' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                  <div className="text-xl font-semibold text-slate-900">{stat.value}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-4">
            {STEP_CONTENT.map((item, index) => {
              const Icon = item.icon;
              const active = step === index + 1;
              return (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setStep(index + 1)}
                  className={`flex flex-1 min-w-[180px] items-start gap-3 rounded-2xl border px-4 py-3 text-left shadow-sm transition ${
                    active ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white hover:border-blue-200'
                  }`}
                >
                  <Icon className={`mt-1 text-lg ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                  <div>
                    <div className={`text-sm font-semibold ${active ? 'text-blue-700' : 'text-slate-700'}`}>{item.title}</div>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-blue-100/40 backdrop-blur">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Step {step} of {STEP_CONTENT.length}</p>
              <h2 className="text-xl font-semibold text-slate-900">{currentStepMeta.title}</h2>
              <p className="text-sm text-slate-500">{currentStepMeta.description}</p>
            </div>
            <div className="text-sm text-slate-500">Fields marked * are required</div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                Legal / company name*
                <input value={form.legal_name} onChange={(e) => change('legal_name', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Primary contact
                <input value={form.contact_person} onChange={(e) => change('contact_person', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Email*
                <input type="email" value={form.email} onChange={(e) => change('email', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Phone
                <input value={form.phone} onChange={(e) => change('phone', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                Address
                <input value={form.address} onChange={(e) => change('address', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Website
                <input value={form.website} onChange={(e) => change('website', e.target.value)} placeholder="https://" className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                Tagline
                <input value={form.tagline} onChange={(e) => change('tagline', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g. Premium AV supplier" />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Public description
                <input value={form.public_description} onChange={(e) => change('public_description', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Short description for storefront" />
              </label>
            </div>
            <label className="block">
              <div className="text-sm font-medium">Capabilities / services</div>
              <textarea value={form.capabilities} onChange={(e) => change('capabilities', e.target.value)} className="mt-1 block w-full rounded border px-3 py-2" rows={3} />
            </label>
            <label className="block">
              <div className="text-sm font-medium">Upload logo</div>
              <input type="file" accept="image/*" onChange={(e) => change('logo_file', e.target.files && e.target.files[0])} className="mt-1 block w-full" />
              {form.logo_file && (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <img src={URL.createObjectURL(form.logo_file)} alt="logo-preview" className="h-16 w-16 rounded object-contain" />
                  <div className="text-sm text-gray-600">
                    {form.logo_file.name} ({Math.round(form.logo_file.size / 1024)} KB)
                  </div>
                </div>
              )}
            </label>
            <p className="text-xs text-slate-500">
              Vendor login credentials are generated automatically when you approve the vendor. We use their email for the username.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
              <label className="text-sm font-medium text-slate-600">
                Monthly fee*
                <div className="relative mt-1">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">MVR</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.monthlyFee}
                onChange={(e) => change('monthlyFee', e.target.value)}
                className="w-full rounded border px-3 py-2 pl-14 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
              />
            </div>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Currency
                <select
                  value={form.currency}
                  onChange={(e) => change('currency', e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CURRENCY_OPTIONS.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-600">
                Sales fee %
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.salesFeePercent}
                  onChange={(e) => change('salesFeePercent', e.target.value)}
                  className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Billing start date
                <input
                    type="date"
                    value={form.billingStartDate}
                    onChange={(e) => change('billingStartDate', e.target.value)}
                    className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Notes / internal flags
                <input value={form.notes} onChange={(e) => change('notes', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Optional notes" />
              </label>
            </div>
            <label className="block">
              <div className="text-sm font-medium">Bank / payout details</div>
              <textarea value={form.bank_details} onChange={(e) => change('bank_details', e.target.value)} className="mt-1 block w-full rounded border px-3 py-2" rows={3} />
            </label>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-700">
              Vendors must pay their monthly fee within 5 days to keep their dashboard active. The billing automation emails on day 1, 3, and 5, then disables access on day 6.
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            {step > 1 && (
              <button type="button" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold" onClick={() => setStep((s) => s - 1)}>Back</button>
            )}
            {step < STEP_CONTENT.length && (
              <button type="button" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-700" onClick={() => setStep((s) => s + 1)}>Next</button>
            )}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200/70 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Submitting…' : 'Submit application'}
          </button>
        </div>
          </form>
        </section>
      </div>
    </div>
  );
}
