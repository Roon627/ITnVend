import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductForm from '../components/ProductForm';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function AddProduct() {
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [lookups, setLookups] = useState({});
  const [categoryTree, setCategoryTree] = useState([]);
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [lu, tree, vlist] = await Promise.all([
          api.get('/lookups'),
          api.get('/categories/tree', { params: { depth: 3 } }),
          api.get('/vendors', { params: { status: 'active' } }),
        ]);
        if (!mounted) return;
        setLookups(lu || {});
        setCategoryTree(Array.isArray(tree) ? tree : []);
        setVendors(Array.isArray(vlist) ? vlist : []);
      } catch (err) {
        console.debug('Failed loading lookups/categories/vendors', err);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const handleSave = async (payload, { setFieldErrors } = {}) => {
    function galleryPayloadFromState(gallery) {
      return (Array.isArray(gallery) ? gallery : [])
        .map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.path || entry?.url || ''))
        .map((v) => (v || '').trim())
        .filter(Boolean);
    }

    function normalizeVendorId(value) {
      if (value === undefined || value === null || value === '') return null;
      const parsed = parseInt(value, 10);
      return Number.isFinite(parsed) ? parsed : value;
    }

    function normalizeAvailabilityStatus(value, fallback = 'in_stock') {
      if (value == null) return fallback;
      const normalized = String(value).toLowerCase();
      const allowed = ['in_stock', 'preorder', 'vendor', 'used'];
      return allowed.includes(normalized) ? normalized : fallback;
    }

    try {
      setSaving(true);
      const isDigital = (payload.productTypeLabel || payload.type || '').toLowerCase() === 'digital';
      const createdPayload = {
        name: payload.name,
        price: payload.price != null ? parseFloat(payload.price) : 0,
        stock: isDigital ? 0 : payload.stock ? parseInt(payload.stock, 10) || 0 : 0,
        category: payload.category || null,
        subcategory: payload.subcategory || null,
        image: payload.image || null,
        imageUrl: payload.imageUrl || null,
        description: payload.description || null,
        technicalDetails: payload.technicalDetails || null,
        sku: payload.sku || null,
        barcode: payload.barcode || null,
        model: payload.model || null,
        cost: payload.cost ? parseFloat(payload.cost) : 0,
        trackInventory: isDigital ? false : payload.trackInventory,
        type: isDigital ? 'digital' : 'physical',
        productTypeLabel: payload.productTypeLabel || payload.type || (isDigital ? 'digital' : 'physical'),
        availabilityStatus: normalizeAvailabilityStatus(payload.availabilityStatus),
        availableForPreorder: payload.availableForPreorder,
        preorderReleaseDate: payload.availableForPreorder ? payload.preorderReleaseDate || null : null,
        preorderNotes: payload.availableForPreorder ? payload.preorderNotes || null : null,
        preorderEta: payload.availableForPreorder ? payload.preorderEta || null : null,
        vendorId: normalizeVendorId(payload.vendorId),
        gallery: galleryPayloadFromState(payload.gallery),
        highlightActive: payload.highlightActive ? 1 : 0,
        highlightLabel: payload.highlightLabel && payload.highlightLabel.trim() ? payload.highlightLabel.trim() : null,
        highlightPriority: payload.highlightPriority ? parseInt(payload.highlightPriority, 10) || 0 : 0,
        clothingSizes: payload.clothingSizes || null,
        clothingCare: payload.clothingCare || null,
        digitalDownloadUrl: payload.digitalDownloadUrl || null,
        digitalLicenseKey: payload.digitalLicenseKey || null,
        digitalActivationLimit: payload.digitalActivationLimit
          ? parseInt(payload.digitalActivationLimit, 10) || null
          : null,
        digitalExpiry: payload.digitalExpiry || null,
        digitalSupportUrl: payload.digitalSupportUrl || null,
        deliveryType: payload.deliveryType || (isDigital ? 'instant_download' : null),
        audience: payload.audience || null,
        warrantyTerm: payload.warrantyTerm || null,
      };

      await api.post('/products', createdPayload);
      toast.push('Product created', 'success');
      navigate('/products');
    } catch (err) {
      console.debug('Failed to create product', err);
      toast.push(err?.message || 'Failed to create product', 'error');
      if (err?.fields && typeof setFieldErrors === 'function') setFieldErrors(err.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen p-6 pb-24" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <section
          className="rounded-3xl border p-6 shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            boxShadow: '0 25px 55px var(--color-shadow)'
          }}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em]"
                style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
              >
                Product studio
              </span>
              <h1 className="text-3xl font-extrabold" style={{ color: 'var(--color-heading)' }}>
                Add a new product
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                Every field here mirrors the POS product modal. Use it for full-screen focus while maintaining the same payloads.
              </p>
              <div className="flex flex-wrap gap-2 pt-3">
                <Link
                  to="/manage-lookups"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: `1px solid var(--color-border)`,
                    color: 'var(--color-primary)'
                  }}
                >
                  Manage lookups
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: `1px solid var(--color-border)`,
                    color: 'var(--color-muted)'
                  }}
                >
                  Back to catalog
                </button>
              </div>
            </div>
            <div
              className="rounded-2xl border p-4 shadow-inner"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-surface-muted)'
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                Sync status
              </p>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--color-text)' }}>
                <li>• POS & vendor dashboards update instantly</li>
                <li>• eStore highlight badges stay in sync</li>
                <li>• Lookup additions appear in this form immediately</li>
              </ul>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border p-6 shadow-xl"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            boxShadow: '0 20px 40px var(--color-shadow)'
          }}
        >
          <ProductForm
            initial={{}}
            onSave={handleSave}
            onCancel={() => navigate('/products')}
            saving={saving}
            lookups={lookups}
            categoryTree={categoryTree}
            vendors={vendors}
          />
        </section>
      </div>
    </div>
  );
}
