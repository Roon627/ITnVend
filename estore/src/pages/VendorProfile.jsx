import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import ProductCard from '../components/ProductCard';
import { mapPreorderFlags } from '../lib/preorder';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';

export default function VendorProfile() {
  const { slug } = useParams();
  const [vendor, setVendor] = useState(null);
  const [vendorError, setVendorError] = useState('');
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    if (!slug) return;
    setLoadingVendor(true);
    setVendorError('');
    api
      .get(`/public/vendors/${slug}`)
      .then((data) => {
        setVendor(data);
      })
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
      .then((list) => {
        const normalized = Array.isArray(list) ? mapPreorderFlags(list) : [];
        setProducts(normalized);
      })
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [slug]);

  const hero = resolveMediaUrl(vendor?.hero_image || '');
  const logo = resolveMediaUrl(vendor?.logo_url || '');

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 py-14 text-slate-800">
      <div className="container mx-auto px-6">
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
                    className="h-full w-full object-cover"
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
                      />
                    ) : (
                      <div className="flex h-24 w-24 items-center justify-center rounded-3xl border-4 border-white bg-white/30 text-lg font-semibold text-white shadow-xl">
                        {vendor.legal_name?.slice(0, 2) || 'IT'}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-200">Vendor</p>
                      <h1 className="text-3xl font-black text-white sm:text-4xl">{vendor.legal_name}</h1>
                      {vendor.tagline && <p className="text-sm text-white/80">{vendor.tagline}</p>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {vendor.website && (
                      <a
                        href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/20 px-5 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
                      >
                        Visit site
                      </a>
                    )}
                    <Link
                      to="/vendor-onboarding"
                      className="inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/20 px-5 py-2 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/30"
                    >
                      Become a vendor
                    </Link>
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

            <section className="rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg shadow-rose-100/50">
              <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">Products from {vendor.legal_name}</h3>
                  <p className="text-sm text-slate-500">
                    Browse their live catalogue. Every action here maps to the same POS workflow staff already use.
                  </p>
                </div>
                <Link
                  to="/market"
                  className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
                >
                  Back to Market Hub
                </Link>
              </div>

              {loadingProducts ? (
                <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-10 text-center text-rose-400">
                  Syncing catalogue…
                </div>
              ) : products.length > 0 ? (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {products.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onAdd={() => addToCart(product)}
                      formatCurrency={formatCurrency}
                    />
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 p-10 text-center text-slate-500">
                  This vendor is just getting started. Products will appear once their POS catalog goes live.
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
