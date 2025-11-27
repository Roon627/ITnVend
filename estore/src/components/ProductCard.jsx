import React from 'react';
import { Link } from 'react-router-dom';
import { FaShoppingCart, FaPhone } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';
import { isPreorderProduct } from '../lib/preorder';
import AvailabilityTag from './AvailabilityTag';
import { isUserListing, getSellerContact, buildContactLink } from '../lib/listings';
import { getSaleInfo } from '../lib/sale';
import { useSettings } from './SettingsContext';

// Dark-styled product card used across Home and PublicProducts
export default function ProductCard({
  product,
  onAdd = () => {},
  formatCurrency: formatCurrencyProp,
  compact = false,
  showVendor = false,
}) {
  const image = resolveMediaUrl(product.image || product.image_source || product.imageUrl);
  // modal removed - navigates to product detail page instead

  const isPreorder = isPreorderProduct(product);
  const imageSizes = '(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 320px';
  const availabilityStatus =
    product.availability_status ||
    product.availabilityStatus ||
    (isPreorder ? 'preorder' : 'in_stock');
  const stockValueRaw = product.stock ?? product.quantity ?? product.qty;
  const parsedStock = Number(stockValueRaw);
  const trackLimited = product.track_inventory !== 0 && product.track_inventory !== false;
  const stockValue = Number.isFinite(parsedStock) ? parsedStock : null;
  const inStock = !trackLimited || (stockValue !== null && stockValue > 0);
  const stockLabel = trackLimited
    ? stockValue !== null && stockValue > 0
      ? `${stockValue} available`
      : 'Out of stock'
    : 'Available';
  const outOfStock = !inStock && !isPreorder;
  const userListing = isUserListing(product);
  const sellerContact = getSellerContact(product);
  const contactLink = buildContactLink(sellerContact);
  const contactHasInfo = Boolean(sellerContact.phone);
  // intentionally omit unused description piece here (kept minimal in card view)
  const { formatCurrency } = useSettings();
  const fmt = formatCurrencyProp || formatCurrency || ((n) => n);

  const sale = getSaleInfo(product);
  const vendorName = product.vendor_name || product.vendorName || null;
  const vendorSlug = product.vendor_slug || product.vendorSlug || null;

  const buttonBase =
    'inline-flex items-center justify-center gap-1 rounded-lg border px-1 py-0.5 text-[7px] font-semibold uppercase tracking-wide transition-colors duration-200 sm:px-3 sm:py-1.5 sm:text-xs';
  const primaryButton = `${buttonBase} border-rose-200 bg-rose-500 text-white shadow-sm hover:bg-rose-600`;
  const outlineButton = `${buttonBase} border-rose-200 bg-white/90 text-rose-600 hover:bg-rose-50`;
  const neutralButton = `${buttonBase} border-slate-200 bg-slate-100 text-slate-500`;

  const cardClassName = [
    'group flex w-full flex-col overflow-hidden rounded-2xl border border-slate-200/40 bg-white text-slate-900 shadow-lg shadow-rose-100/40 transition-all duration-300',
    compact
      ? 'mx-auto min-w-[150px] w-[150px] sm:min-w-[180px] sm:w-[180px]'
      : 'mx-auto max-w-[200px] sm:max-w-[320px] md:max-w-[360px] xl:max-w-[420px] 2xl:max-w-[460px] sm:hover:-translate-y-1 sm:hover:shadow-xl sm:hover:shadow-rose-200/60',
  ]
    .filter(Boolean)
    .join(' ');
  const figureClassName = compact
    ? 'relative w-full overflow-hidden rounded-xl aspect-square'
    : 'relative aspect-[4/5] w-full overflow-hidden rounded-xl sm:h-56 sm:aspect-auto';
  const priceClass = compact ? 'text-base' : 'text-sm sm:text-xl';

  return (
    <>
      <article className={cardClassName}>
        <div className={figureClassName}>
          <AvailabilityTag availabilityStatus={availabilityStatus} stock={product.stock} />
          {sale.isOnSale && (
            <div className="absolute left-2 top-2 rounded-full bg-rose-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
              Sale
            </div>
          )}
          {outOfStock && (
            <div className="absolute right-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow">
              Out of stock
            </div>
          )}
          {image ? (
            <img
              src={image}
              alt={product.name}
              className="h-full w-full object-cover transition-transform duration-500 sm:group-hover:scale-105"
              loading="lazy"
              decoding="async"
              fetchpriority="low"
              width={480}
              height={480}
              sizes={imageSizes}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-500 text-sm">
              Visual coming soon
            </div>
          )}
        </div>

        <div className={`flex flex-1 flex-col ${compact ? 'p-3' : 'p-2.5 sm:p-4'}`}>
          {showVendor && vendorName && (
            vendorSlug ? (
              <Link
                to={`/vendors/${vendorSlug}`}
                className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600 hover:text-emerald-700"
              >
                {vendorName}
              </Link>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                {vendorName}
              </span>
            )
          )}
          <h3 className={`font-semibold text-slate-800 line-clamp-2 ${compact ? 'text-sm' : 'text-xs sm:text-base'}`}>
            {product.name}
          </h3>
          
          <div className="mt-auto pt-4">
            <div className="mb-3 text-left space-y-1">
              {sale.isOnSale ? (
                <>
                  <span className={`block font-bold text-rose-500 ${priceClass}`}>{fmt(sale.effectivePrice)}</span>
                  <span className="block text-xs text-slate-400 line-through">{fmt(sale.basePrice)}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {sale.discountPercent != null && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600">
                        -{Math.round(sale.discountPercent)}%
                      </span>
                    )}
                    {sale.savingsAmount > 0 && (
                      <span className="text-[10px] font-semibold text-emerald-600">
                        Save {fmt(sale.savingsAmount)}
                      </span>
                    )}
                  </div>
                </>
              ) : (
                <span className={`font-bold text-rose-500 ${priceClass}`}>{fmt(product.price)}</span>
              )}
            </div>
              {trackLimited && !outOfStock && (
                <div className="text-[11px] text-slate-500">
                  {stockLabel}
                </div>
              )}
              <div className={`mt-2 grid gap-2 ${userListing ? 'grid-cols-1' : 'grid-cols-2'} sm:gap-3`}>
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
                  className={`${primaryButton} ${outOfStock ? 'opacity-50 cursor-not-allowed' : ''}`}
                  disabled={outOfStock}
                  aria-label={`${isPreorder ? 'Preorder' : 'Add'} ${product.name}`}
                  aria-disabled={outOfStock}
                >
                  <FaShoppingCart className="text-[10px] sm:text-xs" />
                  <span>{isPreorder ? 'Preorder' : 'Add'}</span>
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
          {!userListing && (
            <p className={`mt-2 text-xs ${outOfStock ? 'text-rose-500' : 'text-emerald-600'}`}>
              {outOfStock
                ? 'Currently sold out — restock coming soon.'
                : isPreorder
                ? 'Preorder only'
                : 'Available for order'}
            </p>
          )}
        </div>
      </article>

  {/* modal removed; navigation to product page used instead */}
    </>
  );
}
