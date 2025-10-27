import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', subcategory: '' });
  const [form, setForm] = useState({ name: '', price: '', stock: '', category: '', subcategory: '', image: '', description: '', sku: '', barcode: '', cost: '' });
  const [showModal, setShowModal] = useState(false);
  const [errors, setErrors] = useState({});
  const [uploading, setUploading] = useState(false);
  
  // helper: convert file to data URL
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // limit 3MB
    if (f.size > 3 * 1024 * 1024) {
      setErrors(prev => ({ ...prev, image: 'File too large (max 3MB)' }));
      return;
    }
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append('file', f);
      const token = localStorage.getItem('ITnvend_token');
  const categoryQuery = form.category ? `?category=${encodeURIComponent(form.category)}` : '';
  const resp = await fetch(`/api/uploads${categoryQuery}`, { method: 'POST', body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
      if (!resp.ok) {
        const txt = await resp.text();
        throw new Error(txt || 'Upload failed');
      }
      const json = await resp.json();
      setForm(prev => ({ ...prev, image: json.url }));
      setErrors(prev => ({ ...prev, image: null }));
    } catch (err) {
      setErrors(prev => ({ ...prev, image: 'Upload failed' }));
    } finally {
      setUploading(false);
    }
  }
  const toast = useToast();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [filters]);

  const fetchProducts = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await api.get(`/products?${query}`);
      setProducts(res);
    } catch (err) {
      toast.push('Failed to load products', 'error');
    }
  };

  // Camera barcode scanner support (uses html5-qrcode if available)
  const [showScanner, setShowScanner] = useState(false);
  const [scannerError, setScannerError] = useState(null);
  let scannerRef = null;

  async function startCameraScanner() {
    setScannerError(null);
  try {
  const mod = await import(/* @vite-ignore */ 'html5-qrcode');
      const Html5Qrcode = mod.Html5Qrcode || mod.default?.Html5Qrcode || mod.default;
      if (!Html5Qrcode) throw new Error('html5-qrcode not found');
      const qrRegionId = 'qr-reader';
      scannerRef = new Html5Qrcode(qrRegionId);
      setShowScanner(true);
      await scannerRef.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, (decoded) => {
        // on success
        setForm(prev => ({ ...prev, barcode: decoded }));
        toast.push('Scanned: ' + decoded, 'info');
        try { scannerRef.stop(); } catch (e) {}
        setShowScanner(false);
      }, (err) => {
        // ignore per-frame errors
      });
    } catch (err) {
      console.warn('Scanner failed', err);
      setScannerError('Camera scanner unavailable. Install html5-qrcode or use manual entry.');
      setShowScanner(false);
    }
  }

  async function stopCameraScanner() {
    try { if (scannerRef) await scannerRef.stop(); } catch (e) { /* ignore */ }
    setShowScanner(false);
  }

  const fetchCategories = async () => {
    try {
      const res = await api.get('/products/categories');
      setCategories(res);
    } catch (err) {
      toast.push('Failed to load categories', 'error');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const newFilters = { ...prev, [name]: value };
      if (name === 'category') {
        newFilters.subcategory = ''; // Reset subcategory when category changes
      }
      return newFilters;
    });
  };

  const handleFormChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      // client-side validation
      const newErrors = {};
      if (!form.name || !form.name.trim()) newErrors.name = 'Name is required';
      const priceNum = parseFloat(form.price);
      if (isNaN(priceNum) || priceNum < 0) newErrors.price = 'Price must be a positive number';
      const costNum = form.cost === '' ? 0 : parseFloat(form.cost);
      if (form.cost !== '' && (isNaN(costNum) || costNum < 0)) newErrors.cost = 'Cost must be a positive number';
      const stockNum = parseInt(form.stock || '0');
      if (isNaN(stockNum) || stockNum < 0) newErrors.stock = 'Stock must be a non-negative integer';
      if (form.description && form.description.length > 250) newErrors.description = 'Description must be 250 characters or less';
      if (form.image) {
        try { const u = new URL(form.image); if (!['http:', 'https:'].includes(u.protocol)) newErrors.image = 'Image must be an http(s) URL'; } catch (e) { newErrors.image = 'Image must be a valid URL'; }
      }
      if (Object.keys(newErrors).length) { setErrors(newErrors); return; }

      await api.post('/products', { ...form, price: priceNum, stock: stockNum, image: form.image || null, description: form.description || null, sku: form.sku || null, barcode: form.barcode || null, cost: costNum });
      setForm({ name: '', price: '', stock: '', category: '', subcategory: '', image: '', description: '', sku: '', barcode: '', cost: '' });
      setErrors({});
      setShowModal(false);
      fetchProducts();
      toast.push('Product added', 'info');
    } catch (err) {
      toast.push('Failed to add product', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.del(`/products/${id}`);
      fetchProducts();
      toast.push('Product deleted', 'info');
    } catch (err) {
      toast.push('Failed to delete product', 'error');
    }
  };

  // Edit modal state
  const [editProduct, setEditProduct] = useState(null);

  const saveEdit = async (e) => {
    e.preventDefault();
    if (!editProduct) return;
    try {
      // basic client-side validation
      const priceNum = parseFloat(editProduct.price);
      const costNum = editProduct.cost === '' ? 0 : parseFloat(editProduct.cost);
      const stockNum = parseInt(editProduct.stock || '0');
      if (isNaN(priceNum) || priceNum < 0) throw new Error('Invalid price');
      await api.put(`/products/${editProduct.id}`, { name: editProduct.name, price: priceNum, stock: stockNum, category: editProduct.category, subcategory: editProduct.subcategory, image: editProduct.image || null, description: editProduct.description || null, sku: editProduct.sku || null, barcode: editProduct.barcode || null, cost: costNum });
      setEditProduct(null);
      fetchProducts();
      toast.push('Product updated', 'info');
    } catch (err) {
      toast.push('Failed to update product: ' + (err?.message || ''), 'error');
    }
  };

  const handleEdit = async (p) => {
    // open edit modal
    setEditProduct({ ...p });
  };

  const generateBarcode = async (p) => {
    try {
      // simple generated barcode: timestamp + random
      const code = String(Date.now()).slice(-12) + Math.floor(Math.random() * 90 + 10);
      await api.put(`/products/${p.id}`, { ...p, barcode: code });
      fetchProducts();
      toast.push('Barcode generated', 'info');
    } catch (err) {
      toast.push('Failed to generate barcode', 'error');
    }
  };

  const scanBarcode = async (p) => {
    const scanned = prompt('Scan or paste barcode value', p.barcode || '');
    if (scanned == null) return;
    try {
      await api.put(`/products/${p.id}`, { ...p, barcode: scanned });
      fetchProducts();
      toast.push('Barcode updated', 'info');
    } catch (err) {
      toast.push('Failed to update barcode', 'error');
    }
  };

  const showQr = (p) => {
    const value = encodeURIComponent(p.sku || p.barcode || `product:${p.id}`);
    const url = `https://chart.googleapis.com/chart?cht=qr&chs=200x200&chl=${value}`;
    window.open(url, '_blank', 'noopener');
  };

  const availableSubcategories = useMemo(() => {
    return filters.category ? categories[filters.category] || [] : [];
  }, [filters.category, categories]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Products</h2>
      
      {/* Add Product Form */}
      <div className="bg-white p-4 rounded-md shadow mb-6">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold mb-2">Products</h3>
          <button onClick={() => setShowModal(true)} className="bg-blue-600 text-white px-3 py-1 rounded">New Product</button>
        </div>

        {/* Modal */}
        {showModal ? (
          <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="absolute inset-0 bg-black opacity-30" onClick={() => setShowModal(false)} />
            <div className="bg-white rounded p-6 z-10 w-full max-w-2xl shadow-lg">
              <h4 className="text-lg font-semibold mb-4">Add New Product</h4>
              <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-600">Name</label>
                  <input name="name" value={form.name} onChange={handleFormChange} placeholder="Name" className="p-2 border rounded w-full" />
                  {errors.name ? <div className="text-xs text-red-600">{errors.name}</div> : null}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">SKU</label>
                  <input name="sku" value={form.sku} onChange={handleFormChange} placeholder="SKU" className="p-2 border rounded w-full" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Price</label>
                  <input name="price" value={form.price} onChange={handleFormChange} placeholder="Price" className="p-2 border rounded w-full" type="number" step="0.01" />
                  {errors.price ? <div className="text-xs text-red-600">{errors.price}</div> : null}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Cost</label>
                  <input name="cost" value={form.cost} onChange={handleFormChange} placeholder="Cost" className="p-2 border rounded w-full" type="number" step="0.01" />
                  {errors.cost ? <div className="text-xs text-red-600">{errors.cost}</div> : null}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Stock</label>
                  <input name="stock" value={form.stock} onChange={handleFormChange} placeholder="Stock" className="p-2 border rounded w-full" type="number" />
                  {errors.stock ? <div className="text-xs text-red-600">{errors.stock}</div> : null}
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Barcode</label>
                  <div className="flex gap-2">
                    <input name="barcode" value={form.barcode} onChange={handleFormChange} placeholder="Barcode" className="p-2 border rounded w-full" />
                    <button type="button" onClick={() => startCameraScanner()} className="px-2 py-1 border rounded">Camera</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Category</label>
                  <input name="category" value={form.category} onChange={handleFormChange} placeholder="Category" className="p-2 border rounded w-full" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600">Subcategory</label>
                  <input name="subcategory" value={form.subcategory} onChange={handleFormChange} placeholder="Subcategory" className="p-2 border rounded w-full" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600">Image</label>
                  <div className="flex items-center space-x-2">
                    <input type="file" accept="image/*" onChange={handleFileSelect} />
                    <input name="image" value={form.image} onChange={handleFormChange} placeholder="or paste image URL" className="p-2 border rounded w-full" type="text" />
                  </div>
                  {uploading ? <div className="text-xs text-gray-600">Uploading...</div> : null}
                  {errors.image ? <div className="text-xs text-red-600">{errors.image}</div> : null}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-600">Short description</label>
                  <textarea name="description" value={form.description} onChange={handleFormChange} placeholder="Short description" className="p-2 border rounded w-full" rows={3} />
                  {errors.description ? <div className="text-xs text-red-600">{errors.description}</div> : null}
                </div>
                <div className="sm:col-span-2 flex justify-end space-x-2">
                  <button type="button" onClick={() => { setShowModal(false); setErrors({}); }} className="px-3 py-1 border rounded">Cancel</button>
                  <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">Create</button>
                </div>
              </form>
            </div>
          </div>
        ) : null}
      </div>
      {/* Scanner modal */}
      {showScanner ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => stopCameraScanner()} />
          <div className="bg-white rounded p-4 z-10 w-full max-w-md">
            <h4 className="font-semibold mb-2">Scan Barcode (Camera)</h4>
            {scannerError ? <div className="text-sm text-red-600 mb-2">{scannerError}</div> : null}
            <div id="qr-reader" style={{ width: '100%' }} />
            <div className="mt-2 text-right">
              <button className="px-3 py-1 border rounded" onClick={() => stopCameraScanner()}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
      {/* Edit product modal */}
      {editProduct && (
        <div className="fixed inset-0 flex items-center justify-center z-50">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditProduct(null)} />
          <div className="bg-white rounded p-6 z-10 w-full max-w-2xl">
            <h4 className="text-lg font-semibold mb-4">Edit Product</h4>
            <form onSubmit={saveEdit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600">Name</label>
                <input name="name" value={editProduct.name} onChange={(e) => setEditProduct(prev => ({ ...prev, name: e.target.value }))} className="p-2 border rounded w-full" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">SKU</label>
                <input name="sku" value={editProduct.sku || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, sku: e.target.value }))} className="p-2 border rounded w-full" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Price</label>
                <input name="price" value={editProduct.price} onChange={(e) => setEditProduct(prev => ({ ...prev, price: e.target.value }))} className="p-2 border rounded w-full" type="number" step="0.01" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Cost</label>
                <input name="cost" value={editProduct.cost != null ? editProduct.cost : ''} onChange={(e) => setEditProduct(prev => ({ ...prev, cost: e.target.value }))} className="p-2 border rounded w-full" type="number" step="0.01" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Stock</label>
                <input name="stock" value={editProduct.stock} onChange={(e) => setEditProduct(prev => ({ ...prev, stock: e.target.value }))} className="p-2 border rounded w-full" type="number" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Barcode</label>
                <div className="flex gap-2">
                  <input name="barcode" value={editProduct.barcode || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, barcode: e.target.value }))} className="p-2 border rounded w-full" />
                  <button type="button" onClick={() => scanBarcode(editProduct)} className="px-2 py-1 border rounded">Scan</button>
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600">Category</label>
                <input name="category" value={editProduct.category || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, category: e.target.value }))} className="p-2 border rounded w-full" />
              </div>
              <div>
                <label className="block text-sm text-gray-600">Subcategory</label>
                <input name="subcategory" value={editProduct.subcategory || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, subcategory: e.target.value }))} className="p-2 border rounded w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600">Image URL</label>
                <input name="image" value={editProduct.image || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, image: e.target.value }))} className="p-2 border rounded w-full" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm text-gray-600">Short description</label>
                <textarea name="description" value={editProduct.description || ''} onChange={(e) => setEditProduct(prev => ({ ...prev, description: e.target.value }))} className="p-2 border rounded w-full" rows={3} />
              </div>
              <div className="sm:col-span-2 flex justify-end space-x-2">
                <button type="button" onClick={() => setEditProduct(null)} className="px-3 py-1 border rounded">Cancel</button>
                <button type="submit" className="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters and Product Table */}
      <div className="bg-white p-4 rounded-md shadow">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <select name="category" value={filters.category} onChange={handleFilterChange} className="p-2 border rounded">
            <option value="">All Categories</option>
            {Object.keys(categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select name="subcategory" value={filters.subcategory} onChange={handleFilterChange} className="p-2 border rounded" disabled={!filters.category}>
            <option value="">All Subcategories</option>
            {availableSubcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-600 uppercase text-sm">
                <th className="p-3">Name</th>
                <th className="p-3">Image</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Barcode</th>
                <th className="p-3 text-right">Cost</th>
                <th className="p-3">Category</th>
                <th className="p-3">Subcategory</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {products.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 flex items-center">
                    <div className="w-10 h-10 mr-3 flex-shrink-0">
                      {p.image ? <img src={p.image} alt={p.name} className="w-10 h-10 object-cover rounded" /> : <div className="w-10 h-10 bg-gray-100 rounded" />}
                    </div>
                    <div>
                      <div className="font-medium">{p.name}</div>
                      {p.description ? <div className="text-xs text-gray-500">{p.description}</div> : null}
                    </div>
                  </td>
                  <td className="p-3">{p.sku || ''}</td>
                  <td className="p-3">{p.barcode || ''}</td>
                  <td className="p-3 text-right">{p.cost != null ? formatCurrency(p.cost) : ''}</td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">{p.subcategory}</td>
                  <td className="p-3 text-right">{formatCurrency(p.price)}</td>
                  <td className="p-3 text-right">{p.stock}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleEdit(p)} className="mr-2 text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => generateBarcode(p)} className="mr-2 text-green-600 hover:underline">Generate</button>
                    <button onClick={() => scanBarcode(p)} className="mr-2 text-yellow-600 hover:underline">Scan</button>
                    <button onClick={() => showQr(p)} className="mr-2 text-blue-600 hover:underline">QR</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
