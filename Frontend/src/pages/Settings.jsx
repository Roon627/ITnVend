import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useAuth } from '../components/AuthContext';
import { useTheme } from '../components/ThemeContext';
import ThemePanel from './Settings/ThemePanel';
import OutletsPanel from './Settings/OutletsPanel';
import EmailSettings from './Settings/EmailSettings';
import ReconcileModal from './Accounting/ReconcileModal';

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

      push('Failed to load settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  };

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
    refreshSettings();
  }, [fetchOutlets]);

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

  const updateField = (field, value) => setFormState((p) => ({ ...p, [field]: value }));

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
      setFormState((prev) => ({ ...prev, ...defaultSettings }));
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

  if (settingsLoading && !globalSettings) return <div className="p-6">Loading settings…</div>;

  return (
    <div className="p-6" style={{ minHeight: 'calc(100vh - 72px)' }}>
      <div className="max-w-5xl mx-auto h-full flex flex-col gap-4">
        {/* Header */}
        <div className="sticky top-6 z-20 bg-white/0 backdrop-blur-sm">
          import { useCallback, useEffect, useMemo, useState } from 'react';
          import api from '../lib/api';
          import { useToast } from '../components/ToastContext';
          import { useAuth } from '../components/AuthContext';
          import { useTheme } from '../components/ThemeContext';
          import ThemePanel from './Settings/ThemePanel';
          import OutletsPanel from './Settings/OutletsPanel';
          import EmailSettings from './Settings/EmailSettings';
          import ReconcileModal from '../components/ReconcileModal';

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
            const { theme: activeTheme, setTheme, themes: themeOptions } = useTheme();

            const [globalSettings, setGlobalSettings] = useState(null);
            const [settingsLoading, setSettingsLoading] = useState(true);
            const [outlets, setOutlets] = useState([]);
            const [selectedOutletId, setSelectedOutletId] = useState(null);
            const [formState, setFormState] = useState(DEFAULT_FORM);
            const [creatingOutlet, setCreatingOutlet] = useState(false);
            const [newOutlet, setNewOutlet] = useState(DEFAULT_NEW_OUTLET);
            const [status, setStatus] = useState('idle');
            const [reconcileOpen, setReconcileOpen] = useState(false);

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
              refreshSettings();
            }, [fetchOutlets]);

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

            const updateField = (field, value) => setFormState((p) => ({ ...p, [field]: value }));

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
                setFormState((prev) => ({ ...prev, ...defaultSettings }));
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

            const handleReconcileSubmit = async (payload) => {
              try {
                // Attempt to POST reconcile/payment to backend; endpoint may vary server-side
                await api.post('/reconcile', payload);
                push('Reconcile recorded', 'info');
              } catch (err) {
                console.error('Reconcile failed', err);
                push('Failed to record reconcile', 'error');
              }
            };

            if (settingsLoading && !globalSettings) return <div className="p-6">Loading settings…</div>;

            return (
              <div className="p-6" style={{ minHeight: 'calc(100vh - 72px)' }}>
                <div className="max-w-5xl mx-auto h-full flex flex-col gap-4">
                  {/* Header */}
                  <div className="sticky top-6 z-20 bg-white/0 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-4">
                      <h2 className="text-2xl font-bold">Settings</h2>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setReconcileOpen(true)}
                          type="button"
                          className="px-3 py-2 border rounded-md font-semibold hover:bg-gray-50"
                        >
                          Reconcile
                        </button>
                        <button
                          onClick={save}
                          disabled={status === 'saving'}
                          className="bg-blue-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                        >
                          {status === 'saving' ? 'Saving…' : 'Save Settings'}
                        </button>
                        {status === 'saved' && <span className="text-sm text-green-600">✓ Saved</span>}
                        {status === 'error' && <span className="text-sm text-red-600">Save failed</span>}
                      </div>
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 overflow-auto space-y-6">

                    <ThemePanel themeOptions={themeOptions} activeTheme={activeTheme} setTheme={setTheme} />

                    <OutletsPanel
                      outlets={outlets}
                      selectedOutletId={selectedOutletId}
                      handleSelectOutlet={handleSelectOutlet}
                      creatingOutlet={creatingOutlet}
                      setCreatingOutlet={setCreatingOutlet}
                      newOutlet={newOutlet}
                      setNewOutlet={setNewOutlet}
                      CURRENCY_OPTIONS={CURRENCY_OPTIONS}
                      createOutlet={createOutlet}
                      isManager={isManager}
                      defaultSettings={defaultSettings}
                      formState={formState}
                      updateField={updateField}
                    />

                    <EmailSettings
                      formState={formState}
                      updateField={updateField}
                      useGmailPreset={useGmailPreset}
                      testSmtp={testSmtp}
                      isManager={isManager}
                      status={status}
                    />

                    <div className="flex items-center gap-4 pt-4 border-t">
                      <button onClick={save} disabled={status === 'saving'} className="bg-blue-600 text-white px-5 py-2 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400">{status === 'saving' ? 'Saving…' : 'Save Settings'}</button>
                      {status === 'saved' && <span className="text-sm text-green-600">✓ Saved</span>}
                      {status === 'error' && <span className="text-sm text-red-600">Save failed. Please try again.</span>}
                    </div>
                  </div>
                </div>

                <ReconcileModal open={reconcileOpen} onClose={() => setReconcileOpen(false)} onSubmit={handleReconcileSubmit} />
              </div>
            );
          }
