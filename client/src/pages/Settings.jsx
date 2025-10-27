import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../components/AuthContext';

const CURRENCY_OPTIONS = [
  { code: 'MVR', label: 'MVR - Maldivian Rufiyaa' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'JPY', label: 'JPY - Japanese Yen' },
  { code: 'AUD', label: 'AUD - Australian Dollar' },
  { code: 'CAD', label: 'CAD - Canadian Dollar' },
  { code: 'SGD', label: 'SGD - Singapore Dollar' },
  { code: 'INR', label: 'INR - Indian Rupee' },
];

const DEFAULT_FORM = {
  outlet_name: '',
  currency: 'MVR',
  gst_rate: 0,
  store_address: '',
  invoice_template: '',
  email_provider: '',
  email_api_key: '',
  email_from: '',
  email_to: '',
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_pass: '',
  email_template_invoice: '',
  email_template_quote: '',
  email_template_quote_request: '',
};

const DEFAULT_NEW_OUTLET = {
  name: '',
  currency: 'MVR',
  gst_rate: 0,
  store_address: '',
  invoice_template: '',
};

export default function Settings() {
  const { push } = useToast();
  const { user } = useAuth();
  const isManager = user && user.role === 'manager';

  const [globalSettings, setGlobalSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const refreshSettings = async () => {
    try {
      const s = await api.get('/settings');
      setGlobalSettings(s);
    } catch (err) {
      console.error('Failed to load settings', err);
      push('Failed to load settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [creatingOutlet, setCreatingOutlet] = useState(false);
  const [newOutlet, setNewOutlet] = useState(DEFAULT_NEW_OUTLET);
  const [status, setStatus] = useState('idle');

  const fetchOutlets = useCallback(async () => {
    try {
      const list = await api.get('/outlets');
      setOutlets(list);
    } catch (err) {
      console.error(err);
      push('Failed to load outlets', 'error');
    }
  }, [push]);

  useEffect(() => {
    fetchOutlets();
  }, [fetchOutlets]);

  useEffect(() => {
    refreshSettings();
  }, []);

  const defaultSettings = useMemo(() => ({
    outlet_name: globalSettings?.outlet_name ?? '',
    currency: globalSettings?.currency ?? 'MVR',
    gst_rate: globalSettings?.gst_rate ?? 0,
    store_address: globalSettings?.store_address ?? '',
    invoice_template: globalSettings?.invoice_template ?? '',
  }), [globalSettings]);

  useEffect(() => {
    if (!globalSettings) return;
    const activeOutletId = globalSettings.outlet?.id ?? null;
    setSelectedOutletId(activeOutletId);

    const source = activeOutletId
      ? {
          outlet_name: globalSettings.outlet?.name ?? defaultSettings.outlet_name,
          currency: globalSettings.outlet?.currency ?? defaultSettings.currency,
          gst_rate: globalSettings.outlet?.gst_rate ?? defaultSettings.gst_rate,
          store_address: globalSettings.outlet?.store_address ?? defaultSettings.store_address,
          invoice_template: globalSettings.outlet?.invoice_template ?? defaultSettings.invoice_template,
        }
      : defaultSettings;

    setFormState({
      ...DEFAULT_FORM,
      ...source,
      email_provider: globalSettings.email?.provider ?? '',
      email_api_key: globalSettings.email?.api_key ?? '',
      email_from: globalSettings.email?.email_from ?? '',
      email_to: globalSettings.email?.email_to ?? '',
      smtp_host: globalSettings.email?.smtp_host ?? '',
      smtp_port: globalSettings.email?.smtp_port ?? '',
      smtp_user: globalSettings.email?.smtp_user ?? '',
      smtp_pass: '',
      email_template_invoice: globalSettings.email_template_invoice ?? globalSettings.invoice_template ?? '',
      email_template_quote: globalSettings.email_template_quote ?? '',
      email_template_quote_request: globalSettings.email_template_quote_request ?? '',
    });
  }, [globalSettings, defaultSettings]);

  const updateField = (field, value) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectOutlet = async (event) => {
    const outletId = event.target.value ? Number(event.target.value) : null;
    setSelectedOutletId(outletId);

    if (outletId) {
      const outlet = outlets.find((o) => o.id === outletId);
      if (outlet) {
        setFormState((prev) => ({
          ...prev,
          outlet_name: outlet.name ?? '',
          currency: outlet.currency ?? defaultSettings.currency,
          gst_rate: outlet.gst_rate ?? defaultSettings.gst_rate,
          store_address: outlet.store_address ?? '',
          invoice_template: outlet.invoice_template ?? '',
        }));
      }
    } else {
      setFormState((prev) => ({
        ...prev,
        ...defaultSettings,
      }));
    }

    try {
      await api.put('/settings', { current_outlet_id: outletId });
      await refreshSettings();
      push('Active outlet updated', 'info');
    } catch (err) {
      console.error(err);
      push('Failed to update active outlet', 'error');
    }
  };

  const save = async () => {
    setStatus('saving');
    try {
      if (selectedOutletId) {
        await api.put(`/outlets/${selectedOutletId}`, {
          name: formState.outlet_name,
          currency: formState.currency,
          gst_rate: formState.gst_rate,
          store_address: formState.store_address,
          invoice_template: formState.invoice_template,
        });
      }

      await api.put('/settings', {
        outlet_name: formState.outlet_name,
        currency: formState.currency,
        gst_rate: formState.gst_rate,
        store_address: formState.store_address,
        invoice_template: formState.invoice_template,
        current_outlet_id: selectedOutletId,
        email_provider: formState.email_provider || null,
        email_api_key: formState.email_api_key || null,
        email_from: formState.email_from || null,
        email_to: formState.email_to || null,
        smtp_host: formState.smtp_host || null,
        smtp_port: formState.smtp_port || null,
        smtp_user: formState.smtp_user || null,
        smtp_pass: formState.smtp_pass || null,
        email_template_invoice: formState.email_template_invoice || null,
        email_template_quote: formState.email_template_quote || null,
        email_template_quote_request: formState.email_template_quote_request || null,
      });

      await Promise.all([refreshSettings(), fetchOutlets()]);

      setStatus('saved');
      push('Settings saved', 'info');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      push('Failed to save settings', 'error');
    }
  };

  const useGmailPreset = () => {
    updateField('email_provider', 'smtp');
    updateField('smtp_host', 'smtp.gmail.com');
    updateField('smtp_port', 587);
    push('Gmail preset applied. Use your full Gmail address as SMTP user and an App Password.', 'info');
  };

  const testSmtp = async () => {
    setStatus('saving');
    try {
      const r = await api.post('/settings/test-smtp', {});
      push(`Test message sent to ${r.to}`, 'info');
      setStatus('idle');
    } catch (err) {
      console.error('SMTP test failed', err);
      push('SMTP test failed: ' + (err?.message || String(err)), 'error');
      setStatus('error');
    }
  };

  const createOutlet = async () => {
    setStatus('saving');
    try {
      const created = await api.post('/outlets', newOutlet);
      await api.put('/settings', { current_outlet_id: created.id });
      await Promise.all([fetchOutlets(), refreshSettings()]);
      setCreatingOutlet(false);
      setNewOutlet(DEFAULT_NEW_OUTLET);
      setStatus('saved');
      push('Outlet created and activated', 'info');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error(err);
      setStatus('error');
      push('Failed to create outlet', 'error');
    }
  };

  if (settingsLoading && !globalSettings) {
    return <div className="p-6">Loading settings…</div>;
  }

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Settings</h2>

      <div className="bg-white p-6 rounded-md shadow space-y-6 max-w-3xl">
        <section className="space-y-2">
          <h3 className="text-lg font-medium text-gray-800">Outlet Management</h3>
          <label className="block text-sm font-medium text-gray-700">Active Outlet</label>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
             <select
              value={selectedOutletId ?? ''}
              onChange={handleSelectOutlet}
              className="block w-full sm:w-64 border rounded px-3 py-2 bg-white shadow-sm"
            >
              <option value="">Default (Global Settings)</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {o.currency}
                </option>
              ))}
            </select>
            <button
              onClick={() => setCreatingOutlet((current) => !current)}
              className="px-3 py-2 border rounded text-sm font-medium hover:bg-gray-50"
              disabled={isManager}
              title={isManager ? 'Only administrators may create outlets' : 'Create new outlet'}
            >
              {creatingOutlet ? 'Cancel' : (isManager ? 'New Outlet (Admin only)' : 'New Outlet')}
            </button>
          </div>
        </section>

        {creatingOutlet && (
          <section className="p-4 bg-gray-50 rounded-lg border space-y-4">
            <h4 className="font-semibold text-gray-800">Create New Outlet</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input
                placeholder="Outlet Name"
                value={newOutlet.name}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, name: e.target.value }))}
                className="border px-3 py-2 rounded-md"
              />
              <select
                value={newOutlet.currency}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, currency: e.target.value }))}
                className="border px-3 py-2 rounded-md bg-white"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
              <input
                placeholder="GST rate (%)"
                type="number"
                value={newOutlet.gst_rate}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, gst_rate: parseFloat(e.target.value) || 0 }))}
                className="border px-3 py-2 rounded-md"
              />
              <div />
              <textarea
                placeholder="Store Address"
                value={newOutlet.store_address}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, store_address: e.target.value }))}
                className="md:col-span-2 border px-3 py-2 rounded-md"
                rows={3}
              />
              <textarea
                placeholder="Invoice Template"
                value={newOutlet.invoice_template}
                onChange={(e) => setNewOutlet((prev) => ({ ...prev, invoice_template: e.target.value }))}
                className="md:col-span-2 border px-3 py-2 rounded-md font-mono"
                rows={4}
              />
            </div>
              <div className="text-right">
              <button
                onClick={createOutlet}
                className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700"
                disabled={isManager}
                title={isManager ? 'Only administrators may create outlets' : ''}
              >
                {isManager ? 'Admin only' : 'Create and Activate'}
              </button>
            </div>
          </section>
    )}

        <section className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium text-gray-800">
            {selectedOutletId ? `Editing ${formState.outlet_name || 'Selected Outlet'}` : 'Global Defaults'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Outlet Name</label>
              <input
                value={formState.outlet_name}
                onChange={(e) => updateField('outlet_name', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Currency</label>
              <select
                value={formState.currency}
                onChange={(e) => updateField('currency', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 bg-white shadow-sm"
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">GST / Tax rate (%)</label>
              <input
                type="number"
                step="0.01"
                value={formState.gst_rate}
                onChange={(e) => updateField('gst_rate', parseFloat(e.target.value) || 0)}
                className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Store Address</label>
              <textarea
                value={formState.store_address}
                onChange={(e) => updateField('store_address', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
                rows={3}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Invoice Template (HTML/Text)</label>
              <textarea
                value={formState.invoice_template}
                onChange={(e) => updateField('invoice_template', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 font-mono shadow-sm"
                rows={6}
              />
            </div>
          </div>
        </section>

        <section className="pt-4 border-t">
          <h3 className="text-lg font-medium mb-3">Email &amp; Quotation Settings</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">Provider</label>
              <select
                value={formState.email_provider}
                onChange={(e) => updateField('email_provider', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 bg-white shadow-sm"
                disabled={isManager}
              >
                <option value="">(None)</option>
                <option value="sendgrid">SendGrid (API)</option>
                <option value="smtp">SMTP (e.g., Gmail)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Sender Email (From)</label>
              <input
                type="email"
                value={formState.email_from}
                onChange={(e) => updateField('email_from', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
                disabled={isManager}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Notification Recipient (To)</label>
              <input
                type="email"
                value={formState.email_to}
                onChange={(e) => updateField('email_to', e.target.value)}
                className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
                disabled={isManager}
              />
            </div>
            {formState.email_provider === 'sendgrid' && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700">API Key (e.g., SendGrid)</label>
                <input
                  type="password"
                  value={formState.email_api_key}
                  onChange={(e) => updateField('email_api_key', e.target.value)}
                  className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm"
                  disabled={isManager}
                />
              </div>
            )}
            {formState.email_provider === 'smtp' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700">SMTP Host</label>
                  <input type="text" value={formState.smtp_host} onChange={(e) => updateField('smtp_host', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">SMTP Port</label>
                  <input type="number" value={formState.smtp_port} onChange={(e) => updateField('smtp_port', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">SMTP User</label>
                  <input type="text" value={formState.smtp_user} onChange={(e) => updateField('smtp_user', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700">SMTP Password</label>
                  <input type="password" value={formState.smtp_pass} onChange={(e) => updateField('smtp_pass', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                </div>
                <div className="sm:col-span-2 flex items-center gap-3">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={useGmailPreset} disabled={isManager}>Use Gmail preset</button>
                  <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={testSmtp} disabled={isManager || status === 'saving'}>{status === 'saving' ? 'Testing…' : 'Test SMTP'}</button>
                </div>
              </>
            )}
          </div>

          <div className="mt-4">
            <h4 className="text-md font-medium mb-2">Email Templates</h4>
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700">Invoice Email Template</label>
                <textarea value={formState.email_template_invoice} onChange={(e) => updateField('email_template_invoice', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quote Email Template</label>
                <textarea value={formState.email_template_quote} onChange={(e) => updateField('email_template_quote', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Quote Request Notification Template</label>
                <textarea value={formState.email_template_quote_request} onChange={(e) => updateField('email_template_quote_request', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              </div>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-4 pt-4 border-t">
          <button
            onClick={save}
            disabled={status === 'saving'}
            className="bg-blue-600 text-white px-5 py-2 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400"
          >
            {status === 'saving' ? 'Saving…' : 'Save Settings'}
          </button>
          {status === 'saved' && <span className="text-sm text-green-600">✓ Saved</span>}
          {status === 'error' && <span className="text-sm text-red-600">Save failed. Please try again.</span>}
        </div>
      </div>
    </div>
  );
}
