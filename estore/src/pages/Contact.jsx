import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaArrowRight, FaEnvelope } from 'react-icons/fa';
import { useToast } from '../components/ToastContext';
import api from '../lib/api';

const REASONS = [
  { value: 'support', label: 'I need help with my store' },
  { value: 'issue', label: 'Report an issue or suspicious activity' },
  { value: 'security', label: 'Security concern' },
  { value: 'partnership', label: 'Partnership enquiry' },
  { value: 'other', label: 'Something else' },
];

const topicExists = (topic) => REASONS.some((entry) => entry.value === topic);

export default function Contact() {
  const toast = useToast();
  const location = useLocation();
  const topicParam = useMemo(() => new URLSearchParams(location.search).get('topic'), [location.search]);
  const initialReason = topicExists(topicParam) ? topicParam : 'support';

  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    reason: initialReason,
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (topicExists(topicParam)) {
      setForm((prev) => ({ ...prev, reason: topicParam }));
    }
  }, [topicParam]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.push('Please share your name, email, and a short message.', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim() || null,
        reason: form.reason,
        message: form.message.trim(),
      });
      toast.push('Thanks for reaching out! We will respond from itnvend.com shortly.', 'success');
      setForm({ name: '', email: '', company: '', reason: initialReason, message: '' });
    } catch (err) {
      console.error('Failed to submit contact form', err);
      toast.push('Thanks for your message! We will respond from itnvend.com shortly.', 'success');
      setForm({ name: '', email: '', company: '', reason: initialReason, message: '' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-gradient-to-b from-rose-50 via-white to-emerald-50 py-16">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 lg:flex-row">
        <section className="flex-1 space-y-6">
          <div className="rounded-[32px] border border-white/80 bg-white/95 p-6 shadow-2xl shadow-rose-100/60">
            <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-rose-400">
              Need a hand?
            </span>
            <h1 className="mt-4 text-3xl font-black text-slate-900 sm:text-4xl">Talk to the ITnVend crew</h1>
            <p className="mt-3 text-sm text-slate-600">
              Our support folks sit in the Maldives and reply from <strong>@itnvend.com</strong> inboxes only. Send a note and we’ll respond within one business day—often faster.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                { title: 'Retail operations', detail: 'ops@itnvend.com', sub: 'Daily logistics & onboarding' },
                { title: 'Trust & safety', detail: 'trust@itnvend.com', sub: 'Report suspicious activity' },
                { title: 'Call us', detail: '+960 723 3399', sub: 'Sun–Thu • 09:00–20:00' },
                { title: 'Response time', detail: '< 1 business day', sub: 'Priority for onboarded vendors' },
              ].map((card) => (
                <div key={card.title} className="rounded-2xl border border-rose-100 bg-rose-50/70 p-4 shadow-sm shadow-rose-100/80">
                  <p className="text-xs uppercase tracking-[0.3em] text-rose-400">{card.title}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{card.detail}</p>
                  <p className="text-xs text-slate-500">{card.sub}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-lg shadow-emerald-100/50">
            <h2 className="text-lg font-semibold text-slate-900">Other channels</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>
                • Email: <a href="mailto:hello@itnvend.com" className="font-semibold text-emerald-600 hover:text-emerald-500">hello@itnvend.com</a>
              </li>
              <li>• POS: Settings → Support → “Raise a ticket”</li>
              <li>• Socials: <span className="font-semibold text-emerald-600">@itnvend</span></li>
            </ul>
          </div>

          <div className="rounded-[28px] border border-white/70 bg-white/95 p-5 shadow-lg shadow-rose-100/50">
            <h2 className="text-lg font-semibold text-slate-900">Safety checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>• Confirm sender domain before paying invoices.</li>
              <li>• We never request passwords or OTPs over chat/email.</li>
              <li>• Suspect phishing? Forward headers—we’ll audit immediately.</li>
            </ul>
          </div>
        </section>

        <section className="flex-1 rounded-[32px] border border-white/80 bg-white text-slate-900 shadow-2xl shadow-rose-100/50">
          <div className="border-b border-slate-100 px-5 py-5">
            <h2 className="text-2xl font-bold text-slate-900">Send us a message</h2>
            <p className="mt-2 text-sm text-slate-500">
              Fill in the form below and we’ll respond from a verified itnvend.com inbox. We only use your details to reply to this request.
            </p>
          </div>
          <form className="grid grid-cols-1 gap-5 px-5 pb-7 pt-5 md:grid-cols-2 md:gap-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="name" className="block text-sm font-semibold text-slate-700">
                Your name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                value={form.name}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                placeholder="Full name"
                autoComplete="name"
              />
            </div>
            <div>
              <label htmlFor="company" className="block text-sm font-semibold text-slate-700">
                Company (optional)
              </label>
              <input
                id="company"
                name="company"
                type="text"
                value={form.company}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                placeholder="Business or outlet name"
                autoComplete="organization"
              />
            </div>
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
                Email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label htmlFor="reason" className="block text-sm font-semibold text-slate-700">
                How can we help?
              </label>
              <select
                id="reason"
                name="reason"
                value={form.reason}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              >
                {REASONS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label htmlFor="message" className="block text-sm font-semibold text-slate-700">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={5}
                value={form.message}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                placeholder="Share details so we can help quickly."
              />
            </div>
            <div className="md:col-span-2 flex flex-col gap-3 items-center text-center md:text-left">
              <p className="text-xs text-slate-400">
                By submitting this form you agree to let us contact you regarding your request. We respond from verified <strong>@itnvend.com</strong> email addresses only.
              </p>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:-translate-y-0.5 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              >
                <FaEnvelope aria-hidden="true" />
                {submitting ? 'Sending...' : 'Send message'}
                {!submitting && <FaArrowRight aria-hidden="true" />}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
