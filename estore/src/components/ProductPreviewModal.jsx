import React from 'react';
import { FaPhone, FaEnvelope } from 'react-icons/fa';
import Modal from './Modal';
import ImageCarousel from './ImageCarousel';
import { resolveMediaUrl } from '../lib/media';
import { isPreorderProduct } from '../lib/preorder';
import AvailabilityTag from './AvailabilityTag';
import { isUserListing, getSellerContact, buildContactLink, buyerNoticeText } from '../lib/listings';

export default function ProductPreviewModal({ open, product, onClose, onAdd, formatCurrency }) {
  if (!open || !product) return null;
  const images = [];
  // product may have multiple image fields; collect them if available
  if (product.image) images.push(resolveMediaUrl(product.image));
  if (product.image_source) images.push(resolveMediaUrl(product.image_source));
  if (product.imageUrl) images.push(resolveMediaUrl(product.imageUrl));
  // dedupe
  const uniq = [...new Set(images.filter(Boolean))];

  const preorder = isPreorderProduct(product);
  const availabilityStatus =
    product.availability_status ||
    product.availabilityStatus ||
    (preorder ? 'preorder' : 'in_stock');
  const userListing = isUserListing(product);
  const sellerContact = getSellerContact(product);
  const contactLink = buildContactLink(sellerContact);
  const contactHasInfo = Boolean(sellerContact.phone || sellerContact.email);
  const buyerNotice = buyerNoticeText();
  const formatPrice =
    typeof formatCurrency === 'function'
      ? formatCurrency
      : (value) => (value != null ? `${Number(value).toLocaleString()} MVR` : '—');

  return (
    <Modal open={open} onClose={onClose} labelledBy={`preview-${product.id}`} className="max-w-4xl md:max-w-6xl">
      <div id={`preview-${product.id}`} className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] p-4 sm:p-6">
        <div className="relative flex items-center justify-center bg-gradient-to-br from-white via-rose-50 to-sky-50 p-4">
          <AvailabilityTag availabilityStatus={availabilityStatus} />
          {uniq.length ? (
            <ImageCarousel images={uniq} alt={product.name} />
          ) : (
            <div className="flex h-64 w-full items-center justify-center rounded-xl border border-dashed border-rose-200 bg-white text-sm text-rose-300">
              Image coming soon
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-2 sm:p-4">
          <header className="flex items-start justify-between">
            <div>
              <h3 className="text-xl font-extrabold text-slate-900">{product.name}</h3>
              <p className="text-sm uppercase tracking-wider text-rose-400">{product.subcategory || ''}</p>
              {userListing && (
                <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                  Seller listing
                </span>
              )}
              {preorder && (
                <span className="mt-2 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-500">
                  Preorder item
                </span>
              )}
            </div>
          </header>

          <div className="rounded-2xl bg-rose-50/60 p-4 text-rose-700">
            <p className="text-sm font-semibold uppercase tracking-wider text-rose-400">Price</p>
            <p className="mt-1 text-2xl font-bold text-rose-600">{formatPrice(product.price)}</p>
          </div>

          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-slate-800">Details</h4>
            <p className="text-sm text-slate-600">{product.description || 'No description available.'}</p>
          </section>

          {userListing && (
            <section className="space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-4 text-sm text-slate-700">
              <h4 className="text-sm font-semibold text-amber-600">Seller contact</h4>
              <div className="font-semibold text-slate-900">{sellerContact.name || 'Seller'}</div>
              <div className="flex flex-col gap-2 text-sm">
                {sellerContact.phone && (
                  <a href={`tel:${sellerContact.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-800">
                    <FaPhone className="text-[13px]" />
                    <span>{sellerContact.phone}</span>
                  </a>
                )}
                {sellerContact.email && (
                  <a href={`mailto:${sellerContact.email}`} className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-800">
                    <FaEnvelope className="text-[13px]" />
                    <span>{sellerContact.email}</span>
                  </a>
                )}
                {!contactHasInfo && <p className="text-xs text-slate-500">Seller will provide contact details after we notify them.</p>}
              </div>
              <p className="text-xs text-rose-500">{buyerNotice}</p>
            </section>
          )}

          {preorder && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-500">
              This item is fulfilled as a preorder. Complete checkout with a bank transfer slip so our team can reserve it for you.
            </p>
          )}

          <div className="mt-auto flex flex-wrap gap-3">
            {userListing ? (
              <>
                {contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-amber-500 px-5 py-2 text-white font-semibold shadow hover:bg-amber-400"
                  >
                    Reach out
                  </a>
                ) : null}
                <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50">
                  Close
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    onAdd(product);
                    onClose();
                  }}
                  className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-white font-semibold shadow hover:bg-rose-400"
                >
                  {preorder ? 'Preorder item' : 'Add to cart'}
                </button>
                <button onClick={onClose} className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-4 py-2 text-sm text-rose-600 hover:bg-rose-50">
                  Close
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
