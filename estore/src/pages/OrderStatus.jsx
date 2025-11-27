import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useSettings } from '../components/SettingsContext';
import { useToast } from '../components/ToastContext';

export default function OrderStatus() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const initialOrder = params.get('order') || '';
  const initialToken = params.get('token') || '';
  const [orderId, setOrderId] = useState(initialOrder);
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const toast = useToast();
  const { formatCurrency } = useSettings();

  const fetchStatus = async (overrideOrderId, overrideToken) => {
    const id = overrideOrderId || orderId;
    const tok = overrideToken || token;
    if (!id || !tok) {
      toast.push('Enter both order ID and tracking token.', 'error');
      return;
    }
    try {
      setLoading(true);
      const data = await api.get(`/order-tracking/${encodeURIComponent(id)}`, { params: { token: tok } });
      setResult(data);
      if (id !== orderId || tok !== token) {
        setOrderId(id);
        setToken(tok);
      }
      const nextParams = new URLSearchParams();
      nextParams.set('order', id);
      nextParams.set('token', tok);
      navigate(`/order-status?${nextParams.toString()}`, { replace: true });
    } catch (err) {
      console.error('Failed to fetch order status', err);
      toast.push(err?.message || 'Unable to load order status.', 'error');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialOrder && initialToken) {
      fetchStatus(initialOrder, initialToken);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onSubmit = (event) => {
    event.preventDefault();
    fetchStatus();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 py-16">
      <div className="mx-auto w-full max-w-screen-2xl rounded-[40px] border border-white/60 bg-white/95 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur px-4 sm:px-8">
        <div className="grid gap-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-800 p-6 text-white shadow-xl">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-white/60">Order lookup</p>
            <h1 className="text-3xl font-black sm:text-4xl">Track your order</h1>
            <p className="text-sm text-white/80 max-w-2xl">
              Drop in the order ID plus the secure tracking token we emailed you. We surface real-time status, applied actions, and courier notes across every channel.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl bg-white/10 p-4 shadow-inner">
              <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Promise board</h3>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-center text-sm font-semibold">
                {[
                  { label: 'Live updates', value: '24/7' },
                  { label: 'Link expiry', value: '30 days' },
                  { label: 'Support SLA', value: '< 2 hrs' },
                  { label: 'Status events', value: 'Full history' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-2xl bg-white/15 px-3 py-2 shadow-sm shadow-slate-900/20">
                    <dt className="text-[10px] text-white/60">{stat.label}</dt>
                    <dd className="mt-1 text-base">{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 shadow-inner">
              <h3 className="text-xs font-semibold uppercase tracking-[0.3em] text-white/70">Need help?</h3>
              <p className="mt-3 text-sm text-white/75">
                Stuck or lost your token? Reply to the order email or tap Contact Support — we’ll resend the tracking link and loop in a human right away.
              </p>
              <a
                href="/contact?topic=support"
                className="mt-4 inline-flex items-center justify-center rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-emerald-700 shadow-lg shadow-slate-900/20 transition hover:-translate-y-0.5"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="mt-8 grid gap-4 rounded-3xl border border-slate-100 bg-white/90 p-5 shadow-inner sm:grid-cols-[1.4fr_1fr_auto]">
          <div className="sm:col-span-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="order-id">
              Order ID
            </label>
            <input
              id="order-id"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-rose-200 px-4 py-2 text-sm shadow-inner focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              placeholder="e.g. 1024"
              required
            />
          </div>
          <div className="sm:col-span-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="order-token">
              Tracking token
            </label>
            <input
              id="order-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 w-full rounded-2xl border border-rose-200 px-4 py-2 text-sm shadow-inner focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              placeholder="Paste token"
              required
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-300 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Checking…' : 'View status'}
            </button>
          </div>
        </form>

        {result && (
          <section className="mt-10 grid gap-6 rounded-3xl border border-slate-100 bg-white/95 p-6 shadow-xl shadow-slate-100/60 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Order</p>
                  <p className="text-3xl font-black text-slate-900">#{result.id}</p>
                  <p className="text-sm text-slate-500">
                    Placed {result.createdAt ? new Date(result.createdAt).toLocaleString() : '—'} · Total {formatCurrency(result.total || 0)}
                  </p>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 shadow-inner">
                  {result.status?.replace(/_/g, ' ') || 'Pending'}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
                <h3 className="font-semibold text-slate-800">Items</h3>
                <ul className="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white/80">
                  {(result.items || []).map((item) => (
                    <li key={`${item.productId}-${item.name}`} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-semibold text-slate-800">{item.name}</p>
                        <p className="text-xs text-slate-400">Qty {item.quantity}</p>
                      </div>
                      <span className="font-semibold text-slate-900">{formatCurrency(item.price * item.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-800/20 bg-slate-900/95 p-5 text-white shadow-lg shadow-slate-900/20">
              <h3 className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">Status history</h3>
              <div className="mt-4 space-y-4">
                {(result.history || []).map((entry, idx) => (
                  <div key={`${entry.status}-${entry.created_at}-${entry.note}-${idx}`} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white shadow-md">
                        {idx + 1}
                      </span>
                      {idx !== (result.history || []).length - 1 && <span className="h-full w-px bg-white/30" />}
                    </div>
                    <div className="flex-1 rounded-xl bg-white/5 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-white">{entry.status?.replace(/_/g, ' ')}</span>
                        <span className="text-xs text-white/70">{entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}</span>
                      </div>
                      {entry.note && <p className="mt-1 text-sm text-white/80">{entry.note}</p>}
                    </div>
                  </div>
                ))}
                {(!result.history || result.history.length === 0) && (
                  <p className="text-sm text-white/70">No updates yet. Check back once our team progresses your order.</p>
                )}
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
