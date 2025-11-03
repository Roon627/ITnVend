import React from 'react';

export default function EmailSettings({ formState, updateField, useGmailPreset, testSmtp, isManager, status }) {
  const invoicePlaceholders = [
    '{{customer_name}}',
    '{{order_id}}',
    '{{invoice_id}}',
    '{{subtotal}}',
    '{{tax_amount}}',
    '{{total}}',
    '{{payment_method}}',
    '{{status}}',
    '{{preorder_flag}}',
    '{{items_html}}',
    '{{outlet_name}}',
  ];
  const quoteCustomerPlaceholders = [
    '{{contact_name}}',
    '{{contact_first}}',
    '{{contact_email}}',
    '{{quote_id}}',
    '{{invoice_id}}',
    '{{subtotal}}',
    '{{tax_amount}}',
    '{{total}}',
    '{{item_count}}',
    '{{submitted_at}}',
    '{{items_html}}',
  ];
  const quoteStaffPlaceholders = [
    '{{company_name}}',
    '{{contact_name}}',
    '{{contact_email}}',
    '{{phone}}',
    '{{submission_type}}',
    '{{existing_customer_ref}}',
    '{{registration_number}}',
    '{{details}}',
    '{{quote_id}}',
    '{{invoice_id}}',
    '{{subtotal}}',
    '{{tax_amount}}',
    '{{total}}',
    '{{item_count}}',
    '{{submitted_at}}',
    '{{items_html}}',
  ];

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
                  <div>
                    <label className="block text-sm font-medium">From name</label>
                    <input type="text" value={formState.smtp_from_name} onChange={(e) => updateField('smtp_from_name', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Reply-To</label>
                    <input type="email" value={formState.smtp_reply_to} onChange={(e) => updateField('smtp_reply_to', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-3">
                  <button className="px-3 py-2 bg-gray-100 rounded" onClick={useGmailPreset} disabled={isManager} type="button">Use Gmail preset</button>
                  <button className="px-3 py-2 bg-blue-600 text-white rounded" onClick={testSmtp} disabled={isManager || status === 'saving'} type="button">{status === 'saving' ? 'Testing…' : 'Test SMTP'}</button>
                </div>
                <div className="mt-3 flex items-center gap-4 text-sm text-gray-600">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!formState.smtp_secure} onChange={(e) => updateField('smtp_secure', e.target.checked ? 1 : 0)} disabled={isManager} />
                    Use implicit SSL (port 465)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!formState.smtp_require_tls} onChange={(e) => updateField('smtp_require_tls', e.target.checked ? 1 : 0)} disabled={isManager} />
                    Require STARTTLS (port 587)
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <h4 className="text-md font-medium mb-2">Email Templates</h4>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-sm font-medium">Invoice / Order Confirmation (customer)</label>
              <textarea value={formState.email_template_invoice} onChange={(e) => updateField('email_template_invoice', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              <p className="mt-1 text-xs text-gray-500">
                Placeholders: {invoicePlaceholders.join(', ')}. Use {'{{items_html}}'} to embed a bullet list of line items.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium">Quote receipt email (customer)</label>
              <textarea value={formState.email_template_quote} onChange={(e) => updateField('email_template_quote', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              <p className="mt-1 text-xs text-gray-500">
                Placeholders: {quoteCustomerPlaceholders.join(', ')}.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium">Quote request notification (staff)</label>
              <textarea value={formState.email_template_quote_request} onChange={(e) => updateField('email_template_quote_request', e.target.value)} className="mt-1 block w-full border rounded-md px-3 py-2 shadow-sm font-mono" rows={4} />
              <p className="mt-1 text-xs text-gray-500">
                Placeholders: {quoteStaffPlaceholders.join(', ')}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
