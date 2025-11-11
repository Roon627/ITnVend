import { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import { isUserListing, isVendorListing } from '../lib/listings';

export default function useMarketplaceStats({ pollInterval = 30000 } = {}) {
  const [stats, setStats] = useState({ totalProducts: 0, vendors: 0, sellers: 0, vendorProducts: 0, casualProducts: 0 });
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  async function load() {
    try {
      const [allProducts, publicVendors] = await Promise.all([
        api.get('/products').catch(() => []),
        api.get('/public/vendors', { params: { limit: 1000 } }).catch(() => []),
      ]);
      if (!mounted.current) return;
      const products = Array.isArray(allProducts) ? allProducts : [];
      const vendorsList = Array.isArray(publicVendors) ? publicVendors : [];

      const casualProducts = products.filter((p) => isUserListing(p));
      const vendorProducts = products.filter((p) => isVendorListing(p));

      const sellerSet = new Set();
      for (const p of casualProducts) {
        const email = (p.seller_contact_email || p.seller_email || '').toString().trim().toLowerCase();
        const name = (p.seller_contact_name || p.seller_name || '').toString().trim().toLowerCase();
        if (email) sellerSet.add(`e:${email}`);
        else if (name) sellerSet.add(`n:${name}`);
      }

      setStats({
        totalProducts: products.length,
        vendors: vendorsList.length,
        sellers: sellerSet.size,
        vendorProducts: vendorProducts.length,
        casualProducts: casualProducts.length,
      });
    } catch (err) {
      // ignore — keep previous stats
      // console.debug('useMarketplaceStats load failed', err?.message || err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }

  useEffect(() => {
    mounted.current = true;
    load();
    let id = null;
    if (pollInterval && pollInterval > 0) {
      id = setInterval(() => {
        load();
      }, pollInterval);
    }
    return () => {
      mounted.current = false;
      if (id) clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollInterval]);

  return { stats, loading, refresh: load };
}
