import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaBoxOpen, FaCube, FaExclamationTriangle } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import ProductForm from '../../modules/product/ProductForm';
import { useSettings } from '../../components/SettingsContext';

const extractSaleState = (product) => {
  const basePrice = Number(product?.price);
  const salePrice = Number(product?.sale_price ?? product?.salePrice);
  const isFlagged = Number(product?.is_on_sale ?? product?.isOnSale ?? 0) === 1;
  if (isFlagged && Number.isFinite(basePrice) && basePrice > 0 && Number.isFinite(salePrice) && salePrice > 0 && salePrice < basePrice) {
    const discount =
      product?.discount_percent ??
      product?.discountPercent ??
      ((basePrice - salePrice) / basePrice) * 100;
    return {
      isOnSale: true,
      basePrice,
      salePrice,
      discountPercent: discount,
      savings: basePrice - salePrice,
    };
  }
  return { isOnSale: false, basePrice: Number.isFinite(basePrice) ? basePrice : 0 };
};

export default function VendorProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const [lookups, setLookups] = useState({ brands: [], materials: [], colors: [] });
  const [categoryTree, setCategoryTree] = useState([]);
  const { formatCurrency } = useSettings();

  const formatMoney = useCallback(
    (amount) =>
      typeof formatCurrency === 'function'
        ? formatCurrency(amount || 0)
        : new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(amount || 0),
    [formatCurrency]
  );

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/vendor/me/products');
      setProducts(res || []);
    } catch (err) {
      console.error('Failed to load vendor products', err);
      toast.push('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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
    try {
      if (editing) {
        await api.put(`/vendor/products/${editing.id}`, payload);
        toast.push('Product updated', 'success');
      } else {
        await api.post('/vendor/products', payload);
        toast.push('Product created', 'success');
      }
      setModalOpen(false);
      fetchProducts();
    } catch (err) {
      console.error('Save failed', err);
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
      fetchProducts();
    } catch (err) {
      console.error('Archive failed', err);
      toast.push(err.message || 'Archive failed', 'error');
    }
  }

  async function handleToggleSale(product) {
    try {
      if (Number(product.is_on_sale ?? 0) === 1) {
        await api.put(`/vendor/products/${product.id}`, { isOnSale: false });
        toast.push('Sale disabled', 'success');
      } else {
        openEdit(product);
        return;
      }
      fetchProducts();
    } catch (err) {
      console.error('Failed to toggle sale', err);
      toast.push(err?.message || 'Failed to update sale status', 'error');
    }
  }

  const saleProducts = useMemo(
    () =>
      products.filter((prod) => {
        const sale = extractSaleState(prod);
        return sale.isOnSale;
      }),
    [products]
  );
  const totalStock = useMemo(() => products.reduce((sum, prod) => sum + (Number(prod.stock) || 0), 0), [products]);
  const lowStockCount = useMemo(() => products.filter((prod) => (Number(prod.stock) || 0) < 6).length, [products]);
  const totalValue = useMemo(
    () =>
      products.reduce((sum, prod) => {
        const sale = extractSaleState(prod);
        return sum + (sale.isOnSale ? sale.salePrice : sale.basePrice || 0);
      }, 0),
    [products]
  );
  const totalSaleValue = useMemo(
    () =>
      saleProducts.reduce((sum, prod) => {
        const sale = extractSaleState(prod);
        return sum + (sale.salePrice || 0);
      }, 0),
    [saleProducts]
  );

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

        {saleProducts.length > 0 && (
          <section className="rounded-3xl border border-emerald-100 bg-white/90 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Items on sale</h2>
                <p className="text-sm text-slate-500">You have {saleProducts.length} listing{saleProducts.length === 1 ? '' : 's'} with active sale pricing.</p>
              </div>
              <div className="text-sm font-semibold text-emerald-700">
                Sale catalog value: {formatMoney(totalSaleValue)}
              </div>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-emerald-50 text-xs uppercase tracking-wide text-emerald-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Product</th>
                    <th className="px-3 py-2 text-left">Sale price</th>
                    <th className="px-3 py-2 text-left">Original</th>
                    <th className="px-3 py-2 text-left">Discount</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {saleProducts.map((product) => {
                    const sale = extractSaleState(product);
                    const discountLabel = sale.discountPercent != null ? `${Math.round(sale.discountPercent)}%` : '—';
                    return (
                      <tr key={`sale-${product.id}`} className="hover:bg-emerald-50/30">
                        <td className="px-3 py-2 font-semibold text-slate-800">{product.name}</td>
                        <td className="px-3 py-2 text-emerald-700 font-semibold">{formatMoney(sale.salePrice)}</td>
                        <td className="px-3 py-2 text-xs text-slate-500 line-through">{formatMoney(sale.basePrice)}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                            {discountLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(product)}
                              className="rounded-full border border-emerald-200 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSale(product)}
                              className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                            >
                              Disable sale
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

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
              <p className="text-sm text-slate-500">Estimated catalog value: {formatMoney(totalValue)}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {products.map((p) => {
                const typeLabel = (p.product_type_label || p.productTypeLabel || p.type || 'physical')?.toString();
                const clothingSizes = p.clothing_sizes || p.clothingSizes || '';
                const digitalFlags = p.digital_license_key || p.digitalLicenseKey || p.digital_download_url || p.digitalDownloadUrl;
                const sale = extractSaleState(p);
                const discountLabel =
                  sale.isOnSale && sale.discountPercent != null ? `${Math.round(sale.discountPercent)}% OFF` : null;
                return (
                  <article key={p.id} className="flex flex-col gap-4 rounded-2xl border border-white/60 bg-white p-4 shadow-sm sm:flex-row">
                    <img src={p.image || '/images/placeholder.png'} alt={p.name} className="h-28 w-28 rounded-xl object-cover" />
                    <div className="flex flex-1 flex-col gap-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <h3 className="text-base font-semibold text-slate-900">{p.name}</h3>
                            {sale.isOnSale && (
                              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                                Sale
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-500">SKU: {p.sku || '—'}</p>
                        </div>
                        {typeLabel && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                            {typeLabel}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-baseline gap-4 text-sm text-slate-600">
                        {sale.isOnSale ? (
                          <>
                            <span className="text-lg font-semibold text-emerald-600">{formatMoney(sale.salePrice)}</span>
                            <span className="text-sm text-slate-400 line-through">{formatMoney(sale.basePrice)}</span>
                            {discountLabel && (
                              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                {discountLabel}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-lg font-semibold text-slate-900">{formatMoney(sale.basePrice)}</span>
                        )}
                        <span>{p.track_inventory === 0 ? 'Unlimited' : `${p.stock || 0} in stock`}</span>
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

        <ProductForm
          open={modalOpen}
          draft={editing || {}}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          saving={saving}
          lookups={lookups}
          categoryTree={categoryTree}
        />
      </div>
    </div>
  );
}
