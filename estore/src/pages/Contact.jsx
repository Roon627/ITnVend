import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaArrowRight, FaEnvelope, FaComments } from 'react-icons/fa';
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
    <div className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[1fr,1fr] lg:items-start">
        <section className="space-y-6">
          <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-400">
            Need a hand?
          </span>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">Talk to a real human</h1>
          <p className="text-base text-rose-400 sm:text-lg">
            Our support team is based in the Maldives and replies from <strong>@itnvend.com</strong> email addresses only. Share a few
            details and we’ll get back to you soon—typically within one business day.
          </p>
          <div className="rounded-3xl border border-rose-100 bg-white/90 p-6 shadow-rose-100">
            <h2 className="text-lg font-semibold text-slate-900">Quick safety checklist</h2>
            <ul className="mt-3 space-y-2 text-sm text-rose-500">
              <li>• Always verify the sender’s domain before responding to payment requests.</li>
              <li>• We will never ask for your password, OTPs, or credit card information over chat or email.</li>
              <li>• If something feels off, report it using the form—we’ll investigate right away.</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-rose-100 bg-white/90 p-6 shadow-rose-100">
            <h2 className="text-lg font-semibold text-slate-900">Other ways to reach us</h2>
            <ul className="mt-3 space-y-2 text-sm text-rose-500">
              <li>
                • Email: <a href="mailto:hello@itnvend.com" className="font-semibold text-rose-500 hover:text-rose-400">hello@itnvend.com</a>
              </li>
              <li>• Admin console: Settings → Support → “Raise a ticket”</li>
              <li>• Socials: @itnvend (Instagram, LinkedIn)</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-rose-100 bg-white/95 p-6 shadow-rose-100 space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Send us a note</h2>
            <button
              type="button"
              onClick={() => {
                if (window.Tawk_API) {
                  window.Tawk_API.showWidget?.();
                  window.Tawk_API.maximize?.();
                }
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"
            >
              <FaComments aria-hidden="true" />
              Live chat
            </button>
          </div>
          <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
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
            <div>
              <label htmlFor="message" className="block text-sm font-semibold text-slate-700">
                Message
              </label>
              <textarea
                id="message"
                name="message"
                rows={5}
                value={form.message}
                onChange={handleChange}
                className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                placeholder="Share details so we can help quickly."
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-sm btn-sm-primary inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 to-sky-400 text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaEnvelope aria-hidden="true" />
              {submitting ? 'Sending...' : 'Send message'}
              {!submitting && <FaArrowRight aria-hidden="true" />}
            </button>
            <p className="text-xs text-rose-400">
              By submitting this form you agree to let us contact you regarding your request. We respond from verified <strong>@itnvend.com</strong> email addresses only.
            </p>
          </form>
        </section>
      </div>
    </div>
  );
}
