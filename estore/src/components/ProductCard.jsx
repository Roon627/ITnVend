import React, { useState } from 'react';
import { FaShoppingCart, FaPhone } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';
import ProductPreviewModal from './ProductPreviewModal';
import { isPreorderProduct } from '../lib/preorder';
import AvailabilityTag from './AvailabilityTag';
import { isUserListing, isVendorListing, getSellerContact, buildContactLink, productDescriptionCopy } from '../lib/listings';

// Dark-styled product card used across Home and PublicProducts
export default function ProductCard({ product, onAdd = () => {}, formatCurrency = (n) => n }) {
  const image = resolveMediaUrl(product.image || product.image_source || product.imageUrl);
  const [previewOpen, setPreviewOpen] = useState(false);

  const isPreorder = isPreorderProduct(product);
  const availabilityStatus =
    product.availability_status ||
    product.availabilityStatus ||
    (isPreorder ? 'preorder' : 'in_stock');
  const userListing = isUserListing(product);
  const vendorListing = isVendorListing(product);
  const sellerContact = getSellerContact(product);
  const contactLink = buildContactLink(sellerContact);
  const contactHasInfo = Boolean(sellerContact.phone);
  const { primary: detailBlurb } = productDescriptionCopy(product);

  return (
    <>
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/40 bg-gradient-to-br from-white via-rose-50 to-sky-50 text-slate-900 shadow-lg shadow-rose-200/40 transition hover:-translate-y-1 hover:shadow-rose-300/70">
        <div className="relative h-44 overflow-hidden">
          <AvailabilityTag availabilityStatus={availabilityStatus} />
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

        <div className="flex flex-1 flex-col p-6">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 line-clamp-2">{product.name}</h3>
            {product.subcategory && (
              <p className="mt-1 text-[11px] uppercase tracking-[0.3em] text-rose-400">{product.subcategory}</p>
            )}
            {userListing && (
              <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-amber-700">
                Seller listing
              </span>
            )}
            {!userListing && vendorListing && (
              <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.3em] text-emerald-700">
                Marketplace partner
              </span>
            )}
            {detailBlurb && (
              <p className="mt-3 text-sm text-slate-600 line-clamp-3">{detailBlurb}</p>
            )}
          </div>

          <div className="mt-auto pt-4">
            <div className="mb-3 text-left">
              <span className="text-2xl font-bold text-rose-500">{formatCurrency(product.price)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPreviewOpen(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-white/80 px-4 py-2 text-sm text-rose-600 shadow-sm transition hover:bg-rose-100"
                aria-label={`View details for ${product.name}`}
              >
                View details
              </button>
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-full border border-amber-200 bg-amber-500 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-amber-600"
                    aria-label="Contact seller"
                  >
                    <FaPhone className="text-[12px]" />
                    Contact seller
                  </a>
                ) : (
                  <div className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white/70 px-3 py-1.5 text-[11px] font-semibold uppercase text-slate-400">
                    Contact pending
                  </div>
                )
              ) : (
                <button
                  onClick={() => onAdd(product)}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-500 px-4 py-2 text-sm text-white shadow-sm transition hover:bg-rose-600"
                  aria-label={`${isPreorder ? 'Preorder' : 'Add'} ${product.name}`}
                >
                  <FaShoppingCart />
                  <span>{isPreorder ? 'Preorder' : 'Add'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </article>

      <ProductPreviewModal open={previewOpen} product={product} onClose={() => setPreviewOpen(false)} onAdd={onAdd} formatCurrency={formatCurrency} />
    </>
  );
}
