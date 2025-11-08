export function isUserListing(product) {
  if (!product) return false;
  if (product.is_casual_listing) return true;
  const source = (product.listing_source || product.listingSource || '').toString().toLowerCase();
  if (source === 'casual' || source === 'one-time' || source === 'seller') return true;
  const category = (product.category || product.category_name || '').toString().toLowerCase();
  if (category === 'casual' || category === 'one-time seller' || category === 'one-time-seller') return true;
  return false;
}

export function isVendorListing(product) {
  if (!product || isUserListing(product)) return false;
  const vendorId = product.vendor_id ?? product.vendorId ?? null;
  if (vendorId) return true;
  if (product.vendor_name || product.vendor || product.vendor_slug || product.vendorSlug) return true;
  const source = (product.listing_source || product.listingSource || '').toString().toLowerCase();
  return source === 'vendor' || source === 'partner' || source === 'marketplace';
}

export function getSellerContact(product) {
  if (!product) {
    return { name: null, phone: null, email: null };
  }
  const name =
    product.seller_contact_name ||
    product.seller_name ||
    product.vendor_name ||
    product.vendor ||
    product.casual_seller_name ||
    null;
  const phone = product.seller_contact_phone || product.seller_phone || product.phone || null;
  const email = product.seller_contact_email || product.seller_email || product.email || null;
  return { name, phone, email };
}

export function buildContactLink({ phone }) {
  if (phone) return `tel:${phone.replace(/[^0-9+]/g, '')}`;
  return null;
}

export function buyerNoticeText() {
  return 'Peer-to-peer listing: coordinate inspection, payment, and delivery directly with the seller. ITnVend Market Hub only publishes the listing and does not broker the transaction.';
}

const PRIVATE_SELLER_MESSAGE =
  'Available to purchase via a private seller through ITnVend Market Hub. Coordinate inspection, payment, and pickup directly with the seller.';
const STORE_DEFAULT_MESSAGE =
  'Fulfilled directly by ITnVend with store pickup and delivery options. Includes our standard after-sales support.';

const sanitizeCopy = (value) => (value || '').toString().replace(/\s+/g, ' ').trim();
const stripLegacyBlurb = (value) => value.replace(/listed by.+?\(casual_item_id.*?\)/gi, '').trim();

export function productDescriptionCopy(product = {}) {
  const normalizedDescription = stripLegacyBlurb(sanitizeCopy(product.description));
  const normalizedShort = stripLegacyBlurb(sanitizeCopy(product.short_description));
  const fallback = normalizedDescription || normalizedShort;

  if (isUserListing(product)) {
    const condition =
      product.condition ||
      product.item_condition ||
      product.user_condition ||
      product.product_condition ||
      '';
    const conditionSentence = condition ? ` Condition: ${condition}.` : '';
    const sellerBlurb =
      fallback && fallback.toLowerCase() !== 'na' ? fallback : '';
    return {
      primary: `${PRIVATE_SELLER_MESSAGE}${conditionSentence}`,
      secondary: sellerBlurb,
      context: 'private',
    };
  }

  if (isVendorListing(product)) {
    const vendorIntro =
      sanitizeCopy(product.vendor_public_description) ||
      sanitizeCopy(product.vendor_tagline) ||
      (product.vendor_name ? `${product.vendor_name} is one of our trusted marketplace partners.` : '');
    const secondary =
      fallback && fallback !== vendorIntro ? fallback : '';
    return {
      primary:
        vendorIntro ||
        'Partner vendor item fulfilled through ITnVend. We coordinate payment, fulfilment, and delivery with the seller.',
      secondary,
      context: 'vendor',
    };
  }

  const storeBlurb = normalizedShort || fallback || STORE_DEFAULT_MESSAGE;
  return {
    primary: storeBlurb,
    secondary: fallback && fallback !== storeBlurb ? fallback : '',
    context: 'store',
  };
}
