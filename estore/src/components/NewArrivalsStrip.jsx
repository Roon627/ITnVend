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
      <div className="relative rounded-xl bg-white p-4 shadow-md border border-rose-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-[#111827]">New arrivals</div>
            <div className="text-sm text-[#4b5563]">{items.length} new item{items.length > 1 ? 's' : ''}</div>
          </div>
          <div className="flex items-center gap-2 flex-col sm:flex-row sm:items-center sm:gap-3">
            <button
              type="button"
              onClick={() => onView()}
              className="btn-sm btn-sm-outline w-full sm:w-auto justify-center text-xs sm:text-sm"
            >
              View
            </button>
            <button
              type="button"
              onClick={() => onBrowse()}
              className="btn-sm btn-sm-primary w-full sm:w-auto justify-center text-xs sm:text-sm"
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
            className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 pl-12 pr-12"
            style={{ scrollBehavior: 'smooth' }}
          >
            {items.map((p, idx) => (
                <Link
                  key={p.id}
                  to={`/product/${p.id}`}
                  state={{ preloadedProduct: p }}
                  className="min-w-[110px] sm:min-w-[140px] w-[110px] sm:w-[140px] snap-start rounded-lg border border-rose-100 bg-white p-2 shadow-sm hover:shadow-lg transform transition-all duration-300 hover:z-10 no-underline animate-card"
                  style={{ animationDelay: `${idx * 40}ms` }}
                >
                  <div className="h-20 sm:h-28 w-full overflow-hidden rounded-md">
                    <img
                      src={resolveMediaUrl(p.image || p.image_source || (Array.isArray(p.gallery) && p.gallery[0]))}
                      alt={p.name}
                      className="h-full w-full object-cover transition-transform duration-300 transform hover:scale-110"
                    />
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#111827] line-clamp-2">{p.name}</div>
                  <div className="mt-1 text-sm text-[#111827] font-bold">{typeof p.price === 'number' ? (formatCurrency ? formatCurrency(p.price) : `MVR ${p.price}`) : p.price}</div>
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
