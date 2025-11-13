import React, { useEffect, useState } from 'react';
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

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(p) { setEditing(p); setModalOpen(true); }

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-5xl">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-semibold">Your products</h2>
        <div>
          <button onClick={openNew} className="rounded bg-indigo-600 text-white px-3 py-1">Add product</button>
        </div>
      </header>

      {loading ? (
        <div>Loading…</div>
      ) : (
        <div className="space-y-4">
          {products.length === 0 ? (
            <div className="text-sm text-slate-500">No products yet — add one to get started.</div>
          ) : (
            <div className="grid gap-3">
              {products.map(p => (
                <div key={p.id} className="flex items-center justify-between rounded border bg-white p-3">
                  <div className="flex items-center gap-3">
                    <img src={p.image || '/images/placeholder.png'} alt={p.name} className="h-12 w-12 rounded object-cover" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.price} • {p.stock} in stock</div>
                      <div className="text-xs text-slate-400">{(p.tags || []).join(', ')}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => openEdit(p)} className="rounded border px-2 py-1 text-sm">Edit</button>
                    <button onClick={() => handleArchive(p)} className="rounded bg-red-600 text-white px-2 py-1 text-sm">Archive</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} labelledBy="product-modal-title" className="max-w-2xl">
        <div className="w-full rounded-2xl border bg-white p-6">
          <h3 id="product-modal-title" className="text-lg font-semibold mb-3">{editing ? 'Edit product' : 'Add product'}</h3>
          <ProductForm initial={editing || {}} onCancel={() => setModalOpen(false)} onSave={handleSave} saving={saving} />
        </div>
      </Modal>
      </div>
    </div>
  );
}
