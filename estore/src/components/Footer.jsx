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
    <footer className="border-t border-[#0f2b1d]/20 bg-gradient-to-b from-[#0f2b1d] to-[#0a1a11] py-4 text-white">
      <div className="container mx-auto flex flex-col gap-5 px-4">
        <div className="flex flex-col items-center justify-between gap-2 text-[11px] md:flex-row md:text-xs">
          <div className="text-center text-[#d7e4da] md:text-left">
            <span className="font-semibold text-white">© {year} ITnVend.</span> Serving customers in the Maldives and worldwide with a smile.
          </div>
          <div className="flex flex-col items-center gap-3 md:flex-row md:items-center">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-b from-[#1e6c45] to-[#0f2b1d] px-3 py-1 text-[11px] font-semibold text-white shadow-lg shadow-black/30 transition hover:-translate-y-0.5"
              >
                <FaHeadset aria-hidden="true" />
                Talk to a human
              </Link>
              <Link
                to="/contact?topic=issue"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/30 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-white/10"
              >
                <FaShieldAlt aria-hidden="true" />
                Report an issue
              </Link>
            </div>
            <nav aria-label="Footer navigation">
              <ul className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#9cb3a4] md:ml-3">
                <li>
                  <Link to="/vendor-onboarding" className="hover:text-white">
                    Become a vendor
                  </Link>
                </li>
                <li>
                  <Link to="/privacy" className="hover:text-white">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link to="/use" className="hover:text-white">
                    Use Policy
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
        <div className="relative isolate overflow-hidden rounded-3xl border border-[#1a3d2d] bg-gradient-to-r from-[#0f2b1d] via-[#134127] to-[#0b2416] p-3 text-center shadow-inner shadow-black/40">
          <div className="absolute -left-10 -top-10 h-24 w-24 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
          <div className="absolute -bottom-6 -right-8 h-24 w-24 rounded-full bg-white/10 blur-3xl" aria-hidden="true" />
          <div className="relative mx-auto flex max-w-xl flex-col items-center gap-2.5">
            <p className="text-[9px] font-semibold uppercase tracking-[0.4em] text-[#9cb3a4]">Stay in the loop</p>
            <h3 className="text-sm font-semibold text-white text-balance">Our social circles rotate faster than the Maldives sunsets.</h3>
            <p className="text-sm text-[#d4e0d7] text-balance">
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
                      className="group relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#0f2b1d] shadow-md shadow-black/20 transition hover:-translate-y-0.5 hover:text-[#1c5b3a]"
                      aria-label={label}
                    >
                      <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#cfe2d6] to-[#f2f7f3] opacity-0 transition group-hover:opacity-100" aria-hidden="true" />
                      <IconComponent className="relative text-base" aria-hidden="true" />
                    </a>
                  );
                })
              ) : (
                <span className="rounded-full border border-dashed border-white/40 px-3 py-1.5 text-xs font-medium text-white/70">
                  Social handles coming soon—stay tuned!
                </span>
              )}
            </div>
            <Link
              to="/socials"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-[#1b4c31] to-[#0f2b1d] px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-black/25 transition hover:-translate-y-0.5"
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
