import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaBars, FaShoppingCart, FaTimes, FaStore, FaHandshake, FaPaperPlane, FaListUl, FaUserFriends, FaShieldAlt } from 'react-icons/fa';
import { useCart } from './CartContext';

const POS_BRAND_LOGO = 'https://pos.itnvend.com:4000/uploads/logos/1762295200252-icons8-it-64.png.png';

const NAV_LINKS = [
  { to: '/market', label: 'Market Hub', description: 'Fresh drops & bundles', icon: FaStore },
  { to: '/sell', label: 'Sell with us', description: 'POS-first consignments', icon: FaHandshake },
  { to: '/shop-and-ship', label: 'Shop & Ship', description: 'Overseas cart concierge', icon: FaPaperPlane },
  { to: '/vendors', label: 'Vendor directory', description: 'Browse approved partners', icon: FaListUl },
  { to: '/vendor-onboarding', label: 'Apply as vendor', description: 'Join the marketplace', icon: FaUserFriends },
  { to: '/privacy', label: 'Trust Center', description: 'Security & policies', icon: FaShieldAlt },
];

export default function PublicNavbar() {
    const cartContext = useCart();
    const cartCount = cartContext?.cartCount ?? 0;
    const location = useLocation();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [elevated, setElevated] = useState(false);
    const [showNotice, setShowNotice] = useState(true);

    useEffect(() => {
      setMobileOpen(false);
    }, [location.pathname]);

    useEffect(() => {
      const handleScroll = () => setElevated(window.scrollY > 12);
      handleScroll();
      window.addEventListener('scroll', handleScroll, { passive: true });
      return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const activeLabel = useMemo(() => {
      const current = NAV_LINKS.find((item) => location.pathname.startsWith(item.to));
      return current?.label ?? '';
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
        className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-semibold leading-none text-white shadow-sm"
        aria-label={`${cartCount} item${cartCount === 1 ? '' : 's'} in cart`}
      >
        {cartCount}
      </span>
    ) : null;

    const cartButtonClasses = [
      'inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-rose-600 backdrop-blur-md',
      'shadow-[0_5px_25px_rgba(244,114,182,0.25)] transition-colors duration-200 hover:border-white/60 hover:shadow-[0_10px_35px_rgba(244,114,182,0.45)]'
    ].join(' ');

    return (
      <>
      {showNotice && (
        <div className="bg-gradient-to-r from-rose-500 via-rose-400 to-sky-400 text-white">
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
                onClick={() => setShowNotice(false)}
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
        className={`sticky top-0 z-40 bg-gradient-to-r from-rose-50/70 via-white/40 to-sky-50/70 backdrop-blur-md transition-shadow duration-300 ${
          elevated ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3 lg:py-4">
            <Link to="/" className="flex items-center gap-3 text-left">
              <img
                src={POS_BRAND_LOGO}
                alt="ITnVend"
                className="h-12 w-12 rounded-2xl border border-white/70 bg-white/80 object-contain p-2 shadow-md shadow-rose-200/40"
              />
              <span className="flex flex-col leading-snug text-slate-900">
                <span className="text-lg font-black tracking-tight sm:text-xl">ITnVend Market Hub</span>
                <span className="text-[13px] text-rose-400 sm:text-sm">Retail, subscriptions &amp; smiles in sync</span>
              </span>
            </Link>

          <nav className="hidden flex-1 items-center justify-center lg:flex">
            <div className="flex w-full max-w-5xl items-center justify-between gap-3 rounded-full border border-white/60 bg-white/80 px-4 py-2 shadow-sm shadow-rose-100 backdrop-blur-lg">
              {filteredNavLinks.map(({ to, label, description, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) => [
                    'group inline-flex flex-1 items-center gap-2 rounded-full border px-3 py-2 transition-all duration-200',
                    isActive
                      ? 'border-rose-200 bg-gradient-to-r from-rose-50 via-white to-sky-50 text-rose-600 shadow-sm'
                      : 'border-transparent text-slate-600 hover:-translate-y-0.5 hover:border-rose-100 hover:bg-white',
                  ].join(' ')}
                >
                  {Icon && <Icon size={18} className="text-rose-400 group-hover:text-rose-500" />}
                  <span className="flex flex-col whitespace-nowrap leading-tight">
                    <span className="text-sm font-semibold">{label}</span>
                    {description && <span className="text-[11px] font-medium text-slate-400">{description}</span>}
                  </span>
                </NavLink>
              ))}
            </div>
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link to="/cart" className={cartButtonClasses}>
              <FaShoppingCart className="mr-2" aria-hidden="true" />
              Cart
              {cartbadge}
            </Link>

            {!isOnMarketPage && (
              <Link
                to="/market"
                className="hidden items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-rose-400 to-sky-400 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200/50 transition-transform duration-200 hover:-translate-y-0.5 lg:inline-flex"
              >
                Browse curated sets
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
              <div className="text-sm font-semibold text-rose-500">
                {activeLabel ? `Currently viewing: ${activeLabel}` : 'Navigate'}
              </div>
              <button
                type="button"
                className="rounded-full border border-rose-200 p-2 text-rose-500 shadow-sm transition hover:bg-rose-50"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
              >
                <FaTimes />
              </button>
            </div>
            <nav className="space-y-2 text-base font-semibold text-rose-500">
              {filteredNavLinks.map(({ to, label, description, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-2xl border px-4 py-3 transition ${
                      isActive
                        ? 'border-rose-400 bg-rose-50 text-rose-600 shadow-sm'
                        : 'border-rose-100 bg-white hover:border-rose-200 hover:bg-rose-50/70'
                    }`
                }
                  >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {Icon && <Icon size={18} className="text-rose-400" />}
                      {label}
                    </span>
                    {description && <span className="text-xs font-normal text-slate-400">{description}</span>}
                  </div>
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-rose-200 text-xs text-rose-400">
                    •
                  </span>
                </NavLink>
              ))}
            </nav>
            <div className="mt-6 grid gap-3">
              <Link
                to="/market"
                className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-rose-500 to-sky-400 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5"
              >
                Explore Market Hub
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center justify-center rounded-full border border-rose-200 bg-white px-5 py-3 text-sm font-semibold text-rose-500 transition hover:border-rose-300 hover:text-rose-600"
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
