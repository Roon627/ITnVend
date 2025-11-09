import React from 'react';

export default function ContactPanel({ formState, updateField, canEdit = false }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-foreground">Contact & Support</h3>
      <p className="mt-2 text-sm text-muted-foreground">These details are shown on the login page and Help center as primary contact channels.</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-muted-foreground">Support email</label>
          <input value={formState.support_email || ''} onChange={(e) => updateField('support_email', e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded border px-3 py-2" />
        </div>

        <div>
          <label className="block text-sm font-medium text-muted-foreground">Support phone</label>
          <input value={formState.support_phone || ''} onChange={(e) => updateField('support_phone', e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded border px-3 py-2" />
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-muted-foreground">Support hours / note</label>
          <input value={formState.support_hours || ''} onChange={(e) => updateField('support_hours', e.target.value)} disabled={!canEdit} className="mt-1 w-full rounded border px-3 py-2" />
        </div>
      </div>
    </div>
  );
}
