import React, { useRef } from 'react';
import { FaChevronLeft, FaChevronRight } from 'react-icons/fa';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../lib/media';

export default function NewArrivalsStrip({ items = [], onView = () => {}, onBrowse = () => {}, formatCurrency = null }) {
  const listRef = useRef(null);

  const scrollBy = (dir = 1) => {
    const el = listRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.6 * dir;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  };

  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className="mb-4">
      <div className="relative rounded-xl border border-rose-100 bg-white/90 p-3 sm:p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-semibold text-emerald-700">New arrivals</div>
            <div className="text-[11px] text-slate-600 sm:text-sm">{items.length} new item{items.length > 1 ? 's' : ''}</div>
          </div>
          <div className="flex w-full flex-row flex-wrap gap-2 sm:w-auto sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => onView()}
              className="btn-sm btn-sm-outline flex-1 min-w-[120px] justify-center text-[11px] sm:min-w-0"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => onBrowse()}
              className="btn-sm btn-sm-primary flex-1 min-w-[140px] justify-center text-[11px] sm:min-w-0"
            >
              Browse market
            </button>
          </div>
        </div>

          <div className="mt-3 relative">
          <button
            aria-label="Scroll left"
            onClick={() => scrollBy(-1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/80 p-1 border shadow-sm hover:scale-105"
          >
            <FaChevronLeft />
          </button>
          <div
            ref={listRef}
            className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 pl-10 pr-10 sm:pl-12 sm:pr-12"
            style={{ scrollBehavior: 'smooth' }}
          >
            {items.map((p) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  state={{ preloadedProduct: p }}
                  className="min-w-[95px] w-[95px] sm:min-w-[140px] sm:w-[140px] snap-start rounded-lg border bg-white p-2 shadow-sm hover:scale-105 transform transition-all duration-300 hover:z-10 no-underline"
                >
                  <div className="h-20 sm:h-28 w-full overflow-hidden rounded-md">
                    <img
                      src={resolveMediaUrl(p.image || p.image_source || (Array.isArray(p.gallery) && p.gallery[0]))}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-300 transform hover:scale-110"
                    />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-800 line-clamp-2">{p.name}</div>
                  <div className="mt-1 text-sm text-rose-500 font-bold">{typeof p.price === 'number' ? (formatCurrency ? formatCurrency(p.price) : `MVR ${p.price}`) : p.price}</div>
                </Link>
            ))}
          </div>
          <button
            aria-label="Scroll right"
            onClick={() => scrollBy(1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/80 p-1 border shadow-sm hover:scale-105"
          >
            <FaChevronRight />
          </button>
        </div>
      </div>
    </div>
  );
}
