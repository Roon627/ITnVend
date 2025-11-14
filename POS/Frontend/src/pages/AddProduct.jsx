import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
      const createdPayload = {
        name: payload.name,
        price: payload.price != null ? parseFloat(payload.price) : 0,
        stock: payload.stock ? parseInt(payload.stock, 10) || 0 : 0,
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
        trackInventory: payload.trackInventory,
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
    <div className="p-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Add Product</h1>
            <p className="text-sm text-slate-500">Create a new product listing. All fields are available in the product editor.</p>
          </div>
        </div>
      </section>

      <section className="mt-6 bg-white p-6 rounded-lg shadow-sm">
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
  );
}
