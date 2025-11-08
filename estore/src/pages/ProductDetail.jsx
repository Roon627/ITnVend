import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { FaPhone, FaEnvelope } from 'react-icons/fa';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { resolveMediaUrl } from '../lib/media';
import { withPreorderFlags, isPreorderProduct } from '../lib/preorder';
import AvailabilityTag from '../components/AvailabilityTag';
import {
  isUserListing,
  isVendorListing,
  getSellerContact,
  buildContactLink,
  buyerNoticeText,
  productDescriptionCopy,
} from '../lib/listings';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;
    api
      .get(`/products/${id}`)
      .then((p) => {
        if (mounted) setProduct(withPreorderFlags(p));
      })
      .catch(() => setProduct(null));
    return () => {
      mounted = false;
    };
  }, [id]);

  if (!product) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-sky-50">
        <p className="rounded-full border border-rose-200 bg-white px-6 py-3 text-sm font-semibold text-rose-500 shadow-sm">
          Loading your item...
        </p>
      </div>
    );
  }

  const imageSrc = resolveMediaUrl(product.image || product.image_source || product.imageUrl);
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
  const descriptionCopy = productDescriptionCopy(product);
  const vendorListing = isVendorListing(product);
  const vendorIntro =
    product.vendor_public_description ||
    product.vendor_tagline ||
    (product.vendor_name
      ? `${product.vendor_name} is part of our curated marketplace network. ITnVend coordinates payment, fulfilment, and delivery for this item.`
      : 'Partner vendor item fulfilled through ITnVend. We coordinate payment, fulfilment, and delivery for this listing.');

  const handlePreorder = () => {
    const params = new URLSearchParams();
    if (product?.category) params.set('store', product.category);
    if (product?.name) params.set('name', product.name);
    params.set('link', window.location.href);
    navigate(`/shop-and-ship?${params.toString()}`);
  };

  return (
    <div className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="container mx-auto px-6">
        <div className="mb-6 text-sm text-rose-500">
          <Link to="/" className="font-semibold hover:text-rose-600">
            ITnVend Home
          </Link>
          <span className="mx-2 text-rose-300">/</span>
          <Link to="/market" className="font-semibold hover:text-rose-600">
            Market Hub
          </Link>
          <span className="mx-2 text-rose-300">/</span>
          <span className="text-rose-400">{product.name}</span>
        </div>

        <div className="grid gap-10 rounded-3xl border border-white/60 bg-white/90 p-6 shadow-rose-100 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-white via-rose-50 to-sky-50 p-6 shadow-inner">
            <AvailabilityTag availabilityStatus={availabilityStatus} className="top-4 left-4" />
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={product.name}
                loading="lazy"
                className="max-h-[26rem] w-full object-contain drop-shadow-lg"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-xl border border-dashed border-rose-200 bg-white text-sm text-rose-300">
                Image coming soon
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <header className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-600">
              {product.category || 'Market item'}
            </span>
            <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{product.name}</h1>
            {userListing && (
              <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                Seller listing
              </span>
            )}
            {preorder && (
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-500">
                Preorder item
              </span>
            )}
            <p className="text-sm uppercase tracking-widest text-rose-400">{product.subcategory || ''}</p>
            </header>

            <div className="rounded-2xl bg-rose-50/60 p-5 text-rose-700 shadow-inner">
              <p className="text-sm font-semibold uppercase tracking-wider text-rose-400">Price</p>
              <p className="mt-1 text-3xl font-bold text-rose-600">{formatCurrency(product.price)}</p>
              <p className="mt-3 text-sm text-rose-500">
                {userListing
                  ? 'Community seller listing — coordinate inspection, payment, and delivery directly with the seller.'
                  : 'Your POS will pull this value directly when a cart containing this item is submitted from the storefront.'}
              </p>
            </div>

            <section className="space-y-3 rounded-2xl border border-rose-100 bg-white p-6 text-slate-700 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Details</h2>
              <p className="leading-relaxed text-slate-600">
                {descriptionCopy.primary ||
                  'This item syncs with ITnVend POS for ordering, fulfilment, and inventory workflows.'}
              </p>
              {descriptionCopy.secondary && (
                <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{descriptionCopy.secondary}</p>
              )}
              {product.notes && (
                <p className="rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-600">
                  Notes: {product.notes}
                </p>
              )}
            </section>

            {vendorListing && (
              <section className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-6 text-sm text-emerald-900 shadow-sm">
                <h2 className="text-base font-semibold text-emerald-700">Marketplace partner</h2>
                <p>{vendorIntro}</p>
                {product.vendor_slug && (
                  <Link
                    to={`/vendors/${product.vendor_slug}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                  >
                    Explore vendor profile
                    <span aria-hidden>→</span>
                  </Link>
                )}
              </section>
            )}

            {userListing && (
              <section className="space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-6 text-slate-700 shadow-sm">
                <h2 className="text-lg font-semibold text-amber-600">Seller contact</h2>
                <div className="font-semibold text-slate-900">{sellerContact.name || 'Seller'}</div>
                <div className="flex flex-col gap-2 text-sm">
                  {sellerContact.phone && (
                    <a href={`tel:${sellerContact.phone.replace(/[^0-9+]/g, '')}`} className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-800">
                      <FaPhone className="text-[14px]" />
                      <span>{sellerContact.phone}</span>
                    </a>
                  )}
                  {sellerContact.email && (
                    <a href={`mailto:${sellerContact.email}`} className="inline-flex items-center gap-2 text-amber-700 hover:text-amber-800">
                      <FaEnvelope className="text-[14px]" />
                      <span>{sellerContact.email}</span>
                    </a>
                  )}
                  {!contactHasInfo && <p className="text-xs text-slate-500">Contact details will appear here once verified.</p>}
                </div>
                <p className="text-xs text-rose-500">{buyerNotice}</p>
              </section>
            )}

            <div className="flex flex-wrap gap-3">
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="inline-flex items-center gap-3 rounded-full bg-amber-500 px-6 py-3 text-white shadow-lg shadow-amber-300 transition hover:-translate-y-0.5 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  >
                    Contact seller
                  </a>
                ) : (
                  <div className="inline-flex items-center gap-3 rounded-full border border-amber-200 px-6 py-3 text-sm font-semibold text-amber-700">
                    Awaiting seller contact
                  </div>
                )
              ) : (
                <>
                  <button
                    onClick={() => addToCart(product)}
                    className="inline-flex items-center gap-3 rounded-full bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-300 transition hover:-translate-y-0.5 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    Add to cart
                  </button>
                  {preorder ? (
                    <button
                      type="button"
                      onClick={handlePreorder}
                      className="inline-flex items-center gap-3 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      Preorder via Shop &amp; Ship
                    </button>
                  ) : null}
                </>
              )}
              <Link
                to="/market"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                Back to Market Hub
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                Home
              </Link>
            </div>
            {userListing && (
              <p className="text-xs text-rose-500">
                Marketplace notice: ITnVend introduces buyer and seller but does not guarantee payment, condition, or delivery. Please document the transaction carefully.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
