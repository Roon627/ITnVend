import React from 'react';
import { FaShieldAlt, FaLock, FaDatabase, FaUsers, FaFlag, FaEnvelope } from 'react-icons/fa';

const STANDARDS = [
  { icon: FaLock, title: 'Encryption by default', body: 'TLS 1.2+ for transport, disk-level encryption for stored customer data, and rotating secrets managed via Vault.' },
  { icon: FaDatabase, title: 'Minimal collection', body: 'Only the fields we need to process an order—no invasive analytics, no resale to third parties.' },
  { icon: FaUsers, title: 'Access transparency', body: 'All staff activity is logged. Least-privilege access is enforced through our POS and vendor tooling.' },
];

const GLOBAL_POLICY = [
  { label: 'Data controller', value: 'ITnVend Market Hub, Malé, Maldives' },
  { label: 'Legal bases', value: 'Contract fulfilment, legitimate interest, consent for marketing' },
  { label: 'Retention', value: 'Order history retained 5 years, support tickets 12 months, backups 30 days' },
  { label: 'Security tooling', value: 'Endpoint detection, WAF, automatic patch cadence < 14 days' },
];

const MALDIVES_POLICY = [
  'Personal-identifiable information is stored in the Maldives region unless you opt into export.',
  'All payments route through Maldives Monetary Authority–licensed processors.',
  'Government requests are reviewed by legal counsel; we notify you unless prohibited by law.',
  'Vendors must pass document verification before accessing customer addresses.',
];

const CONTACT_CHANNELS = [
  { label: 'privacy@itnvend.com', description: 'Questions about GDPR/PDPA compliance' },
  { label: 'ops@itnvend.com', description: 'Operations & incident bridge (24/7 monitored inbox)' },
  { label: '+960 723 3399', description: 'Security hotline (business days, 10:00–18:00 MVT)' },
  { label: 'Malé, Maldives', description: 'ITnVend Operations, 3rd Floor, Orchid Magu' },
  { label: 'Help → Contact Support', description: 'In-app secure messaging for existing customers' },
];

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 py-10">
      <div className="mx-auto w-full max-w-screen-2xl space-y-8 px-4 sm:px-6">
        <section className="rounded-3xl border border-rose-100 bg-white/95 p-6 shadow-2xl shadow-rose-100/40">
          <div className="flex flex-col gap-4">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-500">
                ITnVend Trust Center
              </span>
              <h1 className="text-3xl font-bold text-slate-900">Privacy & security promises</h1>
              <p className="text-sm text-slate-600">
                A single hub for everything related to privacy, data residency, and compliance. The short version:
                we keep as little data as possible, guard it heavily, and give you fast ways to reach a human if something feels off.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          {STANDARDS.map((item) => (
            <article key={item.title} className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm">
              <div className="flex items-center gap-3 text-sm font-semibold text-slate-800">
                <item.icon className="text-rose-400" />
                {item.title}
              </div>
              <p className="mt-2 text-xs text-slate-600">{item.body}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="space-y-4 rounded-3xl border border-white/70 bg-white/95 p-5 shadow-lg shadow-rose-100/30">
            <div className="flex items-center gap-2 text-rose-500">
              <FaShieldAlt /> <p className="text-xs font-semibold uppercase tracking-wide">Global policy</p>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">How we handle your data worldwide</h2>
            <p className="text-sm text-slate-600">
              Every product interaction follows the same rulebook—collect the minimum, encrypt everything,
              and give you full control to export or delete it.
            </p>
            <ul className="space-y-2 rounded-2xl border border-slate-50 bg-slate-50/60 p-4 text-sm text-slate-700">
              {GLOBAL_POLICY.map((row) => (
                <li key={row.label} className="flex items-start gap-2">
                  <span className="text-rose-400">•</span>
                  <div>
                    <p className="font-semibold text-slate-900">{row.label}</p>
                    <p className="text-xs text-slate-600">{row.value}</p>
                  </div>
                </li>
              ))}
            </ul>
          </article>

          <article className="space-y-4 rounded-3xl border border-white/70 bg-white/95 p-5 shadow-lg shadow-rose-100/30">
            <div className="flex items-center gap-2 text-emerald-500">
              <FaFlag /> <p className="text-xs font-semibold uppercase tracking-wide">Maldives privacy focus</p>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Local guarantees for 🇲🇻 merchants & buyers</h2>
            <ul className="space-y-2 text-sm text-slate-600">
              {MALDIVES_POLICY.map((item) => (
                <li key={item} className="flex items-start gap-2 rounded-2xl border border-emerald-50 bg-emerald-50/60 p-3">
                  <span className="text-emerald-500">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Need to host data outside the Maldives? Contact us for a Data Processing Agreement before exporting records.
            </p>
          </article>
        </section>

        <section className="rounded-3xl border border-rose-50 bg-white/95 p-6 shadow-lg">
          <div className="flex items-center gap-2 text-rose-500">
            <FaLock /> <p className="text-xs font-semibold uppercase tracking-wide">Need a copy of your data?</p>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {CONTACT_CHANNELS.map((channel) => (
              <div key={channel.label} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{channel.label}</p>
                <p className="text-xs text-slate-500">{channel.description}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} ITnVend · Privacy reviewed every quarter.
        </footer>
      </div>
    </div>
  );
}
