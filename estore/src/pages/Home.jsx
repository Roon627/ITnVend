import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaChartLine, FaShoppingBag, FaShoppingCart } from 'react-icons/fa';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import ProductCard from '../components/ProductCard';

const CATEGORY_LIMIT = 6;

const VALUE_PILLARS = [
  { title: 'POS besties', copy: 'Every Market Hub item talks directly to the POS so inventory, carts, and invoices stay in perfect harmony.' },
  { title: 'Bundles made cosy', copy: 'Mix licences, hardware, and care plans into packages tailored for your crew—launch-ready in days.' },
  { title: 'Support that hugs back', copy: 'Remote monitoring, friendly helpdesk heroes, and on-site visits that keep smiles (and devices) running.' },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    api
      .get('/products')
      .then((allProducts) => setProducts(allProducts.slice(0, 6)))
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

  const hasCatalogue = useMemo(() => categories.length > 0, [categories]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 text-slate-800">
      <header className="relative overflow-hidden bg-gradient-to-br from-rose-400 via-sky-400 to-indigo-400 text-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),transparent_60%)]" />
        <div className="container relative z-10 mx-auto grid gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="space-y-6">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/20 px-4 py-1 text-sm font-semibold uppercase tracking-wider">
              <span className="h-2 w-2 rounded-full bg-emerald-200" />
              ITnVend operating cloud
            </span>
            <h1 className="text-4xl font-black leading-tight sm:text-5xl xl:text-6xl">
              Welcome to the Market Hub — the cute side of connected retail.
            </h1>
            <p className="text-lg text-white/90 sm:text-xl">
              ITnVend.com is your hello, the Market Hub is your shop window. Everything here is POS-ready, instantly synced, and wrapped in playful vibes.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/market"
                className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-rose-600 font-semibold shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5"
              >
                Shop the Market Hub
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white">
                  <FaShoppingBag />
                </span>
              </Link>
              <Link
                to="/shop-and-ship"
                className="inline-flex items-center gap-3 rounded-full border border-white/60 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                Share your overseas cart
                <FaArrowRight className="text-white/80" />
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-3 rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Build a happy bundle
                <FaArrowRight className="text-white/80" />
              </Link>
            </div>
          </div>
          <div className="rounded-3xl border border-white/30 bg-white/20 p-6 backdrop-blur">
            <h2 className="text-lg font-semibold text-white">Why teams choose ITnVend</h2>
            <div className="mt-4 space-y-5 text-white/90">
              {VALUE_PILLARS.map((pillar) => (
                <div key={pillar.title} className="rounded-2xl border border-white/20 bg-white/10 p-4">
                  <h3 className="text-base font-semibold">{pillar.title}</h3>
                  <p className="mt-2 text-sm text-white/80">{pillar.copy}</p>
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
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
              >
                See everything
                <FaArrowRight />
              </Link>
            </div>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {hasCatalogue ? (
                categories.map((category) => (
                  <Link
                    key={category.name}
                    to={`/market?category=${encodeURIComponent(category.name)}`}
                    className="group flex flex-col gap-3 rounded-3xl border border-rose-200 bg-white p-6 shadow-lg shadow-rose-100 transition hover:-translate-y-1 hover:border-rose-400/70 hover:shadow-rose-200"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-500">
                        <FaChartLine />
                      </span>
                      <span className="text-xs uppercase tracking-wide text-rose-300">Tap to view</span>
                    </div>
                    <h3 className="text-xl font-semibold text-slate-900">{category.name}</h3>
                    <p className="text-sm text-slate-500">
                      {category.subcategories.length > 0
                        ? `${category.subcategories.slice(0, 3).join(', ')}${category.subcategories.length > 3 ? '…' : ''}`
                        : 'Curated inventory ready for deployment.'}
                    </p>
                    <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-rose-500 group-hover:text-rose-600">
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
                className="relative inline-flex items-center gap-3 rounded-full border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-rose-50"
              >
                View cart ({cartCount})
                <FaShoppingCart />
              </Link>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
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
              className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-rose-500 font-semibold shadow-lg shadow-rose-200 transition hover:-translate-y-0.5"
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
      </main>
    </div>
  );
}
