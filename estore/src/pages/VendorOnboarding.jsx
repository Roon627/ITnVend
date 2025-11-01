import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHandshake, FaShieldAlt, FaTruck, FaUserTie } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const initialForm = {
  legalName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  website: '',
  capabilities: '',
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
  const toast = useToast();
  const navigate = useNavigate();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      await api.post('/vendors', {
        legal_name: formData.legalName,
        contact_person: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        website: formData.website,
        capabilities: formData.capabilities,
        notes: formData.notes,
      });
      toast.push('Thanks! Our procurement team will contact you shortly.', 'success');
      setFormData(initialForm);
      navigate('/');
    } catch (error) {
      toast.push(error.response?.data?.error || 'Something went wrong. Please try again.', 'error');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen">
      <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-800 text-white">
        <div className="container mx-auto px-6 py-16 flex flex-col lg:flex-row gap-12">
          <div className="flex-1 space-y-6">
            <span className="inline-flex items-center gap-2 bg-white/10 px-4 py-1 rounded-full text-sm font-medium backdrop-blur">
              <FaHandshake className="text-emerald-300" /> Partner with ITnVend
            </span>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight">
              Join our vendor network powering IT infrastructure, digital media, and smart retail experiences.
            </h1>
            <p className="text-slate-200 text-lg">
              We partner with specialists across the region—from hardware distributors and certified installers to creative studios and
              vending innovators. Provide your details below and we’ll align the right opportunities.
            </p>
            <div className="grid gap-4 sm:grid-cols-3 text-sm text-slate-200">
              <Feature icon={<FaShieldAlt className="text-teal-300" />} title="Curated engagements" text="Opportunities scoped by our delivery teams." />
              <Feature icon={<FaTruck className="text-blue-300" />} title="Regional deployments" text="Support projects across Maldives & beyond." />
              <Feature icon={<FaUserTie className="text-indigo-300" />} title="Strategic partnership" text="Access quarterly planning & enablement." />
            </div>
          </div>
          <div className="w-full max-w-md bg-white text-slate-900 rounded-2xl shadow-xl p-6 self-start">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">What to expect</p>
            <ul className="space-y-3 text-sm text-slate-600">
              <li>• A procurement specialist will review your capabilities within 3 business days.</li>
              <li>• We may request additional credentials or references for regulated categories.</li>
              <li>• Approved partners gain access to our shared planning portal and opportunity briefings.</li>
            </ul>
            <p className="text-sm text-slate-400 mt-4">
              Already work with us? Email <a href="mailto:partners@itnvend.com" className="text-blue-600">partners@itnvend.com</a> to update your profile.
            </p>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-6 py-12">
        <div className="max-w-5xl mx-auto bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Tell us about your organisation</h2>
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="grid gap-6 md:grid-cols-2">
              <FormField
                label="Legal entity name"
                name="legalName"
                value={formData.legalName}
                onChange={handleChange}
                required
              />
              <FormField
                label="Website"
                name="website"
                type="url"
                placeholder="https://"
                value={formData.website}
                onChange={handleChange}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Primary contact</h3>
              <div className="grid gap-6 md:grid-cols-2">
                <FormField
                  label="Contact person"
                  name="contactPerson"
                  value={formData.contactPerson}
                  onChange={handleChange}
                  placeholder="Full name"
                  required
                />
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
                <FormField
                  label="Phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={handleChange}
                  placeholder="+960 ..."
                />
                <FormField
                  label="Head office address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                />
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Capabilities & scope</h3>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Core services (<span className="text-gray-500">select or describe the work you can deliver</span>)
              </label>
              <textarea
                name="capabilities"
                rows={4}
                value={formData.capabilities}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder={capabilitiesHints.join(', ')}
                required
              />
              <label className="block text-sm font-medium text-gray-700 mt-4 mb-2">
                Supporting notes <span className="text-gray-500">(references, key certifications, service regions)</span>
              </label>
              <textarea
                name="notes"
                rows={3}
                value={formData.notes}
                onChange={handleChange}
                className="w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-2 text-white font-semibold shadow hover:bg-blue-700 disabled:bg-gray-400"
              >
                {isSubmitting ? 'Submitting...' : 'Submit application'}
              </button>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}

function FormField({ label, name, value, onChange, type = 'text', placeholder, required = false }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label} {required && <span className="text-red-500">*</span>}
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="mt-1 w-full border rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
      />
    </label>
  );
}

function Feature({ icon, title, text }) {
  return (
    <div className="bg-white/10 rounded-lg p-4 space-y-2">
      <div className="text-2xl">{icon}</div>
      <div className="text-sm font-semibold tracking-wide uppercase">{title}</div>
      <p className="text-xs text-slate-200 leading-relaxed">{text}</p>
    </div>
  );
}
