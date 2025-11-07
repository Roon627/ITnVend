import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCamera, FaCloudUploadAlt, FaHandshake, FaShieldAlt, FaStore } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const HIGHLIGHTS = [
  { label: 'Average approval', value: '24h' },
  { label: 'Marketplace reach', value: '80K+' },
  { label: 'Instant payout', value: 'MVR / USD' },
];

const FEATURE_LIST = [
  'POS-sync’d inventory and pricing',
  'Staff review and copy-polish for every listing',
  'Priority placement when fees are confirmed',
];

export default function SellWithUs() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    productTitle: '',
  condition: 'Used',
    brand: '',
    model: '',
    sku: '',
    description: '',
    askingPrice: '',
    feature: false,
    quantity: 1,
    serialNumber: '',
    warranty: '',
    category: '',
    subcategory: '',
    user_tag: '',
  });
  const [categoriesMap, setCategoriesMap] = useState({});
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  // photos: { file, preview (objectURL), name, size }
  const [photos, setPhotos] = useState([]);
  const [slipFile, setSlipFile] = useState(null);
  const [slipPreview, setSlipPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useToast();
  const navigate = useNavigate();
  const suggestedTag = (form.condition || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // fee rules
  const LISTING_THRESHOLD = 300;
  const LISTING_FEE_AMOUNT = 100;
  const FEATURE_FEE_AMOUNT = 20;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const map = await api.get('/products/categories');
        if (mounted && map && typeof map === 'object') {
          setCategoriesMap(map || {});
        }
      } catch (err) {
        // ignore — categories are optional
        console.debug('Failed to load categories for SellWithUs', err?.message || err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  };

  const handlePhotos = (e) => {
    const list = Array.from(e.target.files || []);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const maxBytes = 5 * 1024 * 1024; // 5MB
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
    setPhotos((p) => [...p, ...accepted]);
  };

  const handleSlip = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) {
      setSlipFile(null);
      setSlipPreview(null);
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    const maxBytes = 5 * 1024 * 1024; // 5MB
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

  // cleanup object URLs when component unmounts or photos change
  useEffect(() => {
    return () => {
      for (const p of photos) {
        try { URL.revokeObjectURL(p.preview); } catch {}
      }
      try { if (slipPreview) URL.revokeObjectURL(slipPreview); } catch {}
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function uploadFiles(files, category = 'casual_items') {
    const paths = [];
    for (const f of files) {
      const file = f && f.file ? f.file : f; // accept either File or {file}
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.upload(`/uploads?category=${category}`, fd);
        // API returns object or Response; try to extract path
        if (res && res.path) paths.push(res.path);
        else if (typeof res === 'string') paths.push(res);
        else if (res && res.location) paths.push(res.location);
      } catch (err) {
        console.warn('Upload failed', err);
      }
    }
    return paths;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.productTitle) return toast.push('Please provide your name and a product title', 'error');
    // compute live fees before uploading
    const asking = Number(form.askingPrice) || 0;
    const listingFee = asking > LISTING_THRESHOLD ? LISTING_FEE_AMOUNT : 0;
    const featureFee = form.feature ? FEATURE_FEE_AMOUNT : 0;
    const subtotalFee = listingFee + featureFee;
    if (subtotalFee > 0 && !slipFile) {
      return toast.push(`A listing fee of ${subtotalFee} MVR applies. Please upload a payment slip to continue.`, 'error');
    }

    setSubmitting(true);
    try {
      const uploaded = await uploadFiles(photos, 'casual_items');
      let slipData = null;
      if (slipFile) {
        const slipPaths = await uploadFiles([slipFile], 'payment_slips');
        slipData = slipPaths[0] || null;
      }

      const asking = Number(form.askingPrice) || 0;
      const listingFee = asking > LISTING_THRESHOLD ? LISTING_FEE_AMOUNT : 0;
      const featureFee = form.feature ? FEATURE_FEE_AMOUNT : 0;
      const subtotalFee = listingFee + featureFee;

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
        askingPrice: asking,
        feature: !!form.feature,
        quantity: Number(form.quantity) || 1,
        serialNumber: form.serialNumber || null,
        warranty: form.warranty || null,
        category: form.category || null,
        subcategory: form.subcategory || null,
        user_tag: form.user_tag || null,
        listing_fee_applicable: listingFee > 0,
        listing_fee: listingFee,
        payable_total: subtotalFee,
        photos: uploaded,
        payment_slip: slipData,
      };

      const res = await api.post('/sellers/submit-item', payload);
      toast.push(res?.message || 'Submission received — we will review it soon.', 'success');
      navigate('/');
    } catch (err) {
      console.error('Submit failed', err);
      const msg = err?.response?.data?.error || err?.message || 'Failed to submit listing';
      toast.push(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const feeBreakdown = useMemo(() => {
    const asking = Number(form.askingPrice) || 0;
    const listingFee = asking > LISTING_THRESHOLD ? LISTING_FEE_AMOUNT : 0;
    const featureFee = form.feature ? FEATURE_FEE_AMOUNT : 0;
    return {
      listingFee,
      featureFee,
      subtotal: listingFee + featureFee,
    };
  }, [form.askingPrice, form.feature]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 px-4 py-8 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-2xl border border-rose-100 bg-white/90 p-6 shadow-lg shadow-rose-100/40">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-500">
                Market Hub
              </span>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Sell with us</h1>
                <p className="mt-2 text-sm text-slate-600">
                  Submit a one-time listing, attach proof of payment if required, and our merchandising team will publish it across the store & POS.
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
            <div className="grid flex-1 grid-cols-3 gap-4">
              {HIGHLIGHTS.map((stat) => (
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
                    <input name="name" value={form.name} onChange={handleChange} required className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" placeholder="Your full name" />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Email
                    <input name="email" type="email" value={form.email} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" placeholder="email@example.com" />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Phone
                    <input name="phone" value={form.phone} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" placeholder="(+960) 7xx xxxx" />
                  </label>
                  <label className="text-sm font-medium text-slate-600">
                    Condition
                    <select name="condition" value={form.condition} onChange={handleChange} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100">
                      <option>New</option>
                      <option>Like New</option>
                      <option>Used</option>
                    </select>
                  </label>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Listing details</p>
                <div className="mt-3 space-y-4">
                  <input name="productTitle" value={form.productTitle} onChange={handleChange} required placeholder="Product title" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                  <textarea name="description" value={form.description} onChange={handleChange} rows={3} placeholder="Describe the item, condition, any add-ons" className="w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                  <div className="grid gap-4 md:grid-cols-3">
                    <input name="brand" value={form.brand} onChange={handleChange} placeholder="Brand" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <input name="model" value={form.model} onChange={handleChange} placeholder="Model" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <input name="sku" value={form.sku} onChange={handleChange} placeholder="SKU / reference" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <input name="askingPrice" value={form.askingPrice} onChange={handleChange} placeholder="Asking price (MVR)" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} placeholder="Quantity" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <label className="flex items-center gap-2 text-sm text-slate-600">
                      <input type="checkbox" name="feature" checked={form.feature} onChange={handleChange} />
                      Featured placement (+20 MVR)
                    </label>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <input name="serialNumber" value={form.serialNumber} onChange={handleChange} placeholder="Serial / IMEI (optional)" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <input name="warranty" value={form.warranty} onChange={handleChange} placeholder="Warranty info" className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                    <input name="user_tag" value={form.user_tag} onChange={handleChange} placeholder={`Suggested tag (${suggestedTag})`} className="rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100" />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-600">Category</label>
                      <select
                        name="category"
                        value={form.category}
                        onChange={(e) => {
                          handleChange(e);
                          const chosen = e.target.value;
                          setAvailableSubcategories(categoriesMap[chosen] || []);
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      >
                        <option value="">Select</option>
                        {Object.keys(categoriesMap || {}).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-slate-600">Subcategory</label>
                      <select
                        name="subcategory"
                        value={form.subcategory}
                        onChange={handleChange}
                        disabled={!availableSubcategories.length}
                        className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-100"
                      >
                        <option value="">Select</option>
                        {availableSubcategories.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Attachments</p>
                <div className="mt-3 space-y-4">
                  <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-4 py-6 text-center text-sm text-slate-600">
                    <FaCamera className="mb-2 text-rose-400" />
                    <span>Upload product photos</span>
                    <input type="file" accept="image/*" multiple onChange={handlePhotos} className="hidden" />
                  </label>
                  <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-6 text-center text-sm text-slate-600">
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
                  className="rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200/60 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? 'Submitting…' : 'Submit listing'}
                </button>
                <button type="button" onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-slate-700">
                  Cancel and go back
                </button>
              </div>
            </form>
          </section>

          <aside className="rounded-2xl border border-white/60 bg-white/95 p-6 shadow-lg shadow-rose-100/30">
            <div className="space-y-4">
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
                <p className="mt-2 text-xs text-slate-500">If the total is greater than 0 MVR, attach your transfer slip so we can publish instantly.</p>
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
                <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-900">{form.productTitle || 'Untitled item'}</div>
                  <div className="text-xs text-slate-500">Category • {form.category || '—'} {form.subcategory ? `› ${form.subcategory}` : ''}</div>
                  <p className="mt-2 min-h-[60px] whitespace-pre-wrap text-sm">{form.description || 'Description to be added.'}</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
