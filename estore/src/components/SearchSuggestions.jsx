import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';

// Minimal search suggestions component with highlighting, client-side limit, and analytics hook
export default function SearchSuggestions({ query, onSelect, minChars = 2, limit = 6, enabled = true }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const mounted = useRef(true);
  const debounceRef = useRef(null);
  const navigate = useNavigate();
  const containerRef = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !query || query.length < minChars) {
      setItems([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
  // Use lowercase query to encourage case-insensitive backend matching and reduce client-side normalization
  const q = (query || '').toString().toLowerCase();
  // Prefer server-side limiting if supported; pass `limit` so backend can optimize
  const res = await api.get('/products', { params: { search: q, limit } });
  if (!mounted.current) return;
  const list = Array.isArray(res) ? res : [];
        setItems(list);
        setOpen(true);
        setActive(-1);
      } catch (err) {
        console.error('Search suggestions error', err);
        if (!mounted.current) return;
        setItems([]);
        setOpen(false);
      } finally {
        if (mounted.current) setLoading(false);
      }
    }, 200);
  }, [query, minChars, limit, enabled]);

  const fireAnalytics = useCallback((item) => {
    try {
      const payload = { event: 'search_suggestion_select', suggestionId: item?.id || null, query: query || '' };
      // GTM dataLayer
      if (window && window.dataLayer && typeof window.dataLayer.push === 'function') {
        window.dataLayer.push(payload);
      }
      // gtag fallback
      if (window && typeof window.gtag === 'function') {
        window.gtag('event', 'search_suggestion_select', payload);
      }
    } catch (error) {
      // don't let analytics break UX
      console.debug('Search analytics failed', error);
    }
  }, [query]);

  const handleSelect = useCallback((item) => {
    setOpen(false);
    fireAnalytics(item);
    if (onSelect) {
      onSelect(item);
      return;
    }
    // default: navigate to product detail
    if (item && item.id) navigate(`/product/${item.id}`);
  }, [fireAnalytics, navigate, onSelect]);

  // Keyboard handling
  useEffect(() => {
    function onKey(e) {
      if (!open) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, items.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter') {
        // If an item is active, select it. Otherwise run a full search.
        if (active >= 0 && active < items.length) {
          e.preventDefault();
          handleSelect(items[active]);
        } else if ((query || '').length >= minChars) {
          e.preventDefault();
          // run a full search: navigate to products listing with the search param
              navigate(`/products?search=${encodeURIComponent((query || '').toLowerCase())}`);
          setOpen(false);
        }
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items, active, query, navigate, minChars, handleSelect]);

  // click away to close
  useEffect(() => {
    function onClick(e) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target)) setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const renderHighlighted = (text = '', q = '') => {
    if (!q) return text;
    const lower = text.toString().toLowerCase();
    const qLower = q.toString().toLowerCase();
    const idx = lower.indexOf(qLower);
    if (idx === -1) return text;
    const before = text.slice(0, idx);
    const match = text.slice(idx, idx + q.length);
    const after = text.slice(idx + q.length);
    return (
      <>
        {before}
        <span className="bg-rose-100 text-rose-600 rounded px-0.5">{match}</span>
        {after}
      </>
    );
  };

  if (!open) return null;

  return (
    <div ref={containerRef} className="absolute left-0 right-0 mt-2 z-50" aria-live="polite">
      <div className="mx-auto max-w-2xl rounded-lg bg-white shadow-xl ring-1 ring-slate-100" role="listbox" id="search-suggestions">
        <div className="divide-y divide-slate-100">
          {loading && (
            <div className="p-3 text-sm text-slate-500">Loading…</div>
          )}
          {!loading && items.length === 0 && (
            <div className="p-3 text-sm text-slate-500">No results</div>
          )}
          {!loading && items.map((it, idx) => (
            <button
              key={it.id || `${it.name}-${idx}`}
              onClick={() => handleSelect(it)}
              role="option"
              aria-selected={idx === active}
              id={`search-suggestions-opt-${idx}`}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-rose-50 transition ${idx === active ? 'bg-rose-50' : ''}`}
              type="button"
            >
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-md bg-slate-100">
                {it.image ? (
                  <img src={resolveMediaUrl(it.image)} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full bg-slate-100" />
                )}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-800 line-clamp-1">{renderHighlighted(it.name, query)}</div>
                <div className="text-xs text-slate-500">{it.subcategory || it.vendor_name || ''}</div>
              </div>
              <div className="text-sm text-rose-500 font-semibold">{it.price ? (typeof it.price === 'number' ? `MVR ${it.price}` : it.price) : ''}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
