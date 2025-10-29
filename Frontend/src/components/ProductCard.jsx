import React from 'react';
import { FaShoppingCart } from 'react-icons/fa';

// Dark-styled product card used across Home and PublicProducts
export default function ProductCard({ product, onAdd = () => {}, formatCurrency = (n) => n }) {
  const image = product.image || product.image_source || product.imageUrl;

  return (
    <article
      className="group flex flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 text-white shadow-lg shadow-black/20 transition hover:-translate-y-1 hover:shadow-blue-900/40"
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
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <h3 className="text-lg font-semibold text-white line-clamp-2">{product.name}</h3>
          <p className="mt-1 text-xs uppercase tracking-widest text-blue-300">{product.subcategory || ''}</p>
          {product.description && (
            <p className="mt-3 text-sm text-slate-300 line-clamp-3">{product.description}</p>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-blue-300">{formatCurrency(product.price)}</span>
          <button
            onClick={() => onAdd(product)}
            className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800/60 px-3 py-1 text-sm text-white/90 hover:bg-slate-800"
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
