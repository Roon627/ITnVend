import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCamera, FaCloudUploadAlt, FaHandshake, FaShieldAlt, FaStore } from 'react-icons/fa';
import api from '../lib/api';
import useMarketplaceStats from '../hooks/useMarketplaceStats';
import { makeSku } from '../lib/sku';
import { useToast } from '../components/ToastContext';

// initial placeholders; will be replaced by live stats on mount
const HIGHLIGHTS = [
  { key: 'totalProducts', label: 'Total products', value: '—' },
  { key: 'vendors', label: 'Approved vendors', value: '—' },
  { key: 'sellers', label: 'Peer sellers', value: '—' },
];

const FEATURE_LIST = [
  "POS-sync'd inventory and pricing",
  'Staff review and copy-polish for every listing',
  'Priority placement when fees are confirmed',
];

const AVAILABILITY_STATUS_OPTIONS = [
  { id: 'in_stock', label: 'In Stock' },
  { id: 'preorder', label: 'Preorder' },
  { id: 'vendor', label: 'Through Vendor' },
  { id: 'used', label: 'Used / Refurb' },
];

const AUDIENCE_OPTIONS = [
  { id: '', label: 'Not specified' },
  { id: 'men', label: 'Men' },
  { id: 'women', label: 'Women' },
  { id: 'unisex', label: 'Unisex' },
];

const DELIVERY_OPTIONS = [
  { id: 'shipping', label: 'Shipping' },
  { id: 'pickup', label: 'In-store pickup' },
  { id: 'instant_download', label: 'Instant download' },
];

const WARRANTY_OPTIONS = [
  { id: 'none', label: 'No warranty' },
  { id: '1_year', label: '1 year' },
  { id: 'lifetime', label: 'Lifetime' },
];

const PRODUCT_TYPES = [
  { id: 'physical', label: 'Physical' },
  { id: 'digital', label: 'Digital' },
];

const currentYear = new Date().getFullYear();

const DEFAULT_FORM = {
  name: '',
  email: '',
  phone: '',
  productTitle: '',
  condition: 'Used',
  brand: '',
  model: '',
  sku: '',
  autoSku: true,
  shortDescription: '',
  description: '',
  technicalDetails: '',
  price: '',
  stock: 1,
  type: 'physical',
  availabilityStatus: 'in_stock',
  barcode: '',
  serialNumber: '',
  warranty: '',
  warrantyTerm: 'none',
  audience: '',
  deliveryType: '',
  year: currentYear,
  category: '',
  subcategory: '',
  subsubcategory: '',
  tags: '',
  user_tag: '',
  material: '',
  color: '',
  weight: '',
  dimensions: '',
  vendorNotes: '',
  feature: false,
  agreeTerms: false,
};

const LISTING_THRESHOLD = 300;
const LISTING_FEE_AMOUNT = 100;
const FEATURE_FEE_AMOUNT = 20;

function normalizeTags(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export default function SellWithUs() {
  const { stats, loading: _statsLoading } = useMarketplaceStats();
  const [form, setForm] = useState(DEFAULT_FORM);
  const [categoriesMap, setCategoriesMap] = useState({});
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();

  const suggestedTag = useMemo(
    () => (form.condition || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    [form.condition],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const map = await api.get('/products/categories');
        if (mounted && map && typeof map === 'object') {
          setCategoriesMap(map || {});
        }
      } catch (err) {
        console.debug('Failed to load categories for SellWithUs', err?.message || err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // stats loading handled by useMarketplaceStats (polls by default every 30s)

  useEffect(() => {
    const subcats = categoriesMap[form.category];
    setAvailableSubcategories(Array.isArray(subcats) ? subcats : []);
  }, [categoriesMap, form.category]);

  useEffect(() => {
    if (!form.autoSku) return;
    const computed = makeSku({
      brandName: form.brand,
      productName: form.productTitle,
      year: form.year,
    });
    setForm((prev) => {
      if (!prev.autoSku || prev.sku === computed) return prev;
      return { ...prev, sku: computed };
    });
  }, [form.autoSku, form.brand, form.productTitle, form.year]);

  useEffect(() => {
    return () => {
      photos.forEach((p) => {
        try {
          if (p.preview) URL.revokeObjectURL(p.preview);
        } catch {
          /* noop */
        }
      });
      try {
        if (slipPreview) URL.revokeObjectURL(slipPreview);
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => {
      const nextValue = type === 'checkbox' ? checked : value;
      const updated = { ...prev, [name]: nextValue };
      if (name === 'category') {
        updated.subcategory = '';
        updated.subsubcategory = '';
      }
      return updated;
    });
  };

  const handlePhotos = (e) => {
    const list = Array.from(e.target.files || []);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = 5 * 1024 * 1024;
    const accepted = [];
    for (const f of list) {
      if (!allowed.includes(f.type)) {
        toast.push(`${f.name} has unsupported file type. Only JPG/PNG/WEBP allowed.`, 'error');
        continue;
      }
      if (f.size > maxBytes) {
        toast.push(`${f.name} is too large (max 5MB).`, 'error');
        continue;
      }
      const preview = URL.createObjectURL(f);
      accepted.push({ file: f, preview, name: f.name, size: f.size });
    }
    if (accepted.length === 0 && list.length > 0) return;
    setPhotos((prev) => [...prev, ...accepted]);
  };

  const handleSlip = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setSlipFile(null);
      setSlipPreview(null);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxBytes = 5 * 1024 * 1024;
    if (!allowed.includes(f.type)) {
      toast.push('Payment slip must be an image or PDF (max 5MB).', 'error');
      return;
    }
    if (f.size > maxBytes) {
      toast.push('Payment slip is too large (max 5MB).', 'error');
      return;
    }
    setSlipFile(f);
    try {
      setSlipPreview(URL.createObjectURL(f));
    } catch {
      setSlipPreview(null);
    }
  };

  async function uploadFiles(files, category = 'casual_items') {
    const paths = [];
    for (const f of files) {
      const file = f && f.file ? f.file : f;
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.upload(`/uploads?category=${category}`, fd);
        if (res && res.path) paths.push(res.path);
        else if (typeof res === 'string') paths.push(res);
        else if (res && res.location) paths.push(res.location);
      } catch (err) {
        console.warn('Upload failed', err);
      }
    }
    return paths;
  }

  const feeBreakdown = useMemo(() => {
    const priceValue = Number(form.price) || 0;
    const listingFee = priceValue > LISTING_THRESHOLD ? LISTING_FEE_AMOUNT : 0;
    const featureFee = form.feature ? FEATURE_FEE_AMOUNT : 0;
    return {
      priceValue,
      listingFee,
      featureFee,
      subtotal: listingFee + featureFee,
    };
  }, [form.price, form.feature]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.productTitle) {
      toast.push('Please provide your name and product title', 'error');
      return;
    }
    if (form.price === '') {
      toast.push('Please enter a selling price (can be 0 if needed).', 'error');
      return;
    }
    if (!form.agreeTerms) {
      toast.push('Please agree to the marketplace terms to continue.', 'error');
      return;
    }
    if (feeBreakdown.subtotal > 0 && !slipFile) {
      toast.push(`A listing fee of ${feeBreakdown.subtotal} MVR applies. Upload a payment slip to continue.`, 'error');
      return;
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFiles(photos, 'casual_items');
      let slipData = null;
      if (slipFile) {
        const slipPaths = await uploadFiles([slipFile], 'payment_slips');
        slipData = slipPaths[0] || null;
      }

      const priceValue = feeBreakdown.priceValue;
      const tagsArray = normalizeTags(form.tags);
      const stockValue = Number(form.stock) || 1;
      const productDetails = {
        name: form.productTitle,
        shortDescription: form.shortDescription || null,
        description: form.description || null,
        technicalDetails: form.technicalDetails || null,
        condition: form.condition || null,
        brand: form.brand || null,
        model: form.model || null,
        sku: form.sku || null,
        autoSku: form.autoSku,
        year: form.year || null,
        price: priceValue,
        cost: null,
        stock: stockValue,
        trackInventory: false,
        type: form.type,
        availabilityStatus: form.availabilityStatus || 'in_stock',
        barcode: form.barcode || null,
        serialNumber: form.serialNumber || null,
        warranty: form.warranty || null,
        warrantyTerm: form.warrantyTerm || null,
        audience: form.audience || null,
        deliveryType: form.deliveryType || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        subsubcategory: form.subsubcategory || null,
        tags: tagsArray,
        material: form.material || null,
        color: form.color || null,
        weight: form.weight || null,
        dimensions: form.dimensions || null,
        vendorNotes: form.vendorNotes || null,
        availableForPreorder: false,
        preorderReleaseDate: null,
        preorderEta: null,
        preorderNotes: null,
        inventoryManagedBySeller: true,
        sellerTermsAgreed: true,
        attachments: {
          uploadedPhotos: uploaded,
          paymentSlip: slipData,
        },
        agreements: {
          sellerResponsibleForTransaction: true,
          platformIsListingOnly: true,
        },
      };

      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        productTitle: form.productTitle,
        brand: form.brand || null,
        model: form.model || null,
        sku: form.sku || null,
        condition: form.condition || null,
        description: form.description,
        askingPrice: priceValue,
        feature: !!form.feature,
        quantity: stockValue,
        serialNumber: form.serialNumber || null,
        warranty: form.warranty || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        subsubcategory: form.subsubcategory || null,
        user_category: form.category || null,
        user_subcategory: form.subcategory || null,
        user_tag: form.user_tag || suggestedTag,
        listing_fee_applicable: feeBreakdown.listingFee > 0,
        listing_fee: feeBreakdown.listingFee,
        payable_total: feeBreakdown.subtotal,
        photos: uploaded,
        payment_slip: slipData,
        product_details: productDetails,
        seller_terms_agreed: !!form.agreeTerms,
      };

      const res = await api.post('/sellers/submit-item', payload);
      toast.push(res?.message || 'Submission received - we will review it soon.', 'success');
      setForm((prev) => ({ ...DEFAULT_FORM, year: prev.year || currentYear }));
      photos.forEach((p) => {
        try {
          if (p.preview) URL.revokeObjectURL(p.preview);
        } catch {
          /* noop */
        }
      });
      setPhotos([]);
      setSlipFile(null);
      if (slipPreview) {
        try {
          URL.revokeObjectURL(slipPreview);
        } catch {
          /* noop */
        }
      }
      setSlipPreview(null);
      navigate('/');
    } catch (err) {
      console.error('Submit failed', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to submit listing';
      toast.push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const tagsList = useMemo(() => normalizeTags(form.tags), [form.tags]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-rose-100 bg-white/90 p-6 shadow-lg shadow-rose-100/40">
          <div className="flex flex-col gap-6 items-start">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-500">
                Market Hub
              </span>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Sell with us</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Submit a one-time listing with full product metadata, attach proof of payment if required, and our merchandising team will publish it across the store & POS.
                </p>
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                {FEATURE_LIST.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <FaShieldAlt className="mt-0.5 text-rose-400" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="w-full grid grid-cols-1 gap-4 sm:grid-cols-3">
              {/* Render live stats when available, fall back to HIGHLIGHTS placeholders */}
              {(
                stats && (stats.totalProducts || stats.vendors || stats.sellers) ? [
                  { label: 'Total products', value: stats.totalProducts },
                  { label: 'Approved vendors', value: stats.vendors },
                  { label: 'Peer sellers', value: stats.sellers },
                ] : HIGHLIGHTS
              ).map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-rose-100 bg-white px-4 py-3 text-center shadow-sm">
                  <div className="text-xl font-semibold text-slate-900">{stat.value}</div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <section className="rounded-2xl border border-white/70 bg-white/95 p-6 shadow-xl shadow-rose-100/30">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Seller details</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Name*
                    <input
                      name="name"
                      value={form.name}
                      onChange={handleChange}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Your full name"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Email
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="email@example.com"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Phone
                    <input
                      name="phone"
                      value={form.phone}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="(+960) 7xx xxxx"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Condition
                    <select
                      name="condition"
                      value={form.condition}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      <option>New</option>
                      <option>Like New</option>
                      <option>Used</option>
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Product overview</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600 md:col-span-2">
                    Product title*
                    <input
                      name="productTitle"
                      value={form.productTitle}
                      onChange={handleChange}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="e.g. Surface Laptop 5"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Brand
                    <input
                      name="brand"
                      value={form.brand}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Brand name"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Model
                    <input
                      name="model"
                      value={form.model}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Model / trim"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Year
                    <input
                      name="year"
                      type="number"
                      value={form.year}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <div>
                    <label className="text-sm font-medium text-slate-600 flex items-center justify-between">
                      SKU
                      <span className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                        <input
                          type="checkbox"
                          name="autoSku"
                          checked={form.autoSku}
                          onChange={handleChange}
                          className="rounded border-slate-300 text-rose-500"
                        />
                        Auto-generate
                      </span>
                    </label>
                    <input
                      name="sku"
                      value={form.sku}
                      onChange={handleChange}
                      disabled={form.autoSku}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-slate-50"
                      placeholder="AUTO"
                    />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Descriptions</p>
                <div className="mt-3 space-y-4">
                  <label className="text-sm font-medium text-slate-600">
                    One-line summary
                    <input
                      name="shortDescription"
                      value={form.shortDescription}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Short blurb shown on cards"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Detailed description
                    <textarea
                      name="description"
                      value={form.description}
                      onChange={handleChange}
                      rows={4}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Features, selling points, condition notes"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Technical details / specs
                    <textarea
                      name="technicalDetails"
                      value={form.technicalDetails}
                      onChange={handleChange}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Optional spec sheet text"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Pricing & inventory</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Selling price (MVR)*
                    <input
                      name="price"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.price}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="e.g. 8500"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Quantity available
                    <input
                      name="stock"
                      type="number"
                      min="1"
                      value={form.stock}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Availability
                    <select
                      name="availabilityStatus"
                      value={form.availabilityStatus}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      {AVAILABILITY_STATUS_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Product type
                    <select
                      name="type"
                      value={form.type}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      {PRODUCT_TYPES.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Barcode / identifier
                    <input
                      name="barcode"
                      value={form.barcode}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="EAN / UPC (optional)"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Serial number
                    <input
                      name="serialNumber"
                      value={form.serialNumber}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Warranty summary
                    <textarea
                      name="warranty"
                      value={form.warranty}
                      onChange={handleChange}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="e.g. Remaining AppleCare until Oct 2025"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Warranty term
                    <select
                      name="warrantyTerm"
                      value={form.warrantyTerm}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      {WARRANTY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Classification</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Category
                    <select
                      name="category"
                      value={form.category}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      <option value="">Select</option>
                      {Object.keys(categoriesMap).map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Subcategory
                    <select
                      name="subcategory"
                      value={form.subcategory}
                      onChange={handleChange}
                      disabled={!availableSubcategories.length}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100 disabled:bg-slate-50"
                    >
                      <option value="">Select</option>
                      {availableSubcategories.map((subcategory) => (
                        <option key={subcategory} value={subcategory}>
                          {subcategory}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-600 md:col-span-2">
                    Additional tags (comma separated)
                    <input
                      name="tags"
                      value={form.tags}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="gaming, microsoft, touchscreen"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Material / finish
                    <input
                      name="material"
                      value={form.material}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Primary color
                    <input
                      name="color"
                      value={form.color}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Weight
                    <input
                      name="weight"
                      value={form.weight}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="e.g. 1.6kg"
                    />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Dimensions
                    <input
                      name="dimensions"
                      value={form.dimensions}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="e.g. 13” x 9” x 0.5”"
                    />
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Audience & delivery</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="text-sm font-medium text-slate-600">
                    Intended audience
                    <select
                      name="audience"
                      value={form.audience}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      {AUDIENCE_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Delivery type
                    <select
                      name="deliveryType"
                      value={form.deliveryType}
                      onChange={handleChange}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                    >
                      <option value="">Not specified</option>
                      {DELIVERY_OPTIONS.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  Quantities are displayed to buyers for context, but ITnVend does not manage fulfilment or stock for peer-to-peer listings.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs uppercase tracking-wide text-slate-400">Listing options</p>
                <div className="mt-3 flex flex-col gap-3">
                  <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      name="feature"
                      checked={form.feature}
                      onChange={handleChange}
                      className="rounded border-slate-300 text-rose-500"
                    />
                    Boost listing (adds {FEATURE_FEE_AMOUNT} MVR)
                  </label>
                  <div className="text-sm text-slate-600">
                    Category tag:
                    <span className="ml-2 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                      {form.user_tag || suggestedTag}
                    </span>
                    <input
                      name="user_tag"
                      value={form.user_tag || ''}
                      onChange={handleChange}
                      className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Override the suggested listing tag"
                    />
                  </div>
                  <label className="text-sm font-medium text-slate-600">
                    Internal notes for reviewer
                    <textarea
                      name="vendorNotes"
                      value={form.vendorNotes}
                      onChange={handleChange}
                      rows={2}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      placeholder="Optional clarifications for the merchandising team"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-400">Marketplace terms</p>
                <label className="mt-3 flex items-start gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="agreeTerms"
                    checked={form.agreeTerms}
                    onChange={handleChange}
                    className="mt-1 rounded border-slate-300 text-rose-500"
                  />
                  <span>
                    I understand ITnVend Market Hub is a listing platform only. I will handle inspections, payments, delivery, and any disputes directly with the buyer, and I accept that the buyer will see the same notice before contacting me.
                  </span>
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  We encourage clear receipts and written agreements between you and the buyer. ITnVend staff may remove listings that violate policy but we do not mediate peer-to-peer transactions.
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Attachments</p>
                <div className="mt-3 space-y-4">
                  <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-4 py-6 text-center text-sm text-slate-600 cursor-pointer">
                    <FaCamera className="mb-2 text-rose-400" />
                    <span>Upload product photos</span>
                    <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                  </label>
                  <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center text-sm text-slate-600 cursor-pointer">
                    <FaCloudUploadAlt className="mb-2 text-emerald-400" />
                    <span>Payment slip (required if fees apply)</span>
                    <input type="file" accept="image/*,application/pdf" onChange={handleSlip} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex flex-col gap-3 pt-4 border-t">
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-sm btn-sm-primary rounded-full bg-rose-500 text-sm font-semibold text-white shadow-lg shadow-rose-200/60 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? 'Submitting.' : 'Submit listing'}
                </button>
                <button type="button" onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-slate-700">
                  Cancel and go back
                </button>
              </div>
            </form>
          </section>

          <aside className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-rose-100/30 space-y-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Fee summary</p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Listing fee</span>
                  <span className="font-semibold">{feeBreakdown.listingFee} MVR</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Featured placement</span>
                  <span className="font-semibold">{feeBreakdown.featureFee} MVR</span>
                </div>
                <div className="flex items-center justify-between border-t pt-2 text-base font-semibold">
                  <span>Total due</span>
                  <span>{feeBreakdown.subtotal} MVR</span>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Listings priced above {LISTING_THRESHOLD} MVR incur a {LISTING_FEE_AMOUNT} MVR verification fee. Attach a bank transfer slip when a fee applies for instant approval.
              </p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Photos</p>
              {photos.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No images uploaded yet.</p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photos.map((p, idx) => (
                    <div key={idx} className="overflow-hidden rounded-lg border border-slate-100">
                      <img src={p.preview} alt={p.name} className="h-20 w-full object-cover" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Payment slip</p>
              {slipFile ? (
                <div className="mt-2 flex items-center gap-3 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  <FaHandshake />
                  <div>
                    <div className="font-semibold">{slipFile.name}</div>
                    <div className="text-xs">{(slipFile.size / 1024).toFixed(0)} KB</div>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Attach a bank transfer slip when a fee applies.</p>
              )}
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Listing preview</p>
              <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600 space-y-2">
                <div className="font-semibold text-slate-900 flex items-center gap-2">
                  <FaStore className="text-rose-400" />
                  {form.productTitle || 'Untitled item'}
                </div>
                <div className="text-xs text-slate-500">
                  Category &rsaquo; {form.category || '-'}
                  {form.subcategory ? ` > ${form.subcategory}` : ''}
                </div>
                <div className="text-base font-semibold text-slate-900">
                  {feeBreakdown.priceValue ? `${feeBreakdown.priceValue.toLocaleString()} MVR` : 'Set a price'}
                </div>
                <div className="text-xs text-slate-500">SKU: {form.sku || 'AUTO'}</div>
                <p className="min-h-[60px] whitespace-pre-wrap text-sm">{form.description || 'Description to be added.'}</p>
                {tagsList.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tagsList.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
