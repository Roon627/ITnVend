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
    <section className="space-y-4 rounded-3xl border border-rose-100 bg-white/95 p-5 shadow-xl shadow-black/5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === activeSection.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.15em] transition sm:px-4 sm:py-1.5 sm:text-xs sm:tracking-[0.2em] ${
                active ? 'bg-[#111827] text-white shadow' : 'bg-white text-[#111827] border border-[#e5e7eb] hover:border-[#33f5c6]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {activeSection.description && (
        <p className="text-sm text-[#4b5563]">{activeSection.description}</p>
      )}
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth touch-pan-x no-scrollbar">
        {items.map((item, idx) => {
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
          return (
            <div
              key={`highlight-${activeSection.key}-${item.id}`}
              className="min-w-full sm:min-w-[240px] snap-center rounded-2xl border border-rose-100 bg-white p-4 shadow-sm hover:shadow-lg transition-transform duration-200 animate-card"
              style={{ animationDelay: `${idx * 60}ms` }}
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
                {badge && (
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#111827]">
                    {badge}
                  </span>
                )}
                <div className="text-base font-semibold text-[#111827] line-clamp-2">{item.name}</div>
                <p className="text-xs text-[#6b7280] line-clamp-3">
                  {descriptionCopy.primary || 'Curated inventory from the ITnVend network.'}
                </p>
                <div className="text-lg font-bold text-[#111827]">
                  {typeof formatCurrency === 'function' ? formatCurrency(item.price) : `${item.price} MVR`}
                </div>
                <div className="flex gap-2">
                  <Link
                      to={`/product/${item.id}`}
                      state={{ preloadedProduct: item }}
                      className="btn-sm btn-sm-outline flex-1 justify-center text-xs sm:text-sm"
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
                        className="btn-sm btn-sm-primary inline-flex items-center justify-center px-4"
                      >
                        Contact seller
                      </a>
                    ) : (
                      <div className="btn-sm btn-sm-ghost w-full justify-center text-[11px] uppercase">
                        Contact pending
                      </div>
                    )
                  ) : (
                    onAdd && (
                      <button
                        type="button"
                        onClick={() => onAdd(item)}
                        className="btn-sm btn-sm-primary"
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
