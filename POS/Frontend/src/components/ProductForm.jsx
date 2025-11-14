import React, { useEffect, useState, useRef } from 'react';
import api from '../lib/api';
import SelectField from './SelectField';
import { makeSku } from '../lib/sku';

// Shared ProductForm component used by POS product editor and VendorProducts.
// Props:
// - initial: initial values object
// - onSave(payload, { setFieldErrors }): called when validated form is submitted
// - onCancel(): called to cancel
// - saving: boolean
// - extraFields?: optional render prop for additional POS-specific fields

export default function ProductForm({
  initial = {},
  onSave,
  onCancel,
  saving = false,
  extraFields = null,
  lookups = {},
  categoryTree = [],
  vendors = [],
  createBrand,
  createMaterial,
  // optional external handlers (for modal integration)
  onChange: externalOnChange,
  onUploadImage: externalOnUploadImage,
  onUploadGallery: externalOnUploadGallery,
}) {
  const [form, setForm] = useState({
    // basic
    name: (initial && initial.name) || '',
    price: (initial && initial.price != null) ? initial.price : '',
    stock: (initial && initial.stock != null) ? initial.stock : 0,
    sku: (initial && initial.sku) || '',
    autoSku: initial?.autoSku ?? initial?.auto_sku ?? true,
    shortDescription: (initial && (initial.shortDescription || initial.short_description)) || '',
    description: initial?.description || '',
    technicalDetails: initial?.technicalDetails || initial?.technical_details || '',
    // category lookups
    categoryId: initial?.categoryId || initial?.category_id || '',
    subcategoryId: initial?.subcategoryId || initial?.subcategory_id || '',
    subsubcategoryId: initial?.subsubcategoryId || initial?.subsubcategory_id || '',
    // lookups
    brandId: initial?.brandId || initial?.brand_id || '',
    materialId: initial?.materialId || initial?.material_id || '',
    colorId: initial?.colorId || initial?.color_id || '',
    type: initial?.type || 'physical',
    model: initial?.model || '',
    year: initial?.year || '',
    barcode: initial?.barcode || '',
    cost: initial?.cost != null ? String(initial.cost) : '',
    trackInventory: initial?.trackInventory ?? (initial?.track_inventory !== 0),
    availabilityStatus: initial?.availabilityStatus || initial?.availability_status || 'in_stock',
    availableForPreorder: (initial?.availableForPreorder ?? (initial?.preorder_enabled ?? false)),
    preorderEta: initial?.preorderEta || initial?.preorder_eta || '',
    preorderReleaseDate: initial?.preorderReleaseDate || initial?.preorder_release_date || '',
    preorderNotes: initial?.preorderNotes || initial?.preorder_notes || '',
    vendorId: initial?.vendorId || initial?.vendor_id || '',
    highlightActive: initial?.highlightActive || initial?.highlight_active || false,
    highlightLabel: initial?.highlightLabel || initial?.highlight_label || '',
    highlightPriority: initial?.highlightPriority != null ? String(initial?.highlightPriority || initial?.highlight_priority) : '',
    newArrival: initial?.newArrival || initial?.new_arrival || false,
    // media
    image: (initial && (initial.image || initial.imageUrl)) || '',
    gallery: (initial && Array.isArray(initial.gallery)) ? initial.gallery : (initial && initial.gallery ? [initial.gallery] : []),
    tags: (initial && Array.isArray(initial.tags)) ? initial.tags.join(', ') : ((initial && initial.tags) || ''),
    // passthrough
    ...(initial || {}),
  });
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef(null);
  const [localCategories, setLocalCategories] = useState([]);
  const [localLookups, setLocalLookups] = useState({
    brands: (lookups && lookups.brands) || [],
    materials: (lookups && lookups.materials) || [],
    colors: (lookups && lookups.colors) || [],
  });

  useEffect(() => {
    setLocalLookups({
      brands: (lookups && lookups.brands) || [],
      materials: (lookups && lookups.materials) || [],
      colors: (lookups && lookups.colors) || [],
    });
  }, [lookups]);

  useEffect(() => {
    setForm({
      name: (initial && initial.name) || '',
      price: (initial && initial.price != null) ? initial.price : '',
      stock: (initial && initial.stock != null) ? initial.stock : 0,
      sku: (initial && initial.sku) || '',
      shortDescription: (initial && (initial.shortDescription || initial.short_description)) || '',
      image: (initial && (initial.image || initial.imageUrl)) || '',
      gallery: (initial && Array.isArray(initial.gallery)) ? initial.gallery : (initial && initial.gallery ? [initial.gallery] : []),
      tags: (initial && Array.isArray(initial.tags)) ? initial.tags.join(', ') : ((initial && initial.tags) || ''),
      ...(initial || {}),
    });
    setErrors({});
  }, [initial]);

  // build simple category lists from categoryTree prop
  useEffect(() => {
    if (!Array.isArray(categoryTree)) return setLocalCategories([]);
    setLocalCategories(categoryTree);
  }, [categoryTree]);

  // auto-generate SKU when enabled
  useEffect(() => {
    if (!form) return;
    if (!form.autoSku) return;
    const brandName = (localLookups?.brands || []).find((b) => String(b.id) === String(form.brandId))?.name || '';
    const sku = makeSku({ brandName, productName: form.name, year: form.year });
    setForm((prev) => (prev ? { ...prev, sku } : prev));
  }, [form, localLookups]);

  function update(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      if (typeof externalOnChange === 'function') {
        try { externalOnChange(field, value, next); } catch { /* ignore */ }
      }
      return next;
    });
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

  // fallback create handlers when parent doesn't provide them
  async function internalCreateBrand(name) {
    if (!name || !String(name).trim()) return null;
    try {
      const res = await api.post('/lookups/brands', { name });
      const item = res && (res.data || res);
      const newBrand = item && item.id ? item : { id: item?.id || item?.insertId || name, name };
      setLocalLookups(prev => ({ ...prev, brands: [...(prev.brands || []), newBrand] }));
      if (newBrand && newBrand.id) update('brandId', newBrand.id);
      return newBrand;
    } catch (err) {
      console.error('create brand failed', err);
      return null;
    }
  }

  async function internalCreateMaterial(name) {
    if (!name || !String(name).trim()) return null;
    try {
      const res = await api.post('/lookups/materials', { name });
      const item = res && (res.data || res);
      const newMat = item && item.id ? item : { id: item?.id || item?.insertId || name, name };
      setLocalLookups(prev => ({ ...prev, materials: [...(prev.materials || []), newMat] }));
      if (newMat && newMat.id) update('materialId', newMat.id);
      return newMat;
    } catch (err) {
      console.error('create material failed', err);
      return null;
    }
  }

  async function handleImageFile(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const preview = URL.createObjectURL(f);
    update('image', preview);
    if (typeof externalOnUploadImage === 'function') {
      // allow parent to handle upload
      externalOnUploadImage(f);
      return;
    }
    const uploaded = await uploadFile(f);
    if (uploaded) update('image', uploaded);
  }

  async function handleGalleryFiles(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const previews = files.map(f => URL.createObjectURL(f));
    setForm(prev => ({ ...prev, gallery: [...(prev.gallery || []), ...previews] }));
    if (typeof externalOnUploadGallery === 'function') {
      try { externalOnUploadGallery(files); } catch { /* ignore */ }
      if (galleryInputRef.current) galleryInputRef.current.value = null;
      return;
    }
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <SelectField
            label="Category"
            value={form.categoryId}
            onChange={(v) => { update('categoryId', v); update('subcategoryId', ''); update('subsubcategoryId', ''); }}
            options={(localCategories || []).map(c => ({ id: c.id, name: c.name }))}
            placeholder="Select category"
          />
        </div>
        <div>
          <SelectField
            label="Subcategory"
            value={form.subcategoryId}
            onChange={(v) => { update('subcategoryId', v); update('subsubcategoryId', ''); }}
            options={(() => {
              const cat = (localCategories || []).find(c => String(c.id) === String(form.categoryId));
              return (cat && Array.isArray(cat.children) ? cat.children.map(sc => ({ id: sc.id, name: sc.name })) : []);
            })()}
            placeholder="Select subcategory"
          />
        </div>
        <div>
          <SelectField
            label="Sub-subcategory"
            value={form.subsubcategoryId}
            onChange={(v) => update('subsubcategoryId', v)}
            options={(() => {
              const cat = (localCategories || []).find(c => String(c.id) === String(form.categoryId));
              if (!cat || !Array.isArray(cat.children)) return [];
              const sub = cat.children.find(s => String(s.id) === String(form.subcategoryId));
              return (sub && Array.isArray(sub.children) ? sub.children.map(ss => ({ id: ss.id, name: ss.name })) : []);
            })()}
            placeholder="Select sub-subcategory"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <SelectField
            label="Brand"
            value={form.brandId}
            onChange={(v) => update('brandId', v)}
            options={(localLookups?.brands || []).map(b => ({ id: b.id, name: b.name }))}
            placeholder="Select brand"
            allowCreate={true}
            createLabel="Add brand"
            onCreate={createBrand || internalCreateBrand}
          />
        </div>
        <div>
          <SelectField
            label="Material"
            value={form.materialId}
            onChange={(v) => update('materialId', v)}
            options={(localLookups?.materials || []).map(m => ({ id: m.id, name: m.name }))}
            placeholder="Select material"
            allowCreate={true}
            createLabel="Add material"
            onCreate={createMaterial || internalCreateMaterial}
          />
        </div>
        <div>
          <SelectField
            label="Color"
            value={form.colorId}
            onChange={(v) => update('colorId', v)}
            options={(localLookups?.colors || []).map(c => ({ id: c.id, name: c.name }))}
            placeholder="Select color"
          />
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium">Type</label>
          <select value={form.type} onChange={(e) => update('type', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
            <option value="physical">Physical</option>
            <option value="digital">Digital</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Model</label>
          <input value={form.model} onChange={(e) => update('model', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Year</label>
          <input value={form.year} onChange={(e) => update('year', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        <div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!!form.autoSku} onChange={(e) => update('autoSku', !!e.target.checked)} />
            <span className="text-sm"> Auto-generate SKU</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium">Barcode</label>
          <input value={form.barcode} onChange={(e) => update('barcode', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-sm font-medium">Cost</label>
          <input type="number" step="0.01" value={form.cost} onChange={(e) => update('cost', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
        <div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!!form.trackInventory} onChange={(e) => update('trackInventory', !!e.target.checked)} />
            <span className="text-sm"> Track inventory</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium">Availability</label>
          <select value={form.availabilityStatus} onChange={(e) => update('availabilityStatus', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
            <option value="in_stock">In stock</option>
            <option value="preorder">Preorder</option>
            <option value="vendor">Through vendor</option>
            <option value="used">Used</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Vendor</label>
          <select value={form.vendorId} onChange={(e) => update('vendorId', e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm">
            <option value="">Select vendor</option>
            {(vendors || []).map(v => <option key={v.id} value={v.id}>{v.name || v.legal_name || v.company_name || v.id}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={!!form.availableForPreorder} onChange={(e) => update('availableForPreorder', !!e.target.checked)} />
          <span className="text-sm"> Enable preorder</span>
        </label>
        {form.availableForPreorder && (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium">ETA</label>
              <input value={form.preorderEta} onChange={(e) => update('preorderEta', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Release date</label>
              <input type="date" value={form.preorderReleaseDate} onChange={(e) => update('preorderReleaseDate', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="block text-sm font-medium">Notes</label>
              <input value={form.preorderNotes} onChange={(e) => update('preorderNotes', e.target.value)} className="mt-1 block w-full border rounded px-2 py-1" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!!form.highlightActive} onChange={(e) => update('highlightActive', !!e.target.checked)} />
            <span className="text-sm"> Highlight</span>
          </label>
          {form.highlightActive && (
            <div className="mt-2">
              <input value={form.highlightLabel} onChange={(e) => update('highlightLabel', e.target.value)} placeholder="Label" className="mt-1 block w-full border rounded px-2 py-1" />
              <input value={form.highlightPriority} onChange={(e) => update('highlightPriority', e.target.value)} placeholder="Priority (numeric)" className="mt-2 block w-full border rounded px-2 py-1" />
            </div>
          )}
        </div>
        <div>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!!form.newArrival} onChange={(e) => update('newArrival', !!e.target.checked)} />
            <span className="text-sm"> New arrival</span>
          </label>
        </div>
        <div>
          <label className="block text-sm font-medium">Tags</label>
          <input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="comma separated tags" className="mt-1 block w-full border rounded px-2 py-1" />
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
