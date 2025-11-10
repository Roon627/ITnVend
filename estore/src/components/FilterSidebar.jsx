import { FaSearch, FaUndoAlt } from 'react-icons/fa';
import { Link } from 'react-router-dom';

export default function FilterSidebar({
  filters,
  searchInput,
  onFilterChange,
  onSearchChange,
  resetFilters,
  categories,
  availableSubcategories,
  className = '',
}) {
  return (
    <aside className={`w-full space-y-6 lg:max-w-xs ${className}`}>
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
                onChange={(event) => onSearchChange(event.target.value)}
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
              onChange={onFilterChange}
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
              onChange={onFilterChange}
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
  );
}