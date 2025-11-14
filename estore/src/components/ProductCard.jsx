import React from 'react';
import { Link } from 'react-router-dom';
import { FaShoppingCart, FaPhone } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';
import { isPreorderProduct } from '../lib/preorder';
import AvailabilityTag from './AvailabilityTag';
import { isUserListing, getSellerContact, buildContactLink } from '../lib/listings';
import { useSettings } from './SettingsContext';

// Dark-styled product card used across Home and PublicProducts
export default function ProductCard({ product, onAdd = () => {}, formatCurrency: formatCurrencyProp }) {
  const image = resolveMediaUrl(product.image || product.image_source || product.imageUrl);
  // modal removed - navigates to product detail page instead

  const isPreorder = isPreorderProduct(product);
  const availabilityStatus =
    product.availability_status ||
    product.availabilityStatus ||
    (isPreorder ? 'preorder' : 'in_stock');
  const userListing = isUserListing(product);
  const sellerContact = getSellerContact(product);
  const contactLink = buildContactLink(sellerContact);
  const contactHasInfo = Boolean(sellerContact.phone);
  // intentionally omit unused description piece here (kept minimal in card view)
  const { formatCurrency } = useSettings();
  const fmt = formatCurrencyProp || formatCurrency || ((n) => n);

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
              <span className="text-xl font-bold text-rose-500">{fmt(product.price)}</span>
            </div>
            <div className={`grid gap-2 ${userListing ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="btn-sm btn-sm-primary w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 text-white shadow-sm transition-colors hover:bg-amber-600"
                    aria-label="Contact seller"
                  >
                    <FaPhone />
                    Contact Seller
                  </a>
                ) : (
                  <div className="btn-sm btn-sm-outline w-full sm:flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-slate-200 text-slate-500">
                    Contact Pending
                  </div>
                )
              ) : (
                <button
                  onClick={() => onAdd(product)}
                  className="btn-sm btn-sm-primary inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500 text-white shadow-sm transition-colors hover:bg-rose-600"
                  aria-label={`${isPreorder ? 'Preorder' : 'Add'} ${product.name}`}
                >
                  <FaShoppingCart />
                  <span>{isPreorder ? 'Preorder' : 'Add to Cart'}</span>
                </button>
              )}
              <Link
                to={`/product/${product.id}`}
                state={{ preloadedProduct: product }}
                className="btn-sm btn-sm-outline inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
                aria-label={`View details for ${product.name}`}
              >
                View
              </Link>
            </div>
          </div>
        </div>
      </article>

  {/* modal removed; navigation to product page used instead */}
    </>
  );
}
