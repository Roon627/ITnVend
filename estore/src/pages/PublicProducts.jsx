import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaShoppingCart, FaSearch, FaUndoAlt, FaHeart } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';
import { mapPreorderFlags } from '../lib/preorder';

const initialFilters = { category: '', subcategory: '', search: '' };

const filtersFromParams = (params) => ({
  category: params.get('category') || '',
  subcategory: params.get('subcategory') || '',
  search: params.get('search') || '',
});

const filtersEqual = (a, b) =>
  a.category === b.category && a.subcategory === b.subcategory && a.search === b.search;

export default function PublicProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFromParams = filtersFromParams(searchParams);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState(initialFromParams);
  const [searchInput, setSearchInput] = useState(initialFromParams.search);
  const [loading, setLoading] = useState(false);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    const next = filtersFromParams(searchParams);
    if (!filtersEqual(filters, next)) {
      setFilters(next);
    }
    if (next.search !== searchInput) {
      setSearchInput(next.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const current = filtersFromParams(searchParams);
    if (filtersEqual(filters, current)) return;
    const nextParams = {};
    if (filters.category) nextParams.category = filters.category;
    if (filters.subcategory) nextParams.subcategory = filters.subcategory;
    if (filters.search) nextParams.search = filters.search;
    setSearchParams(nextParams, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    api
      .get('/products/categories')
      .then((res) => setCategories(res || {}))
      .catch(() => setCategories({}));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      setLoading(true);
      try {
        const query = new URLSearchParams(
          Object.entries(filters).reduce((acc, [key, value]) => {
            if (value) acc[key] = value;
            return acc;
          }, {})
        ).toString();
  const res = await api.get(query ? `/products?${query}` : '/products', { signal: controller.signal });
  setProducts(Array.isArray(res) ? mapPreorderFlags(res) : []);
      } catch (err) {
        if (err?.name !== 'AbortError') {
          setProducts([]);
          console.error('Failed to load products', err);
        }
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
    return () => controller.abort();
  }, [filters]);

  useEffect(() => {
    const handle = setTimeout(() => {
      setFilters((prev) => (prev.search === searchInput ? prev : { ...prev, search: searchInput }));
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  const availableSubcategories = useMemo(
    () => (filters.category ? categories[filters.category] || [] : []),
    [filters.category, categories]
  );

  const handleFilterChange = (event) => {
    const { name, value } = event.target;
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'category') {
        next.subcategory = '';
      }
      return next;
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setFilters(initialFilters);
    setSearchParams({}, { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-sky-50 text-slate-800">
      <header className="relative overflow-hidden bg-gradient-to-br from-rose-400 via-sky-400 to-indigo-400 text-white">
        <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.35),transparent_60%)]" />
        <div className="container relative z-10 mx-auto px-6 py-16 lg:py-24">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1 text-sm font-semibold uppercase tracking-wide backdrop-blur">
              <FaHeart className="text-rose-200" /> ITnVend Market Hub
            </div>
            <h1 className="text-4xl font-extrabold leading-tight sm:text-5xl">
              Discover cute, POS-ready picks your team will love.
            </h1>
            <p className="text-lg text-white/90">
              Every item you add to cart syncs straight to the ITnVend POS for fulfilment, inventory, and finance workflows. Mix
              and match to create bundles that feel just right.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/cart"
                className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-rose-600 font-semibold shadow-lg shadow-rose-200/70 transition hover:-translate-y-0.5"
              >
                View cart
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-rose-500 px-2 text-white">
                  {cartCount}
                </span>
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Request proposal
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/60 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Back to overview
              </Link>
            </div>
            {Object.keys(categories).length > 0 && (
              <div className="mt-6 flex flex-wrap gap-3">
                {Object.keys(categories)
                  .slice(0, 6)
                  .map((categoryKey) => (
                    <button
                      key={categoryKey}
                      type="button"
                      onClick={() =>
                        setFilters((prev) => ({
                          ...prev,
                          category: categoryKey,
                          subcategory: '',
                        }))
                      }
                      className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
                        filters.category === categoryKey
                          ? 'border-white bg-white/20 text-white'
                          : 'border-white/40 text-white hover:bg-white/15'
                      }`}
                    >
                      {categoryKey}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative -mt-16 pb-16">
        <div className="container mx-auto px-6">
          <div className="rounded-3xl border border-rose-200 bg-white/95 p-6 shadow-rose-100 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <aside className="w-full space-y-6 lg:max-w-xs">
                <div className="rounded-2xl border border-rose-200 bg-white p-5 shadow-lg shadow-rose-100">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-rose-600">Filter the Market</h2>
                    <button
                      onClick={resetFilters}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-rose-400 hover:text-rose-500"
                    >
                      <FaUndoAlt /> Reset
                    </button>
                  </div>
                  <div className="space-y-4">
                    <label className="block text-sm font-semibold text-rose-500">
                      Search
                      <div className="relative mt-2">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-200" />
                        <input
                          type="search"
                          value={searchInput}
                          onChange={(event) => setSearchInput(event.target.value)}
                          placeholder="Product, SKU, capability."
                          className="w-full rounded-lg border border-rose-200 bg-white py-2 pl-10 pr-3 text-sm text-slate-700 placeholder:text-rose-200 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                        />
                      </div>
                    </label>
                    <label className="block text-sm font-semibold text-rose-500">
                      Category
                      <select
                        name="category"
                        value={filters.category}
                        onChange={handleFilterChange}
                        className="mt-2 w-full rounded-lg border border-rose-200 bg-white py-2 px-3 text-sm text-slate-700 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="">All categories</option>
                        {Object.keys(categories).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-rose-500">
                      Subcategory
                      <select
                        name="subcategory"
                        value={filters.subcategory}
                        onChange={handleFilterChange}
                        disabled={!filters.category}
                        className="mt-2 w-full rounded-lg border border-rose-200 bg-white py-2 px-3 text-sm text-slate-700 disabled:cursor-not-allowed disabled:text-rose-200 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      >
                        <option value="">All subcategories</option>
                        {availableSubcategories.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-white p-5 text-sm text-rose-500">
                  Need a bespoke bundle?{' '}
                  <Link to="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                    Talk with onboarding specialists.
                  </Link>
                </div>
              </aside>

              <section className="flex-1 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-rose-500">
                  <div>
                    Showing{' '}
                    <span className="font-semibold text-rose-600">
                      {products.length}
                    </span>{' '}
                    items
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-400">
                    Connected to ITnVend POS
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-2">
                  {products.map((product, index) => {
                    if (loading) {
                      return (
                        <div
                          key={`skeleton-${index}`}
                          className="animate-pulse rounded-2xl border border-rose-100 bg-white p-6"
                        >
                          <div className="mb-4 h-40 w-full rounded-xl bg-rose-100" />
                          <div className="mb-2 h-4 w-3/4 rounded bg-rose-100" />
                          <div className="mb-4 h-3 w-1/2 rounded bg-rose-100" />
                          <div className="h-5 w-1/3 rounded bg-rose-100" />
                        </div>
                      );
                    }

                    return (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onAdd={() => addToCart(product)}
                        formatCurrency={formatCurrency}
                      />
                    );
                  })}
                </div>

                {!loading && products.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-rose-200 bg-white/80 p-10 text-center text-rose-400">
                    Nothing matches your filters yet. Try resetting filters or{' '}
                    <Link to="/vendor-onboarding" className="font-semibold text-rose-500 hover:text-rose-400">
                      request a bespoke package
                    </Link>
                    .
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
