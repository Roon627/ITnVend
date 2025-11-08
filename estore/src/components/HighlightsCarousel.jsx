import { useMemo, useState } from 'react';
import AvailabilityTag from './AvailabilityTag';
import ProductPreviewModal from './ProductPreviewModal';
import { resolveMediaUrl } from '../lib/media';

export default function HighlightsCarousel({ sections = [], formatCurrency, onAdd }) {
  const tabs = useMemo(
    () => (sections || []).filter((section) => Array.isArray(section.items) && section.items.length > 0),
    [sections]
  );

  const [activeKey, setActiveKey] = useState(tabs[0]?.key || null);
  const [modalProduct, setModalProduct] = useState(null);

  if (!tabs.length) return null;

  const activeSection = tabs.find((tab) => tab.key === activeKey) || tabs[0];
  const items = activeSection?.items || [];

  return (
    <section className="space-y-4 rounded-3xl border border-rose-100 bg-white/95 p-6 shadow-lg shadow-rose-100/50">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === activeSection.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveKey(tab.key)}
              className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
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
      <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
        {items.map((item) => {
          const image = resolveMediaUrl(item.image || item.image_source || item.imageUrl);
          const badge = item.highlight_label || activeSection.badgeLabel || null;
          return (
            <div
              key={`highlight-${activeSection.key}-${item.id}`}
              className="min-w-[240px] snap-start rounded-2xl border border-rose-100 bg-gradient-to-br from-white via-rose-50 to-sky-50 p-4 shadow-sm"
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
                  <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-rose-500">
                    {badge}
                  </span>
                )}
                <div className="text-base font-semibold text-slate-900 line-clamp-2">{item.name}</div>
                <p className="text-xs text-slate-500 line-clamp-2">
                  {item.short_description || item.description || 'Fresh in stock and ready to ship.'}
                </p>
                <div className="text-lg font-bold text-rose-500">
                  {typeof formatCurrency === 'function' ? formatCurrency(item.price) : `${item.price} MVR`}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setModalProduct(item)}
                    className="flex-1 rounded-full border border-rose-200 bg-white px-3 py-1.5 text-sm font-semibold text-rose-600 shadow-sm hover:bg-rose-50"
                  >
                    View details
                  </button>
                  {onAdd && (
                    <button
                      type="button"
                      onClick={() => onAdd(item)}
                      className="rounded-full border border-rose-500 bg-rose-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-400"
                    >
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ProductPreviewModal
        open={!!modalProduct}
        product={modalProduct}
        onClose={() => setModalProduct(null)}
        onAdd={onAdd}
        formatCurrency={formatCurrency}
      />
    </section>
  );
}
