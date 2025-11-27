import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const STATUS_OPTIONS = ['pending', 'awaiting_verification', 'processing', 'ready', 'completed', 'cancelled', 'preorder', 'shipped'];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [statusUpdate, setStatusUpdate] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const toast = useToast();

  const numberFormatter = useMemo(() => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'MVR' }), []);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const data = await api.get('/orders', { params });
      setOrders(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        fetchDetail(data[0].id);
      } else {
        setSelectedOrder(null);
      }
    } catch (err) {
      console.error('Failed to load orders', err);
      toast?.push('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, toast]);

  const fetchDetail = async (orderId) => {
    if (!orderId) return;
    setDetailLoading(true);
    try {
      const detail = await api.get(`/orders/${orderId}`);
      setSelectedOrder(detail);
      setStatusUpdate(detail?.order?.status || '');
      setStatusNote('');
    } catch (err) {
      console.error('Failed to load order detail', err);
      toast?.push('Failed to load order detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const handleStatusUpdate = async (event) => {
    event.preventDefault();
    if (!selectedOrder?.order?.id || !statusUpdate) return;
    try {
      await api.put(`/orders/${selectedOrder.order.id}/status`, { status: statusUpdate, note: statusNote || null });
      toast?.push('Order status updated and customer notified via email.', 'success');
      fetchDetail(selectedOrder.order.id);
      loadOrders();
    } catch (err) {
      console.error('Failed to update order', err);
      toast?.push(err?.message || 'Failed to update order', 'error');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Storefront orders</h1>
          <p className="text-sm text-slate-500">Monitor guest checkout orders and update statuses.</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer or order ID"
            className="rounded-full border border-slate-200 px-4 py-2 text-sm"
          />
          <button
            type="button"
            onClick={loadOrders}
            className="rounded-full border border-blue-500 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent orders</h2>
          {loading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-slate-500">No orders found.</p>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const active = selectedOrder?.order?.id === order.id;
                return (
                  <button
                    type="button"
                    key={order.id}
                    onClick={() => fetchDetail(order.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      active ? 'border-blue-400 bg-blue-50' : 'border-slate-100 bg-white hover:border-blue-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">#{order.id}</p>
                        <p className="text-xs text-slate-400">{new Date(order.created_at).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-slate-800">{numberFormatter.format(order.total || 0)}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-400">{order.status?.replace(/_/g, ' ')}</p>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {order.customer_name} · {order.customer_email}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
          {detailLoading && <p className="text-sm text-slate-500">Loading order…</p>}
          {!detailLoading && !selectedOrder && <p className="text-sm text-slate-500">Select an order to view details.</p>}
          {!detailLoading && selectedOrder && (
            <>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-slate-900">Order #{selectedOrder.order.id}</h2>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                    {selectedOrder.order.status?.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  Total {numberFormatter.format(selectedOrder.order.total || 0)} · {selectedOrder.order.payment_method}
                </p>
              </div>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <h3 className="font-semibold text-slate-800">Items</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {selectedOrder.items?.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>{item.product_name || `#${item.product_id}`} × {item.quantity}</span>
                      <span className="font-semibold">{numberFormatter.format(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                <h3 className="font-semibold text-slate-800">History</h3>
                <ul className="mt-2 space-y-2 text-sm text-slate-600">
                  {selectedOrder.history?.map((entry, idx) => (
                    <li key={`${entry.status}-${idx}`} className="rounded-lg border border-slate-100 bg-white px-3 py-2">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{entry.status?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-slate-400">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
                      </div>
                      {entry.note && <p className="text-xs text-slate-500 mt-1">{entry.note}</p>}
                    </li>
                  ))}
                </ul>
              </div>
              <form onSubmit={handleStatusUpdate} className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-white p-3">
                <h3 className="font-semibold text-slate-800">Update status</h3>
                <select
                  value={statusUpdate}
                  onChange={(e) => setStatusUpdate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select status</option>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <textarea
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  rows={2}
                  placeholder="Optional note for history"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={!statusUpdate}
                  className="w-full rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Save status
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
