import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaCloudUploadAlt, FaShieldAlt, FaTruck, FaUpload, FaUserTie } from 'react-icons/fa';
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
  { id: 1, title: 'Identity', description: 'Tell us who you are.' },
  { id: 2, title: 'Capabilities', description: 'What your team can deliver.' },
  { id: 3, title: 'Billing & uploads', description: 'Fees, documents, and branding.' },
  { id: 4, title: 'Review', description: 'Final check before submitting.' },
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

  const totalSteps = ONBOARDING_STEPS.length;
  const isFinalStep = step === totalSteps;

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (!formData.legalName?.trim() || !formData.contactPerson?.trim() || !formData.email?.trim()) {
        toast.push('Please fill in legal name, contact person, and email to continue.', 'error');
        return false;
      }
      return true;
    }
    if (currentStep === 2) {
      if (formData.monthlyFee && Number(formData.monthlyFee) < 0) {
        toast.push('Monthly fee cannot be negative.', 'error');
        return false;
      }
      return true;
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const handlePrevStep = () => setStep((prev) => Math.max(1, prev - 1));

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFinalStep) {
      handleNextStep();
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
      setStep(1);
      navigate('/');
    } catch (error) {
      toast.push(error.response?.data?.error || 'Something went wrong. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCapabilities = formData.capabilities || [];
  const documentsList = documents || [];

  const identitySection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Organisation</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Legal entity name
            <input
              name="legalName"
              value={formData.legalName}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Website
            <input
              name="website"
              value={formData.website}
              onChange={handleChange}
              placeholder="https://"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Primary contact</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Full name
            <input
              name="contactPerson"
              value={formData.contactPerson}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Email
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Phone
            <input
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="(+960) ..."
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700 md:col-span-2">
            Head office address
            <input
              name="address"
              value={formData.address}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>
      </div>
      <div className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm text-rose-800">
        <p className="font-semibold">Friendly heads-up</p>
        <p className="mt-1">
          Marketplace maintenance is a flat <span className="font-semibold text-rose-900">MVR 100</span> per month. You will review and confirm the exact fee total on the final step before sending your application.
        </p>
      </div>
    </div>
  );

  const capabilitySection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Capabilities & scope</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {capabilitiesHints.map((cap) => (
            <button
              key={cap}
              type="button"
              onClick={() => toggleCapability(cap)}
              className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                selectedCapabilities.includes(cap)
                  ? 'border-rose-400 bg-rose-50 text-rose-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200'
              }`}
            >
              {cap}
            </button>
          ))}
        </div>
      </div>
      <label className="text-sm font-medium text-slate-700 block">
        Additional notes
        <textarea
          name="notes"
          value={formData.notes}
          onChange={handleChange}
          placeholder="Certifications, preferred regions, delivery SLAs"
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
      </label>
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 text-xs text-slate-500">
        Helpful context about specialties tells our procurement team which briefs to route to you first.
      </div>
    </div>
  );

  const billingSection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Billing preferences</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">
            Suggested monthly fee (MVR)
            <input
              type="number"
              name="monthlyFee"
              min="0"
              step="0.01"
              value={formData.monthlyFee}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            Preferred billing start
            <input
              type="date"
              name="billingStartDate"
              value={formData.billingStartDate}
              onChange={handleChange}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
          </label>
        </div>
        <textarea
          name="billingNotes"
          value={formData.billingNotes}
          onChange={handleChange}
          placeholder="Notes about invoicing cycles, finance contacts, or special terms."
          rows={3}
          className="mt-3 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-700">
          Vendors have five days to settle each invoice. Day six automatically pauses dashboards until a payment confirmation or admin override.
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Uploads</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-4 py-6 text-center text-sm text-slate-600">
            <FaUpload className="mb-2 text-rose-400" />
            Company logo (optional)
            <input type="file" accept="image/*" onChange={handleLogo} className="hidden" />
          </label>
          <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/40 px-4 py-6 text-center text-sm text-slate-600">
            <FaCloudUploadAlt className="mb-2 text-indigo-400" />
            Supporting documents
            <input type="file" multiple onChange={handleDocs} className="hidden" />
          </label>
        </div>
        {(logoData || documentsList.length > 0) && (
          <div className="mt-3 rounded-2xl border border-slate-100 bg-white p-4 text-sm text-slate-600">
            <div>Logo: {logoData ? logoData.name : '—'}</div>
            <div className="mt-1">Documents: {documentsList.length ? documentsList.map((doc) => doc.name).join(', ') : '—'}</div>
          </div>
        )}
      </div>
    </div>
  );

  const reviewSection = (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="text-xs uppercase tracking-wide text-slate-400">Organisation</p>
          <ul className="mt-3 space-y-1">
            <li><span className="font-semibold">Entity:</span> {formData.legalName || '—'}</li>
            <li><span className="font-semibold">Contact:</span> {formData.contactPerson || '—'}</li>
            <li><span className="font-semibold">Email:</span> {formData.email || '—'}</li>
            <li><span className="font-semibold">Phone:</span> {formData.phone || '—'}</li>
            <li><span className="font-semibold">Website:</span> {formData.website || '—'}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="text-xs uppercase tracking-wide text-slate-400">Billing snapshot</p>
          <ul className="mt-3 space-y-1">
            <li><span className="font-semibold">Monthly fee:</span> {formData.monthlyFee ? `MVR ${Number(formData.monthlyFee).toFixed(2)}` : '—'}</li>
            <li><span className="font-semibold">Billing start:</span> {formData.billingStartDate || '—'}</li>
            <li><span className="font-semibold">Notes:</span> {formData.billingNotes || '—'}</li>
          </ul>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Capabilities</p>
        {selectedCapabilities.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {selectedCapabilities.map((cap) => (
              <span key={cap} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                {cap}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No capabilities selected yet.</p>
        )}
        {formData.notes && (
          <p className="mt-3 text-sm text-slate-600">{formData.notes}</p>
        )}
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-slate-400">Files & branding</p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600">
          <li>Logo: {logoData ? logoData.name : '—'}</li>
          <li>Documents: {documentsList.length ? documentsList.map((doc) => doc.name).join(', ') : '—'}</li>
        </ul>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return identitySection;
      case 2:
        return capabilitySection;
      case 3:
        return billingSection;
      default:
        return reviewSection;
    }
  };

  const reviewSidebar = (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
          <FaChartLine className="text-rose-500" /> Submission snapshot
        </div>
        <div className="mt-3 space-y-2 text-sm text-slate-600">
          <div><span className="font-semibold">Entity:</span> {formData.legalName || '—'}</div>
          <div><span className="font-semibold">Contact:</span> {formData.contactPerson || '—'}</div>
          <div><span className="font-semibold">Capabilities:</span> {selectedCapabilities.length || 0} selected</div>
          <div><span className="font-semibold">Monthly fee:</span> {formData.monthlyFee ? `MVR ${Number(formData.monthlyFee).toFixed(2)}` : '—'}</div>
          <div><span className="font-semibold">Billing start:</span> {formData.billingStartDate || '—'}</div>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-slate-400">Files attached</p>
        <ul className="mt-3 space-y-2 text-sm text-slate-600">
          <li>Logo: {logoData ? logoData.name : '—'}</li>
          <li>Documents: {documentsList.length ? documentsList.map((d) => d.name).join(', ') : '—'}</li>
        </ul>
      </div>
    </div>
  );

  const showReviewSidebar = step === totalSteps;
  const sidebarContent = showReviewSidebar ? reviewSidebar : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 px-4 py-10 lg:px-8">
      <div className="mx-auto w-full max-w-screen-2xl space-y-8">
        <section className="rounded-2xl border border-rose-100 bg-white/95 p-6 shadow-2xl shadow-rose-100/40">
          <div className="flex flex-col gap-6 items-start">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
                Become a partner
              </span>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Join our vendor network</h1>
                <p className="mt-2 text-sm text-slate-600">
                  We work with suppliers, integrators, and creative teams. Share your details and our procurement group will follow up within two business days.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                {TRUST_POINTS.map((point) => (
                  <div key={point.title} className="rounded-2xl border border-rose-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <point.icon className="text-rose-500" /> {point.title}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{point.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] sm:gap-4 sm:text-sm">
              {(
                stats && (stats.totalProducts || stats.vendors || stats.sellers)
                  ? [
                      { label: 'Total products', value: stats.totalProducts },
                      { label: 'Approved vendors', value: stats.vendors },
                      { label: 'Peer sellers', value: stats.sellers },
                    ]
                  : HERO_STATS
              ).map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-rose-100 bg-white px-2 py-2 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900 sm:text-lg">{stat.value}</div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {!showReviewSidebar && (
          <section className="rounded-2xl border border-rose-100 bg-white/95 p-5 shadow-lg shadow-rose-100/20">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <FaUserTie className="text-rose-500" /> What happens next
                </div>
                <p className="mt-1 text-xs text-slate-500">Three quick checkpoints before your partner portal unlocks.</p>
              </div>
              <div className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
                <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Compliance</p>
                  <p className="mt-1">We review your uploads within two business days.</p>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Intro call</p>
                  <p className="mt-1">A procurement lead schedules a 20‑min intro call.</p>
                </div>
                <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billing</p>
                  <p className="mt-1">Monthly billing starts on the 1st after your start date.</p>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-rose-100/30">
          <div className={`grid gap-10 ${sidebarContent ? 'lg:grid-cols-[3fr,2fr]' : ''}`}>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-rose-100 bg-rose-50/60 p-3 sm:flex sm:flex-row sm:flex-wrap">
                {ONBOARDING_STEPS.map((item) => (
                  <div
                    key={item.id}
                    className={`flex flex-col rounded-xl border px-3 py-2 text-xs ${
                      step === item.id ? 'border-rose-400 bg-white shadow-sm' : 'border-transparent text-slate-500'
                    }`}
                  >
                    <div className="text-[10px] uppercase tracking-wide text-slate-400">Step {item.id}</div>
                    <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                    <p className="text-[10px] text-slate-500">{item.description}</p>
                  </div>
                ))}
              </div>

              {renderStepContent()}

              <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-white/95 pb-3 pt-4 sm:static sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:pb-0">
                <div className="text-xs text-slate-400">Step {step} of {totalSteps}</div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => navigate('/')} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                    Cancel
                  </button>
                  {step > 1 && (
                    <button type="button" onClick={handlePrevStep} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
                      Back
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isFinalStep && isSubmitting}
                    className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200/60 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isFinalStep ? (isSubmitting ? 'Submitting…' : 'Submit application') : 'Continue'}
                  </button>
                </div>
              </div>
            </form>

            {sidebarContent && (
              <div className="space-y-6">
                {sidebarContent}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
