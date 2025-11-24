import { FaGlobe, FaLaughBeam, FaShieldAlt } from 'react-icons/fa';

const VALUES = [
  {
    icon: FaShieldAlt,
    title: 'Safety first, memes second',
    body: 'Security testing is done by our engineers. Curiosity is fine, but please let the vault door stay locked unless you work here.',
  },
  {
    icon: FaLaughBeam,
    title: 'Professional, not boring',
    body: 'You can crack a tasteful joke—we do too—but harassment, hate speech, or spammy promos will insta-yeet your account.',
  },
  {
    icon: FaGlobe,
    title: 'Local laws still rule',
    body: 'Our tools go global, yet every request is bound by the laws of your billing address. If the law says “nope”, we also say “nope”.',
  },
];

const POLICY_SECTIONS = [
  {
    badge: 'Global playbook',
    title: 'How to be a brilliant human online',
    intro:
      'ITnVend products are for legitimate commerce, honest collaboration, and delightful shopping. The following will get your account quietly retired:',
    bullets: [
      'Messing with authentication, scraping private data, or poking ports that do not belong to you.',
      'Deploying malware, phishing flows, or fake storefronts.',
      'Inventing credentials, invoices, or buyer identities.',
      'Circumventing payment systems or laundering funds through our payouts.',
    ],
    footer: 'Need to test integrations? Ask us for a sandbox key instead of stress-testing production.',
  },
  {
    badge: 'Maldives specifics',
    title: 'Extra notes for island life',
    intro:
      'Market Hub operations in the Maldives follow local trade requirements and community standards. Translation: we abide by MIRA, customs, and common sense.',
    bullets: [
      'Large electronics, telecom gear, or medical items require valid import letters—upload them before requesting fulfilment.',
      'We will decline listings that promote controlled substances, political propaganda, or culturally insensitive material.',
      'Cash payments must match the billing currency on your invoice. We cannot exchange rufiyaa on arrival.',
      'On-site pickups require government ID; proxies need written consent plus an ID copy.',
    ],
    footer: 'Questions about compliance? Email support@itnvend.com and we will route you to our legal liaison.',
  },
];

export default function UsePolicy() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-rose-50 py-12 px-4">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-8">
        <section className="rounded-3xl border border-rose-100 bg-white/90 p-8 shadow-2xl shadow-rose-100/50">
          <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">House rules</p>
          <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">Acceptable Use Policy</h1>
              <p className="mt-2 text-base text-slate-600">
                We keep things useful, friendly, and secure. You keep things legal, respectful, and billable. Together we avoid awkward lawyer emails.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">TL;DR</p>
              <p className="mt-1">
                Be an adult, pay your invoices, and don’t try to hack us. Everything else is negotiable with support.
              </p>
            </div>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {VALUES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="rounded-2xl border border-slate-100 bg-white/80 p-5 text-sm text-slate-500 shadow-sm">
                <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
                  <Icon className="text-rose-400" aria-hidden />
                  {title}
                </div>
                <p className="mt-2 leading-relaxed">{body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          {POLICY_SECTIONS.map((section) => (
            <section key={section.badge} className="rounded-3xl border border-slate-100 bg-white/95 p-6 shadow-xl">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-500">
                {section.badge}
              </span>
              <h2 className="mt-3 text-2xl font-bold text-slate-900">{section.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{section.intro}</p>
              <ul className="mt-4 space-y-2 text-sm text-slate-700">
                {section.bullets.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2 rounded-2xl border border-slate-100 bg-slate-50/70 px-3 py-2"
                  >
                    <span className="text-rose-400">•</span>
                    <span className="leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-slate-500">{section.footer}</p>
            </section>
          ))}
        </div>

        <section className="rounded-3xl border border-slate-100 bg-slate-900/95 p-6 text-slate-100 shadow-2xl shadow-slate-900/20">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-rose-200">Need a ruling?</p>
              <h3 className="text-2xl font-bold">Talk to humans, not bots</h3>
              <p className="mt-1 text-sm text-slate-300">
                Email <a href="mailto:support@itnvend.com" className="text-rose-300 underline">support@itnvend.com</a> for clarifications on product categories, shipping regulations, or the occasional dad-joke approval.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-800/70 px-5 py-4 text-sm text-slate-200">
              <p className="font-semibold text-white">Escalations team</p>
              <p>Weekdays 10:00 – 18:00 MVT · Response SLA: 1 business day</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
