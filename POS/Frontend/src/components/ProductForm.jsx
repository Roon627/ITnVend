import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';

// Shared ProductForm component used by POS product editor and VendorProducts.
// Props:
// - initial: initial values object
// - onSave(payload, { setFieldErrors }): called when validated form is submitted
// - onCancel(): called to cancel
// - saving: boolean
// - extraFields?: optional render prop for additional POS-specific fields

export default function ProductForm({ initial = {}, onSave, onCancel, saving = false, extraFields = null }) {
  const [form, setForm] = useState({
    name: initial.name || '',
    price: initial.price != null ? initial.price : '',
    stock: initial.stock != null ? initial.stock : 0,
    sku: initial.sku || '',
    shortDescription: initial.shortDescription || initial.short_description || '',
    image: initial.image || initial.imageUrl || '',
    gallery: Array.isArray(initial.gallery) ? initial.gallery : (initial.gallery ? [initial.gallery] : []),
    tags: Array.isArray(initial.tags) ? initial.tags.join(', ') : (initial.tags || ''),
    // allow arbitrary extra fields to be included by POS via extraFields
    ...initial,
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    setForm({
      name: initial.name || '',
      price: initial.price != null ? initial.price : '',
      stock: initial.stock != null ? initial.stock : 0,
      sku: initial.sku || '',
      shortDescription: initial.shortDescription || initial.short_description || '',
      image: initial.image || initial.imageUrl || '',
      gallery: Array.isArray(initial.gallery) ? initial.gallery : (initial.gallery ? [initial.gallery] : []),
      tags: Array.isArray(initial.tags) ? initial.tags.join(', ') : (initial.tags || ''),
      ...initial,
    });
    setErrors({});
  }, [initial]);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function validate() {
    const e = {};
    if (!form.name || !String(form.name).trim()) e.name = 'Name is required';
    const p = parseFloat(form.price);
    if (!Number.isFinite(p) || p <= 0) e.price = 'Enter a valid price';
    const s = parseInt(form.stock, 10);
    if (!Number.isFinite(s) || s < 0) e.stock = 'Stock must be 0 or greater';
    return e;
  }

  async function uploadFile(file) {
    if (!file) return null;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.upload('/uploads', fd);
      return res?.url || res?.path || null;
    } catch (err) {
      console.error('Upload failed', err);
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleImageFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const preview = URL.createObjectURL(f);
    update('image', preview);
    const uploaded = await uploadFile(f);
    if (uploaded) update('image', uploaded);
  }

  async function handleGalleryFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const previews = files.map(f => URL.createObjectURL(f));
    setForm(prev => ({ ...prev, gallery: [...(prev.gallery || []), ...previews] }));
    for (const f of files) {
      const uploaded = await uploadFile(f);
      if (uploaded) {
        setForm(prev => ({ ...prev, gallery: [...(prev.gallery || []).filter(Boolean), uploaded] }));
      }
    }
    if (galleryInputRef.current) galleryInputRef.current.value = null;
  }

  function removeGalleryIndex(idx) {
    setForm(prev => ({ ...prev, gallery: (prev.gallery || []).filter((_, i) => i !== idx) }));
  }

  function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const fieldErr = validate();
    setErrors(fieldErr);
    if (Object.keys(fieldErr).length) return;
    // Build payload. Include known fields and pass-through any extra fields set by extraFields.
    const payload = {
      ...form,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    };
    // Remove internal representation keys if present
    if (payload.short_description) {
      payload.shortDescription = payload.short_description;
      delete payload.short_description;
    }
    onSave(payload, { setFieldErrors: setErrors });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium">Name</label>
        <input value={form.name} onChange={e => update('name', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium">Price</label>
          <input type="number" step="0.01" value={form.price} onChange={e => update('price', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" required />
        </div>
        <div>
          <label className="block text-sm font-medium">Stock</label>
          <input type="number" value={form.stock} onChange={e => update('stock', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">SKU</label>
        <input value={form.sku} onChange={e => update('sku', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
      </div>

      <div>
        <label className="block text-sm font-medium">Image</label>
        <div className="flex gap-3 items-center">
          <input type="file" accept="image/*" onChange={handleImageFile} />
          <input value={form.image} onChange={e => update('image', e.target.value)} placeholder="Or paste image URL" className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
        {form.image ? (
          <div className="mt-2">
            <img src={form.image} alt="preview" className="h-24 w-24 object-cover rounded border" />
          </div>
        ) : null}
      </div>

      <div>
        <label className="block text-sm font-medium">Gallery</label>
        <div className="flex items-center gap-3">
          <input ref={galleryInputRef} type="file" accept="image/*" multiple onChange={handleGalleryFiles} />
        </div>
        <div className="mt-2 flex gap-2 flex-wrap">
          {(form.gallery || []).map((g, idx) => (
            <div key={idx} className="relative">
              <img src={g} alt={`g-${idx}`} className="h-16 w-16 object-cover rounded border" />
              <button type="button" onClick={() => removeGalleryIndex(idx)} className="absolute -top-1 -right-1 bg-white rounded-full text-xs px-1">×</button>
            </div>
          ))}
        </div>
      </div>

      {extraFields ? extraFields({ form, update, setForm }) : null}

      <div>
        <label className="block text-sm font-medium">Short description</label>
        <input value={form.shortDescription} onChange={e => update('shortDescription', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
      </div>

      <div>
        <label className="block text-sm font-medium">Tags (comma-separated)</label>
        <input value={form.tags} onChange={e => update('tags', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button type="submit" className="rounded bg-indigo-600 text-white px-3 py-1 text-sm" disabled={saving || uploading}>{saving || uploading ? 'Saving…' : 'Save'}</button>
        <button type="button" className="rounded border px-3 py-1 text-sm" onClick={onCancel}>Cancel</button>
      </div>

      {Object.keys(errors).length > 0 && (
        <div className="mt-2 text-sm text-red-600">
          {Object.values(errors).map((v, i) => <div key={i}>{v}</div>)}
        </div>
      )}
    </form>
  );
}
