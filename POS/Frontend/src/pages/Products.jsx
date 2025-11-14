import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import ProductForm from '../modules/product/ProductForm';
import { Link } from 'react-router-dom';
import { FaEdit, FaTrash, FaUpload, FaTimes, FaPlus, FaFileImport, FaExternalLinkAlt, FaArrowLeft, FaArrowRight, FaStar, FaBarcode, FaTags, FaBox, FaHashtag } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import { resolveMediaUrl } from '../lib/media';
import SelectField from '../components/SelectField';
import TagChips from '../components/TagChips';
import SpecPreview from '../components/SpecPreview';
import AvailabilityTag from '../components/AvailabilityTag';
import { makeSku } from '../lib/sku';

const EMPTY_FORM = {
  name: '',
  price: '',
  stock: '',
  category: '',
  subcategory: '',
  categoryId: '',
  subcategoryId: '',
  subsubcategoryId: '',
  type: 'physical',
  brandId: '',
  materialId: '',
  colorId: '',
  audience: '',
  deliveryType: '',
  warrantyTerm: '',
  shortDescription: '',
  sku: '',
  autoSku: true,
  barcode: '',
  cost: '',
  image: '',
  imageUrl: '',
  description: '',
  technicalDetails: '',
  trackInventory: true,
  availableForPreorder: false,
  preorderReleaseDate: '',
  preorderNotes: '',
  preorderEta: '',
  tags: [],
  model: '',
  year: '',
  availabilityStatus: 'in_stock',
  vendorId: '',
  highlightActive: false,
  highlightLabel: '',
  highlightPriority: '',
  newArrival: false,
  gallery: [],
};

const AVAILABILITY_STATUS_OPTIONS = [
  { id: 'in_stock', name: 'In Stock' },
  { id: 'preorder', name: 'Preorder' },
  { id: 'vendor', name: 'Through Vendor' },
  { id: 'used', name: 'Used' },
];

const AVAILABILITY_STATUS_LABELS = AVAILABILITY_STATUS_OPTIONS.reduce((map, option) => {
  map[option.id] = option.name;
  return map;
}, {});

const normalizeAvailabilityStatus = (value, fallback = 'in_stock') => {
  if (value == null) return fallback;
  const normalized = value.toString().toLowerCase();
  return AVAILABILITY_STATUS_LABELS[normalized] ? normalized : fallback;
};

const normalizeVendorId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

function normalizeKey(key) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function createRowAccessor(row) {
  const map = {};
  Object.entries(row).forEach(([key, value]) => {
    map[normalizeKey(key)] = (value ?? '').toString().trim();
  });
  return (aliases) => {
    for (const alias of aliases) {
      const normalized = normalizeKey(alias);
      if (Object.prototype.hasOwnProperty.call(map, normalized)) {
        return map[normalized];
      }
    }
    return '';
  };
}

function tokenizeCsv(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const headers = tokenizeCsv(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const tokens = tokenizeCsv(line);
    const row = {};
    headers.forEach((header, index) => {
      row[header] = tokens[index] ?? '';
    });
    return row;
  });
  return { headers, rows };
}

const slugifySegment = (value = '') =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

function buildProductUploadCategory(category, subcategory, subsubcategory, productLabel) {
  const segments = [category, subcategory, subsubcategory]
    .map((value) => slugifySegment(value))
    .filter(Boolean);
  const productSegment = slugifySegment(productLabel);
  if (productSegment) segments.push(productSegment);
  return ['products', ...segments].join('/');
}

function idsMatch(a, b) {
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function resolveCategoryLabelsFromDraft(draft = {}, categoryTree = []) {
  const normalizedDraft = draft || {};
  const tree = Array.isArray(categoryTree) ? categoryTree : [];

  let categoryName = (normalizedDraft.category || '').toString().trim();
  let subcategoryName = (normalizedDraft.subcategory || '').toString().trim();
  let subsubcategoryName = (normalizedDraft.subsubcategory || '').toString().trim();

  const findCategoryById = (id) => tree.find((cat) => idsMatch(cat.id, id));
  const findSubcategoryById = (id) => {
    for (const category of tree) {
      if (!Array.isArray(category.children)) continue;
      const hit = category.children.find((child) => idsMatch(child.id, id));
      if (hit) return { category, subcategory: hit };
    }
    return null;
  };
  const findSubsubcategoryById = (id) => {
    for (const category of tree) {
      if (!Array.isArray(category.children)) continue;
      for (const subcategory of category.children) {
        if (!Array.isArray(subcategory.children)) continue;
        const hit = subcategory.children.find((child) => idsMatch(child.id, id));
        if (hit) return { category, subcategory, subsubcategory: hit };
      }
    }
    return null;
  };

  if (!categoryName && normalizedDraft.categoryId) {
    const found = findCategoryById(normalizedDraft.categoryId);
    if (found) categoryName = found.name || '';
  }
  if ((!subcategoryName || !categoryName) && normalizedDraft.subcategoryId) {
    const found = findSubcategoryById(normalizedDraft.subcategoryId);
    if (found) {
      subcategoryName = subcategoryName || found.subcategory.name || '';
      categoryName = categoryName || found.category.name || '';
    }
  }
  if ((!subsubcategoryName || !subcategoryName || !categoryName) && normalizedDraft.subsubcategoryId) {
    const found = findSubsubcategoryById(normalizedDraft.subsubcategoryId);
    if (found) {
      subsubcategoryName = subsubcategoryName || found.subsubcategory.name || '';
      subcategoryName = subcategoryName || found.subcategory.name || '';
      categoryName = categoryName || found.category.name || '';
    }
  }

  return {
    categoryName,
    subcategoryName,
    subsubcategoryName,
  };
}

function buildUploadCategoryFromDraft(draft = {}, categoryTree = []) {
  const { categoryName, subcategoryName, subsubcategoryName } = resolveCategoryLabelsFromDraft(draft, categoryTree);
  const label =
    draft.slug ||
    draft.sku ||
    (draft.id ? `product-${draft.id}` : '') ||
    draft.name ||
    draft.model ||
    'new-product';
  return buildProductUploadCategory(categoryName, subcategoryName, subsubcategoryName, label);
}

const formatGalleryEntries = (gallery) => {
  if (!Array.isArray(gallery)) return [];
  return gallery
    .map((entry, index) => {
      const path = typeof entry === 'string' ? entry.trim() : entry?.path?.trim?.() || '';
      if (!path) return null;
      return {
        id: `${path}-${index}-${Date.now()}`,
        path,
        url: resolveMediaUrl(path),
      };
    })
    .filter(Boolean);
};

const galleryPayloadFromState = (gallery) =>
  (Array.isArray(gallery) ? gallery : [])
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      return entry?.path || entry?.url || '';
    })
    .map((value) => value.trim())
    .filter(Boolean);

const buildGalleryEntry = (pathOrUrl, absoluteUrl) => {
  const candidate = (pathOrUrl || absoluteUrl || '').trim();
  if (!candidate) return null;
  const resolved = resolveMediaUrl(absoluteUrl || pathOrUrl || '');
  if (!resolved) return null;
  const id = `${candidate}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    path: pathOrUrl || absoluteUrl || '',
    url: resolved,
  };
};

const addGalleryEntry = (gallery = [], entry) => {
  if (!entry) return gallery;
  const exists = gallery.some((img) => (img.path || img.url) === (entry.path || entry.url));
  if (exists) return gallery;
  return [...gallery, entry];
};

function mapCsvRowToProduct(row) {
  const get = createRowAccessor(row);
  const name = get(['name', 'product', 'productname', 'title']);
  const priceRaw = get(['price', 'unitprice', 'sellingprice', 'amount']);
  const price = priceRaw !== '' ? parseFloat(priceRaw) : NaN;
  const stockRaw = get(['stock', 'qty', 'quantity']);
  const stock = stockRaw !== '' ? parseInt(stockRaw, 10) || 0 : 0;
  const costRaw = get(['cost', 'costprice']);
  const cost = costRaw !== '' ? parseFloat(costRaw) : undefined;
  const technicalDetails = get(['technicaldetails', 'specs', 'specifications']);
  const image = get(['image', 'imagepath']);
  const imageUrl = get(['imageurl', 'url', 'imagelink']);
  const trackRaw = get(['trackinventory', 'inventorytrack', 'track']);
  let trackInventory = true;
  if (trackRaw) {
    const lowered = trackRaw.toLowerCase();
    trackInventory = !['no', 'false', '0', 'n'].includes(lowered);
  }
  const product = {
    name,
    price,
    stock,
    category: get(['category']),
    subcategory: get(['subcategory', 'subcat']),
    sku: get(['sku', 'itemsku']),
    barcode: get(['barcode', 'ean', 'upc']),
    cost,
    description: get(['description', 'summary']),
    technicalDetails,
    image,
    imageUrl,
    trackInventory,
  };
  const valid = Boolean(product.name && Number.isFinite(product.price));
  const issues = [];
  if (!product.name) issues.push('Missing name');
  if (!Number.isFinite(product.price)) issues.push('Missing price');
  return { product, valid, issues, source: row };
}

function _computeAutoSkuPreview(brandName = '', productName = '', year) {
  const brandSegment = (brandName || 'GN')
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 3)
    .toUpperCase() || 'GN';
  const nameSegment = (productName || 'Product')
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join('')
    .slice(0, 4)
    .toUpperCase() || 'PRD';
  const yearSegment = year && Number.isFinite(Number(year))
    ? Number(year).toString().slice(-2).padStart(2, '0')
    : new Date().getFullYear().toString().slice(-2);
  return `${brandSegment}${nameSegment}-${yearSegment}`;
}

function TechnicalDetailsPreview({ value }) {
  if (!value || !value.trim()) {
    return <p className="text-sm text-slate-500">No technical details provided.</p>;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return (
        <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside">
          {parsed.map((item, index) => (
            <li key={index}>{typeof item === 'string' ? item : JSON.stringify(item)}</li>
          ))}
        </ul>
      );
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <dl className="divide-y divide-slate-200 text-sm">
          {Object.entries(parsed).map(([key, val]) => (
            <div key={key} className="py-1.5 flex justify-between gap-2">
              <dt className="font-medium text-slate-600">{key}</dt>
              <dd className="text-slate-700 text-right">
                {typeof val === 'string' ? val : JSON.stringify(val)}
              </dd>
            </div>
          ))}
        </dl>
      );
    }
  } catch {
    // ignore parse errors
  }
  const lines = value.split(/\r?\n/).filter((line) => line.trim());
  return (
    <ul className="space-y-1 text-sm text-slate-600 list-disc list-inside">
      {lines.map((line, index) => (
        <li key={index}>{line}</li>
      ))}
    </ul>
  );
}

function ProductInsight({ product, formatCurrency, lookups }) {
  if (!product) {
    return (
      <div className="text-sm text-slate-500">Select a product to see stock levels, pricing, and technical notes.</div>
    );
  }
  const previewSrc =
    resolveMediaUrl(product.image_source || product.imageUrl || product.image) ||
    (Array.isArray(product.gallery) && product.gallery.length
      ? resolveMediaUrl(product.gallery[0])
      : null);
  // tags normalized on demand
  const availabilityStatus = normalizeAvailabilityStatus(product.availability_status || product.availabilityStatus || (product.preorder_enabled ? 'preorder' : null));
  const availabilityLabel = AVAILABILITY_STATUS_LABELS[availabilityStatus] || AVAILABILITY_STATUS_LABELS.in_stock;
  // Meta fields (exclude Availability/Brand/Type since those are shown in the main info grid)
  const productTypeLabel = product.product_type_label || product.productTypeLabel || product.type || 'physical';
  const meta = [
    { label: 'Vendor', value: product.vendor_name || product.vendorName || (product.vendor_id ? `#${product.vendor_id}` : null) },
    { label: 'Material', value: product.material || product.materialName || product.materialId },
    { label: 'Color', value: product.color || product.colorName || product.colorId },
    { label: 'Year', value: product.year },
    { label: 'Warranty', value: product.warranty_term || product.warrantyTerm },
    { label: 'Delivery', value: product.delivery_type || product.deliveryType },
    { label: 'Sizes', value: product.clothing_sizes || product.clothingSizes },
    { label: 'Care', value: product.clothing_care || product.clothingCare },
    { label: 'Download URL', value: product.digital_download_url || product.digitalDownloadUrl },
    { label: 'License key', value: product.digital_license_key || product.digitalLicenseKey },
    {
      label: 'Activation limit',
      value:
        product.digital_activation_limit != null
          ? product.digital_activation_limit
          : product.digitalActivationLimit,
    },
    { label: 'License expiry', value: product.digital_expiry || product.digitalExpiry },
  ].filter((m) => m.value || m.value === 0);

  const categoryPath = [product.category, product.subcategory, product.subsubcategory].filter(Boolean).join(' › ');
  const brandDisplay =
    product.brandName ||
    (lookups?.brands || []).find((b) => b.id === (product.brand_id || product.brandId))?.name ||
    product.brand ||
    product.brand_id ||
    '—';

  return (
    <div className="relative bg-white rounded-lg border border-slate-100 p-4 shadow-sm">
      {/* Action buttons moved to the Product insight header (handled by parent) */}

      <div className="grid grid-cols-1 gap-4">
        <div className="flex items-center justify-center">
          <div className="w-full max-w-md">
            {previewSrc ? (
              <img src={previewSrc} alt={product.name} className="w-full h-56 object-cover rounded-md shadow-sm border" />
            ) : (
              <div className="w-full h-56 rounded-md border border-dashed flex items-center justify-center text-slate-400 text-sm">No image</div>
            )}
          </div>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 pr-2">
            <h3 className="text-lg font-semibold text-slate-800 leading-tight">{product.name}</h3>
            <p className="text-sm text-slate-500 mt-1">{product.short_description || product.shortDescription}</p>
          </div>

          <div className="text-right">
            <div className="text-xl font-bold text-slate-800">{formatCurrency(product.price || 0)}</div>
            <div className="text-sm text-slate-500">{product.stock ?? 0} in stock</div>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div className="flex items-start gap-2">
              <FaHashtag className="text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs text-slate-500">SKU</div>
                <div className="font-semibold text-slate-800 break-all">{product.sku || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FaBarcode className="text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs text-slate-500">Barcode</div>
                <div className="font-semibold text-slate-800 break-all">{product.barcode || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FaBox className="text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs text-slate-500">Category</div>
                <div className="font-semibold text-slate-800">{categoryPath || '—'}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <FaTags className="text-slate-400 mt-0.5" />
              <div>
                <div className="text-xs text-slate-500">Availability</div>
                <div className="font-semibold text-slate-800">{availabilityLabel}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <div className="text-xs text-slate-500">Brand</div>
                  <div className="font-semibold text-slate-800">{brandDisplay}</div>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <div className="text-xs text-slate-500">Type</div>
                <div className="font-semibold text-slate-800 capitalize">{productTypeLabel || '—'}</div>
              </div>
            </div>
          </div>

            {meta.length > 0 && (
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {meta.map((m) => (
                  <div key={m.label} className="bg-slate-50 rounded px-2 py-1">
                    <div className="text-slate-400 text-[11px]">{m.label}</div>
                    <div className="font-medium text-slate-800 text-sm truncate">{m.value}</div>
                  </div>
                ))}
              </div>
            )}
        </div>

        {product.description && (
          <div className="mt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>
          </div>
        )}

        <div className="mt-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Technical details</h4>
          <TechnicalDetailsPreview value={product.technical_details || product.technicalDetails || ''} />
        </div>
      </div>
    </div>
  );
}

function ProductModal({
  open,
  draft,
  onClose,
  onChange,
  onSave,
  onUploadImage,
  onUploadGallery = () => {},
  onRemoveGalleryItem = () => {},
  onMoveGalleryItem = () => {},
  galleryUploading = false,
  uploading,
  saving,
  stockChanged,
  stockReason,
  onStockReasonChange,
  categoryTree,
  lookups,
  onTagsChanged,
  vendors = [],
  createBrand = async () => false,
  createMaterial = async () => false,
}) {
  const fileInputRef = useRef(null);
  const galleryFileInputRef = useRef(null);
  const modalRef = useRef(null);
  const [modalVisible, setModalVisible] = useState(false);
  // close on Escape for convenience
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // manage enter/exit animation state
  useEffect(() => {
    if (open) {
      // allow next tick to trigger CSS transition
      const id = setTimeout(() => setModalVisible(true), 10);
      return () => clearTimeout(id);
    }
    setModalVisible(false);
  }, [open]);

  // focus trap: keep focus within modal while open
  useEffect(() => {
    if (!open) return undefined;
    const root = modalRef.current;
    if (!root) return undefined;
    const focusable = Array.from(
      root.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])')
    ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);
    if (focusable.length) focusable[0].focus();

    const onKey = (e) => {
      if (e.key !== 'Tab') return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  if (!open || !draft) return null;
  const previewSrc =
    resolveMediaUrl(draft.imagePreview || draft.imageUrl || draft.image) ||
    (Array.isArray(draft.gallery) && draft.gallery.length ? draft.gallery[0].url : null);

  const handleFieldChange = (key) => (event) => {
    // support being called with synthetic event or direct value
    if (event && event.target) {
      const { target } = event;
      const { type } = target;
      if (type === 'checkbox') {
        onChange(key, !!target.checked);
        return;
      }
      if ('value' in target) {
        onChange(key, target.value);
        return;
      }
    }
    // direct value
    onChange(key, event);
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="product-modal">
      <div ref={modalRef} className={`bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col transform transition-all duration-300 ease-out ${modalVisible ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'}`} style={{outline: 'none'}} tabIndex={-1} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 id="product-modal-title" className="text-xl font-semibold text-slate-800">{draft.id ? 'Edit product' : 'Add product'}</h2>
            <p className="text-sm text-slate-500">Edit product details. Changes are saved to the POS backend.</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/manage-lookups" target="_blank" className="text-sm text-blue-600 hover:text-blue-800">Manage lookups</Link>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-slate-100 text-slate-500"
              aria-label="Close product editor"
            >
              <FaTimes />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5 grid gap-6 md:grid-cols-3">
          {/* Main form spans two columns on md+ */}
          <div className="md:col-span-2 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-600">
                Name
                <input
                  value={draft.name}
                  onChange={handleFieldChange('name')}
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Short description
                <input value={draft.shortDescription || ''} onChange={handleFieldChange('shortDescription')} maxLength={180} className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
              <div className="">
                <label className="text-sm font-medium text-slate-600">Brand</label>
                <div className="mt-1 flex items-center gap-2">
                  <SelectField
                    value={draft.brandId || ''}
                    onChange={(v) => handleFieldChange('brandId')({ target: { value: v } })}
                    options={(lookups?.brands||[]).map(b=>({id:b.id,name:b.name}))}
                    placeholder="Select brand"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const name = window.prompt('New brand name');
                      if (!name) return;
                      await createBrand(name);
                    }}
                    className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-green-50 text-green-700 border border-green-100 hover:bg-green-100"
                    aria-label="Add brand"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Type</label>
                <div className="mt-1">
                  <SelectField labelHidden value={draft.type || ''} onChange={(v) => handleFieldChange('type')({ target: { value: v } })} options={[{id:'physical',name:'Physical'},{id:'digital',name:'Digital'}]} placeholder="Select type" />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Vendor (optional)</label>
                <SelectField
                  value={draft.vendorId || ''}
                  onChange={(v) => handleFieldChange('vendorId')({ target: { value: v } })}
                  options={[
                    { id: '', name: 'Not linked' },
                    ...vendors.map((vendor) => ({
                      id: String(vendor.id),
                      name: vendor.legal_name || vendor.contact_person || vendor.email || `Vendor #${vendor.id}`,
                    })),
                  ]}
                  placeholder={vendors.length ? 'Select vendor' : 'No active vendors'}
                  disabled={!vendors.length}
                />
                <p className="mt-1 text-xs text-slate-500">Linked vendors become visible on the store.</p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Material</label>
                <div className="mt-1 flex items-center gap-2">
                  <SelectField
                    value={draft.materialId || ''}
                    onChange={(v) => handleFieldChange('materialId')({ target: { value: v } })}
                    options={(lookups?.materials||[]).map(m=>({id:m.id,name:m.name}))}
                    placeholder="Select material"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const name = window.prompt('New material name');
                      if (!name) return;
                      await createMaterial(name);
                    }}
                    className="inline-flex items-center px-3 py-2 rounded-md text-sm bg-green-50 text-green-700 border border-green-100 hover:bg-green-100"
                    aria-label="Add material"
                  >
                    Add
                  </button>
                </div>
              </div>

              <label className="text-sm font-medium text-slate-600">
                Model
                <input
                  value={draft.model || ''}
                  onChange={handleFieldChange('model')}
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Model / variant"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <label className="text-sm font-medium text-slate-600">
          Price
                <input
                  value={draft.price}
                  onChange={handleFieldChange('price')}
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Cost
                <input
                  value={draft.cost}
                  onChange={handleFieldChange('cost')}
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
              <label className="text-sm font-medium text-slate-600">
                Stock
                <input
                  value={draft.stock}
                  onChange={handleFieldChange('stock')}
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-600">Availability status</label>
                <select
                  value={draft.availabilityStatus || 'in_stock'}
                  onChange={handleFieldChange('availabilityStatus')}
                  className="mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500 mt-1">Displayed on POS and storefront cards.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3 mt-2">
                <input type="checkbox" checked={draft.trackInventory} onChange={handleFieldChange('trackInventory')} className="rounded border-slate-300 text-blue-600" />
                <span className="text-sm font-medium text-slate-600">Track inventory</span>
              </div>
              {stockChanged && (
                <div>
                  <label className="text-sm font-medium text-slate-600">Reason for stock change (required)</label>
                  <input type="text" value={stockReason} onChange={(e) => onStockReasonChange && onStockReasonChange(e.target.value)} placeholder="e.g. Received shipment" className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
            </div>

            <div className="mt-4 border rounded-lg p-4 bg-slate-50 space-y-3">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={draft.availableForPreorder}
                  onChange={handleFieldChange('availableForPreorder')}
                  className="rounded border-slate-300 text-blue-600"
                />
                Available for preorder
              </label>
              <p className="text-xs text-slate-500">
                Enable this to flag the product as preorder-only. Customers will see preorder messaging in the POS and storefront.
              </p>
              {draft.availableForPreorder && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <label className="text-sm font-medium text-slate-600">
                      Release date
                      <input
                        type="date"
                        value={draft.preorderReleaseDate || ''}
                        onChange={handleFieldChange('preorderReleaseDate')}
                        className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                    <label className="text-sm font-medium text-slate-600 sm:col-span-2">
                      ETA / Shipping window
                      <input
                        type="text"
                        value={draft.preorderEta || ''}
                        onChange={handleFieldChange('preorderEta')}
                        placeholder="e.g. Ships mid-July"
                        className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </label>
                  </div>
                  <label className="text-sm font-medium text-slate-600">
                    Preorder notes
                    <textarea
                      value={draft.preorderNotes || ''}
                      onChange={handleFieldChange('preorderNotes')}
                      rows={3}
                      className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional message that appears on preorder confirmations."
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!!draft.highlightActive}
                    onChange={handleFieldChange('highlightActive')}
                    className="rounded border-slate-300 text-blue-600"
                  />
                  Feature on storefront hero
                </label>
                {draft.highlightActive && draft.highlightLabel && (
                  <span className="text-xs font-semibold uppercase tracking-widest text-rose-500">
                    {draft.highlightLabel}
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Highlighted products appear in the public “Hot & New” carousel. Use priority to control ordering (higher = sooner).
              </p>
              {draft.highlightActive && (
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Badge label
                    <input
                      value={draft.highlightLabel || ''}
                      onChange={handleFieldChange('highlightLabel')}
                      maxLength={40}
                      className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Hot drop"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Priority
                    <input
                      type="number"
                      value={draft.highlightPriority || ''}
                      onChange={handleFieldChange('highlightPriority')}
                      className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Higher shows first"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="mt-3 border rounded-lg p-4 bg-white">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={!!draft.newArrival}
                  onChange={handleFieldChange('newArrival')}
                  className="rounded border-slate-300 text-blue-600"
                />
                Mark as new arrival
              </label>
              <p className="mt-1 text-xs text-slate-500">Products marked as new arrivals appear in the storefront "New arrivals" section of the header carousel.</p>
            </div>

            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <SelectField
                label="Category"
                value={draft.categoryId || ''}
                onChange={async (v) => {
                  // refresh lookups/tree in case user added categories in Manage Lookups
                  try { if (typeof onTagsChanged === 'function') await onTagsChanged(); } catch { /* ignore */ }
                  const parsedV = (v === '' || v === null || v === undefined) ? '' : (Number.isNaN(Number(v)) ? v : Number(v));
                  const found = categoryTree.find((c) => c.id === parsedV || String(c.id) === String(v));
                  const updatedDraft = { ...(draft || {}), categoryId: parsedV, subcategoryId: '', subsubcategoryId: '', category: found ? found.name : '' };
                  // perform atomic update to avoid transient stale state for dependent selects
                  onChange && onChange('categoryId', parsedV, updatedDraft);
                }}
                options={categoryTree.map((c) => ({ id: c.id, name: c.name }))}
                placeholder="Select category"
              />
              <SelectField
                label="Subcategory"
                value={draft.subcategoryId || ''}
                onChange={async (v) => {
                  try { if (typeof onTagsChanged === 'function') await onTagsChanged(); } catch { /* ignore */ }
                  const parsedV = (v === '' || v === null || v === undefined) ? '' : (Number.isNaN(Number(v)) ? v : Number(v));
                  let name = '';
                  for (const c of categoryTree) {
                    const child = (c.children || []).find((ch) => ch.id === parsedV || String(ch.id) === String(v));
                    if (child) { name = child.name; break; }
                  }
                  const updatedDraft = { ...(draft || {}), subcategoryId: parsedV, subsubcategoryId: '', subcategory: name };
                  onChange && onChange('subcategoryId', parsedV, updatedDraft);
                }}
                options={(() => {
                  const parent = categoryTree.find((c) => c.id === draft.categoryId);
                  return (parent?.children || []).map((s) => ({ id: s.id, name: s.name }));
                })()}
                placeholder="Select subcategory"
                disabled={!draft.categoryId}
              />
              <SelectField
                label="Sub-subcategory"
                value={draft.subsubcategoryId || ''}
                onChange={(v) => {
                  const parsedV = (v === '' || v === null || v === undefined) ? '' : (Number.isNaN(Number(v)) ? v : Number(v));
                  const updatedDraft = { ...(draft || {}), subsubcategoryId: parsedV };
                  onChange && onChange('subsubcategoryId', parsedV, updatedDraft);
                }}
                options={(() => {
                  let list = [];
                  for (const c of categoryTree) {
                    const s = (c.children || []).find((ch) => ch.id === draft.subcategoryId);
                    if (s) { list = s.children || []; break; }
                  }
                  return list.map((ss) => ({ id: ss.id, name: ss.name }));
                })()}
                placeholder="Select sub-subcategory"
                disabled={!draft.subcategoryId}
              />
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-slate-600">Description</label>
              <textarea value={draft.description} onChange={handleFieldChange('description')} rows={3} className="mt-2 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-slate-600">SKU</label>
                <div className="mt-1 flex gap-3">
                  <input value={draft.sku} onChange={handleFieldChange('sku')} disabled={draft.autoSku} className="flex-1 rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={draft.autoSku} onChange={(e) => handleFieldChange('autoSku')(e)} className="rounded border-slate-300" />
                    Auto
                  </label>
                </div>
                {draft.autoSku && (<div className="text-xs text-slate-500 mt-1">Preview: {makeSku({ brandName: (lookups?.brands?.find(b => b.id === draft.brandId)?.name) || '', productName: draft.name, year: draft.year })}</div>)}
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600">Barcode</label>
                <input value={draft.barcode} onChange={handleFieldChange('barcode')} className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium text-slate-600">Technical details (JSON or list)</label>
              <textarea value={draft.technicalDetails} onChange={handleFieldChange('technicalDetails')} rows={6} className="mt-2 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder='Example: {"CPU":"i7","RAM":"16GB"}' />
            </div>
          </div>

          {/* Right column: image + tags + preview */}
          <aside className="space-y-4">
            <div className="border rounded-lg p-4 bg-slate-50">
              <p className="text-sm font-medium text-slate-600 mb-2">Product image</p>
              {previewSrc ? (
                <img src={previewSrc} alt={draft.name} className="w-full h-56 object-cover rounded-md border" />
              ) : (
                <div className="w-full h-56 rounded-md border border-dashed flex items-center justify-center text-slate-400 text-sm">No image assigned</div>
              )}
              <div className="mt-3 flex flex-col gap-2">
                <div className="flex gap-2">
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUploadImage(file); if (fileInputRef.current) fileInputRef.current.value = ''; }} />
                  <button onClick={() => fileInputRef.current?.click()} type="button" className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-100" disabled={uploading}><FaUpload /> {uploading ? 'Uploading...' : 'Upload'}</button>
                  <button type="button" onClick={() => { onChange('image', ''); onChange('imageUrl', ''); }} className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50">Remove</button>
                </div>
                <input value={draft.imageUrl} onChange={handleFieldChange('imageUrl')} placeholder="Or paste image URL" className="rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            <div className="border rounded-lg p-4 bg-white">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-700">Gallery photos</p>
                  <p className="text-xs text-slate-500">Add supporting angles. The first image is used as the cover.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={galleryFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []);
                      if (files.length) onUploadGallery(files);
                      if (galleryFileInputRef.current) galleryFileInputRef.current.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => galleryFileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={galleryUploading}
                  >
                    <FaUpload /> {galleryUploading ? 'Uploading...' : 'Add photos'}
                  </button>
                </div>
              </div>
              {Array.isArray(draft.gallery) && draft.gallery.length ? (
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {draft.gallery.map((entry, index) => {
                    const entryId = (entry && (entry.id || entry.path || entry.url)) || `gallery-${index}`;
                    const thumbnail = entry?.url || resolveMediaUrl(entry?.path || entry);
                    return (
                      <div key={entryId} className="group relative overflow-hidden rounded-lg border bg-slate-50">
                        {thumbnail ? (
                          <img src={thumbnail} alt={`${draft.name || 'Product'} gallery ${index + 1}`} className="h-28 w-full object-cover" />
                        ) : (
                          <div className="flex h-28 w-full items-center justify-center text-xs text-slate-500">Missing preview</div>
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
                              onClick={() => onMoveGalleryItem(entryId, 'left')}
                              disabled={index === 0}
                              className="rounded-full bg-white/90 p-1 text-slate-600 hover:bg-white disabled:opacity-40"
                              title="Move left"
                            >
                              <FaArrowLeft />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveGalleryItem(entryId, 'right')}
                              disabled={index === draft.gallery.length - 1}
                              className="rounded-full bg-white/90 p-1 text-slate-600 hover:bg-white disabled:opacity-40"
                              title="Move right"
                            >
                              <FaArrowRight />
                            </button>
                            <button
                              type="button"
                              onClick={() => onMoveGalleryItem(entryId, 'cover')}
                              disabled={index === 0}
                              className="rounded-full bg-white/90 p-1 text-amber-600 hover:bg-white disabled:opacity-40"
                              title="Make cover"
                            >
                              <FaStar />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => onRemoveGalleryItem(entryId)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-white/90 px-2 py-0.5 text-xs font-medium text-red-600 hover:bg-white"
                          >
                            <FaTrash /> Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-3 text-xs text-slate-500">No gallery photos yet. Use \"Add photos\" to upload additional shots.</p>
              )}
            </div>

            <div className="border rounded-lg p-4 bg-white">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Tags</h3>
              <TagChips options={lookups?.tags || []} value={draft.tags || []} onChange={(arr) => handleFieldChange('tags')({ target: { value: arr } })} onTagsChanged={onTagsChanged} />
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Technical preview</h3>
              <SpecPreview value={draft.technicalDetails} />
              {draft.preorderEta && (<div className="mt-3 text-xs text-slate-500">Preorder ETA: {draft.preorderEta}</div>)}
            </div>
          </aside>
        </div>

        <footer className="border-t px-6 py-4 flex flex-col gap-3 sm:flex-row sm:justify-end sm:items-center">
          <div className="flex-1 text-sm text-slate-500">{draft.id ? 'Editing product — changes saved to POS.' : 'Creating a new product.'}</div>
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="px-4 py-2 rounded-md border text-sm hover:bg-slate-100" type="button">Cancel</button>
            <button onClick={onSave} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:bg-blue-400" type="button">{saving ? 'Saving...' : 'Save changes'}</button>
          </div>
        </footer>
      </div>
    </Modal>
  );
}

export default function Products() {
  const toast = useToast();
  const { formatCurrency } = useSettings();
  const { user } = useAuth();
  const navigate = useNavigate();
  // Allow staff, manager and admin to archive (soft-delete) from the UI
  const canDelete = user && ['staff', 'manager', 'admin'].includes(user.role);

  const [products, setProducts] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', subcategory: '', search: '', tag: '' });
  const [searchValue, setSearchValue] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [_adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeVendors, setActiveVendors] = useState([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalUploading, setModalUploading] = useState(false);
  const [modalGalleryUploading, setModalGalleryUploading] = useState(false);
  const [modalOriginalDraft, setModalOriginalDraft] = useState(null);
  const [modalStockReason, setModalStockReason] = useState('');
  // Permanent delete modal state (admin-only)
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [permDeleteTarget, setPermDeleteTarget] = useState(null);
  const [permDeleteConfirm, setPermDeleteConfirm] = useState('');
  const [lookups, setLookups] = useState(null);
  const [categoryTree, setCategoryTree] = useState([]);

  const [_newImageUploading, setNewImageUploading] = useState(false);
  const newImageInputRef = useRef(null);

  const [bulkRows, setBulkRows] = useState([]);
  const [_bulkResult, setBulkResult] = useState(null);
  const [_bulkError, setBulkError] = useState('');
  const [_bulkBusy, setBulkBusy] = useState(false);
  const [_bulkFileName, setBulkFileName] = useState('');
  const bulkFileInputRef = useRef(null);

  const fetchCategories = useCallback(async () => {
    try {
      const map = await api.get('/products/categories');
      setCategories(map || {});
    } catch (err) {
      console.debug('Failed to load categories', err?.message || err);
    }
  }, []);

  const fetchLookupsAndTree = useCallback(async () => {
    try {
      const [lu, tree] = await Promise.all([
        api.get('/lookups'),
        api.get('/categories/tree', { params: { depth: 3 } }),
      ]);
      setLookups(lu || {});
      setCategoryTree(Array.isArray(tree) ? tree : []);
    } catch (err) {
      console.debug('Failed to load lookups or category tree', err?.message || err);
    }
  }, []);

  const fetchActiveVendors = useCallback(async () => {
    try {
      const list = await api.get('/vendors', { params: { status: 'active' } });
      setActiveVendors(Array.isArray(list) ? list : []);
    } catch (err) {
      console.debug('Failed to load active vendors', err?.message || err);
    }
  }, []);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        category: filters.category || undefined,
        subcategory: filters.subcategory || undefined,
        search: filters.search || undefined,
        tag: filters.tag || undefined,
        includeArchived: showArchived ? 'true' : undefined,
      };
      const list = await api.get('/products', { params });
      setProducts(Array.isArray(list) ? list : []);
      setSelectedProduct((prev) => {
        if (!prev) return list[0] || null;
        return list.find((item) => item.id === prev.id) || list[0] || null;
      });
    } catch (err) {
      toast.push('Failed to load products', 'error');
      console.debug('Failed to load products', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [filters, toast, showArchived]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchLookupsAndTree();
    fetchActiveVendors();
  }, [fetchLookupsAndTree, fetchActiveVendors]);

  const handleModalFieldChange = (key, value, updatedDraft) => {
    // Allow callers to provide a fully-assembled draft to perform atomic updates
    if (updatedDraft) {
      setModalDraft(updatedDraft);
      return;
    }
    setModalDraft((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  // create helpers for lookups
  const extractId = (obj) => obj?.id;
  
  const createBrand = async (name) => {
    try {
      const created = await api.post('/brands', { name });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new brand.');
      
      setLookups(prev => {
        const base = prev || {};
        return { ...base, brands: [...(base.brands || []), { id: newId, name }] };
      });
      handleModalFieldChange('brandId', newId);
      toast.push('Brand added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add brand', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
      return false;
    }
  };
  const createMaterial = async (name) => {
    try {
      const created = await api.post('/materials', { name });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new material.');

      setLookups(prev => {
        const base = prev || {};
        return { ...base, materials: [...(base.materials || []), { id: newId, name }] };
      });
      handleModalFieldChange('materialId', newId);
      toast.push('Material added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add material', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
      return false;
    }
  };
  const createColor = async (name) => {
    try {
      const created = await api.post('/colors', { name });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new color.');
      setLookups(prev => {
        const base = prev || {};
        return { ...base, colors: [...(base.colors || []), { id: newId, name }] };
      });
      handleModalFieldChange('colorId', newId);
      toast.push('Color added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add color', 'error');
      fetchLookupsAndTree();
      return false;
    }
  };
  const createAudience = async (name) => {
    try {
      const created = await api.post('/audiences', { name });
      const value = created?.value || created?.id || created?.name || name;
      if (!value) throw new Error('API did not return the new audience value.');
      setLookups(prev => {
        const base = prev || {};
        return { ...base, audiences: [...(base.audiences || []), value] };
      });
      handleModalFieldChange('audience', value);
      toast.push('Audience added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add audience', 'error');
      fetchLookupsAndTree();
      return false;
    }
  };
  const createDeliveryType = async (name) => {
    try {
      const created = await api.post('/delivery-types', { name });
      const value = created?.value || created?.id || created?.name || name;
      if (!value) throw new Error('API did not return the new delivery type.');
      setLookups(prev => {
        const base = prev || {};
        return { ...base, deliveryTypes: [...(base.deliveryTypes || []), value] };
      });
      handleModalFieldChange('deliveryType', value);
      toast.push('Delivery type added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add delivery type', 'error');
      fetchLookupsAndTree();
      return false;
    }
  };
  const createWarrantyTerm = async (name) => {
    try {
      const created = await api.post('/warranty-terms', { name });
      const value = created?.value || created?.id || created?.name || name;
      if (!value) throw new Error('API did not return the new warranty term.');
      setLookups(prev => {
        const base = prev || {};
        return { ...base, warrantyTerms: [...(base.warrantyTerms || []), value] };
      });
      handleModalFieldChange('warrantyTerm', value);
      toast.push('Warranty term added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add warranty term', 'error');
      fetchLookupsAndTree();
      return false;
    }
  };
  // Auto-generate SKU when enabled
  useEffect(() => {
    if (!modalDraft) return;
    if (!modalDraft.autoSku) return;
    const brandName = (lookups?.brands || []).find((b) => b.id === modalDraft.brandId)?.name || '';
    const sku = makeSku({ brandName, productName: modalDraft.name, year: modalDraft.year });
    setModalDraft((prev) => (prev ? { ...prev, sku } : prev));
  }, [modalDraft, lookups]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Note: Create modal is opened via dedicated Add Product page at `/products/add`.

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchValue ? prev : { ...prev, search: searchValue }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const _availableSubcategories = useMemo(() => {
    if (!filters.category) return [];
    return categories[filters.category] || [];
  }, [categories, filters.category]);

  const handleFilterChange = (name, value) => {
    setFilters((prev) => {
      const next = { ...prev, [name]: value };
      if (name === 'category') next.subcategory = '';
      return next;
    });
  };

  const _handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const _handleAddProduct = async (event) => {
    event.preventDefault();
    if (!form.name || !form.price) {
      toast.push('Name and price are required', 'warning');
      return;
    }
    setAdding(true);
    try {
      const payload = {
        name: form.name,
        price: parseFloat(form.price),
        stock: form.stock ? parseInt(form.stock, 10) || 0 : 0,
        category: form.category || null,
        subcategory: form.subcategory || null,
        image: form.image || null,
        imageUrl: form.imageUrl || null,
        description: form.description || null,
        technicalDetails: form.technicalDetails || null,
        sku: form.sku || null,
        barcode: form.barcode || null,
        cost: form.cost ? parseFloat(form.cost) : 0,
        trackInventory: form.trackInventory,
        availabilityStatus: normalizeAvailabilityStatus(form.availabilityStatus),
        availableForPreorder: form.availableForPreorder,
        preorderReleaseDate: form.availableForPreorder ? form.preorderReleaseDate || null : null,
        preorderNotes: form.availableForPreorder ? form.preorderNotes || null : null,
        preorderEta: form.availableForPreorder ? form.preorderEta || null : null,
        vendorId: normalizeVendorId(form.vendorId),
        gallery: galleryPayloadFromState(form.gallery),
      };
      const created = await api.post('/products', payload);
      toast.push('Product added', 'info');
      setForm((prev) => ({
        ...EMPTY_FORM,
        category: prev.category,
        subcategory: prev.subcategory,
      }));
      setSelectedProduct(created);
      await fetchProducts();
    } catch (err) {
      toast.push(err?.message || 'Failed to add product', 'error');
      console.debug('Failed to add product', err?.message || err);
    } finally {
      setAdding(false);
      if (newImageInputRef.current) newImageInputRef.current.value = '';
    }
  };

  const handleDeleteProduct = async (id) => {
    if (!canDelete) {
      toast.push('Only managers or admins can delete products', 'warning');
      return;
    }
    if (!window.confirm('Delete this product? This action cannot be undone.')) return;
    try {
      await api.del(`/products/${id}`);
      toast.push('Product deleted', 'info');
      setSelectedProduct((prev) => (prev && prev.id === id ? null : prev));
      await fetchProducts();
    } catch (err) {
      toast.push(err?.message || 'Failed to delete product', 'error');
      console.debug('Failed to delete product', err?.message || err);
    }
  };

  const openPermanentDelete = (product) => {
    setPermDeleteTarget(product || null);
    setPermDeleteConfirm('');
    setPermDeleteOpen(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!permDeleteTarget) return;
    if (!user || user.role !== 'admin') {
      toast.push('Only administrators may permanently delete products', 'warning');
      setPermDeleteOpen(false);
      return;
    }
    // Require exact product name confirmation to avoid accidents
    if ((permDeleteConfirm || '').trim() !== (permDeleteTarget.name || '').trim()) {
      toast.push('Please type the exact product name to confirm permanent deletion', 'warning');
      return;
    }

    try {
      await api.del(`/products/${permDeleteTarget.id}?force=true`);
      toast.push('Product permanently deleted', 'success');
      setPermDeleteOpen(false);
      setPermDeleteTarget(null);
      setPermDeleteConfirm('');
      // refresh list
      await fetchProducts();
      setSelectedProduct((prev) => (prev && prev.id === permDeleteTarget.id ? null : prev));
    } catch (err) {
      toast.push(err?.message || 'Failed to permanently delete product', 'error');
      console.debug('Permanent delete failed', err?.message || err);
    }
  };

  const _handleQuickStockUpdate = async (productId, newStock, reason) => {
    try {
      await api.post(`/products/${productId}/adjust-stock`, { new_stock: newStock, reason });
      toast.push('Stock updated successfully', 'success');
      await fetchProducts();
    } catch (err) {
      toast.push('Failed to update stock', 'error');
      console.debug('Failed to update stock', err?.message || err);
    }
  };

  const handleBeginEdit = async (product) => {
    try {
      await fetchLookupsAndTree();
    } catch { /* ignore */ }
    setModalDraft({
      id: product.id,
      name: product.name || '',
      price: product.price != null ? product.price.toString() : '',
      stock: product.stock != null ? product.stock.toString() : '',
      // keep legacy strings for backward compatibility
      category: product.category || '',
      subcategory: product.subcategory || '',
      // new lookup ids if present
      categoryId: product.category_id || product.categoryId || '',
      subcategoryId: product.subcategory_id || product.subcategoryId || '',
      subsubcategoryId: product.subsubcategory_id || product.subsubcategoryId || '',
      description: product.description || '',
      technicalDetails: product.technical_details || product.technicalDetails || '',
      type: product.product_type_label || product.productTypeLabel || product.type || 'physical',
      sku: product.sku || '',
      barcode: product.barcode || '',
      cost: product.cost != null ? product.cost.toString() : '',
      image: product.image || '',
      imageUrl: product.image_source || '',
      imagePreview: resolveMediaUrl(product.image_source || product.image || ''),
      trackInventory: product.track_inventory !== 0,
      availableForPreorder: product.preorder_enabled === 1 || product.preorder_enabled === true || product.preorder_enabled === '1',
      shortDescription: product.short_description || product.shortDescription || '',
      brandId: product.brand_id || product.brandId || '',
      materialId: product.material_id || product.materialId || '',
      colorId: product.color_id || product.colorId || '',
      vendorId: product.vendor_id ? String(product.vendor_id) : (product.vendorId ? String(product.vendorId) : ''),
      availabilityStatus: normalizeAvailabilityStatus(product.availability_status || product.availabilityStatus || (product.preorder_enabled ? 'preorder' : null)),
      audience: product.audience || '',
      deliveryType: product.delivery_type || product.deliveryType || '',
      warrantyTerm: product.warranty_term || product.warrantyTerm || '',
      preorderEta: product.preorder_eta || product.preorderEta || '',
  model: product.model || product.modelName || '',
  year: product.year || '',
      autoSku: product.auto_sku === 0 || product.auto_sku === false ? false : true,
      tags: Array.isArray(product.tags) ? product.tags.map((t) => t.id || t) : product.tags || [],
      preorderReleaseDate: product.preorder_release_date || '',
      preorderNotes: product.preorder_notes || '',
      highlightActive: product.highlight_active ? true : false,
      highlightLabel: product.highlight_label || '',
      highlightPriority: product.highlight_priority != null ? String(product.highlight_priority) : '',
      newArrival: product.new_arrival ? true : false,
      gallery: formatGalleryEntries(product.gallery),
      clothingSizes: product.clothing_sizes || product.clothingSizes || '',
      clothingCare: product.clothing_care || product.clothingCare || '',
      digitalDownloadUrl: product.digital_download_url || product.digitalDownloadUrl || '',
      digitalLicenseKey: product.digital_license_key || product.digitalLicenseKey || '',
      digitalActivationLimit:
        product.digital_activation_limit != null
          ? String(product.digital_activation_limit)
          : product.digitalActivationLimit != null
          ? String(product.digitalActivationLimit)
          : '',
      digitalExpiry: product.digital_expiry || product.digitalExpiry || '',
      digitalSupportUrl: product.digital_support_url || product.digitalSupportUrl || '',
    });
    setModalOpen(true);
    setModalOriginalDraft({
      id: product.id,
      name: product.name || '',
      price: product.price != null ? String(product.price) : '',
      stock: product.stock != null ? String(product.stock) : '',
      category: product.category || '',
      subcategory: product.subcategory || '',
      description: product.description || '',
      technicalDetails: product.technical_details || '',
      type: product.product_type_label || product.productTypeLabel || product.type || 'physical',
      sku: product.sku || '',
      barcode: product.barcode || '',
      cost: product.cost != null ? String(product.cost) : '',
      image: product.image || '',
      imageUrl: product.image_source || '',
      imagePreview: resolveMediaUrl(product.image_source || product.image || ''),
      trackInventory: product.track_inventory !== 0,
      availableForPreorder: product.preorder_enabled === 1 || product.preorder_enabled === true || product.preorder_enabled === '1',
      shortDescription: product.short_description || product.shortDescription || '',
      brandId: product.brand_id || product.brandId || '',
      materialId: product.material_id || product.materialId || '',
      colorId: product.color_id || product.colorId || '',
      vendorId: product.vendor_id ? String(product.vendor_id) : (product.vendorId ? String(product.vendorId) : ''),
      availabilityStatus: normalizeAvailabilityStatus(product.availability_status || product.availabilityStatus || (product.preorder_enabled ? 'preorder' : null)),
      audience: product.audience || '',
      deliveryType: product.delivery_type || product.deliveryType || '',
      warrantyTerm: product.warranty_term || product.warrantyTerm || '',
      preorderEta: product.preorder_eta || product.preorderEta || '',
  model: product.model || product.modelName || '',
  year: product.year || '',
      autoSku: product.auto_sku === 0 || product.auto_sku === false ? false : true,
      tags: Array.isArray(product.tags) ? product.tags.map((t) => t.id || t) : product.tags || [],
      preorderReleaseDate: product.preorder_release_date || '',
      preorderNotes: product.preorder_notes || '',
      highlightActive: product.highlight_active ? true : false,
      highlightLabel: product.highlight_label || '',
      highlightPriority: product.highlight_priority != null ? String(product.highlight_priority) : '',
      gallery: formatGalleryEntries(product.gallery),
      clothingSizes: product.clothing_sizes || product.clothingSizes || '',
      clothingCare: product.clothing_care || product.clothingCare || '',
      digitalDownloadUrl: product.digital_download_url || product.digitalDownloadUrl || '',
      digitalLicenseKey: product.digital_license_key || product.digitalLicenseKey || '',
      digitalActivationLimit:
        product.digital_activation_limit != null
          ? String(product.digital_activation_limit)
          : product.digitalActivationLimit != null
          ? String(product.digitalActivationLimit)
          : '',
      digitalExpiry: product.digital_expiry || product.digitalExpiry || '',
      digitalSupportUrl: product.digital_support_url || product.digitalSupportUrl || '',
    });
    setModalStockReason('');
  };

  const handleFilterByTag = (tag) => {
    setFilters((prev) => ({ ...prev, tag, search: '' }));
  };

  const handleModalSave = async () => {
    if (!modalDraft) return;
    if (!modalDraft.name || !modalDraft.price) {
      toast.push('Name and price are required', 'warning');
      return;
    }
    setModalSaving(true);
    try {
      // If no id -> create new product
      if (!modalDraft.id) {
        const isDigitalDraft = (modalDraft.type || '').toLowerCase() === 'digital';
        const payload = {
          name: modalDraft.name,
          price: parseFloat(modalDraft.price),
          stock: isDigitalDraft ? 0 : modalDraft.stock ? parseInt(modalDraft.stock, 10) || 0 : 0,
          category: modalDraft.category || null,
          subcategory: modalDraft.subcategory || null,
          image: modalDraft.image || null,
          imageUrl: modalDraft.imageUrl || null,
          description: modalDraft.description || null,
          technicalDetails: modalDraft.technicalDetails || null,
          sku: modalDraft.sku || null,
          barcode: modalDraft.barcode || null,
          model: modalDraft.model || null,
          cost: modalDraft.cost ? parseFloat(modalDraft.cost) : 0,
          trackInventory: isDigitalDraft ? false : modalDraft.trackInventory,
          type: isDigitalDraft ? 'digital' : 'physical',
          productTypeLabel: modalDraft.type || (isDigitalDraft ? 'digital' : 'physical'),
          availabilityStatus: normalizeAvailabilityStatus(modalDraft.availabilityStatus),
          availableForPreorder: modalDraft.availableForPreorder,
          preorderReleaseDate: modalDraft.availableForPreorder ? modalDraft.preorderReleaseDate || null : null,
          preorderNotes: modalDraft.availableForPreorder ? modalDraft.preorderNotes || null : null,
          preorderEta: modalDraft.availableForPreorder ? modalDraft.preorderEta || null : null,
          vendorId: normalizeVendorId(modalDraft.vendorId),
          gallery: galleryPayloadFromState(modalDraft.gallery),
          highlightActive: modalDraft.highlightActive ? 1 : 0,
          highlightLabel: modalDraft.highlightLabel && modalDraft.highlightLabel.trim() ? modalDraft.highlightLabel.trim() : null,
          highlightPriority: modalDraft.highlightPriority ? parseInt(modalDraft.highlightPriority, 10) || 0 : 0,
          clothingSizes: modalDraft.clothingSizes || null,
          clothingCare: modalDraft.clothingCare || null,
          digitalDownloadUrl: modalDraft.digitalDownloadUrl || null,
          digitalLicenseKey: modalDraft.digitalLicenseKey || null,
          digitalActivationLimit: modalDraft.digitalActivationLimit
            ? parseInt(modalDraft.digitalActivationLimit, 10) || null
            : null,
          digitalExpiry: modalDraft.digitalExpiry || null,
          digitalSupportUrl: modalDraft.digitalSupportUrl || null,
          deliveryType: modalDraft.deliveryType || (isDigitalDraft ? 'instant_download' : null),
          audience: modalDraft.audience || null,
          warrantyTerm: modalDraft.warrantyTerm || null,
        };
        const created = await api.post('/products', payload);
        toast.push('Product added', 'info');
        setModalOpen(false);
        setModalDraft(null);
        setModalOriginalDraft(null);
        setModalStockReason('');
        setSelectedProduct(created);
        await fetchProducts();
        setModalSaving(false);
        return;
      }
      const isDigitalDraft = (modalDraft.type || '').toLowerCase() === 'digital';
      const payload = {
        name: modalDraft.name,
        price: parseFloat(modalDraft.price),
        stock: isDigitalDraft ? 0 : modalDraft.stock ? parseInt(modalDraft.stock, 10) || 0 : 0,
        // keep legacy strings for backward compatibility
        category: modalDraft.category || null,
        subcategory: modalDraft.subcategory || null,
        // new lookup ids
        brandId: modalDraft.brandId || null,
        categoryId: modalDraft.categoryId || null,
        subcategoryId: modalDraft.subcategoryId || null,
        subsubcategoryId: modalDraft.subsubcategoryId || null,
        materialId: modalDraft.materialId || null,
        colorId: modalDraft.colorId || null,
        audience: modalDraft.audience || null,
        deliveryType: modalDraft.deliveryType || (isDigitalDraft ? 'instant_download' : null),
        warrantyTerm: modalDraft.warrantyTerm || null,
        type: isDigitalDraft ? 'digital' : 'physical',
        productTypeLabel: modalDraft.type || (isDigitalDraft ? 'digital' : 'physical'),
        shortDescription: modalDraft.shortDescription || null,
        year: modalDraft.year || null,
        tags: modalDraft.tags || [],
        	autoSku: modalDraft.autoSku === false ? false : true,
        	model: modalDraft.model || null,
        image: modalDraft.image || null,
        imageUrl: modalDraft.imageUrl || null,
        description: modalDraft.description || null,
        technicalDetails: modalDraft.technicalDetails || null,
        sku: modalDraft.sku || null,
        barcode: modalDraft.barcode || null,
        cost: modalDraft.cost ? parseFloat(modalDraft.cost) : 0,
        trackInventory: isDigitalDraft ? false : modalDraft.trackInventory,
        availabilityStatus: normalizeAvailabilityStatus(modalDraft.availabilityStatus),
        availableForPreorder: modalDraft.availableForPreorder,
        preorderReleaseDate: modalDraft.availableForPreorder ? modalDraft.preorderReleaseDate || null : null,
        preorderNotes: modalDraft.availableForPreorder ? modalDraft.preorderNotes || null : null,
        preorderEta: modalDraft.availableForPreorder ? modalDraft.preorderEta || null : null,
        vendorId: normalizeVendorId(modalDraft.vendorId),
        gallery: galleryPayloadFromState(modalDraft.gallery),
        highlightActive: modalDraft.highlightActive ? 1 : 0,
        highlightLabel: modalDraft.highlightLabel && modalDraft.highlightLabel.trim() ? modalDraft.highlightLabel.trim() : null,
        highlightPriority: modalDraft.highlightPriority ? parseInt(modalDraft.highlightPriority, 10) || 0 : 0,
        newArrival: modalDraft.newArrival ? 1 : 0,
        clothingSizes: modalDraft.clothingSizes || null,
        clothingCare: modalDraft.clothingCare || null,
        digitalDownloadUrl: modalDraft.digitalDownloadUrl || null,
        digitalLicenseKey: modalDraft.digitalLicenseKey || null,
        digitalActivationLimit: modalDraft.digitalActivationLimit
          ? parseInt(modalDraft.digitalActivationLimit, 10) || null
          : null,
        digitalExpiry: modalDraft.digitalExpiry || null,
        digitalSupportUrl: modalDraft.digitalSupportUrl || null,
      };

      // Detect if only stock changed compared to original draft
      let onlyStockChanged = false;
      try {
        if (modalOriginalDraft) {
          const orig = {
            name: modalOriginalDraft.name || '',
            price: modalOriginalDraft.price ? parseFloat(modalOriginalDraft.price) : 0,
            stock: modalOriginalDraft.stock ? parseInt(modalOriginalDraft.stock, 10) : 0,
            category: modalOriginalDraft.category || null,
            subcategory: modalOriginalDraft.subcategory || null,
            image: modalOriginalDraft.image || null,
            imageUrl: modalOriginalDraft.imageUrl || null,
            description: modalOriginalDraft.description || null,
            technicalDetails: modalOriginalDraft.technicalDetails || null,
            sku: modalOriginalDraft.sku || null,
            barcode: modalOriginalDraft.barcode || null,
            cost: modalOriginalDraft.cost ? parseFloat(modalOriginalDraft.cost) : 0,
            trackInventory: modalOriginalDraft.trackInventory,
            availabilityStatus: normalizeAvailabilityStatus(modalOriginalDraft.availabilityStatus),
            availableForPreorder: modalOriginalDraft.availableForPreorder,
            preorderReleaseDate: modalOriginalDraft.availableForPreorder ? modalOriginalDraft.preorderReleaseDate || null : null,
            preorderNotes: modalOriginalDraft.availableForPreorder ? modalOriginalDraft.preorderNotes || null : null,
            preorderEta: modalOriginalDraft.availableForPreorder ? modalOriginalDraft.preorderEta || null : null,
            vendorId: normalizeVendorId(modalOriginalDraft.vendorId),
            gallery: galleryPayloadFromState(modalOriginalDraft.gallery),
            highlightActive: modalOriginalDraft.highlightActive ? 1 : 0,
            highlightLabel: modalOriginalDraft.highlightLabel && modalOriginalDraft.highlightLabel.trim() ? modalOriginalDraft.highlightLabel.trim() : null,
            highlightPriority: modalOriginalDraft.highlightPriority ? parseInt(modalOriginalDraft.highlightPriority, 10) || 0 : 0,
          };
          const changedKeys = Object.keys(payload).filter((k) => {
            const a = payload[k] == null ? null : payload[k];
            const b = orig[k] == null ? null : orig[k];
            // treat number vs string normalization
            return String(a) !== String(b);
          });
          onlyStockChanged = changedKeys.length === 1 && changedKeys[0] === 'stock';
        }
      } catch {
        // ignore comparison errors
      }

      // If stock changed, require a reason
      const stockChanged = modalOriginalDraft && (parseInt(modalDraft.stock || 0, 10) !== parseInt(modalOriginalDraft.stock || 0, 10));
      if (stockChanged && (!modalStockReason || String(modalStockReason).trim().length === 0)) {
        toast.push('Please provide a reason for stock changes (required)', 'warning');
        setModalSaving(false);
        return;
      }

      if (onlyStockChanged) {
        // Use the dedicated adjust-stock endpoint for purely stock edits
        await api.post(`/products/${modalDraft.id}/adjust-stock`, { new_stock: payload.stock, reason: String(modalStockReason).trim() });
        toast.push('Stock adjusted', 'info');
        setModalOpen(false);
        setModalDraft(null);
        setModalOriginalDraft(null);
        setModalStockReason('');
        await fetchProducts();
        setModalSaving(false);
        return;
      }

      // Include the reason in the generic product update so backend can use it if supported
      if (stockChanged) payload.reason = String(modalStockReason).trim();
      const updated = await api.put(`/products/${modalDraft.id}`, payload);
      toast.push('Product updated', 'info');
      setModalOpen(false);
      setModalDraft(null);
      setModalOriginalDraft(null);
      setModalStockReason('');
      setSelectedProduct(updated);
      await fetchProducts();
    } catch (err) {
      toast.push(err?.message || 'Failed to update product', 'error');
    } finally {
      setModalSaving(false);
    }
  };

  const _handleNewImageUpload = async (file) => {
    if (!file) return;
    setNewImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadCategory = buildUploadCategoryFromDraft(form, categoryTree);
      formData.append('category', uploadCategory);
      const result = await api.upload('/uploads', formData);
      const storedPath = result?.path || result?.url || '';
      const absoluteUrl = result?.url || storedPath;
      setForm((prev) => ({
        ...prev,
        image: storedPath,
        imageUrl: storedPath,
        imagePreview: absoluteUrl,
      }));
      toast.push('Image uploaded', 'info');
    } catch (err) {
      toast.push(err?.message || 'Failed to upload image', 'error');
    } finally {
      setNewImageUploading(false);
      if (newImageInputRef.current) newImageInputRef.current.value = '';
    }
  };

  const handleModalImageUpload = async (file) => {
    if (!file || !modalDraft) return;
    setModalUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadCategory = buildUploadCategoryFromDraft(modalDraft, categoryTree);
      formData.append('category', uploadCategory);
      const result = await api.upload('/uploads', formData);
      const storedPath = result?.path || result?.url || '';
      const absoluteUrl = result?.url || storedPath;
      setModalDraft((prev) =>
        prev ? { ...prev, image: storedPath, imageUrl: storedPath, imagePreview: absoluteUrl } : prev
      );
      toast.push('Image updated', 'info');
    } catch (err) {
      toast.push(err?.message || 'Failed to upload image', 'error');
      console.debug('Failed to upload modal image', err?.message || err);
      console.debug('Failed to upload product image', err?.message || err);
    } finally {
      setModalUploading(false);
    }
  };

  const galleryIdentifier = (entry) => {
    if (!entry) return '';
    if (typeof entry === 'string') return entry;
    return entry.id || entry.path || entry.url || '';
  };

  const handleModalGalleryUpload = async (filesOrList) => {
    if (!modalDraft) return;
    const files = Array.isArray(filesOrList) ? filesOrList : Array.from(filesOrList || []);
    const validFiles = files.filter((file) => file && typeof file === 'object');
    if (!validFiles.length) return;
    setModalGalleryUploading(true);
    try {
      const uploadCategory = buildUploadCategoryFromDraft(modalDraft, categoryTree);
      const addedEntries = [];
      for (const file of validFiles) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('category', uploadCategory);
        const result = await api.upload('/uploads', formData);
        const storedPath = result?.path || result?.url || '';
        const absoluteUrl = result?.url || storedPath;
        const entry = buildGalleryEntry(storedPath, absoluteUrl);
        if (entry) addedEntries.push(entry);
      }
      if (addedEntries.length) {
        setModalDraft((prev) => {
          if (!prev) return prev;
          let gallery = Array.isArray(prev.gallery) ? [...prev.gallery] : [];
          addedEntries.forEach((entry) => {
            gallery = addGalleryEntry(gallery, entry);
          });
          return { ...prev, gallery };
        });
        toast.push(`${addedEntries.length} photo${addedEntries.length > 1 ? 's' : ''} added to the gallery`, 'info');
      }
    } catch (err) {
      toast.push(err?.message || 'Failed to upload gallery image', 'error');
      console.debug('Failed to upload gallery image', err?.message || err);
    } finally {
      setModalGalleryUploading(false);
    }
  };

  const handleModalGalleryRemove = (identifier) => {
    if (!identifier) return;
    let removed = false;
    setModalDraft((prev) => {
      if (!prev) return prev;
      const gallery = Array.isArray(prev.gallery) ? prev.gallery : [];
      const next = gallery.filter((entry) => {
        const id = galleryIdentifier(entry);
        if (id === identifier) {
          removed = true;
          return false;
        }
        return true;
      });
      if (!removed) return prev;
      return { ...prev, gallery: next };
    });
    if (removed) toast.push('Photo removed from gallery', 'info');
  };

  const handleModalGalleryReorder = (identifier, direction) => {
    if (!identifier || !direction) return;
    setModalDraft((prev) => {
      if (!prev) return prev;
      const gallery = Array.isArray(prev.gallery) ? [...prev.gallery] : [];
      if (gallery.length < 2) return prev;
      const index = gallery.findIndex((entry) => galleryIdentifier(entry) === identifier);
      if (index === -1) return prev;
      let nextIndex = index;
      if (direction === 'cover') nextIndex = 0;
      else if (direction === 'left') nextIndex = Math.max(0, index - 1);
      else if (direction === 'right') nextIndex = Math.min(gallery.length - 1, index + 1);
      if (nextIndex === index) return prev;
      const [selected] = gallery.splice(index, 1);
      gallery.splice(nextIndex, 0, selected);
      return { ...prev, gallery };
    });
  };

  const _handleModalChange = (key, value) => {
    setModalDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalDraft(null);
    setModalOriginalDraft(null);
    setModalStockReason('');
    setModalGalleryUploading(false);
  }, []);

  const handleBulkFile = async (file) => {
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.rows.length) {
        setBulkRows([]);
        setBulkError('No rows detected in the file.');
        return;
      }
      const structured = parsed.rows.map(mapCsvRowToProduct);
      setBulkRows(structured);
      setBulkFileName(file.name);
      setBulkError('');
      setBulkResult(null);
    } catch (err) {
      setBulkRows([]);
      setBulkError('Failed to parse CSV file');
      console.debug('Failed to parse bulk CSV file', err?.message || err);
    }
  };

  const _handleBulkFileInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleBulkFile(file);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
  };

  const _bulkStats = useMemo(() => {
    const total = bulkRows.length;
    const valid = bulkRows.filter((row) => row.valid).length;
    return { total, valid, invalid: total - valid };
  }, [bulkRows]);

  const _handleBulkImport = async () => {
    if (!bulkRows.length) {
      setBulkError('Upload a CSV file first.');
      return;
    }
    const payload = bulkRows
      .filter((row) => row.valid)
      .map(({ product }) => ({
        name: product.name,
        price: Number(product.price),
        stock: Number.isFinite(product.stock) ? product.stock : 0,
        category: product.category || null,
        subcategory: product.subcategory || null,
        image: product.image || null,
        imageUrl: product.imageUrl || null,
        description: product.description || null,
        technicalDetails: product.technicalDetails || null,
        sku: product.sku || null,
        barcode: product.barcode || null,
        cost: Number.isFinite(product.cost) ? product.cost : 0,
        trackInventory: product.trackInventory,
      }));
    if (!payload.length) {
      setBulkError('No valid rows to import.');
      return;
    }
    setBulkBusy(true);
    try {
      const summary = await api.post('/products/bulk-import', { products: payload });
      setBulkResult(summary);
      toast.push('Bulk import completed', summary.failed?.length ? 'warning' : 'info');
      await fetchProducts();
    } catch (err) {
      setBulkError(err?.message || 'Bulk import failed');
    } finally {
      setBulkBusy(false);
    }
  };

  const _clearBulkPreview = () => {
    setBulkRows([]);
    setBulkResult(null);
    setBulkError('');
    setBulkFileName('');
  };

  const categoryOptions = useMemo(
    () => Object.keys(categories || {}).sort((a, b) => a.localeCompare(b)),
    [categories]
  );
  const _bulkPreviewRows = useMemo(() => bulkRows.slice(0, 8), [bulkRows]);
  const _noProducts = !loading && products.length === 0;

  return (
    <div className="p-6 space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">PRODUCTS</span>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
                <p className="text-sm text-slate-500">
                  Manage catalog inventory, pricing, and technical specifications.
                </p>
              </div>
            </div>
          <div>
            <button
              type="button"
              onClick={() => navigate('/products/add')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold shadow hover:bg-blue-700"
            >
              <FaPlus /> Add product
            </button>
          </div>
        </div>
      </section>
      {/* Add product moved to modal: click the button above to open the product editor */}

      <section className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Catalog overview</h2>
            <p className="text-sm text-slate-500">Filter products, edit details, and monitor stock levels.</p>
            <p className="text-xs text-slate-400 mt-1">Archived products are hidden by default; archiving preserves history. Use "Show archived" to view them.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="search" value={searchValue} onChange={(e) => setSearchValue(e.target.value)} placeholder="Search by name or SKU" className="rounded-md border px-3 py-2 text-sm w-48" />
            <select value={filters.category} onChange={(e) => handleFilterChange('category', e.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="">All categories</option>
              {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
            <button type="button" onClick={fetchProducts} className="rounded-md border px-3 py-2 text-sm" disabled={loading}>Refresh</button>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(!!e.target.checked)} className="rounded" />
              <span className="text-sm text-slate-600">Show archived</span>
            </label>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div>
            <div className="overflow-hidden rounded-lg border">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">Loading products...</div>
              ) : (products.length === 0) ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">No products found. Adjust filters or add a new product.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium">Product</th>
                        <th className="px-4 py-3 text-left font-medium">Price</th>
                        <th className="px-4 py-3 text-left font-medium">Stock</th>
                        <th className="px-4 py-3 text-left font-medium">Category</th>
                        <th className="px-4 py-3 text-left font-medium">Featured</th>
                        <th className="px-4 py-3 text-right font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {products.map((product) => (
                        <tr key={product.id} className={`cursor-pointer transition hover:bg-slate-50 ${selectedProduct?.id === product.id ? 'bg-blue-50/60' : ''}`} onClick={() => setSelectedProduct(product)}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-800">{product.name}</div>
                            {product.availability_status === 'archived' && <div className="text-xs text-rose-600 mt-1">Archived</div>}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{formatCurrency(product.price || 0)}</td>
                          <td className="px-4 py-3 text-slate-700">{product.track_inventory === 0 ? '--' : product.stock ?? 0}</td>
                          <td className="px-4 py-3 text-slate-700">{product.category || '--'}{product.subcategory ? ` / ${product.subcategory}` : ''}</td>
                          <td className="px-4 py-3 text-slate-700">
                            {product.highlight_active ? (
                              <div className="inline-flex items-center gap-2">
                                <span className="inline-flex items-center rounded-md bg-rose-100 text-rose-700 px-2 py-0.5 text-xs font-semibold">
                                  {product.highlight_label || 'Featured'}
                                </span>
                                {product.highlight_priority ? <span className="text-xs text-slate-500">#{product.highlight_priority}</span> : null}
                              </div>
                            ) : (
                              <div className="text-xs text-slate-400">—</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex justify-end gap-2">
                              <button type="button" onClick={(e) => { e.stopPropagation(); handleBeginEdit(product); }} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"> <FaEdit /> Edit</button>
                              {user && user.role === 'admin' && <button type="button" onClick={(e) => { e.stopPropagation(); openPermanentDelete(product); }} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-rose-700">🗑️ Permanently delete</button>}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Product insight</h3>
                  <p className="text-xs text-slate-500">Focus on a product to preview metadata.</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedProduct && (
                    <>
                      <button type="button" onClick={() => handleBeginEdit(selectedProduct)} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"> <FaEdit /> Edit</button>
                      {canDelete && (
                        <button type="button" onClick={() => handleDeleteProduct(selectedProduct.id)} className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs text-rose-600">Archive</button>
                      )}
                    </>
                  )}
                </div>
              </div>
              <ProductInsight
                product={selectedProduct}
                formatCurrency={formatCurrency}
                onTagClick={handleFilterByTag}
                onEdit={() => selectedProduct && handleBeginEdit(selectedProduct)}
                onDelete={() => selectedProduct && handleDeleteProduct(selectedProduct.id)}
                onPermDelete={(p) => openPermanentDelete(p || selectedProduct)}
                canDelete={canDelete}
                userRole={user?.role}
                lookups={lookups}
              />
            </div>
          </aside>
        </div>
      </section>

      <ProductForm
        open={modalOpen}
        draft={modalDraft}
        onClose={closeModal}
        onChange={handleModalFieldChange}
        onSave={handleModalSave}
        onUploadImage={handleModalImageUpload}
        onUploadGallery={handleModalGalleryUpload}
        onRemoveGalleryItem={handleModalGalleryRemove}
        onMoveGalleryItem={handleModalGalleryReorder}
        galleryUploading={modalGalleryUploading}
        uploading={modalUploading}
        saving={modalSaving}
        stockChanged={modalOriginalDraft && modalDraft && (parseInt(modalDraft.stock||0,10) !== parseInt(modalOriginalDraft.stock||0,10))}
        stockReason={modalStockReason}
        onStockReasonChange={setModalStockReason}
        categoryTree={categoryTree}
        lookups={lookups}
        vendors={activeVendors}
        onTagsChanged={fetchLookupsAndTree}
        createBrand={createBrand}
        createMaterial={createMaterial}
        createColor={createColor}
        createAudience={createAudience}
        createDeliveryType={createDeliveryType}
        createWarrantyTerm={createWarrantyTerm}
      />
      <Modal
        open={permDeleteOpen}
        onClose={() => setPermDeleteOpen(false)}
        title={permDeleteTarget ? `Permanently delete "${permDeleteTarget.name}"?` : 'Permanently delete product'}
        message="This will permanently remove the product from the database. This action is irreversible and may affect historical records."
        primaryText="Permanently delete"
        variant="danger"
        onPrimary={handleConfirmPermanentDelete}
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">To confirm, type the exact product name below:</p>
          <input value={permDeleteConfirm} onChange={(e) => setPermDeleteConfirm(e.target.value)} placeholder={permDeleteTarget?.name || ''} className="w-full rounded border px-3 py-2" />
          <p className="text-xs text-rose-600">Warning: this will remove the product and nullify some references. Audit records may remain if not nullable.</p>
        </div>
      </Modal>
    </div>
  );
}
