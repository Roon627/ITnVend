// @ts-nocheck
import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useAuth } from '../../components/AuthContext';
import { useTheme } from '../../components/ThemeContext';
import { useSettings } from '../../components/SettingsContext';
import ThemePanel from './ThemePanel';
import OutletsPanel from './OutletsPanel';
import EmailSettings from './EmailSettings';
import SocialLinksPanel from './SocialLinksPanel';
import ContactPanel from './ContactPanel';
import PaymentSettingsPanel from './PaymentSettingsPanel';
import {
  FRIENDLY_INVOICE_NOTE,
  FRIENDLY_INVOICE_TEMPLATE,
  FRIENDLY_QUOTE_TEMPLATE,
  FRIENDLY_QUOTE_REQUEST_TEMPLATE,
  FRIENDLY_PASSWORD_SUBJECT,
  FRIENDLY_PASSWORD_TEMPLATE,
  FRIENDLY_STAFF_ORDER_TEMPLATE,
} from './emailTemplatePresets';

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

const INVALID_LOGO_VALUES = new Set(['0', 'null', 'undefined', 'false']);
const normalizeLogoUrl = (value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (INVALID_LOGO_VALUES.has(trimmed.toLowerCase())) return '';
    return trimmed;
  }
  return '';
};

const DEFAULT_FORM = {
  outlet_name: '',
  currency: 'MVR',
  gst_rate: 0,
  store_address: '',
  invoice_template: FRIENDLY_INVOICE_NOTE,
  logo_url: '',
  email_provider: '',
  email_api_key: '',
  email_from: '',
  email_to: '',
  smtp_host: '',
  smtp_port: '',
  smtp_user: '',
  smtp_pass: '',
  smtp_secure: 0,
  smtp_require_tls: 0,
  smtp_from_name: '',
  smtp_reply_to: '',
  email_template_invoice: FRIENDLY_INVOICE_TEMPLATE,
  email_template_quote: FRIENDLY_QUOTE_TEMPLATE,
  email_template_quote_request: FRIENDLY_QUOTE_REQUEST_TEMPLATE,
  email_template_password_reset_subject: FRIENDLY_PASSWORD_SUBJECT,
  email_template_password_reset: FRIENDLY_PASSWORD_TEMPLATE,
  email_template_new_order_staff: FRIENDLY_STAFF_ORDER_TEMPLATE,
  social_facebook: '',
  social_instagram: '',
  social_whatsapp: '',
  social_telegram: '',
  payment_instructions: '',
  payment_qr_code_url: '',
  payment_transfer_details: '',
  footer_note: '',
  support_email: '',
  support_phone: '',
  support_hours: '',
};

const DEFAULT_NEW_OUTLET = {
  name: '',
  currency: 'MVR',
  gst_rate: 0,
  store_address: '',
  invoice_template: FRIENDLY_INVOICE_NOTE,
  logo_url: '',
  footer_note: '',
};

const withFallback = (value, fallback) => {
  if (typeof value === 'string' && value.trim()) return value;
  return fallback;
};

export default function Settings() {
  const { push } = useToast();
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const isAdmin = user?.role === 'admin';
  const { theme: activeTheme, setTheme, themes: themeOptions } = useTheme();
  const { refreshSettings: refreshGlobalSettings } = useSettings();

  const [globalSettings, setGlobalSettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [outlets, setOutlets] = useState([]);
  const [selectedOutletId, setSelectedOutletId] = useState(null);
  const [formState, setFormState] = useState(DEFAULT_FORM);
  const [creatingOutlet, setCreatingOutlet] = useState(false);
  const [newOutlet, setNewOutlet] = useState(DEFAULT_NEW_OUTLET);
  const [status, setStatus] = useState('idle');
  const [activeTab, setActiveTab] = useState('outlet');

  const tabs = useMemo(
    () => [
      { id: 'contact', label: 'Contact', description: 'Support contact info shown across the site.' , adminOnly: true},
      { id: 'outlet', label: 'Outlet Management', description: 'Currency, addresses, and outlet selection.' },
      { id: 'payment', label: 'Payment Settings', description: 'QR codes, transfer details, and payment instructions.' },
      { id: 'smtp', label: 'SMTP Settings', description: 'Email provider credentials and dispatch behaviour.' },
      { id: 'socials', label: 'Social Links', description: 'Storefront social links and customer touchpoints.', adminOnly: true },
      { id: 'templates', label: 'Templates', description: 'Transactional email templates for customers and staff.' },
      { id: 'themes', label: 'Themes', description: 'Switch UI themes and colours for the POS.' },
    ].filter((tab) => !tab.adminOnly || isAdmin),
    [isAdmin]
  );

  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab) && tabs.length) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const activeTabMeta = useMemo(() => tabs.find((tab) => tab.id === activeTab), [tabs, activeTab]);

  const refreshSettings = useCallback(async () => {
    try {
      const s = await api.get('/settings');
      setGlobalSettings(s);
    } catch (err) {
      console.error('Failed to load settings', err);
      push('Failed to load settings', 'error');
    } finally {
      setSettingsLoading(false);
    }
  }, [push]);

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
  }, [fetchOutlets, refreshSettings]);

  const defaultSettings = useMemo(
    () => ({
      outlet_name: globalSettings?.outlet_name ?? '',
      currency: globalSettings?.currency ?? 'MVR',
      gst_rate: globalSettings?.gst_rate ?? 0,
      store_address: globalSettings?.store_address ?? '',
      invoice_template: withFallback(globalSettings?.invoice_template, FRIENDLY_INVOICE_NOTE),
    }),
    [globalSettings]
  );

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
          invoice_template: withFallback(globalSettings.outlet?.invoice_template, defaultSettings.invoice_template),
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
      smtp_secure: globalSettings.email?.smtp_secure ?? 0,
      smtp_require_tls: globalSettings.email?.smtp_require_tls ?? 0,
      smtp_from_name: globalSettings.email?.smtp_from_name ?? '',
      smtp_reply_to: globalSettings.email?.smtp_reply_to ?? '',
      email_template_invoice: withFallback(globalSettings.email_template_invoice ?? globalSettings.invoice_template, FRIENDLY_INVOICE_TEMPLATE),
      email_template_quote: withFallback(globalSettings.email_template_quote, FRIENDLY_QUOTE_TEMPLATE),
      email_template_quote_request: withFallback(globalSettings.email_template_quote_request, FRIENDLY_QUOTE_REQUEST_TEMPLATE),
  email_template_password_reset_subject: withFallback(globalSettings.email_template_password_reset_subject, FRIENDLY_PASSWORD_SUBJECT),
  email_template_password_reset: withFallback(globalSettings.email_template_password_reset, FRIENDLY_PASSWORD_TEMPLATE),
      email_template_new_order_staff: withFallback(globalSettings.email_template_new_order_staff, FRIENDLY_STAFF_ORDER_TEMPLATE),
      logo_url: normalizeLogoUrl(globalSettings.logo_url),
      payment_instructions: (activeOutletId ? (globalSettings.outlet?.payment_instructions ?? '') : (globalSettings.payment_instructions ?? '')) ,
      payment_qr_code_url: globalSettings.payment_qr_code_url ?? '',
      payment_transfer_details: globalSettings.payment_transfer_details ?? '',
      footer_note: (activeOutletId ? (globalSettings.outlet?.footer_note ?? '') : (globalSettings.footer_note ?? '')) ,
  social_facebook: globalSettings.social_links?.facebook ?? globalSettings.social_facebook ?? '',
      social_instagram: globalSettings.social_links?.instagram ?? globalSettings.social_instagram ?? '',
      social_whatsapp: globalSettings.social_links?.whatsapp ?? globalSettings.social_whatsapp ?? '',
      social_telegram: globalSettings.social_links?.telegram ?? globalSettings.social_telegram ?? '',
      support_email: globalSettings.support_email ?? globalSettings.contact_email ?? '',
      support_phone: globalSettings.support_phone ?? globalSettings.contact_phone ?? '',
      support_hours: globalSettings.support_hours ?? globalSettings.contact_hours ?? '',
  // storefront_header_source removed from UI; keep server-side setting untouched
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
          invoice_template: withFallback(outlet.invoice_template, defaultSettings.invoice_template),
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
          payment_instructions: formState.payment_instructions,
          footer_note: formState.footer_note,
        });
      }

      const basePayload = {
        outlet_name: formState.outlet_name,
        currency: formState.currency,
        gst_rate: formState.gst_rate,
        store_address: formState.store_address,
        invoice_template: formState.invoice_template,
        payment_instructions: formState.payment_instructions,
        current_outlet_id: selectedOutletId,
        // storefront_header_source removed from UI; keep server-side default unchanged
      };

      if (isAdmin) {
        Object.assign(basePayload, {
          email_provider: formState.email_provider,
          email_api_key: formState.email_api_key,
          email_from: formState.email_from,
          email_to: formState.email_to,
          smtp_host: formState.smtp_host,
          smtp_port: formState.smtp_port,
          smtp_user: formState.smtp_user,
          smtp_pass: formState.smtp_pass,
          smtp_secure: formState.smtp_secure,
          smtp_require_tls: formState.smtp_require_tls,
          smtp_from_name: formState.smtp_from_name,
          smtp_reply_to: formState.smtp_reply_to,
          email_template_invoice: formState.email_template_invoice,
          email_template_quote: formState.email_template_quote,
          email_template_quote_request: formState.email_template_quote_request,
          email_template_password_reset_subject: formState.email_template_password_reset_subject,
          email_template_password_reset: formState.email_template_password_reset,
          email_template_new_order_staff: formState.email_template_new_order_staff,
          logo_url: normalizeLogoUrl(formState.logo_url),
          payment_qr_code_url: formState.payment_qr_code_url,
          payment_transfer_details: formState.payment_transfer_details,
          footer_note: formState.footer_note,
          social_facebook: formState.social_facebook,
          social_instagram: formState.social_instagram,
          social_whatsapp: formState.social_whatsapp,
          social_telegram: formState.social_telegram,
          support_email: formState.support_email,
          support_phone: formState.support_phone,
          support_hours: formState.support_hours,
        });
      }

      await api.put('/settings', basePayload);

      // Refresh the shared settings context so Login/Help and other consumers see the update
      await Promise.all([refreshGlobalSettings(), fetchOutlets()]);
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
      const response = await api.post('/settings/test-smtp', {});
      push(`Test message sent to ${response.to}`, 'info');
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
    return <div className="p-6">Loading settings...</div>;
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'outlet':
        return (
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
          isAdmin={isAdmin}
          defaultSettings={defaultSettings}
          formState={formState}
          updateField={updateField}
        />
        );
      case 'smtp':
        return (
          <EmailSettings
            formState={formState}
            updateField={updateField}
            useGmailPreset={useGmailPreset}
            testSmtp={testSmtp}
            isManager={isManager}
            status={status}
            showTemplates={false}
            heading="SMTP Configuration"
          />
        );
      case 'socials':
        return (
          <SocialLinksPanel
            formState={formState}
            updateField={updateField}
            canEdit={isAdmin}
          />
        );
      case 'templates':
        return (
          <EmailSettings
            formState={formState}
            updateField={updateField}
            useGmailPreset={useGmailPreset}
            testSmtp={testSmtp}
            isManager={isManager}
            status={status}
            showSmtp={false}
            heading="Email Template Library"
          />
        );
      case 'contact':
        return (
          <ContactPanel
            formState={formState}
            updateField={updateField}
            canEdit={isAdmin}
          />
        );
      case 'payment':
        return (
          <PaymentSettingsPanel
            formState={formState}
            updateField={updateField}
            canEdit={isAdmin}
          />
        );
      case 'themes':
        return <ThemePanel themeOptions={themeOptions} activeTheme={activeTheme} setTheme={setTheme} />;
      default:
        return null;
    }
  };

  const saveLabel = activeTab === 'smtp'
    ? 'Save SMTP'
    : activeTab === 'socials'
    ? 'Save Socials'
    : activeTab === 'templates'
    ? 'Save Templates'
    : activeTab === 'payment'
    ? 'Save Payment Settings'
    : 'Save Settings';

  return (
    <div className="p-6" style={{ minHeight: 'calc(100vh - 72px)' }}>
      <div className="mx-auto flex h-full max-w-6xl flex-col gap-6">
        <header className="sticky top-6 z-10 rounded-3xl border border-slate-200 bg-white/70 px-6 py-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-800">Settings</h2>
              <p className="text-sm text-slate-500">Fine-tune how ITnVend operates across outlets, communications, and style.</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={save}
                disabled={status === 'saving'}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:bg-slate-400"
                type="button"
              >
                {status === 'saving' ? 'Saving...' : saveLabel}
              </button>
              {status === 'saved' && <span className="text-sm text-emerald-600">✓ Saved</span>}
              {status === 'error' && <span className="text-sm text-rose-500">Save failed</span>}
            </div>
          </div>
          <nav className="mt-4 overflow-auto">
            <ul className="flex flex-wrap gap-2">
              {tabs.map((tab) => (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      activeTab === tab.id
                        ? 'border-blue-400 bg-blue-50 text-blue-700 shadow'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-blue-200 hover:text-blue-600'
                    }`}
                  >
                    <span>{tab.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {activeTabMeta?.description && (
            <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-400">
              {activeTabMeta.description}
            </p>
          )}
        </header>

        <section className="flex-1 space-y-6">
          {renderActiveTab()}
        </section>

        <footer className="flex items-center gap-4 border-t border-slate-200 pt-4">
          <button
            onClick={save}
            disabled={status === 'saving'}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 disabled:bg-slate-400"
            type="button"
          >
            {status === 'saving' ? 'Saving...' : saveLabel}
          </button>
          {status === 'saved' && <span className="text-sm text-emerald-600">✓ Saved</span>}
          {status === 'error' && <span className="text-sm text-rose-500">Save failed. Try again.</span>}
          {status === 'saving' && <span className="text-sm text-slate-500">Saving in progress...</span>}
          <span className="ml-auto text-xs text-slate-400">Changes affect the live POS once saved.</span>
        </footer>
      </div>
    </div>
  );
}
