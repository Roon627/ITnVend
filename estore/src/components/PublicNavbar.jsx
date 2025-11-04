import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { FaBars, FaShoppingCart, FaTimes } from 'react-icons/fa';
import { useCart } from './CartContext';
import logoMark from '../assets/logo.svg';

const NAV_LINKS = [
  { to: '/market', label: 'Market Hub' },
  { to: '/shop-and-ship', label: 'Shop & Ship' },
  { to: '/vendor-onboarding', label: 'Vendors' },
  { to: '/privacy', label: 'Trust Center' },
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

    const cartbadge = cartCount > 0 ? (
      <span
        className="ml-2 inline-flex min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-2 text-xs font-semibold leading-none text-white shadow-sm"
        aria-label={`${cartCount} item${cartCount === 1 ? '' : 's'} in cart`}
      >
        {cartCount}
      </span>
    ) : null;

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
        className={`sticky top-0 z-40 backdrop-blur transition-shadow ${
          elevated ? 'shadow-lg shadow-rose-200/40' : ''
        }`}
        style={{ backgroundColor: 'rgba(255,255,255,0.88)', borderBottom: '1px solid rgba(244, 114, 182, 0.15)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 lg:py-4">
          <Link to="/" className="flex items-center gap-3 text-left">
            <img
              src={logoMark}
              alt="ITnVend"
              className="h-10 w-10 rounded-full border border-rose-100 bg-white object-contain p-1 shadow-sm"
            />
            <span className="flex flex-col leading-tight text-slate-800">
              <span className="text-base font-bold sm:text-lg">ITnVend Market Hub</span>
              <span className="text-xs text-rose-400 sm:text-sm">Retail, subscriptions &amp; smiles in sync</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-2 text-sm font-semibold text-rose-400 lg:flex">
            {NAV_LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `relative rounded-full px-4 py-2 transition ${
                    isActive
                      ? 'text-rose-600 after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-rose-400/90'
                      : 'text-rose-400 hover:text-rose-500'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <Link
              to="/cart"
              className="inline-flex items-center rounded-full border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:border-rose-300 hover:text-rose-600"
            >
              <FaShoppingCart className="mr-2" aria-hidden="true" />
              Cart
              {cartbadge}
            </Link>

            <Link
              to="/market"
              className="hidden rounded-full bg-gradient-to-r from-rose-500 to-sky-400 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5 hover:shadow-rose-200/90 lg:inline-flex"
            >
              Explore products
            </Link>

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
              {NAV_LINKS.map(({ to, label }) => (
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
                  {({ isActive }) => (
                    <>
                      <span>{label}</span>
                      {isActive && (
                        <span className="text-xs font-bold uppercase tracking-wider text-rose-400">Active</span>
                      )}
                    </>
                  )}
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
