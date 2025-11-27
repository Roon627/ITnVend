import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import ProductCard from '../components/ProductCard';
import { mapPreorderFlags } from '../lib/preorder';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaCheckCircle, FaFacebookF, FaInstagram, FaLinkedinIn, FaTelegramPlane, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from 'react-icons/fa';

const SOCIAL_ICON_MAP = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  twitter: FaTwitter,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  whatsapp: FaWhatsapp,
  telegram: FaTelegramPlane,
};

const MODULE_RENDER_TIMESTAMP = Date.now();

export default function VendorProfile({ saleOnly = false }) {
  const { slug } = useParams();
  const location = useLocation();
  const showSaleOnly = saleOnly || location.pathname.endsWith('/sale');
  const [vendor, setVendor] = useState(null);
  const [vendorError, setVendorError] = useState('');
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [saleProducts, setSaleProducts] = useState([]);
  const [loadingSale, setLoadingSale] = useState(true);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();
  const initialTimestamp = MODULE_RENDER_TIMESTAMP;

  const socialEntries = useMemo(() => {
    if (!vendor?.social_links) return [];
    return Object.entries(vendor.social_links).filter(([key, value]) => SOCIAL_ICON_MAP[key] && value);
  }, [vendor]);
  const isVerified = Number(vendor?.verified ?? 0) === 1;

  useEffect(() => {
    if (!slug) return;
    setLoadingVendor(true);
    setVendorError('');
    api
      .get(`/public/vendors/${slug}`)
      .then((data) => setVendor(data))
      .catch((err) => {
        setVendor(null);
        setVendorError(err?.message || 'Vendor not found.');
      })
      .finally(() => setLoadingVendor(false));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoadingProducts(true);
    api
      .get(`/public/vendors/${slug}/products`)
      .then((list) => setProducts(Array.isArray(list) ? mapPreorderFlags(list) : []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoadingSale(true);
    api
      .get(`/public/vendors/${slug}/products`, { params: { saleOnly: true } })
      .then((list) => setSaleProducts(Array.isArray(list) ? mapPreorderFlags(list) : []))
      .catch(() => setSaleProducts([]))
      .finally(() => setLoadingSale(false));
  }, [slug]);

  const hero = resolveMediaUrl(vendor?.hero_image || '');
  const logo = resolveMediaUrl(vendor?.logo_url || '');
  const heroSizes = '(max-width: 768px) 100vw, 960px';
  const hasSaleProducts = saleProducts.length > 0;
  const displayProducts = showSaleOnly ? saleProducts : products;
  const displayLoading = showSaleOnly ? loadingSale : loadingProducts;
  const emptyMessage = showSaleOnly
    ? 'This partner is not running any sale listings right now. Hop back to their main profile for the full catalogue.'
    : `No products yet. Once ${vendor?.legal_name || 'this vendor'} publishes inventory in the POS, it appears automatically here.`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 py-14 text-slate-800">
      <div className="mx-auto w-full max-w-screen-2xl px-6">
        <div className="mb-6 text-sm text-rose-400">
          <Link to="/" className="font-semibold text-rose-500 hover:text-rose-400">
            Home
          </Link>
          <span className="mx-2 text-rose-200">/</span>
          <Link to="/market" className="font-semibold text-rose-500 hover:text-rose-400">
            Market Hub
          </Link>
          <span className="mx-2 text-rose-200">/</span>
          <span className="text-rose-300">{slug}</span>
        </div>

        {loadingVendor ? (
          <div className="rounded-3xl border border-dashed border-rose-200 bg-white/80 p-12 text-center text-rose-400">
            Loading vendor profile…
          </div>
        ) : vendorError ? (
          <div className="rounded-3xl border border-rose-200 bg-white/80 p-12 text-center text-rose-500">
            {vendorError}
          </div>
        ) : vendor ? (
          <>
            <section className="mb-12 overflow-hidden rounded-3xl border border-white/70 bg-white shadow-xl shadow-rose-100/60">
              <div className="relative h-64 w-full bg-gradient-to-br from-rose-200 via-white to-sky-200">
                {hero && (
                  <img
                    src={hero}
                    alt={vendor.legal_name}
                    loading="lazy"
                    decoding="async"
                    fetchpriority="high"
                    className="h-full w-full object-cover"
                    width={1280}
                    height={360}
                    sizes={heroSizes}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex items-end gap-4">
                    {logo ? (
                      <img
                        src={logo}
                        alt={`${vendor.legal_name} logo`}
                        className="h-24 w-24 rounded-3xl border-4 border-white object-cover shadow-xl"
                        loading="lazy"
                        decoding="async"
                        width={96}
                        height={96}
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-white bg-white/30 text-lg font-semibold text-white shadow-xl">
                        {vendor.legal_name?.slice(0, 2) || 'IT'}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-200">Vendor</p>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-3xl font-black text-white sm:text-4xl">{vendor.legal_name}</h1>
                        {isVerified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                            <FaCheckCircle />
                            Verified
                          </span>
                        )}
                      </div>
                      {vendor.tagline && <p className="text-sm text-white/80">{vendor.tagline}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {vendor.website && (
                      <a
                        href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/20 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
                      >
                        Visit site
                      </a>
                    )}
                    <Link
                      to="/vendor-onboarding"
                      className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/20 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
                    >
                      Become a vendor
                    </Link>
                    {hasSaleProducts && !showSaleOnly && (
                      <Link
                        to={`/vendors/${slug}/sale`}
                        className="btn-sm inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 text-sm font-semibold text-emerald-700 transition hover:bg-white"
                      >
                        View sale items
                      </Link>
                    )}
                    {socialEntries.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {socialEntries.map(([key, url]) => {
                          const Icon = SOCIAL_ICON_MAP[key];
                          return (
                            <a
                              key={key}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/60 bg-white/10 text-white transition hover:bg-white/30"
                            >
                              <Icon />
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1fr_320px]">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">About this partner</h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    {vendor.public_description ||
                      'This partner sells directly through the Market Hub. Inventory, payments, and fulfilment are unified with the ITnVend POS.'}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50/80 p-5 text-rose-600 shadow-inner">
                  <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-300">Stats</p>
                  <p className="mt-3 text-3xl font-black">{vendor.product_count || 0}</p>
                  <p className="text-sm text-rose-500">Products on the Market Hub</p>
                  <p className="mt-4 text-xs text-rose-400">
                    Listings sync with the vendor’s POS inventory, so stock counts stay accurate on both sides.
                  </p>
                </div>
              </div>
            </section>

            {hasSaleProducts && !showSaleOnly && (
              <section className="mb-10 rounded-3xl border border-emerald-100 bg-emerald-50/70 p-6 shadow-lg shadow-emerald-100/40">
                <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-400">On sale</p>
                    <h3 className="text-2xl font-bold text-emerald-900">Discounted from {vendor.legal_name}</h3>
                    <p className="text-sm text-emerald-700">
                      Limited sets currently priced below their usual rate. Add to cart to lock the savings.
                    </p>
                  </div>
                  <Link
                    to={`/vendors/${slug}/sale`}
                    className="btn-sm inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
                  >
                    Browse all sale items
                  </Link>
                </div>
                {loadingSale ? (
                  <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/80 p-8 text-center text-emerald-400">
                    Syncing sale catalogue…
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {saleProducts.slice(0, 6).map((product) => (
                      <ProductCard key={`sale-${product.id}`} product={product} />
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg shadow-rose-100/50">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">
                    {showSaleOnly ? `Sale items from ${vendor.legal_name}` : `Products from ${vendor.legal_name}`}
                  </h3>
                  <p className="text-sm text-slate-500">
                    {showSaleOnly
                      ? 'Only listings with an active vendor sale are shown here. Stock syncs with the POS in real time.'
                      : 'Browse their live catalogue. Every action here maps to the same POS workflow staff already use.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {showSaleOnly && (
                    <Link
                      to={`/vendors/${slug}`}
                      className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
                    >
                      View all products
                    </Link>
                  )}
                  <Link
                    to="/market"
                    className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
                  >
                    Back to Market Hub
                  </Link>
                </div>
              </div>

              {displayLoading ? (
                <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-10 text-center text-rose-400">
                  Syncing catalogue…
                </div>
              ) : displayProducts.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {displayProducts.map((product) => {
                    const createdAt = product.created_at ? new Date(product.created_at) : null;
                    const isRecent = createdAt ? initialTimestamp - createdAt.getTime() < 1000 * 60 * 60 * 78 : false;
                    return (
                      <div key={`${product.id}-${initialTimestamp}`} className="relative">
                        {isRecent && !showSaleOnly && (
                          <span className="pointer-events-none absolute right-2 top-2 z-20 inline-flex items-center rounded-full bg-rose-500 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-white/90 shadow">
                            New
                          </span>
                        )}
                        <ProductCard product={product} onAdd={() => addToCart(product)} formatCurrency={formatCurrency} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 p-10 text-center text-slate-500">
                  {emptyMessage}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
