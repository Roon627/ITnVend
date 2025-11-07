import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import VendorCard from '../components/VendorCard';

export default function VendorDirectory() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setLoading(true);
    api
      .get('/public/vendors', {
        params: {
          limit: 60,
          search: debounced || undefined,
          sort: debounced ? 'recent' : 'trending',
        },
      })
      .then((list) => setVendors(Array.isArray(list) ? list : []))
      .catch(() => setVendors([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  const heading = useMemo(() => {
    if (loading) return 'Syncing vendor shelves…';
    if (vendors.length === 0) return debounced ? 'No vendors match that search' : 'Vendors are prepping their shelves';
    return debounced ? `Showing vendors matching “${debounced}”` : 'Approved marketplace partners';
  }, [loading, vendors.length, debounced]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16 text-slate-800">
      <div className="container mx-auto px-6">
        <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-rose-300">Vendor directory</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900 sm:text-4xl">Discover ITnVend partners</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Every vendor listed here is approved inside the POS, so inventory, carts, and fulfilment all stay perfectly in sync.
            </p>
          </div>
          <Link
            to="/vendor-onboarding"
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-5 py-2 text-sm font-semibold text-rose-500 shadow-sm transition hover:bg-rose-50"
          >
            Become a vendor
          </Link>
        </div>

        <div className="mb-8 flex flex-col gap-3 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-lg shadow-rose-100/50 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{heading}</h2>
            <p className="text-sm text-slate-500">
              {vendors.length} partner{vendors.length === 1 ? '' : 's'} visible · updated in real-time from the POS.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vendor name or tagline..."
              className="w-full rounded-full border border-rose-100 bg-white px-4 py-3 text-sm text-slate-700 shadow-inner focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute inset-y-0 right-4 text-sm font-semibold text-rose-400 hover:text-rose-600"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-3xl border border-dashed border-rose-200 bg-white/80 p-12 text-center text-rose-400">
            Loading vendors…
          </div>
        ) : vendors.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-rose-200 bg-white/80 p-12 text-center text-rose-400">
            No vendors fit that filter just yet.
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {vendors.map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
