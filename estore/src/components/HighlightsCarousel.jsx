import { useMemo, useState, useEffect } from 'react';
import AvailabilityTag from './AvailabilityTag';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '../lib/media';
import {
  isUserListing,
  isVendorListing,
  getSellerContact,
  buildContactLink,
  productDescriptionCopy,
} from '../lib/listings';

export default function HighlightsCarousel({ sections = [], formatCurrency, onAdd, activeKeyOverride = null }) {
  const tabs = useMemo(
    () => (sections || []).filter((section) => Array.isArray(section.items) && section.items.length > 0),
    [sections]
  );

  // track which section tab is active. Initialize to first available tab when sections load.
  const [activeKey, setActiveKey] = useState(tabs[0]?.key || null);
  // modal removed; use page navigation instead

  // Keep activeKey in sync when the available tabs change (e.g. after async highlights load).
  useEffect(() => {
    if (!tabs || tabs.length === 0) {
      setActiveKey(null);
      return;
    }
    // If current activeKey is not present in tabs, pick the first tab.
    const found = tabs.find((t) => t.key === activeKey);
    if (!found) setActiveKey(tabs[0].key);
  }, [tabs, activeKey]);

  // Allow parent to override which tab is active (e.g. jump to "newArrivals")
  useEffect(() => {
    if (!activeKeyOverride) return;
    const hit = tabs.find((t) => t.key === activeKeyOverride);
    if (hit) setActiveKey(activeKeyOverride);
  }, [activeKeyOverride, tabs]);

  if (!tabs.length) return null;

  const activeSection = tabs.find((tab) => tab.key === activeKey) || tabs[0];
  const items = activeSection?.items || [];

  return (
    <section className="space-y-3 rounded-3xl border border-rose-100 bg-white/95 p-4 shadow-lg shadow-rose-100/40 sm:space-y-4 sm:p-6">
      <div className="grid grid-cols-2 gap-1 text-[9px] sm:flex sm:flex-wrap sm:gap-2 sm:text-sm">
        {tabs.map((tab) => {
          const active = tab.key === activeSection.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={`inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition whitespace-nowrap sm:w-auto sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.2em] ${
                active ? 'bg-rose-500 text-white shadow shadow-rose-200/70' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeSection.description && (
        <p className="text-sm text-slate-500">{activeSection.description}</p>
      )}
      <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth touch-pan-x no-scrollbar sm:gap-4">
        {items.map((item) => {
          const galleryPaths = Array.isArray(item.gallery)
            ? item.gallery
                .map((entry) => {
                  if (typeof entry === 'string') return entry;
                  if (entry?.url) return entry.url;
                  if (entry?.path) return entry.path;
                  return null;
                })
                .filter(Boolean)
            : [];
          const primaryImageSource = [item.image, item.image_source, item.imageUrl, ...galleryPaths].find(Boolean);
          const image = resolveMediaUrl(primaryImageSource);
          const userListing = isUserListing(item);
          const vendorListing = isVendorListing(item);
          const sellerContact = getSellerContact(item);
          const contactLink = buildContactLink(sellerContact);
          const contactHasInfo = Boolean(sellerContact.phone);
          const descriptionCopy = productDescriptionCopy(item);
          let badge = item.highlight_label || activeSection.badgeLabel || null;
          if (userListing) {
            badge = 'Private seller';
          } else if (vendorListing) {
            badge = item.vendor_name ? `Vendor · ${item.vendor_name}` : 'Marketplace partner';
          }
          const friendlyBadge =
            typeof badge === 'string'
              ? badge
                  .toLowerCase()
                  .replace(/\s+/g, ' ')
                  .trim()
                  .replace(/\b\w/g, (char) => char.toUpperCase())
              : badge;
          return (
            <div
              key={`highlight-${activeSection.key}-${item.id}`}
              className="min-w-[85vw] sm:min-w-[240px] snap-center rounded-2xl border border-rose-100 bg-gradient-to-br from-white via-rose-50 to-sky-50 p-4 shadow-sm sm:p-5"
            >
              <div className="relative h-36 overflow-hidden rounded-xl">
                <AvailabilityTag availabilityStatus={item.availability_status || item.availabilityStatus || 'in_stock'} />
                {image ? (
                  <img src={image} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-slate-100 text-xs text-slate-500">
                    Image coming soon
                  </div>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {friendlyBadge && (
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[9px] font-medium text-rose-600 sm:px-3 sm:text-xs">
                    {friendlyBadge}
                  </span>
                )}
                <div className="text-base font-semibold text-slate-900 line-clamp-2">{item.name}</div>
                <p className="text-xs text-slate-500 line-clamp-3">
                  {descriptionCopy.primary || 'Curated inventory from the ITnVend network.'}
                </p>
                <div className="text-lg font-bold text-rose-500">
                  {typeof formatCurrency === 'function' ? formatCurrency(item.price) : `${item.price} MVR`}
                </div>
                <div className="flex gap-2">
                  <Link
                      to={`/product/${item.id}`}
                      state={{ preloadedProduct: item }}
                      className="flex-1 rounded-full border border-rose-200 bg-white px-2.5 py-1 text-center text-xs font-semibold text-rose-600 shadow-sm hover:bg-rose-50 sm:px-4 sm:py-2 sm:text-base"
                    >
                      View details
                  </Link>
                  {userListing ? (
                    contactHasInfo ? (
                      <a
                        href={contactLink || '#'}
                        onClick={(e) => {
                          if (!contactLink) e.preventDefault();
                        }}
                        className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-amber-500 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow-sm hover:bg-amber-400 sm:px-4 sm:py-2 sm:text-base"
                      >
                        Contact seller
                      </a>
                    ) : (
                      <div className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 text-[10px] font-semibold uppercase text-slate-400 sm:px-4 sm:py-2">
                        Contact pending
                      </div>
                    )
                  ) : (
                    onAdd && (
                      <button
                        type="button"
                        onClick={() => onAdd(item)}
                        className="rounded-full border border-rose-500 bg-rose-500 px-2.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-rose-400 sm:px-4 sm:py-2 sm:text-base"
                      >
                        Add
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* ProductPreviewModal removed: navigation goes to product page now */}
    </section>
  );
}
