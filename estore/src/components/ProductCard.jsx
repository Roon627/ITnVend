import React from 'react';
import { FaShoppingCart } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';

// Dark-styled product card used across Home and PublicProducts
export default function ProductCard({ product, onAdd = () => {}, formatCurrency = (n) => n }) {
  const image = resolveMediaUrl(product.image || product.image_source || product.imageUrl);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/40 bg-gradient-to-br from-white via-rose-50 to-sky-50 text-slate-900 shadow-lg shadow-rose-200/40 transition hover:-translate-y-1 hover:shadow-rose-300/70">
      <div className="relative h-44 overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={product.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-500 text-sm">
            Visual coming soon
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{product.name}</h3>
          <p className="mt-1 text-xs uppercase tracking-widest text-rose-500">{product.subcategory || ''}</p>
          {product.description && (
            <p className="mt-3 text-sm text-slate-600 line-clamp-3">{product.description}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-rose-500">{formatCurrency(product.price)}</span>
          <button
            onClick={() => onAdd(product)}
            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white/80 px-3 py-1 text-sm text-rose-600 shadow-sm transition hover:bg-rose-100"
            aria-label={`Add ${product.name} to cart`}
          >
            <FaShoppingCart />
            <span>Add</span>
          </button>
        </div>
      </div>
    </article>
  );
}
