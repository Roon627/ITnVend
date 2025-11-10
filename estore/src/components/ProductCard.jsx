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
      <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200/40 bg-white text-slate-900 shadow-lg shadow-rose-100/40 transition-all duration-300 hover:shadow-xl hover:shadow-rose-200/60 hover:-translate-y-1">
        <div className="relative h-48 sm:h-56 overflow-hidden">
          <AvailabilityTag availabilityStatus={availabilityStatus} />
          {image ? (
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-500 text-sm">
              Visual coming soon
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col p-4">
          <h3 className="text-base font-semibold text-slate-800 line-clamp-2">{product.name}</h3>
          
          <div className="mt-auto pt-4">
            <div className="mb-3 text-left">
              <span className="text-xl font-bold text-rose-500">{formatCurrency(product.price)}</span>
            </div>
            <div className="flex flex-col gap-2">
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600"
                    aria-label="Contact seller"
                  >
                    <FaPhone />
                    Contact Seller
                  </a>
                ) : (
                  <div className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500">
                    Contact Pending
                  </div>
                )
              ) : (
                <button
                  onClick={() => onAdd(product)}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-rose-600"
                  aria-label={`${isPreorder ? 'Preorder' : 'Add'} ${product.name}`}
                >
                  <FaShoppingCart />
                  <span>{isPreorder ? 'Preorder' : 'Add to Cart'}</span>
                </button>
              )}
              <button
                onClick={() => setPreviewOpen(true)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white/80 px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
                aria-label={`View details for ${product.name}`}
              >
                View
              </button>
            </div>
          </div>
        </div>
      </article>

      <ProductPreviewModal open={previewOpen} product={product} onClose={() => setPreviewOpen(false)} onAdd={onAdd} formatCurrency={formatCurrency} />
    </>
  );
}
