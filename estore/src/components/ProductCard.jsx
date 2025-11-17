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

  const primaryButton = 'btn-sm btn-sm-primary w-full justify-center text-[11px]';
  const outlineButton = 'btn-sm btn-sm-outline w-full justify-center text-[11px]';
  const neutralButton = 'btn-sm btn-sm-ghost w-full justify-center text-[11px]';

  return (
    <>
      <article className="group mx-auto flex w-full max-w-[340px] flex-col overflow-hidden rounded-2xl border border-rose-100 bg-white text-[#111827] shadow-lg shadow-black/5 transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl animate-card">
        <div className="relative aspect-[4/5] w-full overflow-hidden sm:h-56 sm:aspect-auto">
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

        <div className="flex flex-1 flex-col p-3 sm:p-4">
          <h3 className="text-sm font-semibold text-[#111827] line-clamp-2 sm:text-base">{product.name}</h3>
          
          <div className="mt-auto pt-4">
            <div className="mb-3 text-left">
              <span className="text-lg font-bold text-[#111827] sm:text-xl">{fmt(product.price)}</span>
            </div>
            <div className={`grid gap-2 ${userListing ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="btn-sm btn-sm-primary w-full justify-center text-[11px]"
                    aria-label="Contact seller"
                  >
                    <FaPhone />
                    Contact Seller
                  </a>
                ) : (
                  <div className={neutralButton}>
                    Contact Pending
                  </div>
                )
              ) : (
                <button
                  onClick={() => onAdd(product)}
                  className={primaryButton}
                  aria-label={`${isPreorder ? 'Preorder' : 'Add'} ${product.name}`}
                >
                  <FaShoppingCart />
                  <span>{isPreorder ? 'Preorder' : 'Add to Cart'}</span>
                </button>
              )}
              <Link
                to={`/product/${product.id}`}
                state={{ preloadedProduct: product }}
                className={outlineButton}
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
