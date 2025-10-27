import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';
import { useSettings } from './SettingsContext';

export default function InvoiceEditModal({ invoiceId, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [invoice, setInvoice] = useState(null);
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState([]);
  const toast = useToast();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    if (!invoiceId) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const data = await api.get(`/invoices/${invoiceId}`);
        if (!mounted) return;
        setInvoice(data);
        setItems((data.items || []).map(it => ({
          id: it.id,
          product_id: it.product_id,
          product_name: it.product_name,
          quantity: it.quantity,
          price: it.price,
          stock: it.product_stock ?? 0,
          image: it.product_image || null
        })));
      } catch (err) {
        toast.push('Failed to load invoice for edit', 'error');
        onClose && onClose();
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [invoiceId]);

  // debounced server-side product search
  useEffect(() => {
    let active = true;
    if (productSearch.length < 2) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/products?search=${encodeURIComponent(productSearch)}`);
        if (!active) return;
        setProductResults((res || []).slice(0, 10));
      } catch (err) {
        // ignore
      }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [productSearch]);

  const updateItem = (idx, patch) => {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const addProductToItems = (product) => {
    setItems(prev => {
      const existing = prev.find(p => p.product_id === product.id);
      if (existing) return prev.map(p => p.product_id === product.id ? { ...p, quantity: (p.quantity||0)+1 } : p);
      return [...prev, { id: null, product_id: product.id, product_name: product.name, quantity: 1, price: product.price, stock: product.stock || 0, image: product.image || null }];
    });
    setProductSearch('');
    setProductResults([]);
  };

  const subtotal = items.reduce((s, it) => s + (Number(it.price||0) * Number(it.quantity||0)), 0);
  const gstRate = invoice?.gst_rate ?? invoice?.gst_rate ?? 0; // may come from invoice/outlet
  const tax = +(subtotal * (gstRate / 100));
  const total = +(subtotal + tax);

  // inline validation errors per line
  const lineErrors = items.map((it) => {
    const errs = [];
    if (!it.product_id) errs.push('Missing product');
    if (!it.quantity || Number(it.quantity) <= 0) errs.push('Quantity must be > 0');
    if (Number(it.price) < 0) errs.push('Price must be >= 0');
    if (it.stock !== undefined && Number(it.quantity) > Number(it.stock)) errs.push(`Only ${it.stock} in stock`);
    return errs;
  });

  const handleSave = async () => {
    try {
      const payload = {
        items: items.map(it => ({ product_id: it.product_id, quantity: Number(it.quantity||0), price: Number(it.price||0) }))
      };
      await api.put(`/invoices/${invoiceId}`, payload);
      toast.push('Invoice updated', 'success');
      onSaved && onSaved();
      onClose && onClose();
    } catch (err) {
      console.error(err);
      toast.push('Failed to save invoice', 'error');
    }
  };

  if (!invoiceId) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white w-full max-w-3xl rounded shadow-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h3 className="text-lg font-semibold">Edit Invoice #{invoiceId}</h3>
            <div className="text-sm text-gray-500">Customer: {invoice?.customer_name || '—'}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-sm text-gray-600">Subtotal: {formatCurrency(subtotal)}</div>
            <button onClick={() => onClose && onClose()} className="px-3 py-1 border rounded">Close</button>
            <button onClick={handleSave} className="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {loading ? (
            <div className="text-center py-8">Loading…</div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Add product</label>
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name"
                  className="w-full border rounded px-3 py-2"
                />
                {productResults.length > 0 && (
                  <div className="border rounded mt-1 max-h-40 overflow-y-auto bg-white">
                    {productResults.map(p => (
                      <div key={p.id} className="p-2 hover:bg-gray-100 cursor-pointer flex items-center gap-3" onClick={() => addProductToItems(p)}>
                        <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                          {p.image ? <img src={p.image} alt={p.name} className="w-full h-full object-cover" /> : <div className="text-xs text-gray-500">IMG</div>}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{p.name}</div>
                          <div className="text-xs text-gray-500">{formatCurrency(p.price)} • {p.stock ?? 0} in stock</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs text-gray-500">
                    <tr>
                      <th className="p-2">Product</th>
                      <th className="p-2">Qty</th>
                      <th className="p-2">Unit Price</th>
                      <th className="p-2">Line Total</th>
                      <th className="p-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <React.Fragment key={`${it.product_id}-${idx}`}>
                        <tr className="border-t">
                          <td className="p-2 flex items-center gap-3">
                            <div className="w-10 h-10 bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                              {it.image ? <img src={it.image} alt={it.product_name} className="w-full h-full object-cover" /> : <div className="text-xs text-gray-500">IMG</div>}
                            </div>
                            <div>{it.product_name || `#${it.product_id}`}</div>
                          </td>
                          <td className="p-2 w-24">
                            <input type="number" min={0} value={it.quantity || 0} onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) })} className="w-20 border rounded px-2 py-1" />
                          </td>
                          <td className="p-2 w-36">
                            <input type="number" min={0} step="0.01" value={it.price || 0} onChange={(e) => updateItem(idx, { price: Number(e.target.value) })} className="w-32 border rounded px-2 py-1" />
                          </td>
                          <td className="p-2 text-right">{formatCurrency((it.quantity||0)*(it.price||0))}</td>
                          <td className="p-2 text-right"><button onClick={() => removeItem(idx)} className="text-red-600">Remove</button></td>
                        </tr>
                        {lineErrors[idx] && lineErrors[idx].length > 0 && (
                          <tr className="bg-yellow-50">
                            <td colSpan={5} className="p-2 text-sm text-red-600">{lineErrors[idx].join('; ')}</td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                    {items.length === 0 && (
                      <tr><td colSpan={5} className="p-4 text-center text-gray-500">No line items</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="text-right">
                <div className="text-sm">Tax: {formatCurrency(tax)}</div>
                <div className="text-lg font-semibold">Total: {formatCurrency(total)}</div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
