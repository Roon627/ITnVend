import React from 'react';
import { useSettings } from '../components/SettingsContext';

export default function ContactOnly() {
  const { settings } = useSettings();
  const supportEmail = settings?.support_email || settings?.contact_email || settings?.email?.email_from || 'support@itnvend.test';
  const supportPhone = settings?.support_phone || settings?.contact_phone || '+960 300 0000';
  const supportHours = settings?.support_hours || settings?.contact_hours || 'Sun – Thu · 9:00 – 18:00';

  return (
    <div className="min-h-screen bg-background p-6 flex items-center justify-center">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-foreground">Contact & Support</h1>
          <p className="mt-2 text-sm text-muted-foreground">Reach the support crew through the channels below. These values are managed from Settings by an administrator.</p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-4">
              <span className="text-base">✉️</span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                <p className="text-sm font-semibold text-foreground">{supportEmail}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-4">
              <span className="text-base">📱</span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                <p className="text-sm font-semibold text-foreground"><a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="text-primary hover:underline">{supportPhone}</a></p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-4">
              <span className="text-base">💼</span>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Hours</p>
                <p className="text-sm font-semibold text-foreground">{supportHours}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
