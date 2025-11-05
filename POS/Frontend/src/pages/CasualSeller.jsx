import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const LISTING_FEE = 100;
const FEATURE_FEE = 20;

export default function CasualSeller() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    productTitle: '',
    brand: '',
    model: '',
    sku: '',
    description: '',
    condition: 'Used',
    photos: [],
    askingPrice: '',
    feature: false,
    quantity: 1,
    serialNumber: '',
    warranty: '',
    user_category: '',
    user_subcategory: '',
    user_tag: '',
  });
  const [categoriesMap, setCategoriesMap] = useState({});
  const [availableSubcategories, setAvailableSubcategories] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [invoice, setInvoice] = useState(null);
  const [previews, setPreviews] = useState([]);
  const toast = useToast();

  function change(k, v) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function uploadPhotos(files) {
    setUploading(true);
    const saved = [];
    for (const f of Array.from(files || [])) {
      // validate file type and size
      if (!f.type.startsWith('image/')) {
        console.warn('Skipping non-image file', f.name);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        console.warn('Skipping large file >5MB', f.name);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res = await api.upload('/uploads?category=casual_items', fd);
        if (res && res.path) saved.push(res.path);
        else if (res && res.url) saved.push(res.url);
        // create a preview for the uploaded file
        try {
          const url = URL.createObjectURL(f);
          setPreviews((p) => [...p, url]);
        } catch (previewErr) {
          console.debug('Failed to create preview after upload', previewErr);
        }
      } catch (err) {
        console.warn('Photo upload failed', err?.message || err);
      }
    }
    setUploading(false);
    return saved;
  }

  const handleFiles = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    // show immediate previews for local files
    for (const f of Array.from(files)) {
      try {
        const url = URL.createObjectURL(f);
        setPreviews((p) => [...p, url]);
      } catch (previewErr) {
        console.debug('Failed to create preview before upload', previewErr);
      }
    }
    const uploaded = await uploadPhotos(files);
    setForm((s) => ({ ...s, photos: [...(s.photos || []), ...uploaded] }));
  };

  // Listing fee only applies for items above threshold (300 MVR)
  const ASKING_PRICE_THRESHOLD = 300;
  const priceNum = Number(form.askingPrice) || 0;
  const listingApplies = priceNum > ASKING_PRICE_THRESHOLD;
  const listingFee = listingApplies ? LISTING_FEE : 0;
  const total = listingFee + (form.feature ? FEATURE_FEE : 0);

  // derive a suggested tag from condition
  const suggestedTag = (form.condition || '').toString().toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // load categories for dropdowns
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const map = await api.get('/products/categories');
        if (mounted && map && typeof map === 'object') setCategoriesMap(map || {});
      } catch (err) {
        console.debug('Failed to load categories', err?.message || err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.productTitle) return toast.push('Name and product title are required', 'error');
    setSubmitting(true);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        email: form.email,
        productTitle: form.productTitle,
        brand: form.brand || null,
        model: form.model || null,
        sku: form.sku || null,
        description: form.description,
        condition: form.condition,
        photos: form.photos,
        askingPrice: Number(form.askingPrice) || 0,
        quantity: Number(form.quantity) || 1,
        serialNumber: form.serialNumber || null,
        warranty: form.warranty || null,
        feature: !!form.feature,
        listing_fee_applicable: listingApplies,
        listing_fee: listingFee,
        payable_total: total,
        user_category: form.user_category || null,
        user_subcategory: form.user_subcategory || null,
        user_tag: form.user_tag || suggestedTag,
      };
      const res = await api.post('/sellers/submit-item', payload);
      setInvoice({ id: res.invoiceId, subtotal: res.subtotal, total: res.total });
      toast.push(res.message || 'Submitted — invoice created', 'success');
    } catch (err) {
      console.error('Submit failed', err);
      toast.push(err?.message || 'Submission failed', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">One-time seller — submit an item</h2>
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <input placeholder="Your name" value={form.name} onChange={(e) => change('name', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="Phone" value={form.phone} onChange={(e) => change('phone', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="Email" value={form.email} onChange={(e) => change('email', e.target.value)} className="border rounded px-3 py-2" />
          <select value={form.condition} onChange={(e) => change('condition', e.target.value)} className="border rounded px-3 py-2">
            <option>New</option>
            <option>Like New</option>
            <option>Used</option>
          </select>
        </div>

        <input placeholder="Product title" value={form.productTitle} onChange={(e) => change('productTitle', e.target.value)} className="border rounded px-3 py-2 w-full" />
        <textarea placeholder="Description" value={form.description} onChange={(e) => change('description', e.target.value)} className="border rounded px-3 py-2 w-full" rows={3} />

        <div>
          <label className="block text-sm font-medium">Photos (optional)</label>
          <input type="file" accept="image/*" multiple onChange={handleFiles} className="mt-2 text-sm" />
          <div className="bg-white p-4 rounded shadow-sm">
            <h3 className="text-sm font-semibold mb-2">Preview</h3>
            <div className="text-sm text-gray-700 mb-2"><strong>Category:</strong> {form.user_category || '—'} {form.user_subcategory ? `› ${form.user_subcategory}` : ''}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Condition:</strong> {form.condition} <em className="ml-2 text-xs text-gray-500">(suggested tag: {suggestedTag})</em></div>
            <div className="text-sm text-gray-700 mb-2"><strong>Preview title:</strong> {form.productTitle || '—'}</div>
            <div className="text-sm text-gray-700 mb-2"><strong>Description:</strong> {form.description ? (<div className="whitespace-pre-wrap">{form.description}</div>) : '—'}</div>
            <div className="text-sm text-gray-700 mt-2"><strong>User tag (editable):</strong>
              <input value={form.user_tag || suggestedTag} onChange={(e) => change('user_tag', e.target.value)} className="ml-2 border rounded px-2 py-1 text-sm" />
            </div>
          </div>

          {uploading && <div className="text-xs text-gray-500">Uploading photos…</div>}
          {(previews && previews.length > 0) && (
            <div className="flex flex-wrap gap-2 mt-2">
              {previews.map((p, i) => (
                <img key={i} src={p} className="h-20 w-20 object-cover rounded" alt={`preview-${i}`} />
              ))}
            </div>
          )}
          {form.photos && form.photos.length > 0 && (
            <div className="mt-2 text-xs text-gray-600">Uploaded: {form.photos.length} file(s)</div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Asking price (MVR)</label>
            <input inputMode="numeric" placeholder="e.g. 500" value={form.askingPrice} onChange={(e) => change('askingPrice', e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" />
            <p className="text-xs text-gray-500 mt-1">Prices help us determine listing fee eligibility and suggested pricing.</p>
          </div>
          <div className="flex items-center">
            <label className="inline-flex items-center gap-2"><input type="checkbox" checked={form.feature} onChange={(e) => change('feature', e.target.checked)} /> <span className="text-sm">Feature this item</span></label>
            <span className="ml-3 text-xs text-gray-500">(+{FEATURE_FEE} MVR)</span>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <input placeholder="Brand (optional)" value={form.brand} onChange={(e) => change('brand', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="Model (optional)" value={form.model} onChange={(e) => change('model', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="SKU / Identifier (optional)" value={form.sku} onChange={(e) => change('sku', e.target.value)} className="border rounded px-3 py-2" />
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <input placeholder="Quantity" type="number" min="1" value={form.quantity} onChange={(e) => change('quantity', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="Serial / IMEI (optional)" value={form.serialNumber} onChange={(e) => change('serialNumber', e.target.value)} className="border rounded px-3 py-2" />
          <input placeholder="Warranty (e.g. 6 months)" value={form.warranty} onChange={(e) => change('warranty', e.target.value)} className="border rounded px-3 py-2" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Category</label>
            <select value={form.user_category} onChange={(e) => { change('user_category', e.target.value); setAvailableSubcategories(categoriesMap[e.target.value] || []); }} className="mt-1 border rounded px-3 py-2 w-full">
              <option value="">Select category</option>
              {Object.keys(categoriesMap || {}).map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium">Subcategory</label>
            <select value={form.user_subcategory} onChange={(e) => change('user_subcategory', e.target.value)} className="mt-1 border rounded px-3 py-2 w-full" disabled={!availableSubcategories.length}>
              <option value="">Select subcategory</option>
              {(availableSubcategories || []).map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
        </div>

        <div className="bg-gray-50 border rounded p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-medium">Listing fee breakdown</div>
              <div className="text-sm text-gray-700 mt-1">Base listing fee: <strong>{LISTING_FEE} MVR</strong></div>
              <div className="text-sm text-gray-700">Featured boost: <strong>{FEATURE_FEE} MVR</strong> (if selected)</div>
              <div className="text-xs text-gray-500 mt-2">Why the fee applies: Listings with asking price above <strong>{ASKING_PRICE_THRESHOLD} MVR</strong> are charged a listing fee to cover verification and listing costs. Small items priced at or below {ASKING_PRICE_THRESHOLD} MVR are free to list.</div>
            </div>
            <div className="text-right">
              <div className="text-sm">Listing applicable: <strong>{listingApplies ? 'Yes' : 'No'}</strong></div>
              <div className="text-lg font-semibold mt-2">Total: {total} MVR</div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={submitting} className="px-4 py-2 bg-blue-600 text-white rounded">{submitting ? 'Submitting...' : 'Create listing & invoice'}</button>
        </div>
      </form>

      {invoice && (
        <div className="mt-6 bg-white p-4 rounded shadow-sm">
          <div className="text-sm">Invoice created: <strong>{invoice.id}</strong></div>
          <div className="text-sm">Subtotal: {invoice.subtotal}</div>
          <div className="text-sm">Total: {invoice.total}</div>
          <div className="mt-3">
            <p className="text-sm text-gray-600">Upload payment slip in the POS → Validate slip or collect payment to mark the listing paid.</p>
          </div>
        </div>
      )}
    </div>
  );
}
