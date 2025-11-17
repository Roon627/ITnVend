import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaBars, FaShoppingCart, FaTimes, FaStore, FaHandshake, FaPaperPlane, FaListUl, FaUserFriends, FaShieldAlt, FaUserPlus, FaChevronDown, FaShoppingBag, FaFire } from 'react-icons/fa';
import { useCart } from './CartContext';
import { useSettings } from './SettingsContext';
import { resolveMediaUrl } from '../lib/media';

const DEFAULT_BRAND_LOGO = '/images/logo.png';

const NAV_LINKS = [
  { to: '/market', label: 'Market Hub', description: 'Fresh drops & bundles', icon: FaStore },
  { to: '/sell', label: 'Sell with us', icon: FaHandshake },
  { to: '/vendor-onboarding', label: 'Apply as vendor', icon: FaUserPlus },
  { to: '/shop-and-ship', label: 'Shop & Ship', description: 'Overseas cart concierge', icon: FaPaperPlane },
  { to: '/vendors', label: 'Vendor directory', description: 'Browse approved partners', icon: FaListUl },
  { to: '/privacy', label: 'Trust Center', description: 'Security & policies', icon: FaShieldAlt },
];

export default function PublicNavbar() {
  const cartContext = useCart();
  const cartCount = cartContext?.cartCount ?? 0;
    const location = useLocation();
    const { settings, logoUrl } = useSettings() || {};
    const [mobileOpen, setMobileOpen] = useState(false);
    const [elevated, setElevated] = useState(false);
    const NOTICE_KEY = 'itnvend_safety_notice_ack';
    const [showNotice, setShowNotice] = useState(() => {
      if (typeof window === 'undefined') return true;
      try {
        return localStorage.getItem(NOTICE_KEY) !== 'dismissed';
      } catch {
        return true;
      }
    });

    useEffect(() => {
      setMobileOpen(false);
    }, [location.pathname]);

    useEffect(() => {
      const handleScroll = () => setElevated(window.scrollY > 12);
      handleScroll();
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    useEffect(() => {
      if (typeof window === 'undefined') return;
      try {
        if (localStorage.getItem(NOTICE_KEY) === 'dismissed') {
          setShowNotice(false);
        }
      } catch {
        // ignore
      }
    }, []);

    const handleDismissNotice = () => {
      setShowNotice(false);
      try {
        localStorage.setItem(NOTICE_KEY, 'dismissed');
      } catch {
        // ignore storage errors
      }
    };

    const activeLabel = useMemo(() => {
      for (const item of NAV_LINKS) {
        if (location.pathname.startsWith(item.to)) return item.label;
        if (item.children) {
          const child = item.children.find((c) => location.pathname.startsWith(c.to));
          if (child) return child.label;
        }
      }
      return '';
    }, [location.pathname]);

    const isOnMarketPage = useMemo(() => location.pathname.startsWith('/market'), [location.pathname]);

    const filteredNavLinks = useMemo(() => {
      if (isOnMarketPage) {
        return NAV_LINKS.filter((link) => link.to !== '/market');
      }
      return NAV_LINKS;
    }, [isOnMarketPage]);

    const cartbadge = cartCount > 0 ? (
      <span className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#111827] text-[10px] font-semibold text-white shadow-sm">
        {cartCount}
      </span>
    ) : null;

    const cartButtonClasses =
      'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d1d5db] bg-white text-[#111827] shadow-sm transition hover:border-black hover:shadow-lg hover:-translate-y-0.5';

    const resolvedLogo = resolveMediaUrl(logoUrl) || DEFAULT_BRAND_LOGO;
    const brandName =
      settings?.branding?.name ||
      settings?.outlet?.name ||
      settings?.brand?.name ||
      'ITnVend';

    return (
      <>
      {showNotice && (
        <div className="bg-black text-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2 text-sm">
            <div className="flex flex-1 flex-wrap items-center gap-2">
              <span className="font-semibold uppercase tracking-wide">Friendly safety reminder:</span>
              <span>
                Our team writes from <strong>@itnvend.com</strong> emails only. If a message feels off, give us a heads up and stay cosy.
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs font-semibold">
              <Link
                to="/contact?topic=issue"
                className="rounded-full bg-white/20 px-3 py-1 text-white transition hover:bg-white/30"
              >
                Report suspicion
              </Link>
              <button
                type="button"
                onClick={handleDismissNotice}
                className="rounded-full border border-white/40 px-2 py-1 text-white/80 transition hover:bg-white/20"
                aria-label="Dismiss safety notice"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
      <header
        className={`sticky top-0 z-40 bg-white/95 backdrop-blur-md transition-shadow duration-300 ${
          elevated ? 'shadow-lg shadow-black/10' : 'shadow-sm'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2">
            <Link to="/" className="flex items-center gap-3 text-left">
              <img
                src={resolvedLogo}
                alt={brandName}
                className="h-10 w-10 rounded-2xl border border-[#e5e7eb] bg-white object-contain p-2 shadow"
                loading="lazy"
              />
              <span className="hidden flex-col leading-tight text-[#111827] sm:flex">
                <span className="text-[12px] font-black tracking-tight uppercase">{brandName}</span>
                <span className="text-[8px] font-semibold uppercase tracking-[0.35em] text-[#6b7280]">Marketplace</span>
              </span>
            </Link>

          <nav className="hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-4xl items-center justify-between gap-1 px-1 py-1 text-[clamp(0.45rem,0.55vw,0.65rem)] font-semibold uppercase tracking-wide text-[#6b7280]">
              {filteredNavLinks.map((item, idx) => (
                <Fragment key={item.to}>
                  {idx !== 0 && <span className="h-6 w-[2px] rounded-full bg-[#e5e7eb]" />}
                  <NavLink
                    to={item.to}
                    title={item.description || item.label}
                    className={({ isActive }) =>
                      [
                        'group inline-flex min-w-0 flex-1 items-center justify-center px-2 py-1 text-center transition-all duration-200 rounded-xl border',
                        isActive
                          ? 'border-[#111827] bg-[#111827] text-white shadow'
                          : 'border-transparent text-[#6b7280] hover:-translate-y-0.5 hover:border-[#d1d5db] hover:bg-white hover:text-black',
                      ].join(' ')
                    }
                  >
                    <span className="flex flex-col items-center justify-center leading-tight">
                      {item.label === 'Shop & Ship'
                        ? ['Shop', 'Ship'].map((word) => <span key={word}>{word}</span>)
                        : item.label.split(' ').map((word, wordIdx) => <span key={wordIdx}>{word}</span>)}
                    </span>
                  </NavLink>
                </Fragment>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link to="/cart" className={`${cartButtonClasses}`}>
              <FaShoppingCart aria-hidden="true" />
              {cartbadge}
            </Link>

            {!isOnMarketPage && (
              <Link
                to="/market"
                className="hidden items-center gap-2 rounded-full bg-black px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow transition-transform duration-200 hover:-translate-y-0.5 lg:inline-flex"
              >
                <FaShoppingBag className="text-[12px]" />
                <span className="flex items-center gap-1">
                  Market
                  <FaFire className="text-[10px] text-[#f97316]" aria-hidden="true" />
                </span>
              </Link>
            )}

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-[#e5e7eb] p-2 text-[#111827] shadow-sm transition hover:bg-gray-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <FaBars />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className="lg:hidden">
          {mobileOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/30 transition-opacity duration-200"
              onClick={() => setMobileOpen(false)}
            />
          )}
          <div
            className={`fixed inset-x-0 top-0 z-50 origin-top rounded-b-3xl border-b border-[#e5e7eb] bg-white px-6 pb-6 pt-4 shadow-xl transition-all duration-300 ${
              mobileOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-10 opacity-0'
            }`}
          >
            <div className="flex items-center justify-between pb-4">
              <div className="text-sm font-semibold text-[#111827]">
                {activeLabel ? `Currently viewing: ${activeLabel}` : 'Navigate'}
              </div>
              <button
                type="button"
                className="rounded-full border border-[#e5e7eb] p-2 text-[#111827] shadow-sm transition hover:bg-gray-50"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="space-y-2 text-base font-semibold text-[#111827]">
              {filteredNavLinks.map((item) =>
                item.children ? (
                  <div key={item.label} className="space-y-2 rounded-2xl border border-[#e5e7eb] bg-white p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#6b7280]">
                      {item.icon && <item.icon size={16} className="text-[#111827]" />}
                      {item.label}
                    </div>
                    <div className="space-y-2 text-sm font-medium text-[#4b5563]">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `flex flex-col rounded-xl border px-3 py-2 transition ${
                              isActive
                                ? 'border-[#111827] bg-gray-50 text-black'
                                : 'border-[#e5e7eb] bg-white hover:border-[#111827]/40 hover:bg-gray-50'
                            }`
                          }
                        >
                          <span className="font-semibold">{child.label}</span>
                          {child.description && <span className="text-xs text-[#6b7280]">{child.description}</span>}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-2xl border px-4 py-3 transition ${
                        isActive
                          ? 'border-[#111827] bg-gray-50 text-black shadow-sm'
                          : 'border-[#e5e7eb] bg-white hover:border-[#111827]/40 hover:bg-gray-50'
                      }`
                    }
                  >
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {item.icon && <item.icon size={18} className="text-[#111827]" />}
                        {item.label}
                      </span>
                      {item.description && <span className="text-xs font-normal text-[#6b7280]">{item.description}</span>}
                    </div>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#e5e7eb] text-xs text-[#6b7280]">
                      •
                    </span>
                  </NavLink>
                )
              )}
            </nav>
            <div className="mt-6 grid gap-3">
              <Link
                to="/market"
                className="btn-sm btn-sm-primary inline-flex items-center justify-center rounded-full transition hover:-translate-y-0.5"
              >
                Explore Market Hub
              </Link>
              <Link
                to="/contact"
                className="btn-sm btn-sm-outline inline-flex items-center justify-center rounded-full transition"
              >
                Talk to a human
              </Link>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
