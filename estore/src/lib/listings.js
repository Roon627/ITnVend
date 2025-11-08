export function isUserListing(product) {
  if (!product) return false;
  if (product.is_casual_listing) return true;
  const source = (product.listing_source || product.listingSource || '').toString().toLowerCase();
  if (source === 'casual' || source === 'one-time' || source === 'seller') return true;
  const category = (product.category || product.category_name || '').toString().toLowerCase();
  if (category === 'casual' || category === 'one-time seller' || category === 'one-time-seller') return true;
  return false;
}

export function getSellerContact(product) {
  if (!product) {
    return { name: null, phone: null };
  }
  const name =
    product.seller_contact_name ||
    product.seller_name ||
    product.vendor_name ||
    product.vendor ||
    product.casual_seller_name ||
    null;
  const phone = product.seller_contact_phone || product.seller_phone || product.phone || null;
  return { name, phone };
}

export function buildContactLink({ phone }) {
  if (phone) return `tel:${phone.replace(/[^0-9+]/g, '')}`;
  return null;
}

export function buyerNoticeText() {
  return 'Peer-to-peer listing: coordinate inspection, payment, and delivery directly with the seller. ITnVend Market Hub only publishes the listing and does not broker the transaction.';
}
