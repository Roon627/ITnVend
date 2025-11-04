import React from 'react';
import {
  FRIENDLY_INVOICE_TEMPLATE,
  FRIENDLY_QUOTE_TEMPLATE,
  FRIENDLY_QUOTE_REQUEST_TEMPLATE,
  FRIENDLY_PASSWORD_SUBJECT,
  FRIENDLY_PASSWORD_TEMPLATE,
} from './emailTemplatePresets';

export default function EmailSettings({
  formState,
  updateField,
  useGmailPreset,
  testSmtp,
  isManager,
  status,
  showSmtp = true,
  showTemplates = true,
  heading = 'Email & Quotation Settings',
}) {
  const layoutClass = showSmtp && showTemplates ? 'grid grid-cols-1 gap-6 xl:grid-cols-2' : 'space-y-6';
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
    '{{logo_url}}',
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
    '{{outlet_name}}',
    '{{logo_url}}',
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
    '{{company_suffix}}',
    '{{logo_url}}',
  ];
  const staffOrderPlaceholders = ['{{customer_name}}', '{{order_id}}', '{{invoice_id}}', '{{total}}', '{{items_html}}', '{{outlet_name}}', '{{logo_url}}'];
  const passwordPlaceholders = ['{{name}}', '{{reset_link}}', '{{logo_url}}'];

  const applyFriendlyPresets = () => {
    updateField('email_template_invoice', FRIENDLY_INVOICE_TEMPLATE);
    updateField('email_template_quote', FRIENDLY_QUOTE_TEMPLATE);
    updateField('email_template_quote_request', FRIENDLY_QUOTE_REQUEST_TEMPLATE);
    updateField('email_template_new_order_staff', FRIENDLY_STAFF_ORDER_TEMPLATE);
    updateField('email_template_password_reset_subject', FRIENDLY_PASSWORD_SUBJECT);
    updateField('email_template_password_reset', FRIENDLY_PASSWORD_TEMPLATE);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-6 shadow-sm space-y-6">
      <h3 className="text-lg font-semibold text-slate-800">{heading}</h3>
      <div className={layoutClass}>
        {showSmtp && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium">Provider</label>
              <select value={formState.email_provider} onChange={(e) => updateField('email_provider', e.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 bg-white shadow-sm" disabled={isManager}>
                <option value="">(None)</option>
                <option value="sendgrid">SendGrid (API)</option>
                <option value="smtp">SMTP (e.g., Gmail)</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium">Sender Email (From)</label>
              <input type="email" value={formState.email_from} onChange={(event) => updateField('email_from', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
            </div>

            <div>
              <label className="block text-sm font-medium">Notification Recipient (To)</label>
              <input type="email" value={formState.email_to} onChange={(event) => updateField('email_to', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
              <p className="mt-1 text-xs text-gray-500">Email address to receive system notifications (order alerts, quotes).</p>
            </div>

            {formState.email_provider === 'sendgrid' && (
              <div>
                <label className="block text-sm font-medium">API Key (e.g., SendGrid)</label>
                <input type="password" value={formState.email_api_key} onChange={(event) => updateField('email_api_key', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
              </div>
            )}

            {formState.email_provider === 'smtp' && (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium">SMTP Host</label>
                    <input type="text" value={formState.smtp_host} onChange={(event) => updateField('smtp_host', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP Port</label>
                    <input type="number" value={formState.smtp_port} onChange={(event) => updateField('smtp_port', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP User</label>
                    <input type="text" value={formState.smtp_user} onChange={(event) => updateField('smtp_user', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">SMTP Password</label>
                    <input type="password" value={formState.smtp_pass} onChange={(event) => updateField('smtp_pass', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">From name</label>
                    <input type="text" value={formState.smtp_from_name} onChange={(event) => updateField('smtp_from_name', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium">Reply-To</label>
                    <input type="email" value={formState.smtp_reply_to} onChange={(event) => updateField('smtp_reply_to', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 shadow-sm" disabled={isManager} />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button type="button" className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50" onClick={useGmailPreset} disabled={isManager}>
                    Use Gmail preset
                  </button>
                  <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60" onClick={testSmtp} disabled={isManager || status === 'saving'}>
                    {status === 'saving' ? 'Testing…' : 'Test SMTP'}
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!formState.smtp_secure} onChange={(event) => updateField('smtp_secure', event.target.checked ? 1 : 0)} disabled={isManager} />
                    Use implicit SSL (port 465)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!formState.smtp_require_tls} onChange={(event) => updateField('smtp_require_tls', event.target.checked ? 1 : 0)} disabled={isManager} />
                    Require STARTTLS (port 587)
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {showTemplates && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h4 className="text-md font-medium">Email Templates</h4>
              <button
                type="button"
                onClick={applyFriendlyPresets}
                className="rounded-full border border-blue-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-blue-600 transition hover:bg-blue-50 disabled:border-slate-200 disabled:text-slate-400"
                disabled={isManager}
                title={isManager ? 'Only admin users can update email templates' : 'Replace with friendly responsive presets'}
              >
                Use friendly presets
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">These templates are mobile-friendly HTML emails. Personalise the colours or copy and remember to keep the {'{{ ... }}'} placeholders intact. Nested tokens like {'{{customer.name}}'} or loop helpers {'{{#each}}'} are not supported.</p>
            <div className="mt-4 grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium">Invoice / Order Confirmation (customer)</label>
                <textarea value={formState.email_template_invoice} onChange={(event) => updateField('email_template_invoice', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm shadow-sm" rows={12} />
                <p className="mt-1 text-xs text-gray-500">Placeholders: {invoicePlaceholders.join(', ')}. Use {'{{items_html}}'} to embed a list of line items.</p>
              </div>
              <div>
                <label className="block text-sm font-medium">Quote receipt email (customer)</label>
                <textarea value={formState.email_template_quote} onChange={(event) => updateField('email_template_quote', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm shadow-sm" rows={10} />
                <p className="mt-1 text-xs text-gray-500">Placeholders: {quoteCustomerPlaceholders.join(', ')}.</p>
              </div>
              <div>
                <label className="block text-sm font-medium">Quote request notification (staff)</label>
                <textarea value={formState.email_template_quote_request} onChange={(event) => updateField('email_template_quote_request', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm shadow-sm" rows={10} />
                <p className="mt-1 text-xs text-gray-500">Placeholders: {quoteStaffPlaceholders.join(', ')}.</p>
              </div>
              <div>
                <label className="block text-sm font-medium">New order notification (staff)</label>
                <textarea value={formState.email_template_new_order_staff} onChange={(event) => updateField('email_template_new_order_staff', event.target.value)} className="mt-1 block w-full rounded-md border px-3 py-2 font-mono text-sm shadow-sm" rows={8} />
                <p className="mt-1 text-xs text-gray-500">Placeholders: {staffOrderPlaceholders.join(', ')}.</p>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium">Password reset subject</label>
                <input
                  type="text"
                  value={formState.email_template_password_reset_subject}
                  onChange={(event) => updateField('email_template_password_reset_subject', event.target.value)}
                  className="block w-full rounded-md border px-3 py-2 text-sm shadow-sm"
                  disabled={isManager}
                />
                <p className="text-xs text-gray-500">Keep it short and clear. Example placeholders: {passwordPlaceholders.join(', ')}.</p>
                <textarea
                  value={formState.email_template_password_reset}
                  onChange={(event) => updateField('email_template_password_reset', event.target.value)}
                  className="block w-full rounded-md border px-3 py-2 font-mono text-sm shadow-sm"
                  rows={10}
                  disabled={isManager}
                />
                <p className="text-xs text-gray-500">Body placeholders: {passwordPlaceholders.join(', ')}.</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
