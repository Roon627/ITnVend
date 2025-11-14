import React, { useEffect, useMemo, useState } from 'react';
import { FaBoxOpen, FaCube, FaExclamationTriangle } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';
import ProductForm from '../../components/ProductForm';

export default function VendorProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [lookups, setLookups] = useState({ brands: [], materials: [], colors: [] });
  const [categoryTree, setCategoryTree] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async function load() {
      setLoading(true);
      try {
        const res = await api.get('/vendor/me/products');
        if (mounted) setProducts(res || []);
      } catch (err) {
        console.error('Failed to load vendor products', err);
        toast.push('Failed to load products', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [toast]);

  useEffect(() => {
    let mounted = true;
    (async function loadLookups() {
      try {
        const [lu, tree] = await Promise.all([
          api.get('/lookups'),
          api.get('/categories/tree', { params: { depth: 3 } }),
        ]);
        if (!mounted) return;
        setLookups(lu || { brands: [], materials: [], colors: [] });
        setCategoryTree(Array.isArray(tree) ? tree : []);
      } catch (err) {
        console.debug('Vendor lookups unavailable', err?.message || err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(p) { setEditing(p); setModalOpen(true); }
  function openQuickEdit() {
    if (products.length) {
      setEditing(products[0]);
      setModalOpen(true);
    } else {
      openNew();
    }
  }

  async function handleSave(payload, opts = {}) {
    setSaving(true);
    let tempId = null;
    if (!editing) {
      tempId = `tmp-${Date.now()}`;
      setProducts(prev => [{ id: tempId, name: payload.name, price: payload.price, stock: payload.stock, image: payload.image }, ...prev]);
      setModalOpen(false);
    } else {
      setProducts(prev => prev.map(p => (p.id === editing.id ? { ...p, ...payload } : p)));
      setModalOpen(false);
    }
    try {
      if (editing) {
        await api.put(`/vendor/products/${editing.id}`, payload);
        toast.push('Product updated', 'success');
      } else {
        const created = await api.post('/vendor/products', payload);
        if (tempId) {
          setProducts(prev => prev.map(p => (p.id === tempId ? { ...created } : p)));
        }
        toast.push('Product created', 'success');
      }
    } catch (err) {
      console.error('Save failed', err);
      if (tempId) setProducts(prev => prev.filter(p => p.id !== tempId));
        if (err && err.data && typeof err.data === 'object') {
          if (err.data.errors && typeof err.data.errors === 'object') {
            if (opts && typeof opts.setFieldErrors === 'function') opts.setFieldErrors(err.data.errors);
            toast.push(Object.values(err.data.errors).join('; '), 'error');
          } else {
            toast.push(err.message || 'Save failed', 'error');
          }
        } else {
          toast.push(err.message || 'Save failed', 'error');
        }
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(p) {
    if (!confirm(`Archive product "${p.name}"?`)) return;
    try {
      await api.del(`/vendor/products/${p.id}`);
      toast.push('Product archived', 'success');
      setProducts(prev => prev.filter(x => x.id !== p.id));
    } catch (err) {
      console.error('Archive failed', err);
      toast.push(err.message || 'Archive failed', 'error');
    }
  }

  const totalStock = useMemo(() => products.reduce((sum, prod) => sum + (Number(prod.stock) || 0), 0), [products]);
  const lowStockCount = useMemo(() => products.filter((prod) => (Number(prod.stock) || 0) < 6).length, [products]);
  const totalValue = useMemo(() => products.reduce((sum, prod) => sum + (Number(prod.price) || 0), 0), [products]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-white/80 p-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">Vendor console</p>
            <h1 className="text-3xl font-extrabold text-slate-900">Manage your products</h1>
            <p className="mt-1 text-sm text-slate-500">Add or edit listings. Updates sync instantly to the public marketplace.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={openNew}
              className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:-translate-y-0.5 hover:bg-indigo-500"
            >
              + Add product
            </button>
            <button
              type="button"
              onClick={openQuickEdit}
              className="inline-flex items-center gap-2 rounded-full border border-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Quick edit latest
            </button>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-600"><FaBoxOpen /></div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Active listings</p>
              <p className="text-2xl font-semibold text-slate-900">{products.length}</p>
              <p className="text-xs text-slate-500">Visible on the storefront</p>
            </div>
          </article>
          <article className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-600"><FaCube /></div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Total stock units</p>
              <p className="text-2xl font-semibold text-slate-900">{totalStock}</p>
              <p className="text-xs text-slate-500">Sum of all quantities</p>
            </div>
          </article>
          <article className="flex items-center gap-4 rounded-2xl border border-white/70 bg-white p-4 shadow-sm">
            <div className="rounded-2xl bg-amber-50 p-3 text-amber-600"><FaExclamationTriangle /></div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Low stock alerts</p>
              <p className="text-2xl font-semibold text-slate-900">{lowStockCount}</p>
              <p className="text-xs text-slate-500">Under 6 units</p>
            </div>
          </article>
        </section>

        {loading ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/80 p-8 text-center text-sm text-slate-500">
            Loading your catalog…
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 p-10 text-center">
            <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-slate-100 text-3xl leading-[4rem] text-slate-400">＋</div>
            <h2 className="text-xl font-semibold text-slate-800">No products yet</h2>
            <p className="mt-2 text-sm text-slate-500">Start by adding your first product. You can add unlimited listings.</p>
            <button onClick={openNew} className="mt-4 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">
              Add your first product
            </button>
          </div>
        ) : (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Products</h2>
              <p className="text-sm text-slate-500">Estimated catalog value: {new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(totalValue)}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((p) => {
                const typeLabel = (p.product_type_label || p.productTypeLabel || p.type || 'physical')?.toString();
                const clothingSizes = p.clothing_sizes || p.clothingSizes || '';
                const digitalFlags = p.digital_license_key || p.digitalLicenseKey || p.digital_download_url || p.digitalDownloadUrl;
                return (
                  <article key={p.id} className="flex flex-col gap-4 rounded-2xl border border-white/60 bg-white p-4 shadow-sm sm:flex-row">
                    <img src={p.image || '/images/placeholder.png'} alt={p.name} className="h-28 w-28 rounded-xl object-cover" />
                    <div className="flex flex-1 flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
                          <p className="text-sm text-slate-500">SKU: {p.sku || '—'}</p>
                        </div>
                        {typeLabel && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {typeLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">${Number(p.price || 0).toFixed(2)}</span>
                        <span>{p.stock || 0} in stock</span>
                        {Array.isArray(p.tags) && p.tags.length > 0 && (
                          <span className="text-xs uppercase tracking-wide text-slate-400">{p.tags.join(', ')}</span>
                        )}
                      </div>
                      {(clothingSizes || digitalFlags) && (
                        <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                          {clothingSizes && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">Sizes: {clothingSizes}</span>}
                          {digitalFlags && <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-indigo-600">Digital delivery</span>}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button onClick={() => openEdit(p)} className="inline-flex flex-1 items-center justify-center rounded-full border border-indigo-100 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:bg-indigo-50">
                          Edit
                        </button>
                        <button
                          onClick={() => handleArchive(p)}
                          className="inline-flex items-center justify-center rounded-full border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          labelledBy="vendor-product-modal"
          align="start"
          className="w-full max-w-3xl"
        >
          <div className="flex h-full max-h-[90vh] flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-300">
                  Vendor workspace
                </p>
                <h3 id="vendor-product-modal" className="text-lg font-semibold text-slate-900">
                  {editing ? 'Edit product' : 'Add product'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-rose-200 hover:text-rose-600"
                aria-label="Close product form"
              >
                ×
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <ProductForm
                initial={editing || {}}
                onCancel={() => setModalOpen(false)}
                onSave={handleSave}
                saving={saving}
                lookups={lookups}
                categoryTree={categoryTree}
              />
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
