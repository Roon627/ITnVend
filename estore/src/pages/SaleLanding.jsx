import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaTags } from 'react-icons/fa';
import api from '../lib/api';
import ProductCard from '../components/ProductCard';
import { mapPreorderFlags } from '../lib/preorder';

function groupItemsByVendor(rawGroups) {
  if (!Array.isArray(rawGroups)) return [];
  const normalized = rawGroups
    .map((group) => ({
      vendorId: group.vendorId || null,
      vendorName: group.vendorName || 'ITnVend',
      vendorSlug: group.vendorSlug || null,
      items: mapPreorderFlags(group.items || []),
    }))
    .filter((group) => group.items.length > 0);
  const marketplace = normalized.filter((group) => !group.vendorSlug);
  const vendorOwned = normalized.filter((group) => group.vendorSlug);
  return [...marketplace, ...vendorOwned];
}

export default function SaleLanding() {
  const [products, setProducts] = useState([]);
  const [vendorGroups, setVendorGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api
      .get('/public/products/sale')
      .then((list) => {
        const normalized = Array.isArray(list) ? mapPreorderFlags(list) : [];
        setProducts(normalized);
      })
      .catch(() => {
        setProducts([]);
        setError('We could not load sale items. Please try again in a moment.');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api
      .get('/public/products/sale-by-vendor')
      .then((groups) => setVendorGroups(groupItemsByVendor(groups)))
      .catch(() => setVendorGroups([]));
  }, []);

  const featuredVendors = useMemo(() => vendorGroups.slice(0, 4), [vendorGroups]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 py-12 text-slate-800">
      <div className="container mx-auto px-6">
        <div className="rounded-3xl border border-white/70 bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-500 p-8 text-white shadow-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-semibold tracking-[0.35em] uppercase">
                <FaTags />
                Sale drop
              </p>
              <h1 className="text-3xl font-black leading-tight text-white sm:text-4xl">
                Flash finds & vendor drop-ins
              </h1>
              <p className="max-w-2xl text-sm text-emerald-100">
                ITnVend vendors mark down inventory when they have cosy bundles, restock missions, or seasonal promos.
                Everything stays synced with the POS, so what you see is in stock and ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/market"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Browse Market Hub
              </Link>
              <Link
                to="/vendors"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/10"
              >
                Vendor directory
              </Link>
            </div>
          </div>
        </div>

        <section className="mt-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">Live sale inventory</h2>
              <p className="text-sm text-slate-500">
                These listings include the vendor’s sale price. Add them to your cart and the savings appear at checkout.
              </p>
            </div>
            <p className="text-sm text-slate-400">
              {loading ? 'Checking inventory…' : `${products.length} sale item${products.length === 1 ? '' : 's'}`}
            </p>
          </div>
          {error && (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
              {error}
            </div>
          )}
          {loading ? (
            <div className="rounded-3xl border border-dashed border-rose-200 bg-white/80 p-12 text-center text-rose-400">
              Syncing sale listings…
            </div>
          ) : products.length === 0 ? (
            <div className="rounded-3xl border border-rose-100 bg-white/80 p-10 text-center text-slate-500">
              Vendors are not running any public sales today. Check back soon or browse the full Market Hub.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} showVendor />
              ))}
            </div>
          )}
        </section>

        {featuredVendors.length > 0 && (
          <section className="mt-14 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg shadow-emerald-100/60">
            <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-emerald-400">
                  Vendor spotlights
                </p>
                <h3 className="mt-2 text-2xl font-bold text-slate-900 sm:text-3xl">Sale showcases</h3>
                <p className="text-sm text-slate-500">
                  Jump straight into a partner’s discounted listings. We cap each card to a few highlights—tap through for the rest.
                </p>
              </div>
              <Link
                to="/vendors"
                className="inline-flex items-center justify-center rounded-full border border-emerald-200 px-4 py-2 text-sm font-semibold text-emerald-600 transition hover:bg-emerald-50"
              >
                Meet all vendors
              </Link>
            </div>
            <div className="grid gap-5 lg:grid-cols-2 justify-items-center">
              {featuredVendors.map((group) => (
                <div
                  key={`${group.vendorId}-${group.vendorName}`}
                  className="rounded-3xl border border-slate-100 bg-slate-50/70 p-4 shadow-inner w-full max-w-xl"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">
                        {group.vendorSlug ? 'Vendor' : 'Marketplace listing'}
                      </p>
                      <h4 className="text-lg font-bold text-slate-900">{group.vendorName || 'ITnVend'}</h4>
                    </div>
                    {group.vendorSlug && (
                      <Link
                        to={`/vendors/${group.vendorSlug}/sale`}
                        className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50"
                      >
                        View sale
                      </Link>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 justify-items-center sm:grid-cols-3">
                    {group.items.slice(0, 2).map((item) => (
                      <ProductCard key={`${group.vendorId}-${item.id}`} product={item} compact showVendor />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
