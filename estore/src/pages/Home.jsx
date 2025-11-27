import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaChartLine, FaShoppingBag, FaShoppingCart } from 'react-icons/fa';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import ProductCard from '../components/ProductCard';
import { mapPreorderFlags } from '../lib/preorder';
import VendorCard from '../components/VendorCard';

const CATEGORY_LIMIT = 6;
const TRENDING_VENDOR_LIMIT = 6;
const VERIFIED_VENDOR_LIMIT = 6;
const SALE_VENDOR_LIMIT = 4;

const VALUE_PILLARS = [
  { title: 'POS besties', copy: 'Every Market Hub item talks directly to the POS so inventory, carts, and invoices stay in perfect harmony.' },
  { title: 'Bundles made cosy', copy: 'Mix licences, hardware, and care plans into packages tailored for your crew—launch-ready in days.' },
  { title: 'Support that hugs back', copy: 'Remote monitoring, friendly helpdesk heroes, and on-site visits that keep smiles (and devices) running.' },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [trendingVendors, setTrendingVendors] = useState([]);
  const [verifiedVendors, setVerifiedVendors] = useState([]);
  const [saleHighlights, setSaleHighlights] = useState([]);
  const [saleLoading, setSaleLoading] = useState(true);
  const [saleVendorGroups, setSaleVendorGroups] = useState([]);
  const [saleVendorLoading, setSaleVendorLoading] = useState(true);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    api
      .get('/products')
      .then((allProducts) => {
        const list = Array.isArray(allProducts) ? mapPreorderFlags(allProducts) : [];
        setProducts(list.slice(0, 6));
      })
      .catch(() => setProducts([]));
  }, []);

  useEffect(() => {
    api
      .get('/products/categories')
      .then((catalogue) => {
        const list = Object.entries(catalogue || {}).map(([name, subs]) => ({
          name,
          subcategories: subs,
        }));
        setCategories(list.slice(0, CATEGORY_LIMIT));
      })
      .catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    api
      .get('/public/vendors', { params: { sort: 'trending', limit: TRENDING_VENDOR_LIMIT } })
      .then((list) => {
        setTrendingVendors(Array.isArray(list) ? list : []);
      })
      .catch(() => setTrendingVendors([]));
  }, []);

  useEffect(() => {
    api
      .get('/public/vendors', { params: { verified: 1, sort: 'recent', limit: VERIFIED_VENDOR_LIMIT } })
      .then((list) => {
        setVerifiedVendors(Array.isArray(list) ? list : []);
      })
      .catch(() => setVerifiedVendors([]));
  }, []);

  useEffect(() => {
    setSaleLoading(true);
    api
      .get('/public/products/sale', { params: { limit: 8 } })
      .then((list) => {
        setSaleHighlights(Array.isArray(list) ? mapPreorderFlags(list) : []);
      })
      .catch(() => setSaleHighlights([]))
      .finally(() => setSaleLoading(false));
  }, []);

  useEffect(() => {
    setSaleVendorLoading(true);
    api
      .get('/public/products/sale-by-vendor')
      .then((groups) => {
        if (!Array.isArray(groups)) {
          setSaleVendorGroups([]);
          return;
        }
        const normalized = groups
          .map((group) => ({
            ...group,
            items: mapPreorderFlags(group.items || []),
          }))
          .filter((group) => group.items.length > 0);
        const marketplace = normalized.filter((group) => !group.vendorSlug);
        const vendorOwned = normalized.filter((group) => group.vendorSlug);
        const combined = [...marketplace, ...vendorOwned].slice(0, SALE_VENDOR_LIMIT);
        setSaleVendorGroups(combined);
      })
      .catch(() => setSaleVendorGroups([]))
      .finally(() => setSaleVendorLoading(false));
  }, []);

  const hasCatalogue = useMemo(() => categories.length > 0, [categories]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 text-slate-800">
      <header className="relative overflow-hidden bg-gradient-to-b from-rose-100 via-white to-sky-50 text-slate-900">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.6),transparent_65%)]" />
        <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-transparent to-white/80" />
        <div className="container relative z-10 mx-auto flex flex-col items-center gap-12 px-6 py-24 text-center lg:flex-row lg:items-center lg:gap-16 lg:text-left">
          <div className="flex-1 space-y-6">
            <span className="inline-flex items-center gap-2 self-center rounded-full border border-slate-200/60 bg-white/70 px-5 py-1.5 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 backdrop-blur lg:self-start">
              <span className="h-2 w-2 rounded-full bg-emerald-300" />
              ITNVEND MARKET HUB
            </span>
            <h1 className="text-4xl font-black leading-tight text-slate-900 drop-shadow-[0_12px_35px_rgba(15,23,42,0.25)] sm:text-5xl xl:text-6xl">
              Discover cute, POS-ready picks your team will love.
            </h1>
            <p className="text-base text-slate-600 sm:text-lg lg:text-xl">
              ITnVend.com is your hello, the Market Hub is your shop window. Everything here is POS-ready, instantly synced, and wrapped in playful vibes.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Link
                to="/market"
                className="btn-sm inline-flex items-center gap-3 rounded-2xl bg-white text-rose-600 font-semibold shadow-[0_12px_35px_rgba(244,114,182,0.35)] transition hover:-translate-y-0.5"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500 text-white">
                  <FaShoppingBag />
                </span>
                <span className="flex flex-col leading-tight text-left">
                  <span className="text-sm font-semibold">Explore products</span>
                  <span className="text-[11px] text-rose-400">POS-ready sets &amp; kits</span>
                </span>
              </Link>
              <Link
                to="/shop-and-ship"
                className="btn-sm btn-sm-outline inline-flex items-center gap-3 rounded-full border border-rose-100/60 bg-white/60 text-rose-500 shadow-sm transition hover:border-rose-200 hover:bg-white"
              >
                Share your overseas cart
                <FaArrowRight className="text-rose-400" />
              </Link>
              <Link
                to="/checkout"
                className="btn-sm btn-sm-outline inline-flex items-center gap-3 rounded-full border border-slate-200/70 text-slate-600 transition hover:border-slate-300 hover:bg-white/70"
              >
                Build a happy bundle
                <FaArrowRight className="text-slate-400" />
              </Link>
            </div>
          </div>
          <div className="flex-1 rounded-3xl border border-white/60 bg-white/70 p-6 text-left shadow-sm shadow-rose-100 backdrop-blur">
            <h2 className="text-lg font-semibold text-slate-900">Why teams choose ITnVend</h2>
            <div className="mt-4 space-y-4 text-slate-600">
              {VALUE_PILLARS.map((pillar) => (
                <div key={pillar.title} className="rounded-2xl border border-slate-100 bg-white/80 p-4 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-800">{pillar.title}</h3>
                  <p className="mt-2 text-sm text-slate-500">{pillar.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="py-16">
          <div className="container mx-auto px-6">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold sm:text-4xl text-slate-900">Categories to explore</h2>
                <p className="mt-3 text-slate-500">
                  Peek into the Market Hub by theme. Each tile drops you into inventory that’s cosy with your POS and ready for checkout.
                </p>
              </div>
              <Link
                to="/market"
                className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50"
              >
                See everything
                <FaArrowRight />
              </Link>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hasCatalogue ? (
                categories.map((category) => (
                  <Link
                    key={category.name}
                    to={`/market?category=${encodeURIComponent(category.name)}`}
                    className="group flex flex-col gap-2 rounded-2xl border border-rose-200 bg-white p-5 text-sm shadow-lg shadow-rose-100 transition hover:-translate-y-0.5 hover:border-rose-400/70 hover:shadow-rose-200 sm:p-6"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-500">
                        <FaChartLine />
                      </span>
                      <span className="text-[11px] uppercase tracking-wide text-rose-300">Tap to view</span>
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900">{category.name}</h3>
                    <p className="text-xs text-slate-500">
                      {category.subcategories.length > 0
                        ? `${category.subcategories.slice(0, 3).join(', ')}${category.subcategories.length > 3 ? '…' : ''}`
                        : 'Curated inventory ready for deployment.'}
                    </p>
                    <div className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-rose-500 group-hover:text-rose-600">
                      View category
                      <FaArrowRight />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="col-span-full rounded-3xl border border-dashed border-rose-200 bg-white p-10 text-center text-rose-400">
                  Categories will appear once products are published in the POS.
                </div>
              )}
            </div>
          </div>
        </section>

        {verifiedVendors.length > 0 && (
          <section className="bg-white py-14">
            <div className="container mx-auto px-6">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-300">Verified partners</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Vendors you should meet</h2>
                  <p className="mt-2 max-w-2xl text-sm text-slate-500">
                    These storefronts submitted compliance docs and keep their invoices tidy. Tap through to browse their curated Market Hub products.
                  </p>
                </div>
                <Link
                  to="/vendors"
                  className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-emerald-200 text-emerald-600 transition hover:bg-emerald-50"
                >
                  View all vendors
                  <FaArrowRight />
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {verifiedVendors.map((vendor) => (
                  <VendorCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="bg-white py-16">
          <div className="container mx-auto px-6">
            <div className="mb-12 flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 sm:text-4xl">Fresh & recently added</h2>
                <p className="mt-3 text-slate-500 max-w-2xl">
                  Hand-picked goodies from the Market Hub. Add them to your cart and we’ll whisper the details straight to the POS for fulfilment magic.
                </p>
              </div>
              <Link
                to="/cart"
                className="btn-sm btn-sm-outline relative inline-flex items-center gap-3 rounded-full border border-rose-200 text-rose-500 shadow-sm transition hover:bg-rose-50"
              >
                View cart ({cartCount})
                <FaShoppingCart />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:gap-8 sm:grid-cols-2 xl:grid-cols-3">
              {products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAdd={() => addToCart(product)}
                  formatCurrency={formatCurrency}
                />
              ))}
            </div>
            {products.length === 0 && (
              <div className="mt-10 rounded-3xl border border-dashed border-rose-200 bg-rose-50 p-8 text-center text-rose-400">
                Market Hub products will appear here once they are published in the POS.
              </div>
            )}
          </div>
        </section>

        {trendingVendors.length > 0 && (
          <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
            <div className="container mx-auto px-6">
              <div className="mb-10 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-300">Trusted partners</p>
                  <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Trending vendors</h2>
                  <p className="mt-2 max-w-2xl text-slate-500">
                    These partners have the most live products on the market hub right now. Tap through to see their curated shelves.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link
                    to="/vendors"
                    className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 text-rose-500 transition hover:bg-rose-50"
                  >
                    Browse all vendors
                    <FaArrowRight />
                  </Link>
                  <Link
                    to="/vendor-onboarding"
                    className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50"
                  >
                    Become a vendor
                  </Link>
                </div>
              </div>
              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {trendingVendors.map((vendor) => (
                  <VendorCard key={vendor.id} vendor={vendor} />
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="relative overflow-hidden bg-gradient-to-br from-sky-300 via-indigo-300 to-rose-300 py-16 text-white">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle,_rgba(255,255,255,0.25)_0%,transparent_60%)] opacity-60" />
          <div className="container relative z-10 mx-auto flex flex-col gap-6 px-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-4">
              <span className="rounded-full border border-white/40 px-4 py-1 text-sm uppercase tracking-widest">
                unified operations stack
              </span>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">
                Connect infrastructure, procurement, and retail touchpoints in weeks—not quarters.
              </h2>
              <p className="text-white/90">
                ITnVend captures every order, upload, and payment slip in one ledger. Automations in the POS handle notifications,
                journal entries, and fulfilment updates so your storefront stays fast and reliable.
              </p>
            </div>
            <Link
              to="/vendor-onboarding"
              className="btn-sm inline-flex items-center gap-3 rounded-full bg-white text-rose-500 font-semibold shadow-lg shadow-rose-200 transition hover:-translate-y-0.5"
            >
              Book a discovery session
              <FaArrowRight />
            </Link>
          </div>
        </section>
        <section className="border-t border-rose-100 bg-white/80">
          <div className="container mx-auto px-6 py-10 text-slate-500">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-widest text-rose-400">ITnVend.com</h3>
                <p className="mt-2 max-w-md text-sm">
                  A single surface for showcasing your brand, selling curated solutions, and feeding every order straight into the POS.
                </p>
              </div>
              <div className="text-sm">
                <p>
                  Need a tailored deployment?{' '}
                  <Link to="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                    Start the onboarding form
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-gradient-to-r from-emerald-50 via-white to-rose-50 py-14">
          <div className="container mx-auto px-6">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-400">Sale spotlight</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Items on sale</h2>
                <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                  Vendors occasionally mark down inventory. These listings use the sale price in your cart immediately.
                </p>
              </div>
              <Link
                to="/sale"
                className="btn-sm inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
              >
                View all sale items
                <FaArrowRight />
              </Link>
            </div>
            {saleLoading ? (
              <div className="rounded-3xl border border-dashed border-emerald-200 bg-white/70 p-10 text-center text-emerald-400">
                Gathering sale data…
              </div>
            ) : saleHighlights.length === 0 ? (
              <div className="rounded-3xl border border-emerald-100 bg-white/80 p-8 text-center text-slate-500">
                No vendors are running visible sales right now. Pop back later or explore the Market Hub today.
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {saleHighlights.slice(0, 8).map((product) => (
                  <ProductCard key={`sale-${product.id}`} product={product} compact showVendor />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="bg-white py-14">
          <div className="container mx-auto px-6">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-300">Vendor showcases</p>
                <h2 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Sale bundles by partner</h2>
                <p className="mt-1 text-sm text-slate-500 max-w-2xl">
                  These vendors toggled sale mode on select inventory. Tap through to their profile to see every discounted listing.
                </p>
              </div>
              <Link
                to="/sale"
                className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Browse full sale page
                <FaArrowRight />
              </Link>
            </div>
            {saleVendorLoading ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-10 text-center text-slate-400">
                Checking vendor promos…
              </div>
            ) : saleVendorGroups.length === 0 ? (
              <div className="rounded-3xl border border-slate-100 bg-slate-50/70 p-8 text-center text-slate-500">
                Once partners run a promo, their cards will show up here automatically.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 justify-items-center">
                {saleVendorGroups.map((group) => (
                  <div
                    key={`${group.vendorId || group.vendorName}`}
                    className="rounded-3xl border border-slate-100 bg-white/90 p-4 shadow-lg shadow-slate-100/70 w-full max-w-xl"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.4em] text-slate-300">
                          {group.vendorSlug ? 'Vendor' : 'Marketplace drop'}
                        </p>
                        <h3 className="text-lg font-bold text-slate-900">{group.vendorName || 'ITnVend'}</h3>
                      </div>
                      {group.vendorSlug && (
                        <Link
                          to={`/vendors/${group.vendorSlug}/sale`}
                          className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 transition hover:bg-emerald-100"
                        >
                          View sale
                          <FaArrowRight />
                        </Link>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 justify-items-center sm:grid-cols-3">
                      {group.items.slice(0, 2).map((product) => (
                        <ProductCard key={`vendor-sale-${group.vendorId}-${product.id}`} product={product} compact showVendor />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
