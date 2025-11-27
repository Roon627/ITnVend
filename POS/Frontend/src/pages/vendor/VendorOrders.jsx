import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';

const VENDOR_STATUS_OPTIONS = ['processing', 'ready', 'completed'];
const ORDER_FILTERS = [
  { id: 'active', label: 'Active', matches: (order) => (order?.status || '').toLowerCase() !== 'completed' },
  { id: 'completed', label: 'Completed', matches: (order) => (order?.status || '').toLowerCase() === 'completed' },
  { id: 'all', label: 'All', matches: () => true },
];

export default function VendorOrders() {
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('active');

  const filteredOrders = useMemo(() => {
    const activeFilter = ORDER_FILTERS.find((filter) => filter.id === statusFilter) || ORDER_FILTERS[0];
    return orders.filter((order) => activeFilter.matches(order));
  }, [orders, statusFilter]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await api.get('/vendor/orders');
      setOrders(Array.isArray(data) ? data : []);
      if (Array.isArray(data) && data.length > 0) {
        setSelectedId(data[0].id);
      } else {
        setDetail(null);
      }
    } catch (err) {
      console.error('Failed to load vendor orders', err);
      toast?.push('Failed to load orders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id) => {
    if (!id) return;
    try {
      const data = await api.get(`/vendor/orders/${id}`);
      setDetail(data);
      setStatus(data?.order?.status || '');
      setNote('');
    } catch (err) {
      console.error('Failed to load vendor order detail', err);
      toast?.push('Failed to load order detail', 'error');
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    if (selectedId != null) {
      loadDetail(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    if (selectedId == null || !filteredOrders.some((order) => order.id === selectedId)) {
      setSelectedId(filteredOrders[0].id);
    }
  }, [filteredOrders, selectedId]);

  const submitStatus = async (event) => {
    event.preventDefault();
    if (!selectedId || !status) return;
    try {
      await api.put(`/vendor/orders/${selectedId}/status`, { status, note: note || null });
      toast?.push('Status saved and customer notified.', 'success');
      loadDetail(selectedId);
      loadOrders();
    } catch (err) {
      console.error('Vendor order status update failed', err);
      toast?.push(err?.message || 'Failed to update order status', 'error');
    }
  };

  const detailItems = detail?.sales && Array.isArray(detail.sales) && detail.sales.length > 0
    ? detail.sales
    : detail?.items || [];
  const detailStatusLabel = detail?.order?.status ? detail.order.status.replace(/_/g, ' ') : '';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-5 shadow-2xl shadow-black/30 backdrop-blur space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">Your storefront orders</h1>
              <p className="text-sm text-slate-300">Track orders containing your products and update progress.</p>
            </div>
            <Link
              to="/vendor/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-1 text-sm font-semibold text-white/80 transition hover:bg-white/10"
            >
              ← Back to dashboard
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {ORDER_FILTERS.map((filter) => {
                const active = statusFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setStatusFilter(filter.id)}
                    className={`rounded-full px-4 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                      active ? 'bg-emerald-400 text-slate-900' : 'border border-white/20 text-white/80 hover:bg-white/10'
                    }`}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={loadOrders}
              className="ml-auto rounded-full border border-white/20 px-4 py-1 text-sm font-semibold text-white/90 transition hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner">
            <h2 className="text-lg font-semibold text-white">Orders</h2>
            {loading ? (
              <p className="text-sm text-slate-300 mt-4">Loading…</p>
            ) : filteredOrders.length === 0 ? (
              <p className="text-sm text-slate-300 mt-4">
                {statusFilter === 'completed' ? 'No completed orders yet.' : 'No storefront orders yet.'}
              </p>
            ) : (
              <ul className="mt-4 space-y-3">
                {filteredOrders.map((order) => {
                  const active = selectedId === order.id;
                  return (
                    <li key={order.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(order.id)}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                          active ? 'border-emerald-300 bg-emerald-500/10' : 'border-white/10 hover:border-emerald-200/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-white">#{order.id}</p>
                            <p className="text-xs text-slate-300">{new Date(order.created_at).toLocaleString()}</p>
                          </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-300">
                        Net MVR {Number(order.vendor_net || 0).toFixed(2)}
                      </p>
                      <p className="text-xs text-emerald-200">
                        Gross {Number(order.vendor_gross || 0).toFixed(2)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-slate-400">{order.status?.replace(/_/g, ' ')}</p>
                    </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner">
            {!detail ? (
              <p className="text-sm text-slate-300">Select an order to view details.</p>
            ) : (
              <>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-white">Order #{detail.order.id}</h2>
                  <p className="text-sm text-slate-300">
                    Status: <span className="font-semibold text-white">{detailStatusLabel || '—'}</span>
                  </p>
                </div>
                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Your items</h3>
                  {detailItems.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">Items from your catalog will show here once an order is routed to you.</p>
                  ) : (
                    <ul className="mt-2 space-y-2 text-sm text-slate-100">
                      {detailItems.map((item) => {
                        const qty = Number(item.quantity) || 0;
                        const grossAmount = Number(item.gross_amount ?? ((Number(item.price) || 0) * qty)) || 0;
                        const netAmount = Number(item.net_amount ?? grossAmount) || 0;
                        const feePercent = item.fee_percent != null ? Number(item.fee_percent) : null;
                        return (
                          <li key={`${item.product_id || item.id}-${qty}`} className="flex justify-between rounded-lg border border-white/5 bg-white/5 px-3 py-2">
                            <div>
                              <p className="font-semibold">{item.product_name || item.product_id}</p>
                              <p className="text-xs text-slate-400">Qty {qty}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-emerald-300">Net MVR {netAmount.toFixed(2)}</p>
                              <p className="text-[11px] text-slate-400">
                                Gross {grossAmount.toFixed(2)}
                                {feePercent != null ? ` · Fee ${feePercent}%` : ''}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <form onSubmit={submitStatus} className="mt-4 space-y-3 rounded-xl border border-white/10 bg-black/20 p-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Update order status</h3>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="w-full rounded-lg border border-white/20 bg-slate-900/70 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="" className="bg-white text-slate-900">Select status</option>
                    {VENDOR_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option} className="bg-white text-slate-900">
                        {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Optional note"
                    className="w-full rounded-lg border border-white/20 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-400"
                  />
                  <button
                    type="submit"
                    disabled={!status}
                    className="w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    Save update
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
