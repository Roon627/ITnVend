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

  const buttonBase =
    'inline-flex items-center justify-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors duration-200';
  const primaryButton = `${buttonBase} border border-rose-200 bg-rose-500 text-white shadow-sm hover:bg-rose-600`;
  const outlineButton = `${buttonBase} border border-rose-200 bg-white/90 text-rose-600 hover:bg-rose-50`;
  const neutralButton = `${buttonBase} border border-slate-200 bg-slate-100 text-slate-500`;

  return (
    <>
      <article className="group mx-auto flex w-full max-w-[360px] flex-col overflow-hidden rounded-2xl border border-slate-200/40 bg-white text-slate-900 shadow-lg shadow-rose-100/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-rose-200/60 md:max-w-[380px] xl:max-w-[440px] 2xl:max-w-[480px]">
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
          <h3 className="text-sm font-semibold text-slate-800 line-clamp-2 sm:text-base">{product.name}</h3>
          
          <div className="mt-auto pt-4">
            <div className="mb-3 text-left">
              <span className="text-lg font-bold text-rose-500 sm:text-xl">{fmt(product.price)}</span>
            </div>
            <div className={`grid gap-2 ${userListing ? 'grid-cols-1' : 'grid-cols-2'}`}>
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className={`${buttonBase} border border-amber-200 bg-amber-500 text-white shadow-sm hover:bg-amber-600`}
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
