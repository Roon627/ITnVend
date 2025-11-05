import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useToast } from '../../components/ToastContext';

const PAGE_SIZE = 50;

export default function StockAdjustments() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [productId, setProductId] = useState('');
  const [username, setUsername] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [products, setProducts] = useState([]);

  const fetchProducts = async () => {
    try {
      const p = await api.get('/products');
      setProducts(Array.isArray(p) ? p : []);
    } catch (err) {
      console.debug('Failed to load products for filter', err?.message || err);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, pageSize: PAGE_SIZE };
      if (productId) params.productId = productId;
      if (username) params.username = username;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await api.get('/stock-adjustments', { params });
      setItems(res.items || []);
      setTotal(res.total || 0);
    } catch (err) {
      toast.push('Failed to load adjustments', 'error');
      console.debug(err);
    } finally {
      setLoading(false);
    }
  }, [page, productId, username, startDate, endDate, toast]);

  useEffect(() => { fetchProducts(); }, []);
  useEffect(() => { load(); }, [load]);

  const exportCsv = () => {
    const params = new URLSearchParams();
    if (productId) params.append('productId', productId);
    if (username) params.append('username', username);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    params.append('export', 'csv');
    const url = `/api/stock-adjustments?${params.toString()}`;
    window.open(url, '_blank');
  };

  const productMap = useMemo(() => {
    return products.reduce((acc, p) => { acc[p.id] = p; return acc; }, {});
  }, [products]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">Stock Adjustments</h2>
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          {/* Filters on the left */}
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="text-sm">Product</label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="block mt-1 border rounded px-3 py-2 text-sm"
              >
                <option value="">All products</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm">User</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block mt-1 border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block mt-1 border rounded px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="text-sm">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block mt-1 border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Buttons on the right */}
          <div className="flex gap-2 items-center">
            <button
              onClick={() => { setPage(1); load(); }}
              className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700 transition"
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Filter'}
            </button>
            <button
              onClick={() => { setProductId(''); setUsername(''); setStartDate(''); setEndDate(''); setPage(1); load(); }}
              className="px-4 py-2 rounded bg-gray-200 hover:bg-gray-300 text-gray-800 transition"
              disabled={loading}
            >
              Clear
            </button>
            <button
              onClick={exportCsv}
              className="px-4 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition"
              disabled={loading}
            >
              Export CSV
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Product</th>
                <th className="px-4 py-2 text-left">User</th>
                <th className="px-4 py-2 text-right">Delta</th>
                <th className="px-4 py-2 text-right">New stock</th>
                <th className="px-4 py-2 text-left">Reason</th>
              </tr>
            </thead>
            <tbody>
              {!items.length && (
                <tr><td colSpan={6} className="p-6 text-center text-gray-500">No adjustments found</td></tr>
              )}
              {items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-4 py-2 text-sm">{new Date(it.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2 text-sm">{it.product_name || productMap[it.product_id]?.name || it.product_id}</td>
                  <td className="px-4 py-2 text-sm">{it.username || it.staff_id || '-'}</td>
                  <td className="px-4 py-2 text-right text-sm">{it.delta}</td>
                  <td className="px-4 py-2 text-right text-sm">{it.new_stock}</td>
                  <td className="px-4 py-2 text-sm">{it.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 flex items-center justify-between">
          <div className="text-sm text-gray-600">Total: {total}</div>
          <div className="flex items-center gap-2">
            <button disabled={page<=1 || loading} onClick={() => setPage((p) => Math.max(1, p-1))} className="btn-muted px-3 py-1">Prev</button>
            <span className="text-sm">Page {page}</span>
            <button disabled={page*PAGE_SIZE >= total || loading} onClick={() => setPage((p) => p+1)} className="btn-muted px-3 py-1">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
