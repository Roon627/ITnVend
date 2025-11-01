import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import Footer from '../components/Footer';
import {
  FaShoppingCart,
  FaShieldAlt,
  FaPaintBrush,
  FaTasks,
  FaCogs,
  FaBolt,
  FaChartLine,
  FaCloud,
  FaStore,
} from 'react-icons/fa';
import { useSettings } from '../components/SettingsContext';
import ProductCard from '../components/ProductCard';

const INSIGHTS = [
  { icon: <FaBolt />, label: 'Rapid Deployment', value: '48h rollout for core services' },
  { icon: <FaChartLine />, label: 'Operational Uptime', value: '99.8% monitored availability' },
  { icon: <FaCloud />, label: 'Managed Cloud Footprint', value: '1.2PB secured' },
  { icon: <FaStore />, label: 'Smart Retail Sites', value: '85 active vending locations' },
];

const PRACTICE_AREAS = [
  {
    icon: <FaShieldAlt />,
    title: 'Managed IT & Support',
    copy: 'Practical support plans for small businesses — remote helpdesk, on-site visits, and proactive maintenance.',
  },
  {
    icon: <FaBolt />,
    title: 'Business Applications',
    copy: 'Software and SaaS tooling that helps small businesses manage sales, inventory, and customer relationships.',
  },
  {
    icon: <FaPaintBrush />,
    title: 'Digital Licences',
    copy: 'Sell and manage software licences and digital assets with centralized billing and seat management.',
  },
  {
    icon: <FaTasks />,
    title: 'Procurement & Lifecycle',
    copy: 'Hardware and software procurement with lifecycle tracking and restocking automation.',
  },
];

export default function Home() {
  const [products, setProducts] = useState([]);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    api
      .get('/products')
      .then((allProducts) => setProducts(allProducts.slice(0, 6)))
      .catch(() => setProducts([]));
  }, []);

  return (
    <div className="bg-white text-slate-900 min-h-screen flex flex-col">
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-blue-800 text-white">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent" />
        <div className="container mx-auto relative z-10 px-6 py-16 lg:py-24 grid gap-12 lg:grid-cols-[1.35fr_1fr] items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium backdrop-blur">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              End-to-end digital operations partner
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight">
              Sell products, licences and provide IT support — everything a small business needs.
            </h1>
            <p className="text-lg text-slate-200 max-w-2xl">
              We help small businesses sell more and run smoother. Offerings include a ready-to-sell POS module (with licensing and optional support),
              digital licences, procurement services, and managed IT support packages tailored for SMBs.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/store"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-slate-900 font-semibold shadow-lg hover:-translate-y-0.5 transition-transform"
              >
                Explore products & licenses
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white">
                  <FaShoppingCart />
                </span>
              </Link>
              {/* POS link intentionally removed — marketing will be handled separately */}
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 rounded-full border border-white/40 px-6 py-3 text-sm font-semibold hover:bg-white/10"
              >
                Build a plan
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="bg-white py-16">
          <div className="container mx-auto px-6">
            <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Markets we operate</h2>
                <p className="mt-3 text-slate-500 max-w-2xl">
                  Modular service suites you can deploy individually or as a coordinated program. Each practice plugs into a shared data
                  fabric for unified reporting and rapid hand-offs.
                </p>
              </div>
              <Link
                to="/store"
                className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:text-blue-700"
              >
                View marketplaces
              </Link>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
              {PRACTICE_AREAS.map((area) => (
                <div
                  key={area.title}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
                >
                  <div className="mb-4 text-3xl text-blue-600">{area.icon}</div>
                  <h3 className="text-xl font-semibold text-slate-900">{area.title}</h3>
                  <p className="mt-3 text-sm text-slate-600 leading-relaxed">{area.copy}</p>
                  <div className="mt-6 h-px w-12 bg-gradient-to-r from-blue-500 to-transparent group-hover:w-24 transition-all" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-slate-50 py-16">
          <div className="container mx-auto px-6">
            <div className="mb-12 flex flex-wrap items-center justify-between gap-6">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-slate-900">Featured solutions</h2>
                <p className="mt-2 text-slate-500">
                  Curated from our marketplace catalogue. Add to your plan instantly or talk with our specialists for tailored bundles.
                </p>
              </div>
              <Link
                to="/cart"
                className="relative inline-flex items-center gap-3 rounded-full border border-slate-300 bg-white px-5 py-2 text-sm font-semibold shadow-sm hover:shadow-lg"
              >
                Cart
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-blue-600 px-2 text-white">
                  {cartCount}
                </span>
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
              <div className="mt-10 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                Marketplace products will appear here once they are published.
              </div>
            )}
          </div>
        </section>

        <section className="relative overflow-hidden bg-blue-900 py-16 text-white">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle,_rgba(255,255,255,0.12)_0%,transparent_60%)] opacity-60" />
          <div className="container mx-auto relative z-10 px-6 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="max-w-2xl space-y-4">
              <span className="rounded-full border border-white/30 px-4 py-1 text-sm uppercase tracking-widest">
                unified operations stack
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Connect your infrastructure, media, and retail touchpoints in weeks — not quarters.
              </h2>
              <p className="text-slate-200">
                From secure device onboarding to branded smart kiosks, ITnVend orchestrates every layer with shared telemetry,
                proactive insights, and a team that scales with your roadmap.
              </p>
            </div>
            <Link
              to="/vendor-onboarding"
              className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-blue-900 font-semibold shadow-lg hover:-translate-y-0.5 transition"
            >
              Book a discovery session
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
