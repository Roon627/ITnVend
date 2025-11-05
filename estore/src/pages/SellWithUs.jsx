import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaCamera, FaUpload } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

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

  return (
    <div className="bg-gradient-to-b from-white to-slate-50 min-h-screen">
      <section className="container mx-auto px-6 py-14">
        <div className="grid lg:grid-cols-2 gap-10 items-start">
          <div className="space-y-6">
            <h1 className="text-3xl lg:text-4xl font-bold">Sell with us</h1>
            <p className="text-slate-600">List a one-time item for review. We'll validate the listing and publish it on your behalf.</p>
            <ul className="list-disc pl-5 text-sm text-slate-600">
              <li>Listing fee applies for items above a threshold (staff will confirm).</li>
              <li>Upload photos and an optional payment slip if you already paid.</li>
              <li>Our team will review and publish the item to the Market Hub.</li>
            </ul>
          </div>

          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <input name="name" value={form.name} onChange={handleChange} placeholder="Your full name" className="block w-full border rounded px-3 py-2" required />
                <input name="email" type="email" value={form.email} onChange={handleChange} placeholder="Email (optional)" className="block w-full border rounded px-3 py-2" />
                <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone (optional)" className="block w-full border rounded px-3 py-2" />
                <input name="productTitle" value={form.productTitle} onChange={handleChange} placeholder="Product title" className="block w-full border rounded px-3 py-2" required />
                <input name="askingPrice" value={form.askingPrice} onChange={handleChange} placeholder="Asking price (MVR)" className="block w-full border rounded px-3 py-2" />
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="feature" checked={form.feature} onChange={handleChange} /> Featured listing (+20 MVR)</label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="block">
                  <div className="text-sm font-medium">Condition</div>
                  <select name="condition" value={form.condition} onChange={handleChange} className="mt-1 block w-full border rounded px-3 py-2">
                    <option>New</option>
                    <option>Like New</option>
                    <option>Used</option>
                  </select>
                </label>
                <div />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <input name="brand" value={form.brand} onChange={handleChange} placeholder="Brand (optional)" className="block w-full border rounded px-3 py-2" />
                <input name="model" value={form.model} onChange={handleChange} placeholder="Model (optional)" className="block w-full border rounded px-3 py-2" />
                <input name="sku" value={form.sku} onChange={handleChange} placeholder="SKU / Identifier (optional)" className="block w-full border rounded px-3 py-2" />
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <input name="quantity" type="number" min="1" value={form.quantity} onChange={handleChange} placeholder="Quantity" className="block w-full border rounded px-3 py-2" />
                <input name="serialNumber" value={form.serialNumber} onChange={handleChange} placeholder="Serial / IMEI (optional)" className="block w-full border rounded px-3 py-2" />
                <input name="warranty" value={form.warranty} onChange={handleChange} placeholder="Warranty (e.g. 6 months)" className="block w-full border rounded px-3 py-2" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium">Category</label>
                  <select name="category" value={form.category} onChange={(e) => {
                    handleChange(e);
                    const chosen = e.target.value;
                    setAvailableSubcategories(categoriesMap[chosen] || []);
                  }} className="mt-1 block w-full border rounded px-3 py-2">
                    <option value="">Select category</option>
                    {Object.keys(categoriesMap || {}).map((c) => (<option key={c} value={c}>{c}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium">Subcategory</label>
                  <select name="subcategory" value={form.subcategory} onChange={handleChange} className="mt-1 block w-full border rounded px-3 py-2" disabled={!availableSubcategories.length}>
                    <option value="">Select subcategory</option>
                    {availableSubcategories.map((s) => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Suggested tag</label>
                <div className="mt-1 flex items-center gap-2">
                  <input name="user_tag" value={form.user_tag} onChange={handleChange} placeholder="suggested-tag" className="block w-full border rounded px-3 py-2" />
                  <div className="text-xs text-slate-500">(editable)</div>
                </div>
              </div>

              {/* live fee summary */}
              <div className="p-3 border rounded bg-gray-50 text-sm">
                <div className="flex justify-between"><div>Listing fee</div><div className="font-semibold">{(Number(form.askingPrice) || 0) > LISTING_THRESHOLD ? `${LISTING_FEE_AMOUNT} MVR` : '0 MVR'}</div></div>
                <div className="flex justify-between mt-1"><div>Featured</div><div className="font-semibold">{form.feature ? `${FEATURE_FEE_AMOUNT} MVR` : '0 MVR'}</div></div>
                <div className="flex justify-between mt-2 border-t pt-2"><div className="font-semibold">Subtotal</div><div className="font-bold">{((Number(form.askingPrice) || 0) > LISTING_THRESHOLD ? LISTING_FEE_AMOUNT : 0) + (form.feature ? FEATURE_FEE_AMOUNT : 0)} MVR</div></div>
              </div>

              <div>
                <textarea name="description" value={form.description} onChange={handleChange} placeholder="Short description" rows={4} className="block w-full border rounded px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium">Photos</label>
                <div className="mt-2">
                  <input type="file" accept="image/*" multiple onChange={handlePhotos} />
                </div>
                <div className="mt-2 text-xs text-slate-500">{photos.length} photo(s) selected</div>
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((p, idx) => (
                      <div key={idx} className="border rounded overflow-hidden">
                        <img src={p.preview} alt={p.name} className="w-full h-24 object-cover" />
                        <div className="text-xs p-1 text-center">{p.name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium">Payment slip (if paid)</label>
                <div className="mt-2">
                  <input type="file" accept="image/*,application/pdf" onChange={handleSlip} />
                </div>
                {slipFile && (
                  <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
                    {slipPreview && slipFile.type !== 'application/pdf' && <img src={slipPreview} alt="slip" className="h-10 object-contain" />}<div>{slipFile.name}</div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end gap-3">
                <button type="button" onClick={() => navigate('/')} className="px-4 py-2 border rounded">Cancel</button>
                <button type="submit" disabled={submitting} className="px-6 py-2 rounded bg-rose-500 text-white">
                  {submitting ? 'Submitting...' : 'Submit listing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </div>
  );
}
