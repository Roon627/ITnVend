import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../components/Modal';
import { FaEdit, FaPlus, FaBarcode, FaTags, FaBox, FaHashtag } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import { resolveMediaUrl } from '../lib/media';

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
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeVendors, setActiveVendors] = useState([]);

  // Permanent delete dialog state (admin-only)
  const [permDeleteOpen, setPermDeleteOpen] = useState(false);
  const [permDeleteTarget, setPermDeleteTarget] = useState(null);
  const [permDeleteConfirm, setPermDeleteConfirm] = useState('');
  const [lookups, setLookups] = useState(null);
  const [categoryTree, setCategoryTree] = useState([]);

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

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

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

  const handleNavigateToEdit = useCallback(
    (product) => {
      if (!product || !product.id) return;
      navigate(`/products/${product.id}/edit`);
    },
    [navigate]
  );

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

  const handleFilterByTag = (tag) => {
    setFilters((prev) => ({ ...prev, tag, search: '' }));
  };

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
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleNavigateToEdit(product);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs"
                              >
                                <FaEdit /> Edit
                              </button>
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
                      <button
                        type="button"
                        onClick={() => handleNavigateToEdit(selectedProduct)}
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
                      >
                        <FaEdit /> Edit
                      </button>
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
                onEdit={() => handleNavigateToEdit(selectedProduct)}
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
