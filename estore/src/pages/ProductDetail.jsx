import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { FaPhone, FaEnvelope, FaHashtag, FaBarcode, FaBox, FaTags, FaIndustry, FaTruck, FaShieldAlt, FaWarehouse } from 'react-icons/fa';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { resolveMediaUrl } from '../lib/media';
import ProductCard from '../components/ProductCard';
import ImageCarousel from '../components/ImageCarousel';
import SpecsPanel from '../components/SpecsPanel';
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  // If navigation provided a preloaded product (from NewArrivalsStrip), use it immediately
  useEffect(() => {
    if (location && location.state && location.state.preloadedProduct) {
      const pre = withPreorderFlags(location.state.preloadedProduct);
      setProduct(pre);
      // show immediately but still fetch in background
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    let mounted = true;
    // Only show global loading state if we don't already have a preloaded product
    const hasPreloaded = Boolean(location && location.state && location.state.preloadedProduct);
    if (!hasPreloaded) {
      setLoading(true);
    }
    setError(null);
    api
      .get(`/products/${id}`)
      .then((p) => {
        if (!mounted) return;
        setProduct(withPreorderFlags(p));
        setLoading(false);
      })
      .catch((err) => {
        if (!mounted) return;
        // If we had a preloaded product, keep showing it instead of showing not-found
        if (hasPreloaded) {
          // don't set error so UI stays on preloaded product
          setLoading(false);
          return;
        }
        setProduct(null);
        setError(err && err.status === 404 ? 'not-found' : 'error');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [id, location]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-sky-50">
        <p className="btn-sm btn-sm-outline rounded-full border border-rose-200 bg-white text-sm font-semibold text-rose-500 shadow-sm">
          Loading your item...
        </p>
      </div>
    );
  }

  if (!loading && !product) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-sky-50">
        <div className="rounded-2xl border border-rose-100 bg-white p-4 text-center sm:p-6">
          <p className="mb-4 text-lg font-semibold text-rose-600">{error === 'not-found' ? 'Item not found' : 'Something went wrong'}</p>
          <p className="mb-4 text-sm text-rose-500">{error === 'not-found' ? "We couldn't locate that product. It may have been removed or is unavailable." : 'An error occurred while fetching the product. Please try again later.'}</p>
          <div className="flex justify-center gap-3">
            <Link to="/market" className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              Back to Market Hub
            </Link>
            <Link to="/" className="btn-sm btn-sm-outline inline-flex items-center gap-2 rounded-full border border-rose-200 text-sm font-semibold text-rose-600 hover:bg-rose-50">
              Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const imageSrc = resolveMediaUrl(product.image || product.image_source || product.imageUrl);
  // build gallery array from available fields
  const galleryPaths = [];
  const pushGallery = (src) => {
    const resolved = resolveMediaUrl(src);
    if (resolved) galleryPaths.push(resolved);
  };
  pushGallery(product.image);
  pushGallery(product.image_source);
  pushGallery(product.imageUrl);
  if (Array.isArray(product.gallery)) {
    product.gallery.forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') pushGallery(entry);
      else if (entry.url || entry.path) pushGallery(entry.url || entry.path);
    });
  }
  const gallery = [...new Set(galleryPaths)].filter(Boolean);
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
  const productTypeLabel = product.product_type_label || product.productTypeLabel || product.type || 'physical';
  const clothingSizes = product.clothing_sizes || product.clothingSizes || '';
  const clothingCare = product.clothing_care || product.clothingCare || '';
  const digitalDownloadUrl = product.digital_download_url || product.digitalDownloadUrl || '';
  const digitalLicenseKey = product.digital_license_key || product.digitalLicenseKey || '';
  const digitalActivationLimit =
    product.digital_activation_limit != null
      ? product.digital_activation_limit
      : product.digitalActivationLimit;
  const digitalExpiry = product.digital_expiry || product.digitalExpiry || '';
  const digitalSupportUrl = product.digital_support_url || product.digitalSupportUrl || '';
  const categoryPath = [product.category, product.subcategory, product.subsubcategory].filter(Boolean).join(' › ');
  const availabilityLabel = availabilityStatus ? availabilityStatus.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'In stock';
  const stockLabel = product.track_inventory === 0 ? 'On request' : `${product.stock ?? 0} units`;
  const vendorName = product.vendor_name || product.vendorName || null;
  const technicalDetails = product.technical_details || product.technicalDetails || '';
  const tagList = Array.isArray(product.tags)
    ? product.tags
    : typeof product.tags === 'string'
    ? product.tags.split(',').map((tag) => tag.trim()).filter(Boolean)
    : [];
  const brandName =
    product.brand_name ||
    product.brandName ||
    product.brand?.name ||
    '';
  const materialName = product.material_name || product.materialName || '';
  const colorName = product.color_name || product.colorName || product.color || '';
  const deliveryType = product.delivery_type || product.deliveryType || '';
  const warrantyTerm = product.warranty_term || product.warrantyTerm || '';
  const audienceLabel = product.audience || product.target_audience || '';
  const modelLabel = product.model || '';
  const metadataEntries = [
    { label: 'SKU', value: product.sku || '—', icon: <FaHashtag className="text-rose-400" /> },
    { label: 'Barcode', value: product.barcode || '—', icon: <FaBarcode className="text-rose-400" /> },
    { label: 'Category', value: categoryPath || '—', icon: <FaBox className="text-rose-400" /> },
    { label: 'Availability', value: availabilityLabel, icon: <FaTags className="text-rose-400" /> },
    { label: 'Brand', value: brandName || '—', icon: <FaIndustry className="text-rose-400" /> },
    { label: 'Stock level', value: stockLabel, icon: <FaWarehouse className="text-rose-400" /> },
    { label: 'Delivery', value: deliveryType || '—', icon: <FaTruck className="text-rose-400" /> },
    { label: 'Warranty', value: warrantyTerm || '—', icon: <FaShieldAlt className="text-rose-400" /> },
    { label: 'Model', value: modelLabel },
    { label: 'Release year', value: product.year || product.model_year },
    { label: 'Audience', value: audienceLabel },
    { label: 'Material', value: materialName },
    { label: 'Colorway', value: colorName },
    { label: 'Vendor', value: vendorName },
    { label: 'Tags', value: tagList.length ? tagList.join(', ') : '' },
  ].filter((entry) => entry.value);

  const handlePreorder = () => {
    const params = new URLSearchParams();
    if (product?.category) params.set('store', product.category);
    if (product?.name) params.set('name', product.name);
    params.set('link', window.location.href);
    navigate(`/shop-and-ship?${params.toString()}`);
  };

  const handleBuyNow = () => {
    // Add item to cart and jump straight to checkout for immediate purchase.
    // Pass the full product in navigation state to avoid race with async cart update.
    const normalized = withPreorderFlags(product);
    addToCart(normalized, 1);
    navigate('/checkout', { state: { buyNowItem: normalized } });
  };

  return (
    <div className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-12 pb-20 sm:pb-0">
      <div className="container mx-auto px-4 sm:px-6">
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

        <div className="grid gap-6 rounded-xl border border-white/60 bg-white/95 p-3 sm:gap-8 sm:p-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative flex flex-col rounded-2xl bg-gradient-to-br from-white via-rose-50 to-sky-50 p-4 shadow-inner sm:p-6">
            <AvailabilityTag availabilityStatus={availabilityStatus} className="top-4 left-4" />
            {gallery && gallery.length ? (
              <div className="w-full">
                <ImageCarousel images={gallery} alt={product.name} />
              </div>
            ) : imageSrc ? (
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
            <div className="mt-4 w-full space-y-4">
              {technicalDetails && (
                <section className="space-y-2 rounded-2xl border border-slate-100 bg-white/95 p-4 text-sm text-slate-700 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base font-semibold text-slate-900">Technical details</h3>
                    <span className="text-xs uppercase tracking-wide text-slate-400">Seller notes</span>
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {technicalDetails}
                  </pre>
                </section>
              )}
              {tagList.length > 0 && (
                <section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {tagList.map((tag) => (
                      <span key={tag} className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <header className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-600">
              {product.category || 'Market item'}
            </span>
            <h1 className="text-2xl font-extrabold text-slate-900 sm:text-3xl">{product.name}</h1>
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
            <p className="text-xs uppercase tracking-wide text-rose-400">{product.subcategory || ''}</p>
            </header>
            <div className="rounded-lg bg-rose-50/60 p-4 text-rose-700">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-400">Price</p>
              <p className="mt-1 text-2xl font-bold text-rose-600">{formatCurrency(product.price)}</p>
              {userListing ? (
                <p className="mt-2 text-xs text-rose-500">Community seller listing — coordinate inspection, payment, and delivery directly with the seller.</p>
              ) : (
                <p className="mt-2 text-xs text-slate-500">Add to cart to purchase</p>
              )}
            </div>

            {/* Specs panel if available (collapsible if long) */}
            {product.specs || product.attributes || product.specifications ? (
              <SpecsPanel
                specs={product.specs || product.attributes || product.specifications}
              />
            ) : null}

            <section className="space-y-3 rounded-lg border border-rose-100 bg-white p-4 text-slate-700">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">Details</h2>
                <button
                  type="button"
                  className="text-sm text-rose-500 hover:text-rose-600"
                  onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
                >
                  Jump to checkout
                </button>
              </div>
              <p className="leading-relaxed text-slate-600 text-sm">
                {descriptionCopy.primary || 'No additional description is available for this item.'}
              </p>
              {descriptionCopy.secondary && (
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">{descriptionCopy.secondary}</p>
              )}
              {product.notes && (
                <p className="rounded-md bg-rose-50 p-3 text-sm font-medium text-rose-600">
                  Notes: {product.notes}
                </p>
              )}
            </section>

            {metadataEntries.length > 0 && (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm text-slate-700 shadow-sm">
                <h3 className="text-base font-semibold text-slate-900">Product snapshot</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {metadataEntries.map((entry) => (
                    <div
                      key={entry.label}
                      className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/80 p-3 shadow-inner"
                    >
                      {entry.icon && <div className="rounded-full bg-white p-2 text-xs">{entry.icon}</div>}
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                          {entry.label}
                        </p>
                        <p className="mt-1 text-sm text-slate-800 break-words">{entry.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {productTypeLabel === 'clothing' && (
              <section className="space-y-2 rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-sm text-rose-700">
                <h3 className="text-base font-semibold text-rose-600">Clothing fit & care</h3>
                {clothingSizes && (
                  <div className="rounded-xl bg-white/80 p-3 text-rose-700 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-400">Available sizes</p>
                    <p className="mt-1 text-sm">{clothingSizes}</p>
                  </div>
                )}
                {clothingCare && (
                  <div className="rounded-xl bg-white/80 p-3 text-rose-700 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-rose-400">Care instructions</p>
                    <p className="mt-1 text-sm">{clothingCare}</p>
                  </div>
                )}
                {!clothingSizes && !clothingCare && (
                  <p className="text-xs text-rose-500">Sizing and care information will be added soon.</p>
                )}
              </section>
            )}

            {productTypeLabel === 'digital' && (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <h3 className="text-base font-semibold text-slate-900">Digital fulfillment</h3>
                {digitalDownloadUrl ? (
                  <a
                    href={digitalDownloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center rounded-full bg-rose-500 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-rose-600"
                  >
                    Download link
                  </a>
                ) : (
                  <p className="text-xs text-slate-500">Download link will be shared after purchase.</p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {digitalLicenseKey && (
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">License reference</p>
                      <p className="mt-1 text-sm font-medium text-slate-800 break-all">{digitalLicenseKey}</p>
                    </div>
                  )}
                  {(digitalActivationLimit || digitalExpiry) && (
                    <div className="rounded-xl bg-white p-3 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">License policy</p>
                      {digitalActivationLimit != null && (
                        <p className="mt-1 text-sm">Activations: {digitalActivationLimit || 'Unlimited'}</p>
                      )}
                      {digitalExpiry && <p className="text-sm">Expires: {digitalExpiry}</p>}
                    </div>
                  )}
                </div>
                {digitalSupportUrl && (
                  <a
                    href={digitalSupportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-white"
                  >
                    Need help? Contact support
                  </a>
                )}
              </section>
            )}

            {vendorListing && (
              <section className="space-y-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm text-emerald-900 shadow-sm sm:p-6">
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
              <section className="space-y-3 rounded-2xl border border-amber-100 bg-white/90 p-4 text-slate-700 shadow-sm sm:p-6">
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

            <div className="space-y-3">
              {userListing ? (
                contactHasInfo ? (
                  <a
                    href={contactLink || '#'}
                    onClick={(e) => {
                      if (!contactLink) e.preventDefault();
                    }}
                    className="btn-sm btn-sm-primary inline-flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 text-white shadow-lg shadow-amber-300 transition hover:-translate-y-0.5 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                  >
                    Contact seller
                  </a>
                ) : (
                  <div className="btn-sm btn-sm-outline inline-flex items-center justify-center gap-2 rounded-full border border-amber-200 text-sm font-semibold text-amber-700">
                    Awaiting seller contact
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:flex-1 sm:gap-3">
                  <button
                    onClick={() => addToCart(product)}
                    className="inline-flex items-center justify-center rounded-lg bg-rose-500 px-3.5 py-1.5 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-rose-200 hover:bg-rose-600 sm:flex-1"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    Add to cart
                  </button>
                  <button
                    onClick={handleBuyNow}
                    className="inline-flex items-center justify-center rounded-lg bg-rose-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow focus:outline-none focus:ring-2 focus:ring-rose-200 hover:bg-rose-700 sm:flex-1"
                  >
                    Buy now
                  </button>
                </div>
                  {preorder ? (
                    <button
                      type="button"
                      onClick={handlePreorder}
                    className="inline-flex w-full items-center justify-center rounded-lg border border-rose-200 px-3.5 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 sm:w-auto"
                    >
                      Preorder via Shop &amp; Ship
                    </button>
                  ) : null}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                <Link
                  to="/market"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 sm:text-sm"
                >
                  Back to Market Hub
                </Link>
                <Link
                  to="/"
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 sm:text-sm"
                >
                  Home
                </Link>
              </div>
            </div>
            {userListing && (
              <p className="text-xs text-rose-500">
                Marketplace notice: ITnVend introduces buyer and seller but does not guarantee payment, condition, or delivery. Please document the transaction carefully.
              </p>
            )}
          </div>
        </div>
        {/* Related products */}
        <div className="container mx-auto px-4 mt-10 sm:px-6">
          <h3 className="mb-4 text-2xl font-bold text-slate-900">You may also like</h3>
          <RelatedProducts category={product.category} excludeId={product.id} onAdd={addToCart} />
        </div>
      </div>
    </div>
  );
}

function RelatedProducts({ category, excludeId, onAdd }) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let mounted = true;
    if (!category) return;
    api
      .get('/products', { params: { category, limit: 6 } })
      .then((res) => {
        if (!mounted) return;
        const list = Array.isArray(res) ? res.filter((p) => p.id !== excludeId).slice(0, 6) : [];
        setItems(list);
      })
      .catch(() => {
        if (!mounted) return;
        setItems([]);
      });
    return () => {
      mounted = false;
    };
  }, [category, excludeId]);

  if (!items || !items.length) return null;
  return (
    <div className="grid grid-cols-2 justify-items-center gap-4 sm:grid-cols-2 md:grid-cols-3">
      {items.map((p) => (
        <div key={p.id}>
          <ProductCard product={p} onAdd={onAdd} />
        </div>
      ))}
    </div>
  );
}
