import React from 'react';
import api from '../../lib/api';
import resolveMediaUrl from '../../lib/media';

const INVALID_LOGO_VALUES = new Set(['0', 'null', 'undefined', 'false']);

export default function OutletsPanel({
  outlets,
  selectedOutletId,
  handleSelectOutlet,
  creatingOutlet,
  setCreatingOutlet,
  newOutlet,
  setNewOutlet,
  CURRENCY_OPTIONS,
  createOutlet,
  isManager,
  isAdmin,
  formState,
  updateField
}) {
  const handleLogoFileChange = async (event) => {
    if (!isAdmin) return;
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        try {
          const json = await api.post('/settings/upload-logo', { filename: file.name, data: dataUrl });
          const sanitizedUrl = typeof json?.url === 'string' ? json.url.trim() : '';
          updateField('logo_url', sanitizedUrl);
        } catch (err) {
          console.error('Upload failed', err);
        }
      };
      reader.onerror = (err) => {
        console.error('Failed to read logo file', err);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Unexpected logo upload error', err);
    }
  };

  const normalizedLogoValue = (() => {
    if (typeof formState.logo_url === 'string') {
      const trimmed = formState.logo_url.trim();
      if (!trimmed) return '';
      if (INVALID_LOGO_VALUES.has(trimmed.toLowerCase())) return '';
      return trimmed;
    }
    return '';
  })();

  const renderLogoPreview = () => {
    if (normalizedLogoValue) {
      const resolved = resolveMediaUrl(normalizedLogoValue);
      if (resolved) {
        return (
          <img
            src={resolved}
            alt="Brand logo preview"
            className="h-12 w-12 object-contain rounded-md border bg-white"
          />
        );
      }
    }
    return (
      <div className="h-12 w-12 rounded-md border bg-gray-50 flex items-center justify-center text-xs text-gray-400">
        No logo uploaded
      </div>
    );
  };

  return (
    <div className="bg-white p-6 rounded-md shadow space-y-6">
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
              <option key={o.id} value={o.id}>{o.name} — {o.currency}</option>
            ))}
          </select>
          <button
            onClick={() => setCreatingOutlet((c) => !c)}
            className="px-3 py-2 border rounded text-sm font-medium hover:bg-gray-50"
            disabled={isManager}
            title={isManager ? 'Only administrators may create outlets' : 'Create new outlet'}
            type="button"
          >
            {creatingOutlet ? 'Cancel' : (isManager ? 'New Outlet (Admin only)' : 'New Outlet')}
          </button>
        </div>
      </section>

      {creatingOutlet && (
        <section className="p-4 bg-gray-50 rounded-lg border space-y-4">
          <h4 className="font-semibold text-gray-800">Create New Outlet</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Outlet Name" value={newOutlet.name} onChange={(e) => setNewOutlet((p) => ({ ...p, name: e.target.value }))} className="border px-3 py-2 rounded-md" />
            <select value={newOutlet.currency} onChange={(e) => setNewOutlet((p) => ({ ...p, currency: e.target.value }))} className="border px-3 py-2 rounded-md bg-white">
              {CURRENCY_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
            <input placeholder="GST rate (%)" type="number" value={newOutlet.gst_rate} onChange={(e) => setNewOutlet((p) => ({ ...p, gst_rate: parseFloat(e.target.value) || 0 }))} className="border px-3 py-2 rounded-md" />
            <div />
            <textarea placeholder="Store Address" value={newOutlet.store_address} onChange={(e) => setNewOutlet((p) => ({ ...p, store_address: e.target.value }))} className="md:col-span-2 border px-3 py-2 rounded-md" rows={3} />
            <div className="md:col-span-2 space-y-2">
              <label className="block text-sm font-medium text-gray-700">Invoice PDF footer note</label>
              <textarea value={newOutlet.invoice_template} onChange={(e) => setNewOutlet((p) => ({ ...p, invoice_template: e.target.value }))} className="w-full border px-3 py-2 rounded-md" rows={4} />
              <p className="text-xs text-gray-500">Keep it short and sweet. This line appears on every generated invoice (plain text only).</p>
            </div>
          </div>
          <div className="text-right">
            <button onClick={createOutlet} className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700" disabled={isManager} type="button">
              {isManager ? 'Admin only' : 'Create and Activate'}
            </button>
          </div>
        </section>
      )}

      <section className="space-y-4 pt-4 border-t">
        <h3 className="text-lg font-medium text-gray-800">{selectedOutletId ? `Editing ${formState.outlet_name || 'Selected Outlet'}` : 'Global Defaults'}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Outlet Name</label>
            <input value={formState.outlet_name} onChange={(e) => updateField('outlet_name', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Currency</label>
            <select value={formState.currency} onChange={(e) => updateField('currency', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 bg-white shadow-sm">
              {CURRENCY_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">GST / Tax rate (%)</label>
            <input type="number" step="0.01" value={formState.gst_rate} onChange={(e) => updateField('gst_rate', parseFloat(e.target.value) || 0)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Store Address</label>
            <textarea value={formState.store_address} onChange={(e) => updateField('store_address', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" rows={3} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Invoice PDF footer note</label>
            <p className="mt-1 text-xs text-slate-500">This short message prints at the bottom of generated invoices and quotes. Plain text only.</p>
            <textarea value={formState.invoice_template} onChange={(e) => updateField('invoice_template', e.target.value)} className="mt-2 block w-full border rounded-md px-3 py-2 shadow-sm" rows={4} />
          </div>

          {selectedOutletId && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Advanced Settings</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-sm font-medium">Payment Instructions</label>
                  <textarea
                    value={formState.payment_instructions || ''}
                    onChange={(e) => updateField('payment_instructions', e.target.value)}
                    className="mt-2 block w-full border rounded-md px-3 py-2 shadow-sm"
                    rows={2}
                  />
                  <p className="mt-1 text-xs text-slate-500">A short note or payment instructions to appear at the bottom of PDF invoices.</p>
                </div>

                <div>
                  <label className="block text-sm font-medium">Invoice footer note</label>
                  <textarea
                    value={formState.footer_note || ''}
                    onChange={(e) => updateField('footer_note', e.target.value)}
                    className="mt-2 block w-full border rounded-md px-3 py-2 shadow-sm"
                    rows={3}
                  />
                  <p className="mt-1 text-xs text-slate-500">A short closing note to appear after payment instructions on invoices (e.g. "Please keep this invoice as proof of payment.").</p>
                </div>
              </div>
            </div>
          )}

          <div className="md:col-span-2 border-t pt-4">
            <label className="block text-sm font-medium text-gray-700">Brand Logo</label>
            <p className="mt-1 text-xs text-slate-500">
              This logo appears on invoices, quotes, and default email templates. It is shared across all outlets.
            </p>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
              {renderLogoPreview()}
              <div className="flex flex-col gap-1">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoFileChange}
                  disabled={!isAdmin}
                  className="text-sm"
                />
                <p className="text-xs text-slate-500">
                  Upload a PNG, JPG, SVG, or GIF. Recommended size 512×512px or larger with transparent background.
                </p>
                {!isAdmin && (
                  <p className="text-xs font-medium text-rose-500">
                    Only administrators can update the shared brand logo.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
