import { useMemo, useState } from 'react';
import { FiSearch } from 'react-icons/fi';
import HelpContent from '../components/HelpContent';
import Modal from '../components/Modal';
import { useSettings } from '../components/SettingsContext';

const ARTICLES = [
  {
    id: 1,
    title: 'Creating invoices from the POS',
    body: 'From the POS screen add items to the cart, select a customer, then choose checkout → invoice. A PDF will be generated automatically.',
    tags: ['invoice', 'pos', 'checkout'],
    icon: '🧾',
  },
  {
    id: 2,
    title: 'Using bulk import for products',
    body: 'Navigate to Products and open the bulk import panel. Upload a CSV with required columns and validate before importing.',
    tags: ['products', 'import'],
    icon: '📦',
  },
  {
    id: 3,
    title: 'Updating outlet settings',
    body: 'Admins can adjust outlet info, tax rates, and email templates from Settings. Changes apply immediately.',
    tags: ['settings', 'outlet'],
    icon: '🏬',
  },
  {
    id: 4,
    title: 'Reconciling end-of-day totals',
    body: 'Download the daily sales summary and compare against cash drawer and payment settlement slips.',
    tags: ['finance', 'reporting'],
    icon: '📊',
  },
];

const QUICK_CHECKLIST = [
  'Sign into POS and verify outlet selection',
  'Run hardware diagnostics (printers, scanners)',
  'Check inventory alerts for low stock',
  'Review pending invoices or holds',
];

export default function Help() {
  const [query, setQuery] = useState('');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const { settings } = useSettings();
  const supportEmail = settings?.support_email || settings?.contact_email || settings?.email?.email_from || 'support@itnvend.test';
  const supportPhone = settings?.support_phone || settings?.contact_phone || settings?.support_phone || '+960 300 0000';
  const supportHours = settings?.support_hours || settings?.contact_hours || 'Sun – Thu · 9:00 – 18:00';

  const filtered = useMemo(() => {
    if (!query.trim()) return ARTICLES;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return ARTICLES.filter((article) =>
      terms.every((term) =>
        article.title.toLowerCase().includes(term) ||
        article.body.toLowerCase().includes(term) ||
        article.tags.some((tag) => tag.toLowerCase().includes(term))
      )
    );
  }, [query]);

  return (
  <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-24">
        <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                HELP HUB
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground md:text-3xl">Help &amp; Support Center</h1>
                <p className="text-sm text-muted-foreground">
                  Search quick answers, explore guides, or reach out to our support team.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSupportModal(true)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
            >
              <span role="img" aria-hidden="true">💬</span>
              Contact Support
            </button>
          </div>
        </section>

        <div className="flex justify-center">
          <div className="relative w-full max-w-md">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search for topics, e.g. invoices, import, settings..."
              className="w-full rounded-md border border-border bg-surface py-2.5 pl-11 pr-4 text-sm text-foreground shadow-sm transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

  <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {filtered.map((article) => (
            <article
              key={article.id}
              className="group flex h-full flex-col justify-between rounded-lg border border-border bg-surface p-4 shadow-sm transition hover:bg-muted/20 sm:p-5"
            >
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 text-2xl text-primary">
                  <span role="img" aria-hidden="true">{article.icon}</span>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Topic</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground">{article.title}</h2>
                <p className="text-sm text-muted-foreground">{article.body}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
                {article.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-primary/10 px-3 py-1 text-primary">
                    #{tag}
                  </span>
                ))}
              </div>
            </article>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full rounded-lg border border-border bg-surface p-6 text-center text-sm text-muted-foreground shadow-sm">
              No topics match your search just yet. Try adjusting your keywords.
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span role="img" aria-hidden="true">🕒</span>
              Start of shift checklist
            </h3>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {QUICK_CHECKLIST.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <span className="mt-0.5 inline-block h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <span role="img" aria-hidden="true">📞</span>
              Contact Support
            </h3>
            <p className="mt-3 text-sm text-muted-foreground">
              Reach the support crew through any of the channels below. We respond within minutes during business hours.
            </p>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
                <span className="text-base">✉️</span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                  <p className="text-sm font-semibold text-foreground">{supportEmail}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
                <span className="text-base">📱</span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Phone</p>
                  <p className="text-sm font-semibold text-foreground">{supportPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
                <span className="text-base">💼</span>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Hours</p>
                  <p className="text-sm font-semibold text-foreground">{supportHours}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <HelpContent />
        </section>
      </div>

      <button
        type="button"
        onClick={() => setShowSupportModal(true)}
        className="fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-md transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
      >
        <span role="img" aria-hidden="true">💬</span>
        Need Help?
      </button>

      <Modal
        open={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        title="Contact support"
        message="We will open up a live chat window in a future update. For now, use the contact options below."
        primaryText="Close"
        variant="notice"
        onPrimary={() => setShowSupportModal(false)}
      >
        <div className="max-w-md mx-auto bg-white rounded-lg p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="relative">
                <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center text-white shadow-lg animate-pulse">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h2.18a2 2 0 011.788 1.106l.72 1.44a2 2 0 01-.45 2.284l-1.2 1.2a11 11 0 005.516 5.516l1.2-1.2a2 2 0 012.284-.45l1.44.72A2 2 0 0121 18.82V21a2 2 0 01-2 2h-0" />
                  </svg>
                </div>
                <span className="absolute -bottom-1 -right-1 inline-block h-3 w-3 rounded-full bg-emerald-400 animate-bounce shadow" />
              </div>
            </div>

            <div className="flex-1">
              <h4 className="text-lg font-semibold text-foreground">Contact Support</h4>
              <p className="mt-1 text-sm text-muted-foreground">We usually respond within minutes during business hours. Use any of the channels below to reach us.</p>

              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="w-6 text-primary">✉️</span>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Email</div><div className="font-semibold text-foreground">{supportEmail}</div></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 text-primary">📱</span>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Phone</div><div className="font-semibold text-foreground"><a href={`tel:${supportPhone.replace(/\s+/g, '')}`} className="text-primary hover:underline">{supportPhone}</a></div></div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="w-6 text-primary">💼</span>
                  <div><div className="text-xs uppercase tracking-wide text-muted-foreground">Hours</div><div className="font-semibold text-foreground">{supportHours}</div></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 text-right">
            <button type="button" onClick={() => setShowSupportModal(false)} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90">Close</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
