import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ProductForm from '../components/ProductForm';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const normalizeVendorId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : value;
};

const normalizeAvailabilityStatus = (value, fallback = 'in_stock') => {
  if (value == null) return fallback;
  const normalized = String(value).toLowerCase();
  const allowed = ['in_stock', 'preorder', 'vendor', 'used'];
  return allowed.includes(normalized) ? normalized : fallback;
};

const galleryPayloadFromState = (gallery) =>
  (Array.isArray(gallery) ? gallery : [])
    .map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.path || entry?.url || ''))
    .map((value) => (value || '').trim())
    .filter(Boolean);

export default function EditProduct() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [product, setProduct] = useState(null);
  const [lookups, setLookups] = useState({});
  const [categoryTree, setCategoryTree] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [productResp, lu, tree, vlist] = await Promise.all([
          api.get(`/products/${id}`),
          api.get('/lookups'),
          api.get('/categories/tree', { params: { depth: 3 } }),
          api.get('/vendors', { params: { status: 'active' } }),
        ]);
        if (!mounted) return;
        setProduct(productResp || null);
        setLookups(lu || {});
        setCategoryTree(Array.isArray(tree) ? tree : []);
        setVendors(Array.isArray(vlist) ? vlist : []);
      } catch (err) {
        console.debug('Failed to load edit product dependencies', err);
        if (!mounted) return;
        setError(err?.message || 'Failed to load product');
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const handleSave = async (payload, { setFieldErrors } = {}) => {
    if (!id) return;
    try {
      setSaving(true);
      const isDigital = (payload.productTypeLabel || payload.type || '').toLowerCase() === 'digital';
      const updatePayload = {
        name: payload.name,
        price: payload.price != null ? parseFloat(payload.price) : 0,
        stock: isDigital ? 0 : payload.stock ? parseInt(payload.stock, 10) || 0 : 0,
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

      await api.put(`/products/${id}`, updatePayload);
      toast.push('Product updated', 'success');
      navigate('/products');
    } catch (err) {
      console.debug('Failed to update product', err);
      toast.push(err?.message || 'Failed to update product', 'error');
      if (err?.fields && typeof setFieldErrors === 'function') setFieldErrors(err.fields);
    } finally {
      setSaving(false);
    }
  };

  const headerDescription = product?.name
    ? `Editing ${product.name}. Changes sync across POS and vendor dashboards.`
    : 'Load and update product details in a focused view.';

  return (
    <div className="min-h-screen p-6 pb-24" style={{ backgroundColor: 'var(--color-bg)' }}>
      <div className="mx-auto max-w-6xl space-y-6">
        <section
          className="rounded-3xl border p-6 shadow-lg"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            boxShadow: '0 25px 55px var(--color-shadow)',
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
                Edit product
              </h1>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
                {headerDescription}
              </p>
              <div className="flex flex-wrap gap-2 pt-3">
                <Link
                  to="/manage-lookups"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-primary)',
                  }}
                >
                  Manage lookups
                </Link>
                <button
                  type="button"
                  onClick={() => navigate('/products')}
                  className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition"
                  style={{
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-muted)',
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
                backgroundColor: 'var(--color-surface-muted)',
              }}
            >
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--color-muted)' }}>
                Sync status
              </p>
              <ul className="mt-2 space-y-1 text-sm" style={{ color: 'var(--color-text)' }}>
                <li>• Changes propagate to POS & vendor dashboards instantly</li>
                <li>• Highlight badges and preorder states remain aligned</li>
                <li>• Lookup additions are immediately available</li>
              </ul>
            </div>
          </div>
        </section>

        <section
          className="rounded-3xl border p-6 shadow-xl"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-surface)',
            boxShadow: '0 20px 40px var(--color-shadow)',
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-24 text-sm text-slate-500">Loading product…</div>
          ) : error ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-rose-600">{error}</p>
              <button
                type="button"
                onClick={() => navigate('/products')}
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-semibold transition"
                style={{
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-muted)',
                }}
              >
                Back to catalog
              </button>
            </div>
          ) : (
            <ProductForm
              mode="edit"
              initial={product || {}}
              onSave={handleSave}
              onCancel={() => navigate('/products')}
              lookups={lookups}
              categoryTree={categoryTree}
              vendors={vendors}
              saving={saving}
            />
          )}
        </section>
      </div>
    </div>
  );
}
