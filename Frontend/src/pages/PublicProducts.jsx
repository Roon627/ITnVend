import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaShoppingCart, FaSearch, FaFilter, FaUndoAlt } from 'react-icons/fa';

const initialFilters = { category: '', subcategory: '', search: '' };

export default function PublicProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState(initialFilters);
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

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
        setProducts(Array.isArray(res) ? res : []);
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
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-blue-700">
        <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-blue-400 via-transparent to-transparent" />
        <div className="container relative z-10 mx-auto px-6 py-16 lg:py-24">
          <div className="max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-sm font-medium backdrop-blur">
              <FaFilter /> Unified commerce catalogue
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight text-white">
              Shop curated IT, media, procurement, and vending solutions.
            </h1>
            <p className="text-lg text-slate-200">
              Mix and match managed services, digital assets, and connected hardware. Every product drops straight into your existing
              ITnVend stack with coordinated onboarding and telemetry.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/cart"
                className="inline-flex items-center gap-3 rounded-full bg-white px-6 py-3 text-slate-900 font-semibold shadow-lg hover:-translate-y-0.5 transition"
              >
                View cart
                <span className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-blue-600 px-2 text-white">
                  {cartCount}
                </span>
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 px-6 py-3 text-sm font-semibold hover:bg-white/10"
              >
                Request proposal
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="relative -mt-16 pb-16">
        <div className="container mx-auto px-6">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
              <aside className="w-full lg:max-w-xs space-y-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-blue-900/20">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Filter catalogue</h2>
                    <button
                      onClick={resetFilters}
                      className="inline-flex items-center gap-2 text-xs font-semibold text-blue-400 hover:text-blue-300"
                    >
                      <FaUndoAlt /> Reset
                    </button>
                  </div>
                  <div className="space-y-4">
                    <label className="block text-sm font-semibold text-slate-300">
                      Search
                      <div className="relative mt-2">
                        <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="search"
                          value={searchInput}
                          onChange={(event) => setSearchInput(event.target.value)}
                          placeholder="Product, SKU, capability…"
                          className="w-full rounded-lg border border-slate-700 bg-slate-800/80 py-2 pl-10 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                      </div>
                    </label>
                    <label className="block text-sm font-semibold text-slate-300">
                      Category
                      <select
                        name="category"
                        value={filters.category}
                        onChange={handleFilterChange}
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800/80 py-2 px-3 text-sm text-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                      >
                        <option value="">All categories</option>
                        {Object.keys(categories).map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold text-slate-300">
                      Subcategory
                      <select
                        name="subcategory"
                        value={filters.subcategory}
                        onChange={handleFilterChange}
                        disabled={!filters.category}
                        className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 px-3 text-sm text-white disabled:cursor-not-allowed disabled:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
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
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 text-sm text-slate-400">
                  Need a bespoke bundle?{' '}
                  <Link to="/vendor-onboarding" className="text-blue-400 font-semibold hover:text-blue-300">
                    Talk with onboarding specialists.
                  </Link>
                </div>
              </aside>

              <section className="flex-1 space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-400">
                  <div>
                    Showing{' '}
                    <span className="font-semibold text-white">
                      {loading ? '…' : products.length}
                    </span>{' '}
                    offers
                    {filters.category && (
                      <span>
                        {' '}
                        in <span className="font-semibold text-blue-300">{filters.category}</span>
                      </span>
                    )}
                  </div>
                  {filters.search && (
                    <div className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs text-blue-200">
                      Searching “{filters.search}”
                    </div>
                  )}
                </div>

                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {(loading ? Array.from({ length: 6 }) : products).map((product, index) => {
                    if (loading) {
                      return (
                        <div
                          key={`skeleton-${index}`}
                          className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900/80 p-6"
                        >
                          <div className="mb-4 h-40 w-full rounded-xl bg-slate-800" />
                          <div className="mb-2 h-4 w-3/4 rounded bg-slate-800" />
                          <div className="mb-4 h-3 w-1/2 rounded bg-slate-800" />
                          <div className="h-5 w-1/3 rounded bg-slate-800" />
                        </div>
                      );
                    }

                    const image = product.image || product.image_source || product.imageUrl;
                    return (
                      <article
                        key={product.id}
                        className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:shadow-blue-900/40"
                      >
                        <div className="relative h-44 overflow-hidden">
                          {image ? (
                            <img
                              src={image}
                              alt={product.name}
                              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700 text-slate-300 text-sm">
                              Visual coming soon
                            </div>
                          )}
                          {product.category && (
                            <span className="absolute left-4 top-4 rounded-full bg-slate-900/80 px-3 py-1 text-xs font-semibold text-blue-300 backdrop-blur">
                              {product.category}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col gap-4 p-6">
                          <div>
                            <h3 className="text-lg font-semibold text-white line-clamp-2">{product.name}</h3>
                            <p className="mt-1 text-xs uppercase tracking-widest text-blue-300">
                              {product.subcategory || 'Premium bundle'}
                            </p>
                            {product.description && (
                              <p className="mt-3 text-sm text-slate-300 line-clamp-3">{product.description}</p>
                            )}
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-2xl font-bold text-blue-300">{formatCurrency(product.price)}</span>
                            <button
                              onClick={() => addToCart(product)}
                              className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
                              aria-label={`Add ${product.name} to cart`}
                            >
                              <FaShoppingCart /> Add to cart
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                {!loading && products.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 p-10 text-center text-slate-300">
                    Nothing matches your filters yet. Try resetting filters or{' '}
                    <Link to="/vendor-onboarding" className="font-semibold text-blue-400 hover:text-blue-300">
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
