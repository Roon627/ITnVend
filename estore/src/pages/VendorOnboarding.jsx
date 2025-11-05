import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHandshake, FaShieldAlt, FaTruck, FaUserTie, FaUpload } from 'react-icons/fa';
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
    <div className="bg-gradient-to-b from-white to-slate-50 min-h-screen">
      <section className="container mx-auto px-6 py-14">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full bg-blue-50 text-blue-700 w-max">
              <FaHandshake className="text-blue-600" /> Become a partner
            </div>
            <h1 className="text-3xl lg:text-4xl font-bold text-slate-900">Join our vendor network</h1>
            <p className="text-slate-600">We work with suppliers, integrators and creative partners. Fill this short form and our procurement team will review your submission.</p>

            <div className="grid sm:grid-cols-3 gap-4 mt-6">
              <InfoCard icon={<FaShieldAlt className="text-emerald-500" />} title="Trusted partners" body="We vet and onboard suppliers for secure, compliant engagements." />
              <InfoCard icon={<FaTruck className="text-sky-500" />} title="Regional deliveries" body="Support available across Maldives and neighbouring markets." />
              <InfoCard icon={<FaUserTie className="text-indigo-500" />} title="Strategic access" body="Approved vendors get access to opportunity briefs and planning." />
            </div>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Tell us about your organisation</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm">
                  <div className="text-sm font-medium text-slate-700">Legal entity name</div>
                  <input name="legalName" value={formData.legalName} onChange={handleChange} required className="mt-1 block w-full border rounded px-3 py-2" />
                </label>
                <label className="block text-sm">
                  <div className="text-sm font-medium text-slate-700">Website</div>
                  <input name="website" value={formData.website} onChange={handleChange} placeholder="https://" className="mt-1 block w-full border rounded px-3 py-2" />
                </label>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700">Primary contact</h3>
                <div className="grid gap-4 md:grid-cols-2 mt-3">
                  <input name="contactPerson" value={formData.contactPerson} onChange={handleChange} placeholder="Full name" className="block w-full border rounded px-3 py-2" required />
                  <input name="email" type="email" value={formData.email} onChange={handleChange} placeholder="email@example.com" className="block w-full border rounded px-3 py-2" required />
                  <input name="phone" value={formData.phone} onChange={handleChange} placeholder="+960 ..." className="block w-full border rounded px-3 py-2" />
                  <input name="address" value={formData.address} onChange={handleChange} placeholder="Head office address" className="block w-full border rounded px-3 py-2" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700">Capabilities & scope</h3>
                <div className="mt-3 grid gap-2">
                  {capabilitiesHints.map((c) => (
                    <label key={c} className="inline-flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={(formData.capabilities || []).includes(c)} onChange={() => toggleCapability(c)} />
                      <span>{c}</span>
                    </label>
                  ))}
                  <textarea name="notes" rows={3} value={formData.notes} onChange={handleChange} className="mt-2 block w-full border rounded px-3 py-2" placeholder="Additional notes, certifications, regions served" />
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-slate-700">Uploads</h3>
                <div className="mt-2 grid gap-3">
                  <label className="flex items-center gap-3 p-3 border rounded-md">
                    <FaUpload />
                    <span className="text-sm">Company logo (optional)</span>
                    <input type="file" accept="image/*" onChange={handleLogo} className="ml-auto" />
                  </label>
                  <label className="flex items-center gap-3 p-3 border rounded-md">
                    <FaUpload />
                    <span className="text-sm">Supporting documents (certificates, reference letters)</span>
                    <input type="file" multiple onChange={handleDocs} className="ml-auto" />
                  </label>
                  {logoData && <div className="text-xs text-slate-500">Logo uploaded: {logoData.name}</div>}
                  {documents.length > 0 && <div className="text-xs text-slate-500">Documents: {documents.map(d => d.name).join(', ')}</div>}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => navigate('/')} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 rounded bg-blue-600 text-white">{isSubmitting ? 'Submitting...' : 'Submit application'}</button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}

function InfoCard({ icon, title, body }) {
  return (
    <div className="bg-white border rounded-lg p-4 text-sm">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="font-semibold">{title}</div>
      <div className="text-xs text-slate-600 mt-1">{body}</div>
    </div>
  );
}

