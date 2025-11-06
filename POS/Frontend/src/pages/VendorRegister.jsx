import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

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
    capabilities: '',
    notes: '',
    bank_details: '',
    logo_file: null,
    commission_rate: 0.10,
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

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-900">Vendor registration</h1>
          <p className="text-sm text-slate-500">Provide vendor details and payment information to register your business on the platform.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 bg-white p-6 rounded-lg shadow-sm">
        {step === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="text-sm font-medium text-slate-600">
              Business name
              <input value={form.legal_name} onChange={(e) => change('legal_name', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Contact person
              <input value={form.contact_person} onChange={(e) => change('contact_person', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Email
              <input type="email" value={form.email} onChange={(e) => change('email', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Phone
              <input value={form.phone} onChange={(e) => change('phone', e.target.value)} className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <div className="text-sm font-medium">Address</div>
              <input value={form.address} onChange={(e) => change('address', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
            </label>
            <label className="block">
              <div className="text-sm font-medium">Website</div>
              <input value={form.website} onChange={(e) => change('website', e.target.value)} placeholder="https://" className="mt-1 block w-full border rounded px-3 py-2" />
            </label>
            <label className="block md:col-span-2">
              <div className="text-sm font-medium">Capabilities / Services</div>
              <textarea value={form.capabilities} onChange={(e) => change('capabilities', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
            </label>
            <label className="block md:col-span-2">
              <div className="text-sm font-medium">Notes</div>
              <textarea value={form.notes} onChange={(e) => change('notes', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" rows={2} />
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block md:col-span-2">
              <div className="text-sm font-medium">Bank / Payment details</div>
              <textarea value={form.bank_details} onChange={(e) => change('bank_details', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
            </label>
            <label className="block">
              <div className="text-sm font-medium">Commission rate (decimal)</div>
              <input type="number" step="0.01" value={form.commission_rate} onChange={(e) => change('commission_rate', Number(e.target.value))} className="mt-1 block w-full border rounded px-3 py-2" />
            </label>
            <label className="block">
              <div className="text-sm font-medium">Upload logo</div>
              <input type="file" accept="image/*" onChange={(e) => change('logo_file', e.target.files && e.target.files[0])} className="mt-1 block w-full" />
              {form.logo_file && (
                <div className="mt-2 flex items-center gap-3">
                  <img src={URL.createObjectURL(form.logo_file)} alt="logo-preview" className="h-16 w-16 object-contain rounded" />
                  <div className="text-sm text-gray-600">{form.logo_file.name} ({Math.round(form.logo_file.size/1024)} KB)</div>
                </div>
              )}
            </label>
          </div>
        )}

        <div className="flex items-center justify-between">
          <div>
            {step > 1 && (
              <button type="button" className="px-4 py-2 border rounded mr-2" onClick={() => setStep((s) => s - 1)}>Back</button>
            )}
            {step < 3 && (
              <button type="button" className="px-4 py-2 bg-blue-600 text-white rounded" onClick={() => setStep((s) => s + 1)}>Next</button>
            )}
          </div>
          <div>
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-white text-sm hover:bg-blue-700 disabled:bg-blue-400">
              {loading ? 'Saving...' : 'Register vendor'}
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
}
