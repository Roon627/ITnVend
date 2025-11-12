import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaHeadset, FaShieldAlt, FaFacebookF, FaInstagram, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { useSettings } from './SettingsContext';

export default function Footer() {
  const year = new Date().getFullYear();
  const { settings } = useSettings();
  const socials = useMemo(() => {
    const base = [
      { key: 'facebook', label: 'Facebook', icon: FaFacebookF, fallback: 'https://facebook.com/itnvend' },
      { key: 'instagram', label: 'Instagram', icon: FaInstagram, fallback: 'https://instagram.com/itnvend' },
      { key: 'whatsapp', label: 'WhatsApp', icon: FaWhatsapp, fallback: 'https://wa.me/9600000000' },
      { key: 'telegram', label: 'Telegram', icon: FaTelegramPlane, fallback: 'https://t.me/itnvend' },
    ];
    const linkMap = settings?.social_links;
    return base
      .map(({ key, fallback, ...rest }) => {
        const hasKey = linkMap && Object.prototype.hasOwnProperty.call(linkMap, key);
        const candidate = hasKey ? linkMap[key] : settings?.[`social_${key}`];
        const href = candidate ?? (linkMap ? null : fallback);
        if (!href) return null;
        return { ...rest, href };
      })
      .filter(Boolean);
  }, [settings]);
  return (
    <footer className="border-t border-rose-100 bg-white/85 py-6 backdrop-blur">
      <div className="container mx-auto flex flex-col gap-8 px-6 text-rose-400">
        <div className="flex flex-col items-center justify-between gap-4 text-sm md:flex-row">
          <div className="text-center md:text-left">
            <span className="font-semibold">© {year} ITnVend.</span> Serving customers in the Maldives and worldwide with a smile.
          </div>
          <div className="flex flex-col items-center gap-3 md:flex-row md:items-center">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/contact"
                className="btn-sm btn-sm-primary inline-flex items-center gap-2 rounded-full text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5"
              >
                <FaHeadset aria-hidden="true" />
                Talk to a human
              </Link>
              <Link
                to="/contact?topic=issue"
                className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full text-rose-500 transition hover:bg-rose-50"
              >
                <FaShieldAlt aria-hidden="true" />
                Report an issue
              </Link>
            </div>
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap items-center justify-center gap-3 md:ml-4">
                <li>
                  <Link to="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                    Become a vendor
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="font-semibold text-rose-500 hover:text-rose-400">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/use" className="font-semibold text-rose-500 hover:text-rose-400">
                    Use Policy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="relative isolate overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-sky-50 via-white to-rose-50 p-6 text-center shadow-inner">
          <div className="absolute -left-16 -top-16 h-40 w-40 rounded-full bg-rose-200/40 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-10 -right-12 h-36 w-36 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-4">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-400">Stay in the loop</p>
            <h3 className="text-lg font-semibold text-slate-700">Our social circles rotate faster than the Maldives sunsets.</h3>
            <p className="text-sm text-slate-500">Follow us for launch drops, behind-the-scenes stories, and flash deals. Tap an icon to jump in now, or explore every channel from the social hub.</p>
            <div className="flex flex-wrap items-center justify-center gap-4">
              {socials.length > 0 ? (
                socials.map(({ label, icon, href }) => {
                  const IconComponent = icon;
                  return (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-rose-500 shadow-lg shadow-rose-100 transition hover:-translate-y-1 hover:text-rose-600"
                      aria-label={label}
                    >
                      <span className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-100 to-sky-100 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      <IconComponent className="relative text-lg" aria-hidden="true" />
                    </a>
                  );
                })
              ) : (
                <span className="rounded-full border border-dashed border-rose-200 px-4 py-2 text-xs font-medium text-rose-400">
                  Social handles coming soon—stay tuned!
                </span>
              )}
            </div>
            <Link
              to="/socials"
              className="btn-sm btn-sm-primary inline-flex items-center gap-2 rounded-full text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5"
            >
              Build your own vibe
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
