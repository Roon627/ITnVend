import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import ProductForm from '../components/ProductForm';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const outerContainerClasses = 'min-h-screen bg-[var(--color-bg)] px-3 py-6 sm:px-6 lg:px-10';
const contentWrapperClasses = 'mx-auto w-full max-w-7xl space-y-6';
const pillButtonClasses =
  'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold transition-colors duration-200';

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
        stock: payload.stock ? parseInt(payload.stock, 10) || 0 : 0,
        categoryId: payload.categoryId || null,
        subcategoryId: payload.subcategoryId || null,
        subsubcategoryId: payload.subsubcategoryId || null,
        image: payload.image || null,
        imageUrl: payload.imageUrl || null,
        description: payload.description || null,
        technicalDetails: payload.technicalDetails || null,
        sku: payload.sku || null,
        barcode: payload.barcode || null,
        model: payload.model || null,
        cost: payload.cost ? parseFloat(payload.cost) : 0,
        trackInventory: payload.trackInventory,
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
        brandId: payload.brandId || null,
        materialId: payload.materialId || null,
        colorId: payload.colorId || null,
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
        shortDescription: payload.shortDescription || null,
        year: payload.year ? parseInt(payload.year, 10) || null : null,
        autoSku: payload.autoSku ?? true,
        tags: payload.tags || [],
        newArrival: payload.newArrival ? 1 : 0,
      };
      const salePriceNumber = Number(payload.salePrice);
      const discountPercentNumber = Number(payload.discountPercent);
      createdPayload.isOnSale = !!payload.isOnSale;
      createdPayload.salePrice =
        createdPayload.isOnSale && Number.isFinite(salePriceNumber) ? salePriceNumber : null;
      createdPayload.discountPercent =
        createdPayload.isOnSale && Number.isFinite(discountPercentNumber) ? discountPercentNumber : null;

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
    <div className={outerContainerClasses}>
      <div className={contentWrapperClasses}>
        <section
          className="rounded-3xl border p-5 shadow-lg sm:p-6 lg:p-8"
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
              <h1 className="text-3xl font-extrabold leading-tight" style={{ color: 'var(--color-heading)' }}>
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
                  className={`${pillButtonClasses} text-[var(--color-primary)]`}
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  Manage lookups
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className={`${pillButtonClasses} text-[var(--color-muted)]`}
                  style={{ borderColor: 'var(--color-border)' }}
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
          className="rounded-3xl border p-5 shadow-xl sm:p-6 lg:p-8"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            boxShadow: '0 20px 40px var(--color-shadow)'
          }}
        >
          <div className="rounded-2xl border border-dashed border-slate-100/80 p-3 sm:p-4 lg:p-6">
            <ProductForm
              initial={{}}
              onSave={handleSave}
              onCancel={() => navigate('/products')}
              saving={saving}
              lookups={lookups}
              categoryTree={categoryTree}
              vendors={vendors}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
