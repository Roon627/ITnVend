import React from 'react';

export default function EmailSettings({ formState, updateField, useGmailPreset, testSmtp, isManager, status }) {
  return (
    <div className="bg-white p-6 rounded-md shadow space-y-6">
      <h3 className="text-lg font-medium mb-3">Email & Quotation Settings</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Provider</label>
              <select value={formState.email_provider} onChange={(e) => updateField('email_provider', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 bg-white shadow-sm" disabled={isManager}>
                <option value="">(None)</option>
                <option value="sendgrid">SendGrid (API)</option>
                <option value="smtp">SMTP (e.g., Gmail)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Sender Email (From)</label>
              <input type="email" value={formState.email_from} onChange={(e) => updateField('email_from', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
            </div>

            <div>
              <label className="block text-sm font-medium">Notification Recipient (To)</label>
              <input type="email" value={formState.email_to} onChange={(e) => updateField('email_to', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
              <p className="text-xs text-gray-500 mt-1">Email address to receive system notifications (order alerts, quotes).</p>
            </div>

            {formState.email_provider === 'sendgrid' && (
              <div>
                <label className="block text-sm font-medium">API Key (e.g., SendGrid)</label>
                <input type="password" value={formState.email_api_key} onChange={(e) => updateField('email_api_key', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
              </div>
            )}

            {formState.email_provider === 'smtp' && (
              <div className="border rounded-md p-3 bg-gray-50">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium">SMTP Host</label>
                    <input type="text" value={formState.smtp_host} onChange={(e) => updateField('smtp_host', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP Port</label>
                    <input type="number" value={formState.smtp_port} onChange={(e) => updateField('smtp_port', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP User</label>
                    <input type="text" value={formState.smtp_user} onChange={(e) => updateField('smtp_user', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP Password</label>
                    <input type="password" value={formState.smtp_pass} onChange={(e) => updateField('smtp_pass', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={useGmailPreset} disabled={isManager} type="button">Use Gmail preset</button>
                  <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={testSmtp} disabled={isManager || status === 'saving'} type="button">{status === 'saving' ? 'Testing…' : 'Test SMTP'}</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-md font-medium mb-2">Email Templates</h4>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium">Invoice Email Template</label>
              <textarea value={formState.email_template_invoice} onChange={(e) => updateField('email_template_invoice', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
            </div>
            <div>
              <label className="block text-sm font-medium">Quote Email Template</label>
              <textarea value={formState.email_template_quote} onChange={(e) => updateField('email_template_quote', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
            </div>
            <div>
              <label className="block text-sm font-medium">Quote Request Notification Template</label>
              <textarea value={formState.email_template_quote_request} onChange={(e) => updateField('email_template_quote_request', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
