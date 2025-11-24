import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

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

export default function VendorEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vendor, setVendor] = useState(null);
  const [form, setForm] = useState({
    legal_name: '',
    contact_person: '',
    email: '',
    phone: '',
    address: '',
    website: '',
    capabilities: '',
    notes: '',
    tagline: '',
    public_description: '',
    monthly_fee: '',
    billing_start_date: '',
    currency: 'USD',
    social_links: {},
    social_showcase_enabled: 1,
    verified: false,
  });

  useEffect(() => {
    let mounted = true;
    (async function load() {
      setLoading(true);
      try {
        const data = await api.get(`/vendors/${id}`);
        if (!mounted) return;
        setVendor(data);
        setForm({
          legal_name: data.legal_name || '',
          contact_person: data.contact_person || '',
          email: data.email || '',
          phone: data.phone || '',
          address: data.address || '',
          website: data.website || '',
          capabilities: data.capabilities || '',
          notes: data.notes || '',
          tagline: data.tagline || '',
          public_description: data.public_description || '',
          monthly_fee: data.monthly_fee != null ? Number(data.monthly_fee).toFixed(2) : '',
          billing_start_date: data.billing_start_date ? data.billing_start_date.slice(0, 10) : '',
          currency: data.currency || 'USD',
          social_links: data.social_links || {},
          social_showcase_enabled: data.social_showcase_enabled !== 0,
          verified: data.verified === 1,
        });
      } catch (err) {
        toast.push(err?.data?.error || 'Failed to load vendor', 'error');
        navigate('/vendors');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id, navigate, toast]);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const updateSocialField = (key, value) => {
    setForm((prev) => {
      const next = { ...(prev.social_links || {}) };
      const trimmed = value.trim();
      if (!trimmed) {
        delete next[key];
      } else {
        next[key] = value;
      }
      return { ...prev, social_links: next };
    });
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        monthly_fee: form.monthly_fee === '' ? null : Number(form.monthly_fee),
        social_showcase_enabled: form.social_showcase_enabled ? 1 : 0,
        billing_start_date: form.billing_start_date || null,
        verified: form.verified ? 1 : 0,
      };
      await api.put(`/vendors/${id}`, payload);
      toast.push('Vendor updated', 'success');
      navigate('/vendors');
    } catch (err) {
      toast.push(err?.data?.error || err?.message || 'Failed to update vendor', 'error');
    } finally {
      setSaving(false);
    }
  }

  const pageTitle = vendor ? `Edit ${vendor.legal_name}` : 'Edit vendor';

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading vendor…</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-slate-100 bg-white/80 p-6 shadow">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Vendor editor</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">{pageTitle}</h1>
          <p className="mt-1 text-sm text-slate-500">Update vendor billing, storefront copy, and contact details.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <Link to="/vendors" className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 hover:border-blue-200 hover:text-blue-600">
              ← Back to vendors
            </Link>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-white/70 bg-white/90 p-6 shadow">
          <section className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              Legal name*
              <input value={form.legal_name} onChange={(e) => updateField('legal_name', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Contact person
              <input value={form.contact_person} onChange={(e) => updateField('contact_person', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Email*
              <input type="email" value={form.email} onChange={(e) => updateField('email', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" required />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Phone
              <input value={form.phone} onChange={(e) => updateField('phone', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700 md:col-span-2">
              Address
              <input value={form.address} onChange={(e) => updateField('address', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Website
              <input value={form.website} onChange={(e) => updateField('website', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Monthly fee
              <input type="number" step="0.01" value={form.monthly_fee} onChange={(e) => updateField('monthly_fee', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Billing start date
              <input type="date" value={form.billing_start_date} onChange={(e) => updateField('billing_start_date', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Preferred currency
              <select value={form.currency} onChange={(e) => updateField('currency', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm">
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
          </section>

          <section className="rounded-3xl border border-emerald-100 bg-emerald-50/60 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Verification badge</p>
                <p className="text-xs text-emerald-700">
                  Verified vendors have provided compliance docs and maintain on-time payments. Their badge appears on storefront cards.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-800">
                <input
                  type="checkbox"
                  checked={!!form.verified}
                  onChange={(e) => updateField('verified', e.target.checked)}
                />
                Mark as verified
              </label>
            </div>
          </section>

          <section className="grid gap-4">
            <label className="text-sm font-medium text-slate-700">
              Capabilities / focus
              <textarea rows={3} value={form.capabilities} onChange={(e) => updateField('capabilities', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Internal notes
              <textarea rows={2} value={form.notes} onChange={(e) => updateField('notes', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Tagline
              <input value={form.tagline} onChange={(e) => updateField('tagline', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Public description
              <textarea rows={3} value={form.public_description} onChange={(e) => updateField('public_description', e.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm" />
            </label>
          </section>

          <section className="rounded-3xl border border-slate-100 bg-slate-50/80 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-800">Social links</p>
                <p className="text-xs text-slate-500">Displayed on the public vendor profile.</p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={!!form.social_showcase_enabled} onChange={(e) => updateField('social_showcase_enabled', e.target.checked)} />
                Publish on storefront
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SOCIAL_FIELDS.map((field) => (
                <label key={field.key} className="text-xs font-medium text-slate-600">
                  {field.label}
                  <input
                    value={form.social_links?.[field.key] || ''}
                    onChange={(e) => updateSocialField(field.key, e.target.value)}
                    className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder={`https://${field.key}.com/…`}
                  />
                </label>
              ))}
            </div>
          </section>

          <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => navigate('/vendors')} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
