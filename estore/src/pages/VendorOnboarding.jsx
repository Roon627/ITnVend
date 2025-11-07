import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaChartLine, FaCloudUploadAlt, FaHandshake, FaShieldAlt, FaTruck, FaUpload, FaUserTie } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const initialForm = {
  legalName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  capabilities: [],
  notes: '',
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
  { label: 'Live partners', value: '120+' },
  { label: 'Regions served', value: '4' },
];

const TRUST_POINTS = [
  { icon: FaShieldAlt, title: 'Compliance ready', body: 'We vet suppliers for secure procurement and regulatory alignment.' },
  { icon: FaTruck, title: 'Regional reach', body: 'Deployments available across Malé, Hulhumalé, Addu and resorts.' },
  { icon: FaUserTie, title: 'Briefs & forecasts', body: 'Approved partners receive early access to upcoming opportunity briefs.' },
];

export default function VendorOnboarding() {
  const [formData, setFormData] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
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

  const handleLogo = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setLogoData({ name: f.name, data: reader.result });
    reader.readAsDataURL(f);
  };

  const handleDocs = (e) => {
    const list = Array.from(e.target.files || []);
    for (const f of list) {
      const reader = new FileReader();
      reader.onload = () => setDocuments((prev) => [...prev, { name: f.name, data: reader.result }]);
      reader.readAsDataURL(f);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
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
        notes: formData.notes,
        logo_data: logoData?.data || null,
        documents: documents.map(d => ({ name: d.name, data: d.data })),
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
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
            <div className="grid flex-1 grid-cols-3 gap-4 text-center">
              {HERO_STATS.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-blue-100 bg-white px-4 py-3 shadow-sm">
                  <div className="text-xl font-semibold text-slate-900">{stat.value}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-blue-100/30">
          <div className="grid gap-10 lg:grid-cols-[3fr,2fr]">
            <form onSubmit={handleSubmit} className="space-y-6">
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
                  <input name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="Full name" required className="rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="email@example.com" required className="rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  <input name="phone" value={formData.phone} onChange={handleChange} placeholder="(+960) …" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                  <input name="address" value={formData.address} onChange={handleChange} placeholder="Head office address" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Capabilities & scope</p>
                <div className="mt-3 grid gap-2">
                  {capabilitiesHints.map((cap) => (
                    <label key={cap} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm">
                      <input type="checkbox" checked={(formData.capabilities || []).includes(cap)} onChange={() => toggleCapability(cap)} />
                      <span>{cap}</span>
                    </label>
                  ))}
                  <textarea name="notes" rows={3} value={formData.notes} onChange={handleChange} placeholder="Certifications, regions served, service windows" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100" />
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

              <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => navigate('/')} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200/60 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? 'Submitting…' : 'Submit application'}
                </button>
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

