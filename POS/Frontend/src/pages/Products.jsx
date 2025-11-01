import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEdit, FaTrash, FaUpload, FaTimes, FaPlus, FaFileImport, FaExternalLinkAlt } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import { resolveMediaUrl } from '../lib/media';
import SelectField from '../components/SelectField';
import TagChips from '../components/TagChips';
import SpecPreview from '../components/SpecPreview';
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
  year: '',
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

function buildProductUploadCategory(category, subcategory, subsubcategory) {
  const segments = [category, subcategory, subsubcategory]
    .map((value) => (value ? String(value).trim().toLowerCase() : ''))
    .filter(Boolean)
    .map((value) => value.replace(/[^a-z0-9\-_]+/g, '-'));
  return ['products', ...segments].join('/');
}

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

function computeAutoSkuPreview(brandName = '', productName = '', year) {
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

function ProductInsight({ product, formatCurrency }) {
  if (!product) {
    return (
      <div className="text-sm text-slate-500">
        Select a product to see stock levels, pricing, and technical notes.
      </div>
    );
  }
  const previewSrc = resolveMediaUrl(product.image_source || product.imageUrl || product.image);
  return (
    <div className="space-y-4">
      {previewSrc ? (
        <img
          src={previewSrc}
          alt={product.name}
          className="w-full h-48 object-cover rounded-md border"
        />
      ) : (
        <div className="w-full h-48 rounded-md border border-dashed flex items-center justify-center text-slate-400 text-sm">
          No image available
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-slate-500">Price</p>
          <p className="font-semibold text-slate-800">{formatCurrency(product.price || 0)}</p>
        </div>
        <div>
          <p className="text-slate-500">Stock</p>
          <p className="font-semibold text-slate-800">
            {product.stock ?? 0}
            {product.track_inventory === 0 ? ' (not tracked)' : ''}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Preorder</p>
          {product.preorder_enabled ? (
            <div className="space-y-1">
              <p className="font-semibold text-emerald-700">Enabled</p>
              {product.preorder_release_date && (
                <p className="text-xs text-slate-500">
                  Release target: {product.preorder_release_date}
                </p>
              )}
              {product.preorder_notes && (
                <p className="text-xs text-slate-500 whitespace-pre-line">{product.preorder_notes}</p>
              )}
            </div>
          ) : (
            <p className="font-semibold text-slate-500">Disabled</p>
          )}
        </div>
        {product.sku && (
          <div>
            <p className="text-slate-500">SKU</p>
            <p className="font-semibold text-slate-800 break-all">{product.sku}</p>
          </div>
        )}
        {product.barcode && (
          <div>
            <p className="text-slate-500">Barcode</p>
            <p className="font-semibold text-slate-800 break-all">{product.barcode}</p>
          </div>
        )}
        {product.category && (
          <div>
            <p className="text-slate-500">Category</p>
            <p className="font-semibold text-slate-800">{product.category}</p>
          </div>
        )}
        {product.subcategory && (
          <div>
            <p className="text-slate-500">Subcategory</p>
            <p className="font-semibold text-slate-800">{product.subcategory}</p>
          </div>
        )}
      </div>
      {product.description && (
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Description</h4>
          <p className="text-sm text-slate-600 whitespace-pre-line">{product.description}</p>
        </div>
      )}
      <div>
        <h4 className="text-sm font-semibold text-slate-700 mb-2">Technical details</h4>
        <TechnicalDetailsPreview value={product.technical_details || product.technicalDetails || ''} />
      </div>
    </div>
  );
}

function ProductModal({ open, draft, onClose, onChange, onSave, onUploadImage, uploading, saving, stockChanged, stockReason, onStockReasonChange, categoryTree, lookups, onTagsChanged, createBrand, createMaterial, createColor, createCategoryRoot, createSubcategory, createSubsubcategory }) {
  const fileInputRef = useRef(null);
  if (!open || !draft) return null;
  const previewSrc = resolveMediaUrl(draft.imagePreview || draft.imageUrl || draft.image);

  const handleFieldChange = (key) => (event) => {
    // support being called with synthetic event or direct value
    if (event && event.target && Object.prototype.hasOwnProperty.call(event.target, 'value')) {
      const { value, type, checked } = event.target;
      onChange(key, type === 'checkbox' ? checked : value);
      return;
    }
    // direct value
    onChange(key, event);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">{draft.id ? 'Edit product' : 'Add product'}</h2>
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <SelectField
                label="Brand"
                value={draft.brandId || ''}
                onChange={(v) => handleFieldChange('brandId')({ target: { value: v } })}
                options={(lookups?.brands||[]).map(b=>({id:b.id,name:b.name}))}
                placeholder="Select brand"
              />
              <SelectField label="Type" value={draft.type || ''} onChange={(v) => handleFieldChange('type')({ target: { value: v } })} options={[{id:'physical',name:'Physical'},{id:'digital',name:'Digital'}]} placeholder="Select type" />
              <label className="text-sm font-medium text-slate-600">
                Year
                <input
                  value={draft.year || ''}
                  onChange={handleFieldChange('year')}
                  type="number"
                  className="mt-1 w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

            <div className="mt-2 grid gap-4 md:grid-cols-3">
              <SelectField
                label="Category"
                value={draft.categoryId || ''}
                onChange={(v) => {
                  handleFieldChange('categoryId')({ target: { value: v } });
                  handleFieldChange('subcategoryId')({ target: { value: '' } });
                  handleFieldChange('subsubcategoryId')({ target: { value: '' } });
                  const found = categoryTree.find((c) => c.id === v);
                  handleFieldChange('category')({ target: { value: found ? found.name : '' } });
                }}
                options={categoryTree.map((c) => ({ id: c.id, name: c.name }))}
                placeholder="Select category"
              />
              <SelectField
                label="Subcategory"
                value={draft.subcategoryId || ''}
                onChange={(v) => {
                  handleFieldChange('subcategoryId')({ target: { value: v } });
                  handleFieldChange('subsubcategoryId')({ target: { value: '' } });
                  let name = '';
                  for (const c of categoryTree) {
                    const child = (c.children || []).find((ch) => ch.id === v);
                    if (child) { name = child.name; break; }
                  }
                  handleFieldChange('subcategory')({ target: { value: name } });
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
                  handleFieldChange('subsubcategoryId')({ target: { value: v } });
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
    </div>
  );
}

export default function Products() {
  const toast = useToast();
  const { formatCurrency } = useSettings();
  const { user } = useAuth();
  const canDelete = user && ['manager', 'admin'].includes(user.role);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', subcategory: '', search: '' });
  const [searchValue, setSearchValue] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalDraft, setModalDraft] = useState(null);
  const [modalSaving, setModalSaving] = useState(false);
  const [modalUploading, setModalUploading] = useState(false);
  const [modalOriginalDraft, setModalOriginalDraft] = useState(null);
  const [modalStockReason, setModalStockReason] = useState('');
  const [lookups, setLookups] = useState(null);
  const [categoryTree, setCategoryTree] = useState([]);

  const [newImageUploading, setNewImageUploading] = useState(false);
  const newImageInputRef = useRef(null);

  const [bulkRows, setBulkRows] = useState([]);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkFileName, setBulkFileName] = useState('');
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

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        category: filters.category || undefined,
        subcategory: filters.subcategory || undefined,
        search: filters.search || undefined,
      };
      const list = await api.get('/products', { params });
      setProducts(Array.isArray(list) ? list : []);
      setSelectedProduct((prev) => {
        if (!prev) return list[0] || null;
        return list.find((item) => item.id === prev.id) || list[0] || null;
      });
    } catch (err) {
      toast.push('Failed to load products', 'error');
    } finally {
      setLoading(false);
    }
  }, [filters, toast]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    fetchLookupsAndTree();
  }, [fetchLookupsAndTree]);

  const handleModalFieldChange = (key, value) => {
    setModalDraft((prev) => (prev ? { ...prev, [key]: value } : null));
  };

  // create helpers for lookups
  const extractId = (obj) => obj?.id;
  
  const createBrand = async (name) => {
    try {
      const created = await api.post('/brands', { name });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new brand.');
      
      setLookups(prev => ({ ...prev, brands: [...(prev?.brands || []), { id: newId, name }] }));
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

      setLookups(prev => ({ ...prev, materials: [...(prev?.materials || []), { id: newId, name }] }));
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

      setLookups(prev => ({ ...prev, colors: [...(prev?.colors || []), { id: newId, name }] }));
      handleModalFieldChange('colorId', newId);
      toast.push('Color added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add color', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
      return false;
    }
  };

  // categories
  const createCategoryRoot = async (name) => {
    try {
      const created = await api.post('/categories', { name });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new category.');

      setCategoryTree(prev => [...prev, { id: newId, name, children: [] }]);
      handleModalFieldChange('categoryId', newId);
      handleModalFieldChange('category', name);
      // clear descendants when switching root
      handleModalFieldChange('subcategoryId', '');
      handleModalFieldChange('subsubcategoryId', '');
      handleModalFieldChange('subcategory', '');
      toast.push('Category added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add category', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
      return false;
    }
  };
  const createSubcategory = async (name) => {
    if (!modalDraft.categoryId) {
      toast.push('Select a category first', 'warning');
      return false;
    }
    try {
      const created = await api.post('/categories', { name, parentId: modalDraft.categoryId });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new subcategory.');

      setCategoryTree(prev => prev.map(cat => 
        cat.id === modalDraft.categoryId 
          ? { ...cat, children: [...(cat.children || []), { id: newId, name, children: [] }] }
          : cat
      ));
      handleModalFieldChange('subcategoryId', newId);
      handleModalFieldChange('subsubcategoryId', '');
      handleModalFieldChange('subcategory', name);
      toast.push('Subcategory added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add subcategory', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
      return false;
    }
  };
  const createSubsubcategory = async (name) => {
    if (!modalDraft.subcategoryId) {
      toast.push('Select a subcategory first', 'warning');
      return false;
    }
    try {
      const created = await api.post('/categories', { name, parentId: modalDraft.subcategoryId });
      const newId = extractId(created);
      if (!newId) throw new Error('API did not return a valid ID for the new sub-subcategory.');
      
      setCategoryTree(prev => prev.map(cat => ({
        ...cat,
        children: (cat.children || []).map(sub => 
          sub.id === modalDraft.subcategoryId
            ? { ...sub, children: [...(sub.children || []), { id: newId, name }] }
            : sub
        )
      })));
      handleModalFieldChange('subsubcategoryId', newId);
      toast.push('Sub-subcategory added', 'info');
      return true;
    } catch (e) {
      toast.push(e?.message || 'Failed to add sub-subcategory', 'error');
      fetchLookupsAndTree(); // Fallback to refetch on error
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
  }, [modalDraft?.brandId, modalDraft?.name, modalDraft?.year, modalDraft?.autoSku, lookups]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openCreateModal = () => {
    setModalDraft({
      ...EMPTY_FORM,
    });
    setModalOriginalDraft(null);
    setModalOpen(true);
    setModalStockReason('');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => (prev.search === searchValue ? prev : { ...prev, search: searchValue }));
    }, 300);
    return () => clearTimeout(timer);
  }, [searchValue]);

  const availableSubcategories = useMemo(() => {
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

  const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleAddProduct = async (event) => {
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
        availableForPreorder: form.availableForPreorder,
        preorderReleaseDate: form.preorderReleaseDate || null,
        preorderNotes: form.preorderNotes || null,
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
    }
  };

  const handleQuickStockUpdate = async (productId, newStock, reason) => {
    try {
      await api.post(`/products/${productId}/adjust-stock`, { new_stock: newStock, reason });
      toast.push('Stock updated successfully', 'success');
      await fetchProducts();
    } catch (err) {
      toast.push('Failed to update stock', 'error');
    }
  };

  const handleBeginEdit = (product) => {
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
      audience: product.audience || '',
      deliveryType: product.delivery_type || product.deliveryType || '',
      warrantyTerm: product.warranty_term || product.warrantyTerm || '',
      preorderEta: product.preorder_eta || product.preorderEta || '',
      year: product.year || '',
      autoSku: product.auto_sku === 0 || product.auto_sku === false ? false : true,
      tags: Array.isArray(product.tags) ? product.tags.map((t) => t.id || t) : product.tags || [],
      preorderReleaseDate: product.preorder_release_date || '',
      preorderNotes: product.preorder_notes || '',
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
      audience: product.audience || '',
      deliveryType: product.delivery_type || product.deliveryType || '',
      warrantyTerm: product.warranty_term || product.warrantyTerm || '',
      preorderEta: product.preorder_eta || product.preorderEta || '',
      year: product.year || '',
      autoSku: product.auto_sku === 0 || product.auto_sku === false ? false : true,
      tags: Array.isArray(product.tags) ? product.tags.map((t) => t.id || t) : product.tags || [],
      preorderReleaseDate: product.preorder_release_date || '',
      preorderNotes: product.preorder_notes || '',
    });
    setModalStockReason('');
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
        const payload = {
          name: modalDraft.name,
          price: parseFloat(modalDraft.price),
          stock: modalDraft.stock ? parseInt(modalDraft.stock, 10) || 0 : 0,
          category: modalDraft.category || null,
          subcategory: modalDraft.subcategory || null,
          image: modalDraft.image || null,
          imageUrl: modalDraft.imageUrl || null,
          description: modalDraft.description || null,
          technicalDetails: modalDraft.technicalDetails || null,
          sku: modalDraft.sku || null,
          barcode: modalDraft.barcode || null,
          cost: modalDraft.cost ? parseFloat(modalDraft.cost) : 0,
          trackInventory: modalDraft.trackInventory,
          availableForPreorder: modalDraft.availableForPreorder,
          preorderReleaseDate: modalDraft.preorderReleaseDate || null,
          preorderNotes: modalDraft.preorderNotes || null,
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
      const payload = {
        name: modalDraft.name,
        price: parseFloat(modalDraft.price),
        stock: modalDraft.stock ? parseInt(modalDraft.stock, 10) || 0 : 0,
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
        deliveryType: modalDraft.deliveryType || null,
        warrantyTerm: modalDraft.warrantyTerm || null,
        type: modalDraft.type || 'physical',
        shortDescription: modalDraft.shortDescription || null,
        preorderEta: modalDraft.preorderEta || null,
        year: modalDraft.year || null,
        tags: modalDraft.tags || [],
        autoSku: modalDraft.autoSku === false ? false : true,
        image: modalDraft.image || null,
        imageUrl: modalDraft.imageUrl || null,
        description: modalDraft.description || null,
        technicalDetails: modalDraft.technicalDetails || null,
        sku: modalDraft.sku || null,
        barcode: modalDraft.barcode || null,
        cost: modalDraft.cost ? parseFloat(modalDraft.cost) : 0,
        trackInventory: modalDraft.trackInventory,
        availableForPreorder: modalDraft.availableForPreorder,
        preorderReleaseDate: modalDraft.preorderReleaseDate || null,
        preorderNotes: modalDraft.preorderNotes || null,
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
          };
          const changedKeys = Object.keys(payload).filter((k) => {
            const a = payload[k] == null ? null : payload[k];
            const b = orig[k] == null ? null : orig[k];
            // treat number vs string normalization
            return String(a) !== String(b);
          });
          onlyStockChanged = changedKeys.length === 1 && changedKeys[0] === 'stock';
        }
      } catch (e) {
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

  const handleNewImageUpload = async (file) => {
    if (!file) return;
    setNewImageUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadCategory = buildProductUploadCategory(form.category, form.subcategory);
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
    if (!file) return;
    setModalUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // prefer category names from selected lookup ids when available
      const cName = modalDraft?.category || (modalDraft?.categoryId ? (() => {
        const found = categoryTree.find((c) => c.id === modalDraft.categoryId);
        return found ? found.name : '';
      })() : '');
      const sName = modalDraft?.subcategory || (modalDraft?.subcategoryId ? (() => {
        let found = null;
        for (const c of categoryTree) {
          if (!c.children) continue;
          const s = (c.children || []).find((s) => s.id === modalDraft.subcategoryId);
          if (s) { found = s; break; }
        }
        return found ? found.name : '';
      })() : '');
      const ssName = (modalDraft?.subsubcategoryId ? (() => {
        for (const c of categoryTree) {
          const s = (c.children || []).find((x) => x.id === modalDraft.subcategoryId);
          if (s) {
            const ss = (s.children || []).find((x) => x.id === modalDraft.subsubcategoryId);
            return ss ? ss.name : '';
          }
        }
        return '';
      })() : '');
      const uploadCategory = buildProductUploadCategory(cName, sName, ssName);
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
    } finally {
      setModalUploading(false);
    }
  };

  const handleModalChange = (key, value) => {
    setModalDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const closeModal = () => {
    setModalOpen(false);
    setModalDraft(null);
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
    }
  };

  const handleBulkFileInput = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await handleBulkFile(file);
    if (bulkFileInputRef.current) bulkFileInputRef.current.value = '';
  };

  const bulkStats = useMemo(() => {
    const total = bulkRows.length;
    const valid = bulkRows.filter((row) => row.valid).length;
    return { total, valid, invalid: total - valid };
  }, [bulkRows]);

  const handleBulkImport = async () => {
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

  const clearBulkPreview = () => {
    setBulkRows([]);
    setBulkResult(null);
    setBulkError('');
    setBulkFileName('');
  };

  const categoryOptions = useMemo(
    () => Object.keys(categories || {}).sort((a, b) => a.localeCompare(b)),
    [categories]
  );
  const bulkPreviewRows = useMemo(() => bulkRows.slice(0, 8), [bulkRows]);
  const noProducts = !loading && products.length === 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Products</h1>
          <p className="text-sm text-slate-500">
            Manage catalog inventory, pricing, and technical specifications.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold shadow hover:bg-blue-700"
          >
            <FaPlus /> Add product
          </button>
        </div>
      </div>
      {/* Add product moved to modal: click the button above to open the product editor */}

      <section className="space-y-6 rounded-lg bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Catalog overview</h2>
            <p className="text-sm text-slate-500">
              Filter products, edit details, and monitor stock levels.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
            <input
              type="search"
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search by name or SKU"
              className="w-full sm:w-48 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={filters.category}
              onChange={(event) => handleFilterChange('category', event.target.value)}
              className="w-full sm:w-auto rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              value={filters.subcategory}
              onChange={(event) => handleFilterChange('subcategory', event.target.value)}
              className="w-full sm:w-auto rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={!availableSubcategories.length}
            >
              <option value="">All subcategories</option>
              {availableSubcategories.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={fetchProducts}
              className="w-full sm:w-auto rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="space-y-6">
            <div className="overflow-hidden rounded-lg border">
              {loading ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  Loading products...
                </div>
              ) : noProducts ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  No products found. Adjust filters or add a new product.
                </div>
              ) : (
                <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Product</th>
                      <th className="px-4 py-3 text-left font-medium">Price</th>
                      <th className="px-4 py-3 text-left font-medium">Stock</th>
                      <th className="px-4 py-3 text-left font-medium">Category</th>
                      <th className="px-4 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {products.map((product) => (
                      <tr
                        key={product.id}
                        className={`cursor-pointer transition hover:bg-slate-50 ${selectedProduct?.id === product.id ? 'bg-blue-50/60' : ''}`}
                        onClick={() => setSelectedProduct(product)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">{product.name}</div>
                          <div className="space-x-2 text-xs text-slate-500">
                            {product.sku && <span>SKU: {product.sku}</span>}
                            {product.barcode && <span>Barcode: {product.barcode}</span>}
                            {(product.preorder_enabled === 1 || product.preorder_enabled === true || product.preorder_enabled === '1') && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                                Preorder
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {formatCurrency(product.price || 0)}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {product.track_inventory === 0 ? '--' : product.stock ?? 0}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {product.category || '--'}
                          {product.subcategory ? ` / ${product.subcategory}` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleBeginEdit(product);
                              }}
                              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                            >
                              <FaEdit /> Edit
                            </button>
                            {(user && ['manager','admin'].includes(user.role)) && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  const newStock = prompt(`Update stock for "${product.name}" (current: ${product.stock || 0}):`, product.stock || 0);
                                  if (newStock !== null) {
                                    const stockValue = parseInt(newStock, 10) || 0;
                                    const reason = prompt('Reason for stock adjustment (required):');
                                    if (reason && reason.trim()) {
                                      handleQuickStockUpdate(product.id, stockValue, reason.trim());
                                    }
                                  }
                                }}
                                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50"
                                title="Quick stock adjustment"
                              >
                                📦 Stock
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteProduct(product.id);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                              >
                                <FaTrash /> Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              )}
            </div>

            <div className="space-y-4 rounded-lg border bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Bulk import</h3>
                  <p className="text-xs text-slate-500">
                    Upload a CSV with columns like name, price, stock, category, sku, barcode.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={bulkFileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={handleBulkFileInput}
                  />
                  <button
                    type="button"
                    onClick={() => bulkFileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm hover:bg-slate-100"
                    disabled={bulkBusy}
                  >
                    <FaFileImport /> Select CSV
                  </button>
                  {bulkRows.length > 0 && (
                    <button
                      type="button"
                      onClick={clearBulkPreview}
                      className="rounded-md border px-3 py-2 text-sm hover:bg-slate-100"
                      disabled={bulkBusy}
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
              {bulkFileName && (
                <div className="text-xs text-slate-500">
                  Loaded file: <span className="font-medium text-slate-700">{bulkFileName}</span>
                </div>
              )}
              {bulkError && (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                  {bulkError}
                </div>
              )}
              {bulkRows.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-4 text-xs text-slate-600">
                    <span>
                      Total rows: <strong>{bulkStats.total}</strong>
                    </span>
                    <span className="text-emerald-600">
                      Valid: <strong>{bulkStats.valid}</strong>
                    </span>
                    <span className="text-amber-600">
                      Needs review: <strong>{bulkStats.invalid}</strong>
                    </span>
                  </div>
                  <div className="max-h-48 overflow-auto rounded-md border bg-white">
                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                      <thead className="bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">#</th>
                          <th className="px-3 py-2 text-left font-medium">Name</th>
                          <th className="px-3 py-2 text-left font-medium">Price</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bulkPreviewRows.map((row, index) => (
                          <tr key={index} className={row.valid ? '' : 'bg-amber-50'}>
                            <td className="px-3 py-2">{index + 1}</td>
                            <td className="px-3 py-2">
                              {row.product.name || (
                                <span className="text-slate-400">Unnamed</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {Number.isFinite(row.product.price)
                                ? formatCurrency(row.product.price)
                                : '--'}
                            </td>
                            <td className="px-3 py-2">
                              {row.valid ? (
                                <span className="font-medium text-emerald-600">Ready</span>
                              ) : (
                                <span className="font-medium text-amber-600">
                                  {row.issues[0] || 'Missing data'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {bulkRows.length > bulkPreviewRows.length && (
                    <p className="text-xs text-slate-500">
                      Showing first {bulkPreviewRows.length} rows of {bulkRows.length}. Fix highlighted issues before importing.
                    </p>
                  )}
                </div>
              )}
              {bulkResult && (
                <div
                  className={`rounded-md border px-3 py-2 text-xs ${
                    (bulkResult.failed?.length || 0) > 0
                      ? 'border-amber-200 bg-amber-50 text-amber-700'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  }`}
                >
                  <p className="font-medium">
                    {bulkResult.inserted || 0} created / {bulkResult.updated || 0} updated / {bulkResult.failed?.length || 0} failed
                  </p>
                  {bulkResult.failed?.length > 0 && (
                    <p className="mt-1">
                      Rows {bulkResult.failed.slice(0, 5).map((item) => item.index + 1).join(', ')}
                      {bulkResult.failed.length > 5 ? '...' : ''} need attention.
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="text-xs text-slate-500">
                  Only valid rows are imported. Invalid rows stay highlighted for review.
                </div>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-blue-400"
                  disabled={bulkBusy || bulkStats.valid === 0}
                >
                  <FaUpload />
                  {bulkBusy ? 'Importing...' : 'Import valid rows'}
                </button>
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="space-y-4 rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">Product insight</h3>
                  <p className="text-xs text-slate-500">Focus on a product to preview metadata.</p>
                </div>
                {selectedProduct && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                      onClick={() => handleBeginEdit(selectedProduct)}
                    >
                      <FaEdit /> Edit
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteProduct(selectedProduct.id)}
                      >
                        <FaTrash /> Remove
                      </button>
                    )}
                  </div>
                )}
              </div>
              <ProductInsight product={selectedProduct} formatCurrency={formatCurrency} />
            </div>
          </aside>
        </div>
      </section>

      <ProductModal
        open={modalOpen}
        draft={modalDraft}
        onClose={closeModal}
        onChange={handleModalChange}
        onSave={handleModalSave}
        onUploadImage={handleModalImageUpload}
        uploading={modalUploading}
        saving={modalSaving}
        stockChanged={modalOriginalDraft && modalDraft && (parseInt(modalDraft.stock||0,10) !== parseInt(modalOriginalDraft.stock||0,10))}
        stockReason={modalStockReason}
        onStockReasonChange={setModalStockReason}
        categoryTree={categoryTree}
        lookups={lookups}
        onTagsChanged={fetchLookupsAndTree}
        createBrand={createBrand}
        createMaterial={createMaterial}
        createColor={createColor}
        createCategoryRoot={createCategoryRoot}
        createSubcategory={createSubcategory}
        createSubsubcategory={createSubsubcategory}
      />
    </div>
  );
}
