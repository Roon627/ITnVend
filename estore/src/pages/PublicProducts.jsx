import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaSearch, FaUndoAlt, FaHeart } from 'react-icons/fa';
import ProductCard from '../components/ProductCard';
import HighlightsCarousel from '../components/HighlightsCarousel';
import NewArrivalsStrip from '../components/NewArrivalsStrip';
import FilterSidebar from '../components/FilterSidebar';
import SearchSuggestions from '../components/SearchSuggestions';
import { mapPreorderFlags } from '../lib/preorder';
import { resolveMediaUrl } from '../lib/media';

const initialFilters = { category: '', subcategory: '', search: '', highlight: '' };

const filtersFromParams = (params) => ({
  category: params.get('category') || '',
  subcategory: params.get('subcategory') || '',
  search: params.get('search') || '',
  highlight: params.get('highlight') || '',
});

const filtersEqual = (a, b) =>
  a.category === b.category && a.subcategory === b.subcategory && a.search === b.search && a.highlight === b.highlight;

export default function PublicProducts() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFromParams = filtersFromParams(searchParams);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState(initialFromParams);
  const [searchInput, setSearchInput] = useState(initialFromParams.search);
  const [loading, setLoading] = useState(false);
  const [highlights, setHighlights] = useState(null);
  const [carouselActiveKeyOverride, setCarouselActiveKeyOverride] = useState(null);
  const [isFilterSidebarOpen, setFilterSidebarOpen] = useState(false);
  const [openCategory, setOpenCategory] = useState(null);
  const [categoryPreviewItems, setCategoryPreviewItems] = useState([]);
  const [categoryLoading, setCategoryLoading] = useState(false);
  const [categoryHasMore, setCategoryHasMore] = useState(false);
  
  const categoryCacheRef = useRef({}); // { [categoryLabel]: { items: [], hasMore: bool } }
  const [suppressHeaderSuggestions, setSuppressHeaderSuggestions] = useState(false);
  const previewRef = useRef(null);

  const fetchMoreCategoryItems = useCallback(
    async (label) => {
      if (!label) return;
      setCategoryLoading(true);
      try {
        const limit = 12;
        const offset = categoryPreviewItems.length || 0;
        const res = await api.get('/products', { params: { category: label, limit, offset } });
        const items = Array.isArray(res) ? res : [];
        const next = (categoryPreviewItems || []).concat(items);
        setCategoryPreviewItems(next);
        const hasMore = items.length === limit;
        setCategoryHasMore(hasMore);
        // update cache
        categoryCacheRef.current[label] = { items: next, hasMore };
        // removed categoryOffset (not used)
      } catch (err) {
        console.error('Failed to load more category items', err);
      } finally {
        setCategoryLoading(false);
      }
    },
    [categoryPreviewItems]
  );

  // Auto-hide the category preview when the user scrolls the page. If the
  // scroll event originated from an element inside the preview (e.g. the
  // user scrolled the preview itself), ignore it. We only close when the
  // page scroll moves more than a small threshold to avoid accidental hides.
  useEffect(() => {
    if (!openCategory) return;
    let lastY = typeof window !== 'undefined' ? window.scrollY || window.pageYOffset : 0;
    const onScroll = (e) => {
      try {
        const tgt = e.target;
        if (previewRef.current && tgt && previewRef.current.contains(tgt)) {
          // scrolling inside the preview panel — ignore
          return;
        }
      } catch {
        // ignore containment errors
      }
      const y = window.scrollY || window.pageYOffset;
      if (Math.abs(y - lastY) > 10) {
        setOpenCategory(null);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [openCategory]);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();

  const headerSearchInitted = useRef(false);
  useEffect(() => {
    const next = filtersFromParams(searchParams);
    if (!filtersEqual(filters, next)) {
      setFilters(next);
    }
    // Only initialize the header search input from URL params once on mount.
    if (!headerSearchInitted.current) {
      headerSearchInitted.current = true;
      if (next.search) setSearchInput(next.search);
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
    if (filters.highlight) nextParams.highlight = filters.highlight;
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
    let mounted = true;
    api
      .get('/storefront/highlights')
      .then((res) => {
        if (mounted) setHighlights(res || {});
      })
      .catch(() => {
        if (mounted) setHighlights(null);
      });
    return () => {
      mounted = false;
    };
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

  // Header search is intentionally decoupled from the product filters to avoid
  // excessive server load. The header input only performs a filtered product
  // search when the user explicitly submits (Enter) or uses the search UI.
  // We intentionally do not reset filters when the header input is cleared so
  // the filter sidebar remains authoritative for real-time filtering.

  const availableSubcategories = useMemo(
    () => (filters.category ? categories[filters.category] || [] : []),
    [filters.category, categories]
  );

  const highlightSections = useMemo(() => {
    if (!highlights) return [];
    return [
      {
        key: 'highlighted',
        label: 'Featured picks',
        description: 'Hand-curated hero slots from the ITnVend team.',
        badgeLabel: 'Featured',
        items: highlights.highlighted || [],
      },
      {
        key: 'hotCasual',
        label: 'Seller hotlist',
        description: 'Boosted community listings with the seller feature fee.',
        badgeLabel: 'Hot drop',
        items: highlights.hotCasual || [],
      },
      {
        key: 'newArrivals',
        label: 'New arrivals',
        description: 'Fresh inventory that landed this week.',
        badgeLabel: 'New',
        items: highlights.newArrivals || [],
      },
    ].filter((section) => section.items && section.items.length > 0);
  }, [highlights]);
  
  // Respect the admin setting that controls which storefront highlight sources
  // populate the public header/hero area. Default to both.
  const filteredHighlightSections = useMemo(() => {
    if (!highlightSections) return [];
    return highlightSections;
  }, [highlightSections]);

  const newArrivalsList = highlights?.newArrivals || [];
  

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
      {/* Compact Market Header - clean, minimal, focused on browsing */}
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="container mx-auto px-4 sm:px-6">
          {/* Top compact row: logo, search, cart */}
          <div className="flex items-center gap-4 py-3">
            <div className="flex items-center shrink-0">
              <Link to="/" className="inline-flex items-center gap-2 text-rose-600 font-bold no-underline">
                <FaHeart className="text-rose-500" />
                <span className="hidden sm:inline">ITnVend</span>
              </Link>
            </div>

            <div className="flex-1">
              <div className="relative max-w-2xl mx-auto">
                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-rose-300" />
                <div className="relative">
                  <input
                    id="market-search"
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        // user explicitly submitted a search; apply it to filters (case-insensitive)
                        const q = (searchInput || '').trim();
                        setFilters((prev) => ({ ...prev, search: q ? q.toLowerCase() : '' }));
                        setSearchParams(q ? { search: q.toLowerCase() } : {}, { replace: false });
                      }
                    }}
                    placeholder="Search products, SKU or brand"
                    aria-controls="search-suggestions"
                    aria-autocomplete="list"
                    aria-expanded={!suppressHeaderSuggestions && (searchInput || '').length >= 2}
                    className="w-full rounded-full border border-rose-100 bg-white py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-rose-200 focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-100"
                  />
                  <SearchSuggestions
                    query={searchInput}
                    onSelect={(item) => {
                      if (!item) return;
                      // Suggestions navigate to product detail only; do not mutate filters
                      if (item.id) navigate(`/product/${item.id}`);
                    }}
                    enabled={!suppressHeaderSuggestions}
                  />
                </div>
              </div>
            </div>

            {/* Cart is provided by the global PublicNavbar to avoid duplication */}
          </div>

          {/* Category menu - horizontally scrollable on mobile, evenly spaced on desktop */}
          <nav className="mt-2">
            <div className="overflow-x-auto no-scrollbar">
              <div className="flex gap-2 md:justify-between md:gap-4 whitespace-nowrap px-2 items-center">
                {/* Show a subset of categories on narrow screens and provide a 'View all' CTA */}
                {((Object.keys(categories).length ? Object.keys(categories) : ['Electronics','Fashion','Home & Garden','Sports','Health & Beauty','Deals']).slice(0, 6)).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      // Toggle category preview panel
                      setOpenCategory((prev) => (prev === label ? null : label));
                      // If we have cached preview items, use them; otherwise fetch the first page
                      const cached = categoryCacheRef.current[label];
                      if (cached && Array.isArray(cached.items) && cached.items.length > 0) {
                        setCategoryPreviewItems(cached.items);
                        setCategoryHasMore(!!cached.hasMore);
                        setCategoryLoading(false);
                        return;
                      }
                      // trigger fetch for preview items (fetchMoreCategoryItems is async)
                      fetchMoreCategoryItems(label);
                    }}
                    className={`inline-block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:underline hover:bg-rose-50 ${filters.category === label ? 'bg-rose-50 underline' : ''}`}
                  >
                    {label}
                  </button>
                ))}
                <Link to="/market" className="inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100">
                  View all
                </Link>
                <Link
                  to="/vendor-onboarding"
                  className="hidden sm:inline-block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:underline hover:bg-rose-50"
                >
                  Sell
                </Link>
              </div>
            </div>
          </nav>

          {/* Category preview panel (appears under the category menu and pushes content down) */}
          <div className={`bg-white border-b transition-all duration-300 overflow-hidden ${openCategory ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="container mx-auto px-4 sm:px-6 py-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800">{openCategory || ''}</h3>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      // View all navigates to product list with category filter
                      if (openCategory) setFilters((prev) => ({ ...prev, category: openCategory, subcategory: '' }));
                      setOpenCategory(null);
                    }}
                    className="text-sm font-semibold text-rose-600 hover:text-rose-500"
                  >
                    View all
                  </button>
                  <button
                    onClick={() => setOpenCategory(null)}
                    className="text-sm text-slate-400 hover:text-slate-600"
                    aria-label="Close category preview"
                  >
                    Close
                  </button>
                </div>
              </div>

              <div className="relative">
                {categoryLoading ? (
                  <div className="py-8 text-center text-slate-500">Loading...</div>
                ) : categoryPreviewItems.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">No items in this category yet.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {categoryPreviewItems.map((p, idx) => (
                        <div
                          key={p.id}
                          className="flex flex-col items-stretch rounded-lg border border-slate-100 bg-white p-3 shadow-sm transform transition-all duration-200 hover:-translate-y-1"
                          style={{ transitionDelay: `${idx * 20}ms` }}
                        >
                          <div className="h-28 w-full overflow-hidden rounded-md mb-2 bg-slate-100">
                            {p.image ? (
                              <img src={resolveMediaUrl(p.image)} alt={p.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full bg-slate-100" />
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-800 line-clamp-2">{p.name}</div>
                            <div className="text-sm text-rose-500 font-semibold mt-2">{formatCurrency(p.price)}</div>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => addToCart(p)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-rose-500 px-2 py-1 text-xs font-semibold text-white hover:bg-rose-600"
                            >
                              Add
                            </button>
                            <button
                              onClick={() => navigate(`/product/${p.id}`)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-rose-100 px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50"
                            >
                              View
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {categoryHasMore && (
                      <div className="mt-4 text-center">
                        <button
                          onClick={() => fetchMoreCategoryItems(openCategory)}
                          className="inline-flex items-center gap-2 rounded-md border border-rose-100 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                        >
                          Load more
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="pb-16">
        <div className="container mx-auto px-4 sm:px-6 pt-8">
          {newArrivalsList.length > 0 && (
            <div className="mb-8">
              <NewArrivalsStrip
                items={newArrivalsList}
                formatCurrency={formatCurrency}
                onView={() => {
                  const el = document.getElementById('highlights-carousel');
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => {
                      setCarouselActiveKeyOverride('newArrivals');
                      setTimeout(() => setCarouselActiveKeyOverride(null), 3000);
                    }, 250);
                  } else {
                    setCarouselActiveKeyOverride('newArrivals');
                    setTimeout(() => setCarouselActiveKeyOverride(null), 3000);
                  }
                }}
                onBrowse={() => {
                  // Set a URL param so the product page knows the user came from New Arrivals.
                  // This doesn't change existing filters but provides a hook for future filtering.
                  setSearchParams({ highlight: 'newArrivals' }, { replace: false });
                  const listEl = document.getElementById('product-list');
                  if (listEl) {
                    listEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  } else {
                    // fallback: scroll to products container in page
                    const fallback = document.querySelector('.grid');
                    if (fallback) fallback.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                  // Also nudge the carousel highlight so user knows context
                  setCarouselActiveKeyOverride('newArrivals');
                  setTimeout(() => setCarouselActiveKeyOverride(null), 3000);
                }}
              />
            </div>
          )}

          {filteredHighlightSections.length > 0 && (
            <div id="highlights-carousel" className="mb-8">
              <HighlightsCarousel
                sections={filteredHighlightSections}
                formatCurrency={formatCurrency}
                onAdd={(product) => addToCart(product)}
                activeKeyOverride={carouselActiveKeyOverride}
              />
            </div>
          )}

          <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
            {/* Mobile filter sidebar - drawer */}
            {isFilterSidebarOpen && (
              <div className="lg:hidden fixed inset-0 z-30">
                <div
                  className="absolute inset-0 bg-black/30"
                  onClick={() => setFilterSidebarOpen(false)}
                />
                <div className="relative bg-white w-80 h-full shadow-xl">
                  <FilterSidebar
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    onFilterSearchChange={(v) => setFilters((prev) => ({ ...prev, search: v }))}
                    onSearchFocus={() => setSuppressHeaderSuggestions(true)}
                    onSearchBlur={() => setSuppressHeaderSuggestions(false)}
                    resetFilters={resetFilters}
                    categories={categories}
                    availableSubcategories={availableSubcategories}
                  />
                </div>
              </div>
            )}

            {/* Desktop filter sidebar - sticky */}
            <FilterSidebar
              className="hidden lg:block lg:sticky lg:top-24"
              filters={filters}
              onFilterChange={handleFilterChange}
              onFilterSearchChange={(v) => setFilters((prev) => ({ ...prev, search: v }))}
              onSearchFocus={() => setSuppressHeaderSuggestions(true)}
              onSearchBlur={() => setSuppressHeaderSuggestions(false)}
              resetFilters={resetFilters}
              categories={categories}
              availableSubcategories={availableSubcategories}
            />

            <section className="flex-1 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-rose-500">
                <div>
                  Showing <span className="font-semibold text-rose-600">{products.length}</span> items
                </div>
                <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-xs uppercase tracking-[0.2em] text-rose-400">
                  Connected to ITnVend POS
                </div>
              </div>

              <div id="product-list" className="grid grid-cols-2 justify-items-center gap-5 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
                {products.map((product, index) => {
                  if (loading) {
                    return (
                      <div
                        key={`skeleton-${index}`}
                        className="animate-pulse rounded-2xl border border-rose-100 bg-white p-4"
                      >
                        <div className="mb-4 h-48 w-full rounded-xl bg-rose-100" />
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
      </main>
    </div>
  );
}
