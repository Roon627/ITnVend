import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { resolveMediaUrl } from '../../lib/media';

const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'twitter', label: 'Twitter' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'telegram', label: 'Telegram' },
];

const CURRENCY_OPTIONS = ['MVR', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'AUD', 'CAD', 'SGD'];

export default function VendorSettings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [form, setForm] = useState({
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    capabilities: '',
    notes: '',
    tagline: '',
    public_description: '',
    social_links: {},
    currency: 'USD',
    logo_data: null,
  });
  const [requestModal, setRequestModal] = useState(false);
  const [requestName, setRequestName] = useState('');
  const [requestDocuments, setRequestDocuments] = useState([]);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [logoPreview, setLogoPreview] = useState('');

  useEffect(() => {
    (async function load() {
      setLoading(true);
      try {
        const data = await api.get('/vendor/me');
        setVendor(data);
        setForm({
          contact_person: data.contact_person || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          website: data.website || '',
          capabilities: data.capabilities || '',
          notes: data.notes || '',
          tagline: data.tagline || '',
          public_description: data.public_description || '',
          social_links: data.social_links || {},
          currency: data.currency || 'USD',
          logo_data: null,
        });
        setLogoPreview(resolveMediaUrl(data.logo_url));
      } catch (err) {
        console.error('Failed to load vendor profile', err);
        toast.push(err?.message || 'Failed to load vendor profile', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSocialField = (key, value) => {
    setForm((prev) => {
      const nextLinks = { ...(prev.social_links || {}) };
      const trimmed = value.trim();
      if (!trimmed) {
        delete nextLinks[key];
      } else {
        nextLinks[key] = value;
      }
      return { ...prev, social_links: nextLinks };
    });
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setLogoPreview(resolveMediaUrl(vendor?.logo_url));
      setForm((prev) => ({ ...prev, logo_data: null }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setLogoPreview(reader.result);
      setForm((prev) => ({ ...prev, logo_data: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  async function handleSave(event) {
    event?.preventDefault();
    setSaving(true);
    try {
      const payload = {
        contact_person: form.contact_person,
        email: form.email,
        phone: form.phone,
        address: form.address,
        website: form.website,
        capabilities: form.capabilities,
        notes: form.notes,
        tagline: form.tagline,
        public_description: form.public_description,
        social_links: form.social_links,
        currency: form.currency,
      };
      if (form.logo_data) {
        payload.logo_data = form.logo_data;
      }
      const updated = await api.put('/vendor/me', payload);
      setVendor(updated);
      setLogoPreview(resolveMediaUrl(updated.logo_url));
      setForm((prev) => ({ ...prev, logo_data: null }));
      toast.push('Profile updated', 'success');
    } catch (err) {
      console.error('Vendor profile update failed', err);
      toast.push(err?.data?.error || err?.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  }

  const handleRequestDocs = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setRequestDocuments([]);
      return;
    }
    const encoded = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: file.name, data: reader.result });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setRequestDocuments(encoded);
  };

  async function submitLegalNameRequest(event) {
    event?.preventDefault();
    if (!requestName.trim()) return toast.push('Enter the new legal name.', 'error');
    if (!requestDocuments.length) return toast.push('Upload supporting documents.', 'error');
    setSubmittingRequest(true);
    try {
      await api.post('/vendor/me/legal-name-request', {
        legal_name: requestName.trim(),
        documents: requestDocuments,
      });
      toast.push('Request submitted for review', 'success');
      setRequestModal(false);
      setRequestDocuments([]);
      setRequestName('');
    } catch (err) {
      console.error('Failed to submit legal name request', err);
      toast.push(err?.data?.error || err?.message || 'Failed to submit request', 'error');
    } finally {
      setSubmittingRequest(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading profile…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Vendor profile</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">Account settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Update contact info, storefront messaging, and public touchpoints. Legal name changes require a verification request.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <Link to="/vendor/dashboard" className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600">
              ← Back to dashboard
            </Link>
            <button
              type="button"
              onClick={() => {
                setRequestModal(true);
                setRequestName('');
                setRequestDocuments([]);
              }}
              className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-semibold text-amber-700"
            >
              Request legal name change
            </button>
          </div>
          {vendor?.pending_profile_request && (
            <div className="mt-4 rounded-2xl border border-amber-100 bg-amber-50/80 p-3 text-sm text-amber-700">
              A profile update request is currently pending review. You’ll be notified once it’s approved or rejected.
            </div>
          )}
        </header>

        <form onSubmit={handleSave} className="space-y-6 rounded-3xl border border-white/70 bg-white/90 p-6 shadow">
          <section className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Contact person
              <input
                value={form.contact_person}
                onChange={(e) => updateField('contact_person', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Phone
              <input
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Website
              <input
                value={form.website}
                onChange={(e) => updateField('website', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Address
              <input
                value={form.address}
                onChange={(e) => updateField('address', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </section>

          <section className="grid gap-4">
            <label className="text-sm font-medium text-slate-700">
              Capabilities / focus
              <textarea
                rows={3}
                value={form.capabilities}
                onChange={(e) => updateField('capabilities', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Internal notes (private)
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tagline
              <input
                value={form.tagline}
                onChange={(e) => updateField('tagline', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Preferred currency
              <select
                value={form.currency}
                onChange={(e) => updateField('currency', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              >
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Public description
              <textarea
                rows={3}
                value={form.public_description}
                onChange={(e) => updateField('public_description', e.target.value)}
                className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Brand assets</p>
                <p className="text-xs text-slate-500">Upload a square logo for the vendor directory and product cards.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-center">
              <div className="flex items-center gap-3">
                {logoPreview ? (
                  <img src={logoPreview} alt="Vendor logo preview" className="h-20 w-20 rounded-2xl border border-white object-cover shadow" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-dashed border-slate-300 text-xs text-slate-400">
                    No logo
                  </div>
                )}
              </div>
              <div className="flex-1">
                <input type="file" accept="image/*" onChange={handleLogoChange} className="block w-full text-sm" />
                <p className="mt-2 text-xs text-slate-500">PNG, JPG, or SVG. Max 3 MB.</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Social links</p>
                <p className="text-xs text-slate-500">Published on the vendor profile and store cards.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SOCIAL_FIELDS.map((field) => (
                <label key={field.key} className="text-xs font-medium text-slate-600">
                  {field.label}
                  <input
                    value={form.social_links?.[field.key] || ''}
                    onChange={(e) => updateSocialField(field.key, e.target.value)}
                    placeholder={`https://${field.key}.com/your-handle`}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
              ))}
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>
      </div>

      {requestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-amber-100 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Request legal name change</h3>
              <button onClick={() => setRequestModal(false)} className="text-sm text-slate-500">
                Close
              </button>
            </div>
            <form className="mt-4 space-y-4" onSubmit={submitLegalNameRequest}>
              <label className="text-sm font-medium text-slate-700">
                New legal name
                <input
                  value={requestName}
                  onChange={(e) => setRequestName(e.target.value)}
                  className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                  required
                />
              </label>
              <label className="text-sm font-medium text-slate-700">
                Upload documents
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  multiple
                  onChange={handleRequestDocs}
                  className="mt-1 block w-full text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Attach registration certificates or licensing proof. PDF or image formats supported.
                </span>
              </label>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRequestModal(false)}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRequest}
                  className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50"
                >
                  {submittingRequest ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
