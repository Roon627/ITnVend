import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaBars, FaShoppingCart, FaTimes, FaStore, FaHandshake, FaPaperPlane, FaListUl, FaUserFriends, FaShieldAlt, FaUserPlus, FaChevronDown, FaShoppingBag, FaFire, FaTags } from 'react-icons/fa';
import { useCart } from './CartContext';
import { useSettings } from './SettingsContext';
import { resolveMediaUrl } from '../lib/media';

const DEFAULT_BRAND_LOGO = '/images/logo.png';

const NAV_LINKS = [
  { to: '/market', label: 'Market Hub', description: 'Fresh drops & bundles', icon: FaStore },
  { to: '/sale', label: 'On sale', description: 'Limited-time savings', icon: FaTags },
  { to: '/sell', label: 'Sell with us', icon: FaHandshake },
  { to: '/vendor-onboarding', label: 'Apply as vendor', icon: FaUserPlus },
  { to: '/shop-and-ship', label: 'Shop & Ship', description: 'Overseas cart concierge', icon: FaPaperPlane },
  { to: '/vendors', label: 'Vendor directory', description: 'Browse approved partners', icon: FaListUl },
  { to: '/order-status', label: 'Track orders', description: 'Live order status', icon: FaFire },
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
      <span
        className="absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#0f2b1d] text-[10px] font-semibold text-white shadow-sm"
        aria-label={`${cartCount} item${cartCount === 1 ? '' : 's'} in cart`}
      >
        {cartCount}
      </span>
    ) : null;

    const cartButtonClasses = [
      'relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/40 bg-white/10 text-white shadow-sm transition',
      'hover:border-white hover:bg-white/20 hover:-translate-y-0.5'
    ].join(' ');

    const resolvedLogo = resolveMediaUrl(logoUrl) || DEFAULT_BRAND_LOGO;
    const brandName =
      settings?.branding?.name ||
      settings?.outlet?.name ||
      settings?.brand?.name ||
      'ITnVend';

    return (
      <>
      {showNotice && (
        <div className="bg-gradient-to-r from-[#0f2b1d] via-[#1a472f] to-[#0f2b1d] text-white">
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
        className={`sticky top-0 z-40 bg-gradient-to-r from-[#0f2b1d]/95 via-[#0c2115]/95 to-[#0a1a11]/95 text-white transition-shadow duration-300 ${
          elevated ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-2.5 lg:py-3">
            <Link to="/" className="flex items-center gap-3 text-left text-white">
              <img
                src={resolvedLogo}
                alt={brandName}
                className="h-12 w-12 rounded-2xl border border-white/50 bg-white/80 object-contain p-2 shadow-md shadow-black/30"
                loading="lazy"
              />
              <span className="flex flex-col leading-tight text-white">
                <span className="text-[12px] font-black tracking-tight uppercase">{brandName}</span>
                <span className="text-[8px] font-semibold uppercase tracking-[0.35em] text-[#b5ccbc]">Marketplace</span>
                <span className="text-[8px] text-[#e2efe6]">Retail, subscriptions &amp; smiles in sync</span>
              </span>
            </Link>

          <nav className="hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-5xl items-center justify-between gap-2 px-2 py-1 text-[clamp(0.5rem,0.65vw,0.7rem)] font-semibold uppercase tracking-wide text-[#cedfd4]">
              {filteredNavLinks.map((item, idx) => (
                <Fragment key={item.to}>
                  {idx !== 0 && <span className="h-7 w-[3px] rounded-full bg-gradient-to-b from-transparent via-[#c9d6cc] to-transparent opacity-90" />}
                  <NavLink
                    to={item.to}
                    title={item.description || item.label}
                    className={({ isActive }) =>
                      [
                        'group inline-flex min-w-0 flex-1 items-center justify-center px-2 py-1 text-center transition-all duration-200 rounded-xl border',
                        isActive
                          ? 'border-white/40 bg-white/15 text-white shadow-[0_8px_20px_rgba(0,0,0,0.25)]'
                          : 'border-transparent text-[#bfcec3] hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:text-white',
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

          <div className="ml-auto flex items-center gap-3">
            <div>
              <Link to="/cart" className={`${cartButtonClasses} hidden md:inline-flex`} aria-label={`Cart with ${cartCount} items`}>
                <FaShoppingCart aria-hidden="true" />
                {cartbadge}
              </Link>
            </div>

            {!isOnMarketPage && (
              <Link
                to="/market"
                className="hidden items-center gap-3 rounded-2xl px-4 py-2 text-white shadow-md shadow-rose-200/50 transition-transform duration-200 hover:-translate-y-0.5 lg:inline-flex highlight-gradient"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 text-white">
                  <FaShoppingBag />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wide">
                  Market
                  <FaFire className="ml-1 inline text-[10px]" aria-hidden="true" />
                </span>
              </Link>
            )}

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full border border-rose-200 p-2 text-rose-500 shadow-sm transition hover:bg-rose-50 lg:hidden"
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
            className={`fixed inset-x-0 top-0 z-50 origin-top rounded-b-3xl bg-white/95 px-6 pb-6 pt-4 shadow-xl backdrop-blur transition-all duration-300 ${
              mobileOpen
                ? 'pointer-events-auto translate-y-0 opacity-100'
                : 'pointer-events-none -translate-y-10 opacity-0'
            }`}
          >
            <div className="flex items-center justify-between pb-4">
              <div className="text-sm font-semibold text-[#0f2b1d]">
                {activeLabel ? `Currently viewing: ${activeLabel}` : 'Navigate'}
              </div>
              <button
                type="button"
                className="rounded-full border border-[#c9d6cc] p-2 text-[#0f2b1d] shadow-sm transition hover:bg-[#eef5f0]"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="space-y-2 text-base font-semibold text-[#10321f]">
              {filteredNavLinks.map((item) =>
                item.children ? (
                  <div key={item.label} className="space-y-2 rounded-2xl border border-[#d7e4da] bg-white p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-[#4f5c52]">
                      {item.icon && <item.icon size={16} className="text-[#0f2b1d]" />}
                      {item.label}
                    </div>
                    <div className="space-y-2 text-sm font-medium text-[#4b5a4d]">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          className={({ isActive }) =>
                            `flex flex-col rounded-xl border px-3 py-2 transition ${
                              isActive
                                ? 'border-[#0f2b1d] bg-[#edf5ef] text-[#0f2b1d]'
                                : 'border-[#d7e4da] bg-white hover:border-[#0f2b1d]/40 hover:bg-[#f3f7f4]'
                            }`
                          }
                        >
                          <span className="font-semibold">{child.label}</span>
                          {child.description && <span className="text-xs text-[#6a776b]">{child.description}</span>}
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
                          ? 'border-[#0f2b1d] bg-[#edf5ef] text-[#0f2b1d] shadow-sm'
                          : 'border-[#d7e4da] bg-white hover:border-[#0f2b1d]/40 hover:bg-[#f3f7f4]'
                      }`
                    }
                  >
                    <div className="flex flex-col">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {item.icon && <item.icon size={18} className="text-[#0f2b1d]" />}
                        {item.label}
                      </span>
                      {item.description && <span className="text-xs font-normal text-[#6a776b]">{item.description}</span>}
                    </div>
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[#d7e4da] text-xs text-[#4f5a50]">
                      •
                    </span>
                  </NavLink>
                )
              )}
            </nav>
            <div className="mt-6 grid gap-3">
              <Link
                to="/market"
                className="btn-sm btn-sm-primary inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#1b4c31] to-[#0f2b1d] text-white shadow-lg shadow-black/30 transition hover:-translate-y-0.5"
              >
                Explore Market Hub
              </Link>
              <Link
                to="/contact"
                className="btn-sm btn-sm-outline inline-flex items-center justify-center rounded-full border border-[#c9d6cc] bg-white text-[#0f2b1d] transition hover:border-[#0f2b1d] hover:text-[#0f2b1d]"
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
