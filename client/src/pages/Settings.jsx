import { useEffect, useState } from 'react';
import { useToast } from '../components/ToastContext';
import api from '../lib/api';

export default function Settings() {
  const [settings, setSettings] = useState({
    outlet_name: '',
    currency: 'MVR',
    gst_rate: 0,
    store_address: '',
    invoice_template: '',
  });
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [creatingOutlet, setCreatingOutlet] = useState(false);
  const [newOutlet, setNewOutlet] = useState({ name: '', currency: 'MVR', gst_rate: 0, store_address: '', invoice_template: '' });
  const [status, setStatus] = useState(null);

  const toast = useToast();

  useEffect(() => {
    api.get('/settings')
      .then((data) => {
        if (data) {
          const { outlet, ...rest } = data;
          setSettings((s) => ({ ...s, ...rest }));
          if (outlet) setSelectedOutletId(outlet.id || null);
        }
      })
      .catch(() => toast.push('Failed to load settings', 'error'));

    api.get('/outlets')
      .then((list) => setOutlets(list))
      .catch(() => toast.push('Failed to load outlets', 'error'));
  }, []);

  function updateField(field, value) {
    setSettings((s) => ({ ...s, [field]: value }));
  }

  async function save() {
    setStatus('saving');
    try {
      const payload = { ...settings, current_outlet_id: selectedOutletId };
      const updated = await api.put('/settings', payload);
      setSettings((s) => ({ ...s, ...updated }));
      setStatus('saved');
      toast.push('Settings saved', 'info');
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus('error');
      toast.push('Failed to save settings', 'error');
    }
  }

  async function createOutlet() {
    setStatus('saving');
    try {
      const created = await api.post('/outlets', newOutlet);
      // refresh outlets list and select created
      const list = await api.get('/outlets');
      setOutlets(list);
      setSelectedOutletId(created.id);
      // update settings to point to this outlet
      await api.put('/settings', { current_outlet_id: created.id });
      setCreatingOutlet(false);
      setStatus('saved');
      toast.push('Outlet created and activated', 'info');
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      setStatus('error');
      toast.push('Failed to create outlet', 'error');
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <div className="bg-white p-6 rounded-md shadow space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-gray-700">Outlet name</label>
          <input type="text" value={settings.outlet_name} onChange={(e) => updateField('outlet_name', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Active outlet</label>
          <div className="flex gap-2 items-center mt-1">
            <select value={selectedOutletId ?? ''} onChange={(e) => setSelectedOutletId(e.target.value ? Number(e.target.value) : null)} className="block w-64 border rounded px-3 py-2">
              <option value="">-- (use settings defaults) --</option>
              {outlets.map(o => <option key={o.id} value={o.id}>{o.name} ({o.currency})</option>)}
            </select>
            <button onClick={() => setCreatingOutlet((c) => !c)} className="px-3 py-2 border rounded">{creatingOutlet ? 'Cancel' : 'New outlet'}</button>
          </div>
        </div>

        {creatingOutlet && (
          <div className="p-3 bg-gray-50 rounded">
            <div className="grid grid-cols-2 gap-3">
              <input placeholder="Name" value={newOutlet.name} onChange={(e) => setNewOutlet((n) => ({ ...n, name: e.target.value }))} className="border px-2 py-1" />
              <select value={newOutlet.currency} onChange={(e) => setNewOutlet((n) => ({ ...n, currency: e.target.value }))} className="border px-2 py-1">
                <option value="MVR">MVR</option>
                <option value="USD">USD</option>
              </select>
              <input placeholder="GST rate (%)" type="number" value={newOutlet.gst_rate} onChange={(e) => setNewOutlet((n) => ({ ...n, gst_rate: parseFloat(e.target.value) || 0 }))} className="border px-2 py-1" />
              <div />
              <textarea placeholder="Store address" value={newOutlet.store_address} onChange={(e) => setNewOutlet((n) => ({ ...n, store_address: e.target.value }))} className="col-span-2 border px-2 py-1" />
              <textarea placeholder="Invoice template" value={newOutlet.invoice_template} onChange={(e) => setNewOutlet((n) => ({ ...n, invoice_template: e.target.value }))} className="col-span-2 border px-2 py-1" rows={4} />
            </div>
            <div className="mt-2">
              <button onClick={createOutlet} className="btn-primary px-3 py-2">Create and Activate</button>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700">Currency</label>
          <select value={settings.currency} onChange={(e) => updateField('currency', e.target.value)} className="mt-1 block w-32 border rounded px-3 py-2">
            <option value="MVR">MVR (Rufiyaa)</option>
            <option value="USD">USD (US Dollar)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">GST / Tax rate (%)</label>
          <input type="number" step="0.01" value={settings.gst_rate} onChange={(e) => updateField('gst_rate', parseFloat(e.target.value) || 0)} className="mt-1 block w-40 border rounded px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Store address</label>
          <textarea value={settings.store_address || ''} onChange={(e) => updateField('store_address', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2" rows={3} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Invoice template (simple HTML/text)</label>
          <textarea value={settings.invoice_template || ''} onChange={(e) => updateField('invoice_template', e.target.value)} className="mt-1 block w-full border rounded px-3 py-2 font-mono" rows={6} />
        </div>

        <div className="flex items-center gap-3">
          <button onClick={save} className="btn-primary px-4 py-2">Save settings</button>
          {status === 'saving' && <span className="text-sm text-gray-500">Saving…</span>}
          {status === 'saved' && <span className="text-sm text-green-600">Saved</span>}
          {status === 'error' && <span className="text-sm text-red-600">Failed to save</span>}
        </div>
      </div>
    </div>
  );
}
