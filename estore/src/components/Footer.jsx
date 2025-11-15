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
    <footer className="border-t border-rose-100 bg-white/95 py-4 backdrop-blur">
      <div className="container mx-auto flex flex-col gap-5 px-4 text-rose-400">
        <div className="flex flex-col items-center justify-between gap-2 text-[11px] md:flex-row md:text-xs">
          <div className="text-center text-slate-500 md:text-left">
            <span className="font-semibold text-slate-700">© {year} ITnVend.</span> Serving customers in the Maldives and worldwide with a smile.
          </div>
          <div className="flex flex-col items-center gap-3 md:flex-row md:items-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-rose-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm shadow-rose-200 transition hover:bg-rose-600"
              >
                <FaHeadset aria-hidden="true" />
                Talk to a human
              </Link>
              <Link
                to="/contact?topic=issue"
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-3 py-1 text-[11px] font-semibold text-rose-500 transition hover:bg-rose-50"
              >
                <FaShieldAlt aria-hidden="true" />
                Report an issue
              </Link>
            </div>
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-rose-400 md:ml-3">
                <li>
                  <Link to="/vendor-onboarding" className="hover:text-rose-500">
                    Become a vendor
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-rose-500">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/use" className="hover:text-rose-500">
                    Use Policy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="relative isolate overflow-hidden rounded-3xl border border-rose-100 bg-gradient-to-r from-sky-50 via-white to-rose-50 p-3 text-center shadow-inner">
          <div className="absolute -left-10 -top-10 h-24 w-24 rounded-full bg-rose-200/40 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-6 -right-8 h-24 w-24 rounded-full bg-sky-200/40 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-xl flex-col items-center gap-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.4em] text-rose-400">Stay in the loop</p>
            <h3 className="text-sm font-semibold text-slate-700 text-balance">Our social circles rotate faster than the Maldives sunsets.</h3>
            <p className="text-sm text-slate-500 text-balance">
              Follow us for launch drops, behind-the-scenes stories, and flash deals. Tap an icon to jump in now, or explore every channel from the social hub.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              {socials.length > 0 ? (
                socials.map(({ label, icon, href }) => {
                  const IconComponent = icon;
                  return (
                    <a
                      key={label}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-rose-500 shadow-md shadow-rose-100 transition hover:-translate-y-0.5 hover:text-rose-600"
                      aria-label={label}
                    >
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-rose-100 to-sky-100 opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      <IconComponent className="relative text-base" aria-hidden="true" />
                    </a>
                  );
                })
              ) : (
                <span className="rounded-full border border-dashed border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-400">
                  Social handles coming soon—stay tuned!
                </span>
              )}
            </div>
            <Link
              to="/socials"
              className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-rose-200 transition hover:bg-rose-600"
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
