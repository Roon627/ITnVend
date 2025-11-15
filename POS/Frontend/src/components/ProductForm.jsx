import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FaUpload, FaStar, FaArrowLeft, FaArrowRight, FaTrash } from 'react-icons/fa';
import api from '../lib/api';
import SelectField from './SelectField';
import { makeSku } from '../lib/sku';
import { resolveMediaUrl } from '../lib/media';

// Shared ProductForm component used by POS product editor, Add Product page and vendor dashboard.
// Provides a superset of the legacy modal fields so both Add and Edit experiences stay in sync.

const AVAILABILITY_OPTIONS = [
  { id: 'in_stock', name: 'In stock' },
  { id: 'preorder', name: 'Preorder' },
  { id: 'vendor', name: 'Through vendor' },
  { id: 'used', name: 'Used / refurbished' },
];

const PRODUCT_TYPES = [
  { id: 'physical', name: 'Physical' },
  { id: 'electronics', name: 'Electronics' },
  { id: 'clothing', name: 'Clothing' },
  { id: 'digital', name: 'Digital' },
];

const AUDIENCE_OPTIONS = [
  { id: '', name: 'Audience (optional)' },
  { id: 'men', name: 'Men' },
  { id: 'women', name: 'Women' },
  { id: 'unisex', name: 'Unisex' },
];

const DELIVERY_OPTIONS = [
  { id: '', name: 'Delivery type' },
  { id: 'instant_download', name: 'Instant download' },
  { id: 'shipping', name: 'Shipping' },
  { id: 'pickup', name: 'In-store pickup' },
];

const WARRANTY_OPTIONS = [
  { id: '', name: 'Warranty term' },
  { id: 'none', name: 'No warranty' },
  { id: '1_year', name: '1 year limited' },
  { id: 'lifetime', name: 'Lifetime' },
];

const normalizeLookupOption = (entry) => {
  if (entry === undefined || entry === null) return null;
  if (typeof entry === 'string' || typeof entry === 'number') {
    const text = String(entry);
    return { id: text, name: text };
  }
  const id =
    entry.id ??
    entry.value ??
    entry.slug ??
    (typeof entry.name === 'string' ? entry.name : '');
  return {
    ...entry,
    id: id != null ? String(id) : entry.name,
    name: entry.name || entry.label || entry.value || entry.slug || String(id),
  };
};

const normalizeLookupList = (list = [], fallback = []) => {
  const source = Array.isArray(list) && list.length ? list : fallback;
  return source.map(normalizeLookupOption).filter(Boolean);
};

const safeParseGallery = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
};

const cleanNumberInput = (value, { fallback = '', allowFloat = true } = {}) => {
  if (value === undefined || value === null) return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  if (/^(unlimited|∞|n\/a|na)$/i.test(text)) return fallback;
  const pattern = allowFloat ? /^[-+]?\d+(\.\d+)?$/ : /^[-+]?\d+$/;
  if (!pattern.test(text)) return fallback;
  return text;
};

const safeNumber = (value) => {
  if (value === null || value === undefined) return '';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : '';
};

const cleanDateInput = (value) => {
  if (!value) return '';
  const text = String(value).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const [yearStr, monthStr, dayStr] = text.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return '';
  }
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day
    .toString()
    .padStart(2, '0')}`;
};

const buildLookupState = (lookupSource = {}) => ({
  brands: normalizeLookupList(lookupSource.brands),
  materials: normalizeLookupList(lookupSource.materials),
  colors: normalizeLookupList(lookupSource.colors),
  audiences: normalizeLookupList(
    lookupSource.audiences,
    AUDIENCE_OPTIONS
  ),
  deliveryTypes: normalizeLookupList(
    lookupSource.deliveryTypes,
    DELIVERY_OPTIONS
  ),
  warrantyTerms: normalizeLookupList(
    lookupSource.warrantyTerms,
    WARRANTY_OPTIONS
  ),
});

const buildInitialForm = (initial = {}) => {
  const derivedType =
    initial.productTypeLabel ||
    initial.product_type_label ||
    initial.type ||
    'physical';
  const tagValue = Array.isArray(initial.tags)
    ? initial.tags
        .map((tag) => (typeof tag === 'string' ? tag : tag?.name || tag?.label || ''))
        .filter(Boolean)
        .join(', ')
    : initial.tags || '';
  const galleryValue = Array.isArray(initial.gallery)
    ? initial.gallery
    : initial.gallery
    ? [initial.gallery]
    : [];
  return {
    id: initial.id || null,
    name: initial.name || '',
    price: cleanNumberInput(initial.price, { fallback: '' }),
    stock: cleanNumberInput(initial.stock, { fallback: '0', allowFloat: false }),
    sku: initial.sku || '',
    autoSku: initial.autoSku ?? initial.auto_sku ?? true,
    shortDescription: initial.shortDescription || initial.short_description || '',
    description: initial.description || '',
    technicalDetails: initial.technicalDetails || initial.technical_details || '',
    categoryId: initial.categoryId || initial.category_id || '',
    subcategoryId: initial.subcategoryId || initial.subcategory_id || '',
    subsubcategoryId: initial.subsubcategoryId || initial.subsubcategory_id || '',
    brandId: initial.brandId || initial.brand_id || '',
    materialId: initial.materialId || initial.material_id || '',
    colorId: initial.colorId || initial.color_id || '',
    type: derivedType,
    model: initial.model || initial.modelName || '',
    year: cleanNumberInput(initial.year, { fallback: '' , allowFloat: false }),
    barcode: initial.barcode || '',
    cost: cleanNumberInput(initial.cost, { fallback: '' }),
    trackInventory: initial.trackInventory ?? (initial.track_inventory !== 0),
    availabilityStatus: initial.availabilityStatus || initial.availability_status || 'in_stock',
    availableForPreorder: initial.availableForPreorder ?? !!initial.preorder_enabled,
    preorderEta: initial.preorderEta || initial.preorder_eta || '',
    preorderReleaseDate: cleanDateInput(initial.preorderReleaseDate || initial.preorder_release_date || ''),
    preorderNotes: initial.preorderNotes || initial.preorder_notes || '',
    vendorId: initial.vendorId || initial.vendor_id || '',
    highlightActive: initial.highlightActive ?? !!initial.highlight_active,
    highlightLabel: initial.highlightLabel || initial.highlight_label || '',
    highlightPriority:
      cleanNumberInput(
        initial.highlightPriority != null ? initial.highlightPriority : initial.highlight_priority,
        { fallback: '', allowFloat: false }
      ),
    newArrival: initial.newArrival ?? !!initial.new_arrival,
    image: initial.image || '',
    imageUrl: initial.imageUrl || initial.image_source || initial.image || '',
    imagePreview: initial.imagePreview || initial.image_source || initial.image || '',
    gallery: safeParseGallery(initial.gallery || galleryValue),
    tags: tagValue,
    audience: initial.audience || '',
    deliveryType: initial.deliveryType || initial.delivery_type || '',
    warrantyTerm: initial.warrantyTerm || initial.warranty_term || '',
    clothingSizes: initial.clothingSizes || initial.clothing_sizes || '',
    clothingCare: initial.clothingCare || initial.clothing_care || '',
    digitalDownloadUrl: initial.digitalDownloadUrl || initial.digital_download_url || '',
    digitalLicenseKey: initial.digitalLicenseKey || initial.digital_license_key || '',
    digitalActivationLimit: cleanNumberInput(
      initial.digitalActivationLimit != null
        ? initial.digitalActivationLimit
        : initial.digital_activation_limit,
      { fallback: '', allowFloat: false }
    ),
    digitalExpiry: cleanDateInput(initial.digitalExpiry || initial.digital_expiry || ''),
    digitalSupportUrl: initial.digitalSupportUrl || initial.digital_support_url || '',
  };
};

const galleryIdentifier = (entry, index) => {
  if (!entry) return `gallery-${index}`;
  if (typeof entry === 'string') return entry;
  return entry.id || entry.path || entry.url || `gallery-${index}`;
};

const galleryPreview = (entry) => {
  if (!entry) return '';
  if (typeof entry === 'string') return resolveMediaUrl(entry);
  return resolveMediaUrl(entry.url || entry.path || '');
};

const normalizeGalleryPayload = (gallery) => {
  if (!Array.isArray(gallery)) return [];
  return gallery
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') return entry;
      return entry.path || entry.url || null;
    })
    .filter(Boolean);
};

const formatTags = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return String(value)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
};

const parseOptionValue = (value) => {
  if (value === '' || value === null || value === undefined) return '';
  if (Number.isNaN(Number(value))) return value;
  return Number(value);
};

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
  createColor,
  createAudience,
  createDeliveryType,
  createWarrantyTerm,
  onChange: externalOnChange,
  onUploadImage: externalOnUploadImage,
  onUploadGallery: externalOnUploadGallery,
  onRemoveGalleryItem,
  onMoveGalleryItem,
  galleryUploading = false,
}) {
  const [form, setForm] = useState(() => buildInitialForm(initial));
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  const galleryInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [localCategories, setLocalCategories] = useState(Array.isArray(categoryTree) ? categoryTree : []);
  const [localLookups, setLocalLookups] = useState(() => buildLookupState(lookups));

  const notifyExternalChange = useCallback(
    (field, value, snapshot) => {
      if (typeof externalOnChange === 'function') {
        try {
          externalOnChange(field, value, snapshot);
        } catch (err) {
          console.debug('ProductForm externalOnChange failed', err);
        }
      }
    },
    [externalOnChange]
  );

  const update = useCallback(
    (field, value) => {
      setForm((prev) => {
        const nextValue = typeof value === 'function' ? value(prev[field]) : value;
        if (prev[field] === nextValue) return prev;
        const next = { ...prev, [field]: nextValue };
        notifyExternalChange(field, nextValue, next);
        return next;
      });
    },
    [notifyExternalChange]
  );

  const updateMany = useCallback(
    (patch = {}) => {
      setForm((prev) => {
        let changed = false;
        const next = { ...prev };
        Object.entries(patch).forEach(([field, rawValue]) => {
          const nextValue = typeof rawValue === 'function' ? rawValue(prev[field]) : rawValue;
          if (next[field] !== nextValue) {
            next[field] = nextValue;
            changed = true;
          }
        });
        if (!changed) return prev;
        Object.entries(patch).forEach(([field, rawValue]) => {
          const nextValue = typeof rawValue === 'function' ? rawValue(prev[field]) : rawValue;
          notifyExternalChange(field, nextValue, next);
        });
        return next;
      });
    },
    [notifyExternalChange]
  );

  useEffect(() => {
    setLocalLookups(buildLookupState(lookups));
  }, [lookups]);

  useEffect(() => {
    setLocalCategories(Array.isArray(categoryTree) ? categoryTree : []);
  }, [categoryTree]);

  useEffect(() => {
    setForm(buildInitialForm(initial));
    setErrors({});
  }, [initial]);

  const currentBrandName = useMemo(() => {
    if (!form.brandId) return '';
    return (localLookups?.brands || []).find((brand) => String(brand.id) === String(form.brandId))?.name || '';
  }, [form.brandId, localLookups]);

  const brandOptions = useMemo(() => localLookups?.brands || [], [localLookups]);
  const materialOptions = useMemo(() => localLookups?.materials || [], [localLookups]);
  const colorOptions = useMemo(() => localLookups?.colors || [], [localLookups]);
  const audienceOptions = useMemo(() => localLookups?.audiences || [], [localLookups]);
  const deliveryOptions = useMemo(() => localLookups?.deliveryTypes || [], [localLookups]);
  const warrantyOptions = useMemo(() => localLookups?.warrantyTerms || [], [localLookups]);

  const categoryOptions = useMemo(() => (localCategories || []).map((c) => ({ id: c.id, name: c.name })), [localCategories]);

  const subcategoryOptions = useMemo(() => {
    if (!form.categoryId) return [];
    const parent = (localCategories || []).find((c) => String(c.id) === String(form.categoryId));
    return (parent?.children || []).map((child) => ({ id: child.id, name: child.name }));
  }, [localCategories, form.categoryId]);

  const subsubcategoryOptions = useMemo(() => {
    if (!form.categoryId || !form.subcategoryId) return [];
    const parent = (localCategories || []).find((c) => String(c.id) === String(form.categoryId));
    const sub = (parent?.children || []).find((child) => String(child.id) === String(form.subcategoryId));
    return (sub?.children || []).map((child) => ({ id: child.id, name: child.name }));
  }, [localCategories, form.categoryId, form.subcategoryId]);

  useEffect(() => {
    if (!form.autoSku) return;
    const sku = makeSku({ brandName: currentBrandName || form.name, productName: form.name, year: form.year });
    setForm((prev) => {
      if (prev.sku === sku) return prev;
      const next = { ...prev, sku };
      notifyExternalChange('sku', sku, next);
      return next;
    });
  }, [form.autoSku, form.name, form.year, currentBrandName, notifyExternalChange]);

  const validate = useCallback(() => {
    const validationErrors = {};
    if (!form.name || !String(form.name).trim()) validationErrors.name = 'Name is required';
    const priceValue = parseFloat(form.price);
    if (!Number.isFinite(priceValue) || priceValue <= 0) validationErrors.price = 'Enter a valid price';
    const stockValue = parseInt(form.stock, 10);
    if (form.type === 'digital') {
      if (form.digitalActivationLimit) {
        const activationValue = parseInt(form.digitalActivationLimit, 10);
        if (!Number.isFinite(activationValue) || activationValue < 0) {
          validationErrors.digitalActivationLimit = 'Activation limit must be a non-negative number';
        }
      }
    } else if (!Number.isFinite(stockValue) || stockValue < 0) {
      validationErrors.stock = 'Stock must be 0 or greater';
    }
    if (form.barcode && !/^[0-9]{8,13}$/.test(form.barcode.trim())) {
      validationErrors.barcode = 'Barcode must be 8-13 digits';
    }
    return validationErrors;
  }, [form]);

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
  const createLookupEntry = async ({ endpoint, stateKey, name }) => {
    const trimmed = (name || '').trim();
    if (!trimmed) return null;
    try {
      const res = await api.post(endpoint, { name: trimmed });
      const inserted = res?.data || res;
      const item = normalizeLookupOption(inserted) || {
        id: inserted?.id || inserted?.value || trimmed,
        name: inserted?.name || trimmed,
      };
      setLocalLookups((prev) => ({
        ...prev,
        [stateKey]: normalizeLookupList([...(prev?.[stateKey] || []), item]),
      }));
      return item;
    } catch (err) {
      console.error(`create ${stateKey} failed`, err);
      return null;
    }
  };

  const internalCreateBrand = async (name) => {
    const item = await createLookupEntry({ endpoint: '/brands', stateKey: 'brands', name });
    if (item?.id) update('brandId', item.id);
    return !!item;
  };

  const internalCreateMaterial = async (name) => {
    const item = await createLookupEntry({ endpoint: '/materials', stateKey: 'materials', name });
    if (item?.id) update('materialId', item.id);
    return !!item;
  };

  const internalCreateColor = async (name) => {
    const item = await createLookupEntry({ endpoint: '/colors', stateKey: 'colors', name });
    if (item?.id) update('colorId', item.id);
    return !!item;
  };

  const internalCreateAudience = async (name) => {
    const item = await createLookupEntry({ endpoint: '/audiences', stateKey: 'audiences', name });
    if (item?.id) update('audience', item.id);
    return !!item;
  };

  const internalCreateDeliveryType = async (name) => {
    const item = await createLookupEntry({ endpoint: '/delivery-types', stateKey: 'deliveryTypes', name });
    if (item?.id) update('deliveryType', item.id);
    return !!item;
  };

  const internalCreateWarranty = async (name) => {
    const item = await createLookupEntry({ endpoint: '/warranty-terms', stateKey: 'warrantyTerms', name });
    if (item?.id) update('warrantyTerm', item.id);
    return !!item;
  };

  const handleImageFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    updateMany({ imagePreview: preview });
    if (typeof externalOnUploadImage === 'function') {
      externalOnUploadImage(file);
    } else {
      const uploaded = await uploadFile(file);
      if (uploaded) {
        updateMany({ image: uploaded, imageUrl: uploaded, imagePreview: uploaded });
      }
    }
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleGalleryFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const sanitizeGallery = (list = []) =>
      (Array.isArray(list) ? list : [])
        .map((entry) => {
          if (!entry) return null;
          if (typeof entry === 'string') return entry.trim();
          if (typeof entry === 'object') {
            return entry.path?.trim?.() || entry.url?.trim?.() || '';
          }
          return '';
        })
        .filter(Boolean);

    if (typeof externalOnUploadGallery === 'function') {
      try {
        externalOnUploadGallery(files);
      } catch (err) {
        console.debug('externalOnUploadGallery failed', err);
      } finally {
        if (galleryInputRef.current) galleryInputRef.current.value = '';
      }
      return;
    }

    const uploadedPaths = [];
    for (const file of files) {
      const uploaded = await uploadFile(file);
      if (uploaded) uploadedPaths.push(uploaded);
    }

    if (uploadedPaths.length) {
      setForm((prev) => {
        const nextGallery = sanitizeGallery([...(prev.gallery || []), ...uploadedPaths]);
        const next = { ...prev, gallery: nextGallery };
        notifyExternalChange('gallery', nextGallery, next);
        return next;
      });
    }

    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleGalleryRemove = (entryId) => {
    if (typeof onRemoveGalleryItem === 'function') {
      onRemoveGalleryItem(entryId);
      return;
    }
    setForm((prev) => {
      const filtered = (prev.gallery || []).filter((entry, index) => galleryIdentifier(entry, index) !== entryId);
      notifyExternalChange('gallery', filtered, { ...prev, gallery: filtered });
      return { ...prev, gallery: filtered };
    });
  };

  const handleGalleryMove = (entryId, direction) => {
    if (typeof onMoveGalleryItem === 'function') {
      onMoveGalleryItem(entryId, direction);
      return;
    }
    setForm((prev) => {
      const entries = [...(prev.gallery || [])];
      const index = entries.findIndex((entry, idx) => galleryIdentifier(entry, idx) === entryId);
      if (index === -1) return prev;
      const targetIndex = direction === 'left' ? index - 1 : direction === 'right' ? index + 1 : 0;
      if (targetIndex < 0 || targetIndex >= entries.length) return prev;
      const [removed] = entries.splice(index, 1);
      entries.splice(targetIndex, 0, removed);
      notifyExternalChange('gallery', entries, { ...prev, gallery: entries });
      return { ...prev, gallery: entries };
    });
  };

  const handleSubmit = (event) => {
    if (event?.preventDefault) event.preventDefault();
    const validationErrors = validate();
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) return;
    const normalizedType = form.type === 'digital' ? 'digital' : 'physical';
    const payload = {
      ...(form.id && { id: form.id }),
      name: form.name,
      price: Number(form.price),
      stock: Number(form.stock) || 0,
      sku: form.sku,
      autoSku: form.autoSku,
      shortDescription: form.shortDescription,
      description: form.description,
      technicalDetails: form.technicalDetails,
      categoryId: form.categoryId || null,
      subcategoryId: form.subcategoryId || null,
      subsubcategoryId: form.subsubcategoryId || null,
      brandId: form.type === 'digital' ? null : form.brandId || null,
      materialId: form.type === 'digital' ? null : form.materialId || null,
      colorId: form.type === 'digital' ? null : form.colorId || null,
      type: normalizedType,
      productTypeLabel: form.type || normalizedType,
      model: form.model,
      year: safeNumber(form.year),
      barcode: form.barcode,
      cost: form.cost ? parseFloat(form.cost) : 0,
      trackInventory: !!form.trackInventory,
      availabilityStatus: form.availabilityStatus,
      availableForPreorder: !!form.availableForPreorder,
      preorderEta: form.availableForPreorder ? form.preorderEta : '',
      preorderReleaseDate: form.availableForPreorder ? form.preorderReleaseDate : '',
      preorderNotes: form.availableForPreorder ? form.preorderNotes : '',
      vendorId: form.vendorId || '',
      highlightActive: !!form.highlightActive,
      highlightLabel: form.highlightLabel,
      highlightPriority: safeNumber(form.highlightPriority),
      newArrival: !!form.newArrival,
      image: form.image,
      imageUrl: form.imageUrl,
      gallery: normalizeGalleryPayload(form.gallery),
      tags: formatTags(form.tags),
      audience: form.audience || '',
      deliveryType: form.deliveryType || (form.type === 'digital' ? 'instant_download' : ''),
      warrantyTerm: form.warrantyTerm || '',
      clothingSizes: form.clothingSizes || '',
      clothingCare: form.clothingCare || '',
      digitalDownloadUrl: form.digitalDownloadUrl || '',
      digitalLicenseKey: form.digitalLicenseKey || '',
      digitalActivationLimit: form.digitalActivationLimit
        ? parseInt(form.digitalActivationLimit, 10) || null
        : null,
      digitalExpiry: form.digitalExpiry || '',
      digitalSupportUrl: form.digitalSupportUrl || '',
    };
    onSave(payload, { setFieldErrors: setErrors });
  };

  const renderTypeSpecificFields = () => {
    if (form.type === 'digital') {
      return (
        <div className="rounded-lg border bg-slate-50 p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-700">Digital fulfillment</p>
            <span className="text-xs text-slate-500">Only fields relevant to digital products</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <SelectField
              label="Delivery type"
              value={form.deliveryType || 'instant_download'}
              onChange={(value) => update('deliveryType', value)}
              options={deliveryOptions}
              allowCreate
              createLabel="New delivery"
              onCreate={createDeliveryType || internalCreateDeliveryType}
            />
            <SelectField
              label="Audience"
              value={form.audience}
              onChange={(value) => update('audience', value)}
              options={audienceOptions}
              allowCreate
              createLabel="New audience"
              onCreate={createAudience || internalCreateAudience}
            />
          </div>
          <div className="mt-3">
            <label className="text-sm font-medium text-slate-600">Download / license instructions</label>
            <textarea
              value={form.technicalDetails}
              onChange={(event) => update('technicalDetails', event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Share download links, license keys or activation instructions"
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-600">Download URL</label>
              <input
                type="url"
                value={form.digitalDownloadUrl}
                onChange={(event) => update('digitalDownloadUrl', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://files.itnvend.com/your-product"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Support / contact URL</label>
              <input
                type="url"
                value={form.digitalSupportUrl}
                onChange={(event) => update('digitalSupportUrl', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="https://support.itnvend.com/tickets"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-slate-600">License reference</label>
              <input
                value={form.digitalLicenseKey}
                onChange={(event) => update('digitalLicenseKey', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Optional license code"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Activation limit</label>
              <input
                type="number"
                min="0"
                value={safeNumber(form.digitalActivationLimit)}
                onChange={(event) => update('digitalActivationLimit', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Unlimited"
              />
              {errors.digitalActivationLimit && (
                <p className="mt-1 text-xs text-red-500">{errors.digitalActivationLimit}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">License expiry</label>
              <input
                type="date"
                value={form.digitalExpiry}
                onChange={(event) => update('digitalExpiry', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">Inventory tracking is disabled for digital items automatically.</p>
        </div>
      );
    }

    if (form.type === 'clothing') {
      return (
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="font-medium text-slate-700">Clothing details</p>
            <span className="text-xs text-slate-500">Focus on fit, fabric and audience</span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <SelectField
              label="Audience"
              value={form.audience}
              onChange={(value) => update('audience', value)}
              options={audienceOptions}
              allowCreate
              createLabel="New audience"
              onCreate={createAudience || internalCreateAudience}
            />
            <SelectField
              label="Material"
              value={form.materialId}
              onChange={(value) => update('materialId', value)}
              options={materialOptions}
              allowCreate
              createLabel="New material"
              onCreate={createMaterial || internalCreateMaterial}
              placeholder="Select material"
            />
            <SelectField
              label="Color"
              value={form.colorId}
              onChange={(value) => update('colorId', value)}
              options={colorOptions}
              placeholder="Color"
              allowCreate
              createLabel="New color"
              onCreate={createColor || internalCreateColor}
            />
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-600">Fit / style</label>
              <input
                value={form.model}
                onChange={(event) => update('model', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="E.g. relaxed fit, athletic"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Season / year</label>
              <input
                type="number"
                value={safeNumber(form.year)}
                onChange={(event) => update('year', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="2024"
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-600">Available sizes</label>
              <input
                value={form.clothingSizes}
                onChange={(event) => update('clothingSizes', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="XS, S, M, L, XL"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Care instructions</label>
              <textarea
                value={form.clothingCare}
                onChange={(event) => update('clothingCare', event.target.value)}
                rows={2}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Wash cold, do not tumble dry"
              />
            </div>
          </div>
        </div>
      );
    }

    const isElectronics = form.type === 'electronics';
    return (
      <div className="rounded-lg border bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="font-medium text-slate-700">
            {isElectronics ? 'Electronics specs' : 'Physical attributes'}
          </p>
          <span className="text-xs text-slate-500">
            {isElectronics ? 'Highlight warranty, delivery and technical traits' : 'Model, warranty & fulfillment'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-600">Model</label>
            <input
              value={form.model}
              onChange={(event) => update('model', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Model/variant"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Year</label>
            <input
              type="number"
              value={safeNumber(form.year)}
              onChange={(event) => update('year', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="2024"
            />
          </div>
          <SelectField
            label="Warranty"
            value={form.warrantyTerm}
            onChange={(value) => update('warrantyTerm', value)}
            options={warrantyOptions}
            allowCreate
            createLabel="New warranty"
            onCreate={createWarrantyTerm || internalCreateWarranty}
          />
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SelectField
            label="Delivery type"
            value={form.deliveryType || 'shipping'}
            onChange={(value) => update('deliveryType', value)}
            options={deliveryOptions}
            allowCreate
            createLabel="New delivery"
            onCreate={createDeliveryType || internalCreateDeliveryType}
          />
          <SelectField
            label="Material"
            value={form.materialId}
            onChange={(value) => update('materialId', value)}
            options={materialOptions}
            allowCreate
            createLabel="New material"
            onCreate={createMaterial || internalCreateMaterial}
            placeholder="Select material"
          />
          <SelectField
            label="Color"
            value={form.colorId}
            onChange={(value) => update('colorId', value)}
            options={colorOptions}
            placeholder="Color"
            allowCreate
            createLabel="New color"
            onCreate={createColor || internalCreateColor}
          />
        </div>
      </div>
    );
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-slate-600">Product name</label>
              <input
                value={form.name}
                onChange={(event) => update('name', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="e.g. Midnight Laptop"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Short description</label>
              <input
                value={form.shortDescription}
                onChange={(event) => update('shortDescription', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                maxLength={180}
                placeholder="Shown in cards & highlights"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-600">Tags (comma-separated)</label>
              <input
                value={form.tags}
                onChange={(event) => update('tags', event.target.value)}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="gaming, premium, featured"
              />
            </div>
          </div>
          <div className="space-y-3">
            <SelectField
              label="Product type"
              value={form.type}
              onChange={(value) => {
                const nextType = value || 'physical';
                update('type', nextType);
                if (nextType === 'digital') {
                  updateMany({ deliveryType: form.deliveryType || 'instant_download' });
                }
              }}
              options={PRODUCT_TYPES}
            />
            {form.type !== 'digital' && (
              <SelectField
                label="Brand"
                value={form.brandId}
                onChange={(value) => update('brandId', value)}
                options={brandOptions}
                placeholder="Select brand"
                allowCreate
                createLabel="New brand"
                onCreate={createBrand || internalCreateBrand}
              />
            )}
            <SelectField
              label="Availability status"
              value={form.availabilityStatus}
              onChange={(value) => update('availabilityStatus', value)}
              options={AVAILABILITY_OPTIONS}
            />
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Pricing & stock</p>
        <div className="mt-3 grid gap-4 md:grid-cols-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price</label>
            <input
              type="number"
              step="0.01"
              value={safeNumber(form.price)}
              onChange={(event) => update('price', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cost</label>
            <input
              type="number"
              step="0.01"
              value={safeNumber(form.cost)}
              onChange={(event) => update('cost', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Internal cost"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stock</label>
            <input
              type="number"
              value={safeNumber(form.stock)}
              onChange={(event) => update('stock', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Track inventory</label>
            <label className="mt-2 flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={!!form.trackInventory}
                onChange={(event) => update('trackInventory', !!event.target.checked)}
              />
              Enable stock tracking
            </label>
          </div>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium text-slate-600">SKU</label>
            <div className="mt-1 flex gap-3">
              <input
                value={form.sku}
                onChange={(event) => update('sku', event.target.value)}
                disabled={form.autoSku}
                className="flex-1 rounded-md border px-3 py-2 text-sm"
              />
              <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={!!form.autoSku} onChange={(event) => update('autoSku', !!event.target.checked)} />
                Auto
              </label>
            </div>
            {form.autoSku && (
              <p className="mt-1 text-xs text-slate-500">Auto SKU preview: {makeSku({ brandName: currentBrandName || form.name, productName: form.name, year: form.year })}</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Barcode</label>
            <input
              value={form.barcode}
              onChange={(event) => update('barcode', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="EAN / UPC"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-600">Vendor assignment</label>
            <select
              value={form.vendorId}
              onChange={(event) => update('vendorId', event.target.value)}
              className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="">POS inventory</option>
              {(vendors || []).map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name || vendor.legal_name || vendor.company_name || `Vendor ${vendor.id}`}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Classification</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <SelectField
            label="Category"
            value={form.categoryId}
            onChange={(value) => {
              const parsed = parseOptionValue(value);
              updateMany({ categoryId: parsed, subcategoryId: '', subsubcategoryId: '' });
            }}
            options={categoryOptions}
            placeholder="Select category"
          />
          <SelectField
            label="Subcategory"
            value={form.subcategoryId}
            onChange={(value) => {
              const parsed = parseOptionValue(value);
              updateMany({ subcategoryId: parsed, subsubcategoryId: '' });
            }}
            options={subcategoryOptions}
            placeholder="Select subcategory"
            disabled={!subcategoryOptions.length}
          />
          <SelectField
            label="Sub-subcategory"
            value={form.subsubcategoryId}
            onChange={(value) => update('subsubcategoryId', parseOptionValue(value))}
            options={subsubcategoryOptions}
            placeholder="Select child"
            disabled={!subsubcategoryOptions.length}
          />
        </div>
      </section>

      {renderTypeSpecificFields()}

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-slate-700">Media</p>
        <div className="mt-3 grid gap-5 md:grid-cols-[1fr_1fr]">
          <div className="rounded-lg border bg-slate-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-700">Primary photo</p>
                <p className="text-xs text-slate-500">3:2 or square images work best.</p>
              </div>
              <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                disabled={uploading}
              >
                <FaUpload /> {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
            {form.imagePreview || form.image ? (
              <img
                src={form.imagePreview || form.image}
                alt={form.name || 'Product preview'}
                className="mt-4 h-48 w-full rounded-lg object-cover"
              />
            ) : (
              <div className="mt-4 flex h-48 items-center justify-center rounded-lg border border-dashed text-xs text-slate-400">
                No image yet
              </div>
            )}
            <input
              value={form.imageUrl}
              onChange={(event) => update('imageUrl', event.target.value)}
              className="mt-3 w-full rounded-md border px-3 py-2 text-sm"
              placeholder="…or paste an existing URL"
            />
          </div>
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-700">Gallery</p>
              <div className="flex items-center gap-2">
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleGalleryFiles}
                />
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                  disabled={galleryUploading}
                >
                  <FaUpload /> {galleryUploading ? 'Uploading…' : 'Add photos'}
                </button>
              </div>
            </div>
            {(form.gallery || []).length ? (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                {(form.gallery || []).map((entry, index) => {
                  const entryId = galleryIdentifier(entry, index);
                  const preview = galleryPreview(entry);
                  return (
                    <div key={entryId} className="group relative overflow-hidden rounded-lg border bg-slate-50">
                      {preview ? (
                        <img src={preview} alt={`Gallery ${index + 1}`} className="h-28 w-full object-cover" />
                      ) : (
                        <div className="flex h-28 w-full items-center justify-center text-xs text-slate-500">No preview</div>
                      )}
                      {index === 0 && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          <FaStar className="h-3 w-3" /> Cover
                        </span>
                      )}
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition group-hover:bg-black/60 group-hover:opacity-100">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => handleGalleryMove(entryId, 'left')}
                            disabled={index === 0}
                            className="rounded-full bg-white/90 p-1 text-slate-600 hover:bg-white disabled:opacity-40"
                          >
                            <FaArrowLeft />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleGalleryMove(entryId, 'right')}
                            disabled={index === (form.gallery || []).length - 1}
                            className="rounded-full bg-white/90 p-1 text-slate-600 hover:bg-white disabled:opacity-40"
                          >
                            <FaArrowRight />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleGalleryRemove(entryId)}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white px-2 py-0.5 text-xs font-medium text-red-600"
                        >
                          <FaTrash /> Remove
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-500">No gallery photos yet.</p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-slate-600">Description</label>
              <textarea
                value={form.description}
                onChange={(event) => update('description', event.target.value)}
                rows={4}
                className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                placeholder="Tell shoppers what makes this product special"
              />
            </div>
            {form.type !== 'digital' && (
              <div>
                <label className="text-sm font-medium text-slate-600">Technical details / specs</label>
                <textarea
                  value={form.technicalDetails}
                  onChange={(event) => update('technicalDetails', event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Use JSON, bullet lists or simple text"
                />
              </div>
            )}
          </div>
          <div className="rounded-xl border bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-700">Highlights</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!form.highlightActive} onChange={(event) => update('highlightActive', !!event.target.checked)} />
              Show highlight badge
            </label>
            {form.highlightActive && (
              <div className="mt-3 space-y-2">
                <input
                  value={form.highlightLabel}
                  onChange={(event) => update('highlightLabel', event.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Badge label (e.g. Hot, Trending)"
                />
                <input
                  type="number"
                  value={safeNumber(form.highlightPriority)}
                  onChange={(event) => update('highlightPriority', event.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Priority (numeric)"
                />
              </div>
            )}
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={!!form.newArrival} onChange={(event) => update('newArrival', !!event.target.checked)} />
              Mark as new arrival
            </label>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" checked={!!form.availableForPreorder} onChange={(event) => update('availableForPreorder', !!event.target.checked)} />
                Enable preorder messaging
              </label>
              {form.availableForPreorder && (
                <div className="mt-3 space-y-2 text-sm">
                  <input
                    value={form.preorderEta}
                    onChange={(event) => update('preorderEta', event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="ETA (e.g. Ships in 3 weeks)"
                  />
                  <input
                    type="date"
                    value={form.preorderReleaseDate}
                    onChange={(event) => update('preorderReleaseDate', event.target.value)}
                    className="w-full rounded-md border px-3 py-2"
                  />
                  <textarea
                    value={form.preorderNotes}
                    onChange={(event) => update('preorderNotes', event.target.value)}
                    rows={2}
                    className="w-full rounded-md border px-3 py-2"
                    placeholder="Preorder notes"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {typeof extraFields === 'function' ? extraFields({ form, update, updateMany, setForm }) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={saving || uploading}
        >
          {saving || uploading ? 'Saving…' : 'Save product'}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm">
          Cancel
        </button>
        {Object.keys(errors).length > 0 && (
          <div className="text-sm text-red-600">
            {Object.values(errors).map((message, index) => (
              <div key={index}>{message}</div>
            ))}
          </div>
        )}
      </div>
    </form>
  );
}
