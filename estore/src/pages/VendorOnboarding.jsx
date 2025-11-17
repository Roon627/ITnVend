import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaCloudUploadAlt, FaHandshake, FaShieldAlt, FaTruck, FaUpload, FaUserTie } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import useMarketplaceStats from '../hooks/useMarketplaceStats';

const initialForm = {
  legalName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  capabilities: [],
  notes: '',
  monthlyFee: '',
  billingStartDate: '',
  billingNotes: '',
};

const capabilitiesHints = [
  'Hardware supply & deployment',
  'Managed services or support retainer',
  'Software development or integration',
  'Digital media or creative production',
  'Smart vending & telemetry',
];

const HERO_STATS = [
  { label: 'Avg. review', value: '48h' },
  { label: 'Live partners', value: '—' },
  { label: 'Regions served', value: '4' },
];

const TRUST_POINTS = [
  { icon: FaShieldAlt, title: 'Compliance ready', body: 'We vet suppliers for secure procurement and regulatory alignment.' },
  { icon: FaTruck, title: 'Regional reach', body: 'Deployments available across Malé, Hulhumalé, Addu and resorts.' },
  { icon: FaUserTie, title: 'Briefs & forecasts', body: 'Approved partners receive early access to upcoming opportunity briefs.' },
];

const ONBOARDING_STEPS = [
  { id: 1, title: 'Identity & scope', description: 'Tell us who you are and what you do.' },
  { id: 2, title: 'Billing & documents', description: 'Share fee preferences and upload supporting files.' },
];

export default function VendorOnboarding() {
  // Use shared marketplace stats so both pages display the same live data
  const { stats, loading: _statsLoading } = useMarketplaceStats();
  const [formData, setFormData] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState(1);
  // logoData will store { name, path } when uploaded via multipart; documents will store array of { name, path }
  const [logoData, setLogoData] = useState(null);
  const [documents, setDocuments] = useState([]);
  const toast = useToast();
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const toggleCapability = (cap) => {
    setFormData((prev) => {
      const list = new Set(prev.capabilities || []);
      if (list.has(cap)) list.delete(cap); else list.add(cap);
      return { ...prev, capabilities: Array.from(list) };
    });
  };

  const handleLogo = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // Try multipart upload first
    try {
      const fd = new FormData();
      fd.append('file', f);
      const resp = await api.upload('/uploads', fd);
      const path = resp?.path || resp?.url || (resp?.data && (resp.data.path || resp.data.url));
      if (path) {
        setLogoData({ name: f.name, path });
        return;
      }
  } catch {
      // fall back to base64 if upload fails
    }
    // fallback to base64 for environments without multipart support
    const reader = new FileReader();
    reader.onload = () => setLogoData({ name: f.name, data: reader.result });
    reader.readAsDataURL(f);
  };

  const handleDocs = async (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    const uploaded = [];
    const base64s = [];
    for (const f of list) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const resp = await api.upload('/uploads', fd);
        const path = resp?.path || resp?.url || (resp?.data && (resp.data.path || resp.data.url));
        if (path) {
          uploaded.push({ name: f.name, path });
          continue;
        }
  } catch {
        // ignore and fallback to base64
      }
      // fallback to base64
      const asBase64 = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(f);
      });
      base64s.push({ name: f.name, data: asBase64 });
    }
    setDocuments((prev) => [...(prev || []), ...uploaded, ...base64s]);
  };

  const goToNextStep = () => {
    if (!formData.legalName?.trim() || !formData.contactPerson?.trim() || !formData.email?.trim()) {
      toast.push('Please fill in legal name, contact person, and email to continue.', 'error');
      return;
    }
    setStep(2);
  };

  const goToPreviousStep = () => setStep((prev) => Math.max(1, prev - 1));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (step !== 2) {
      goToNextStep();
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        legal_name: formData.legalName,
        contact_person: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        website: formData.website,
        capabilities: formData.capabilities.join(', '),
        notes: [formData.notes, formData.billingNotes].filter(Boolean).join('\n\n'),
        monthly_fee: formData.monthlyFee ? Number(formData.monthlyFee) : null,
        billing_start_date: formData.billingStartDate || null,
        // Prefer server path returned from /api/uploads (path or url). If multipart wasn't available, fall back to base64 data.
        logo_url: logoData?.path || logoData?.url || null,
        documents: documents.map(d => ({ name: d.name, path: d.path, data: d.data })),
      };

      await api.post('/vendors', payload);
      toast.push('Thanks! Our procurement team will contact you shortly.', 'success');
      setFormData(initialForm);
      setLogoData(null);
      setDocuments([]);
      navigate('/');
    } catch (error) {
      toast.push(error.response?.data?.error || 'Something went wrong. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-10 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-blue-100 bg-white/90 p-6 shadow-xl shadow-blue-100/40">
          <div className="flex flex-col gap-6 items-start">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                Become a partner
              </span>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Join our vendor network</h1>
                <p className="mt-2 text-sm text-slate-600">
                  We work with suppliers, integrators, and creative teams. Share your details and our procurement group will follow up within two business days.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {TRUST_POINTS.map((point) => (
                  <div key={point.title} className="flex-1 min-w-[180px] rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <point.icon className="text-blue-500" /> {point.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{point.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-full overflow-x-auto sm:overflow-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-fit gap-3 sm:grid sm:min-w-0 sm:grid-cols-3 sm:text-center">
                {(
                  stats && (stats.totalProducts || stats.vendors || stats.sellers) ? [
                    { label: 'Total products', value: stats.totalProducts },
                    { label: 'Approved vendors', value: stats.vendors },
                    { label: 'Peer sellers', value: stats.sellers },
                  ] : HERO_STATS
                ).map((stat) => (
                  <div key={stat.label} className="flex min-w-[140px] flex-col items-center justify-center rounded-2xl border border-blue-100 bg-white px-4 py-3 text-center shadow-sm">
                    <div className="text-xl font-semibold text-slate-900">{stat.value}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-blue-100/30">
          <div className="grid gap-10 lg:grid-cols-[3fr,2fr]">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 sm:flex-row sm:flex-wrap sm:justify-between">
                {ONBOARDING_STEPS.map((item) => (
                  <div key={item.id} className={`flex-1 min-w-[220px] rounded-xl border px-4 py-3 text-sm ${step === item.id ? 'border-blue-400 bg-white shadow-sm' : 'border-transparent text-slate-500'}`}>
                    <div className="text-xs uppercase tracking-wide text-slate-400">Step {item.id}</div>
                    <div className="font-semibold text-slate-800">{item.title}</div>
                    <p className="text-xs text-slate-500">{item.description}</p>
                  </div>
                ))}
              </div>

              {step === 1 ? (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Organisation</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        Legal entity name
                        <input name="legalName" value={formData.legalName} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Website
                        <input name="website" value={formData.website} onChange={handleChange} placeholder="https://" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Primary contact</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        Full name
                        <input name="contactPerson" value={formData.contactPerson} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Email
                        <input type="email" name="email" value={formData.email} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Phone
                        <input name="phone" value={formData.phone} onChange={handleChange} placeholder="(+960) ..." className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Head office address
                        <input name="address" value={formData.address} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                      </label>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Capabilities & scope</p>
                    <div className="mt-3 space-y-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        {capabilitiesHints.map((cap) => (
                          <button
                            key={cap}
                            type="button"
                            onClick={() => toggleCapability(cap)}
                            className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                              formData.capabilities.includes(cap)
                                ? 'border-blue-400 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200'
                            }`}
                          >
                            {cap}
                          </button>
                        ))}
                      </div>
                      <textarea
                        name="notes"
                        value={formData.notes}
                        onChange={handleChange}
                        placeholder="Certifications, regions served, service windows"
                        rows={3}
                        className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Billing preferences</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <label className="text-sm font-medium text-slate-700">
                        Suggested monthly fee (USD)
                        <input
                          type="number"
                          name="monthlyFee"
                          min="0"
                          step="0.01"
                          value={formData.monthlyFee}
                          onChange={handleChange}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                      <label className="text-sm font-medium text-slate-700">
                        Preferred billing start
                        <input
                          type="date"
                          name="billingStartDate"
                          value={formData.billingStartDate}
                          onChange={handleChange}
                          className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                        />
                      </label>
                    </div>
                    <textarea
                      name="billingNotes"
                      value={formData.billingNotes}
                      onChange={handleChange}
                      placeholder="Notes about invoicing cycles, special terms, or primary billing contact."
                      rows={3}
                      className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                    />
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-700">
                      Vendors must pay their monthly fee within five days to keep dashboards active. Day 6 triggers an automatic lock until payment is confirmed.
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-400">Uploads</p>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/40 px-4 py-6 text-center text-sm text-slate-600">
                        <FaUpload className="mb-2 text-blue-400" />
                        Company logo (optional)
                        <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
                      </label>
                      <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center text-sm text-slate-600">
                        <FaCloudUploadAlt className="mb-2 text-indigo-400" />
                        Supporting documents
                        <input type="file" multiple onChange={handleDocs} className="hidden" />
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-white/95 pb-3 pt-4 sm:static sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:pb-0">
                <div className="text-xs text-slate-400">Step {step} of {ONBOARDING_STEPS.length}</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => navigate('/')} className="btn-sm btn-sm-outline rounded-full border border-slate-200 text-slate-600">
                    Cancel
                  </button>
                  {step > 1 && (
                    <button type="button" onClick={goToPreviousStep} className="btn-sm btn-sm-outline rounded-full border border-slate-200 text-slate-600">
                      Back
                    </button>
                  )}
                  {step === 1 ? (
                    <button type="button" onClick={goToNextStep} className="btn-sm btn-sm-primary rounded-full bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-200/60">
                      Continue
                    </button>
                  ) : (
                    <button type="submit" disabled={isSubmitting} className="btn-sm btn-sm-primary rounded-full bg-blue-600 text-sm font-semibold text-white shadow-lg shadow-blue-200/60 disabled:cursor-not-allowed disabled:opacity-70">
                      {isSubmitting ? 'Submitting…' : 'Submit application'}
                    </button>
                  )}
                </div>
              </div>
            </form>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                  <FaChartLine className="text-emerald-500" /> Submission snapshot
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div><span className="font-semibold">Entity:</span> {formData.legalName || '—'}</div>
                  <div><span className="font-semibold">Contact:</span> {formData.contactPerson || '—'}</div>
                  <div><span className="font-semibold">Capabilities:</span> {(formData.capabilities || []).length || 0} selected</div>
                  <div><span className="font-semibold">Monthly fee:</span> {formData.monthlyFee ? `$${Number(formData.monthlyFee).toFixed(2)}` : '—'}</div>
                  <div><span className="font-semibold">Billing start:</span> {formData.billingStartDate || '—'}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">Files attached</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>Logo: {logoData ? logoData.name : '—'}</li>
                  <li>Documents: {documents.length ? documents.map((d) => d.name).join(', ') : '—'}</li>
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
