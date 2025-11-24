import { useEffect, useMemo, useState, useCallback } from 'react';
import { FaEnvelopeOpenText, FaExternalLinkAlt, FaHistory, FaSync, FaTimes } from 'react-icons/fa';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'processing', label: 'Processing' },
  { value: 'received', label: 'Received in Maldives' },
  { value: 'ready', label: 'Ready for pickup' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const STATUS_BADGE = {
  pending: 'bg-amber-100 text-amber-700 border border-amber-200',
  accepted: 'bg-sky-100 text-sky-700 border border-sky-200',
  processing: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
  received: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  ready: 'bg-teal-100 text-teal-700 border border-teal-200',
  completed: 'bg-lime-100 text-lime-700 border border-lime-200',
  cancelled: 'bg-rose-100 text-rose-700 border border-rose-200',
};

const numberFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const mvrFormatter = new Intl.NumberFormat('en-MV', { style: 'currency', currency: 'MVR' });

function StatusBadge({ status }) {
  if (!status) return null;
  const cls = STATUS_BADGE[status] || 'bg-slate-100 text-slate-600 border border-slate-200';
  const label = STATUS_OPTIONS.find((opt) => opt.value === status)?.label || status;
  return <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}

function Timeline({ history }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-slate-400">No updates recorded yet.</p>;
  }
  return (
    <ol className="space-y-4">
      {history
        .slice()
        .reverse()
        .map((entry, index) => (
          <li key={index} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge status={entry.status} />
              <span className="text-xs text-slate-400">
                {entry.created_at ? new Date(entry.created_at).toLocaleString() : ''}
              </span>
              {entry.staff ? <span className="text-xs text-slate-400">- {entry.staff}</span> : null}
              {entry.notified_customer ? <span className="text-xs font-semibold text-emerald-500">Customer notified</span> : null}
            </div>
            {entry.note && <p className="mt-2 text-sm text-slate-600">{entry.note}</p>}
            {entry.customer_message && (
              <p className="mt-2 text-sm text-rose-500">
                Customer message: <span className="text-rose-600">{entry.customer_message}</span>
              </p>
            )}
          </li>
        ))}
    </ol>
  );
}

export default function Preorders() {
  const toast = useToast();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const [preorders, setPreorders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [note, setNote] = useState('');
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [customerMessage, setCustomerMessage] = useState('');
  const [nextStatus, setNextStatus] = useState('');
  const [previewSlip, setPreviewSlip] = useState(null);

  const filteredOptions = useMemo(() => STATUS_OPTIONS, []);

  const loadPreorders = useCallback(async (status) => {
    setLoading(true);
    try {
      const params = status !== 'all' ? { status } : {};
      const data = await api.get('/api/preorders', { params });
      setPreorders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to load preorders', err);
      toast?.push('Failed to load preorders', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadDetail = useCallback(async (id) => {
    setDetailLoading(true);
    try {
      const data = await api.get(`/api/preorders/${id}`);
      setDetail(data);
      setPreviewSlip(null);
      setNextStatus(data?.status || '');
      setNote('');
      setCustomerMessage('');
      setNotifyCustomer(false);
    } catch (err) {
      console.error('Failed to load preorder detail', err);
      toast?.push('Failed to load preorder detail', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadPreorders(statusFilter);
  }, [statusFilter, loadPreorders]);

  useEffect(() => {
    if (selectedId == null && preorders.length > 0) {
      setSelectedId(preorders[0].id);
    }
  }, [preorders, selectedId]);

  useEffect(() => {
    if (selectedId != null) {
      loadDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!customerMessage.trim()) {
      setNotifyCustomer(false);
    }
  }, [customerMessage]);


  async function handleUpdate(event) {
    event.preventDefault();
    if (!detail) return;
    if (!nextStatus && !note.trim() && !customerMessage.trim()) {
      toast?.push('Add a note, message, or change the status before updating.', 'warning');
      return;
    }
    setUpdating(true);
    try {
      const message = customerMessage.trim();
      const shouldNotify = notifyCustomer && Boolean(message);
      const payload = {
        status: nextStatus || detail.status,
        internalNote: note.trim() || undefined,
        notifyCustomer: shouldNotify,
        customerMessage: message || undefined,
      };
      const updated = await api.patch(`/api/preorders/${detail.id}`, payload);
      toast?.push('Preorder updated', 'success');
      setDetail(updated);
      setNote('');
      setCustomerMessage('');
      setNotifyCustomer(false);
      setNextStatus(updated?.status || payload.status);
      await loadPreorders(statusFilter);
    } catch (err) {
      console.error('Failed to update preorder', err);
      const message = err?.message || 'Update failed';
      toast?.push(message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  const paymentBankLabel = (value) => {
    if (!value) return null;
    return value === 'mib' ? 'Maldives Islamic Bank' : 'Bank of Maldives';
  };

  const statusSummary = useMemo(() => {
    if (!preorders || preorders.length === 0) return {};
    return preorders.reduce((acc, item) => {
      const key = item.status || 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [preorders]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24 space-y-8">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50 backdrop-blur">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
              Preorder desk
            </span>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Customer Preorders</h1>
              <p className="text-sm text-slate-500">
                Capture overseas cart requests, verify payments, and send order updates by email.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => loadPreorders(statusFilter)}
            className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60"
            disabled={loading}
          >
            <FaSync className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </header>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm shadow-blue-100/40 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 pb-4">
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {filteredOptions.map((option) => {
              const count = statusSummary?.[option.value] ?? 0;
              const isActive = statusFilter === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setStatusFilter(option.value);
                  }}
                  className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow shadow-blue-300/60'
                      : 'bg-white/70 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
                  }`}
                >
                  {option.label}
                  {option.value !== 'all' && <span className="ml-2 text-xs opacity-80">{count}</span>}
                </button>
              );
            })}
          </nav>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Showing {preorders.length} record{preorders.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="grid gap-6 pt-6 lg:grid-cols-[1.6fr_1fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white/90">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Totals</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white/95">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      Loading preorders…
                    </td>
                  </tr>
                ) : preorders.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-slate-400">
                      No preorders yet for this filter.
                    </td>
                  </tr>
                ) : (
                  preorders.map((order) => {
                    const isActive = selectedId === order.id;
                    return (
                      <tr
                        key={order.id}
                        className={`cursor-pointer transition hover:bg-blue-50/40 ${isActive ? 'bg-blue-50/70' : ''}`}
                        onClick={() => setSelectedId(order.id)}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-slate-700">#{order.id}</div>
                          <div className="text-xs text-slate-400">
                            {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : ''}
                          </div>
                          {order.sourceStore && (
                            <div className="mt-1 text-xs text-rose-500">{order.sourceStore}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-medium text-slate-600">{order.customerName || 'Unknown'}</div>
                          <div className="text-xs text-slate-400">{order.customerEmail}</div>
                          {order.customerPhone && (
                            <div className="text-xs text-slate-400">{order.customerPhone}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm text-slate-600">
                            {Number.isFinite(order.usdTotal) ? numberFormatter.format(order.usdTotal) : '-'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {Number.isFinite(order.mvrTotal) ? mvrFormatter.format(order.mvrTotal) : ''}
                          </div>
                          {paymentBankLabel(order.paymentBank) && (
                            <div className="text-xs text-slate-400">{paymentBankLabel(order.paymentBank)}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <StatusBadge status={order.status} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <aside className="space-y-6">
            <div className="rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm shadow-blue-100/50 backdrop-blur">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <FaEnvelopeOpenText /> Customer brief
              </h2>
              {detailLoading ? (
                <p className="text-sm text-slate-400">Loading details…</p>
              ) : !detail ? (
                <p className="text-sm text-slate-400">Select an order to review customer notes and attachments.</p>
              ) : (
                <div className="space-y-4 text-sm text-slate-600">
                  <div>
                    <div className="font-semibold text-slate-700">Customer</div>
                    <div>{detail.customerName}</div>
                    <div className="text-slate-500">{detail.customerEmail}</div>
                    {detail.customerPhone && <div className="text-slate-500">{detail.customerPhone}</div>}
                  </div>
                  {detail.deliveryAddress && (
                    <div>
                      <div className="font-semibold text-slate-700">Delivery address</div>
                      <p className="whitespace-pre-line text-slate-500">{detail.deliveryAddress}</p>
                    </div>
                  )}
                  <div>
                    <div className="font-semibold text-slate-700">Cart links</div>
                    <ul className="mt-1 space-y-1 text-xs text-rose-500">
                      {detail.cartLinks.length === 0 ? (
                        <li className="text-slate-400">No links provided</li>
                      ) : (
                        detail.cartLinks.map((link, idx) => (
                          <li key={idx}>
                            <a href={link} target="_blank" rel="noreferrer" className="hover:underline">
                              {link}
                            </a>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                  {detail.notes && (
                    <div>
                      <div className="font-semibold text-slate-700">Customer notes</div>
                      <p className="text-slate-500">{detail.notes}</p>
                    </div>
                  )}
                  <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
                    <div>
                      <span className="font-semibold text-slate-600">USD total</span>
                      <div>{Number.isFinite(detail.usdTotal) ? numberFormatter.format(detail.usdTotal) : '—'}</div>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">MVR estimate</span>
                      <div>{Number.isFinite(detail.mvrTotal) ? mvrFormatter.format(detail.mvrTotal) : '—'}</div>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Exchange rate</span>
                      <div>{detail.exchangeRate}</div>
                    </div>
                    {paymentBankLabel(detail.paymentBank) && (
                      <div>
                        <span className="font-semibold text-slate-600">Payment bank</span>
                        <div>{paymentBankLabel(detail.paymentBank)}</div>
                      </div>
                    )}
                    {detail.paymentReference && (
                      <div>
                        <span className="font-semibold text-slate-600">Reference</span>
                        <div>{detail.paymentReference}</div>
                      </div>
                    )}
                    {detail.paymentDate && (
                      <div>
                        <span className="font-semibold text-slate-600">Payment date</span>
                        <div>{detail.paymentDate}</div>
                      </div>
                    )}
                  </div>
                  {detail.paymentSlip && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setPreviewSlip(detail.paymentSlip)}
                        className="inline-flex items-center gap-2 rounded-full border border-blue-200 px-4 py-2 text-xs font-semibold text-blue-600 transition hover:border-blue-300 hover:text-blue-700"
                      >
                        View payment slip
                        <FaExternalLinkAlt />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm shadow-blue-100/50 backdrop-blur">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                <FaHistory /> Status history
              </h2>
              <Timeline history={detail?.statusHistory} />
            </div>

            {detail && (
              <form onSubmit={handleUpdate} className="space-y-4 rounded-2xl border border-slate-200/70 bg-white/85 p-5 shadow-sm shadow-blue-100/50 backdrop-blur">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Update order</h2>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Status
                  </label>
                  <select
                    value={nextStatus}
                    onChange={(event) => setNextStatus(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  >
                    {STATUS_OPTIONS.filter((option) => option.value !== 'all').map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Internal note
                  </label>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    placeholder="Add context for teammates (private)"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Customer email message
                  </label>
                  <textarea
                    value={customerMessage}
                    onChange={(event) => setCustomerMessage(event.target.value)}
                    rows={3}
                    placeholder="Write the update they will receive"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
                  />
                  <label className="mt-2 inline-flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      checked={notifyCustomer}
                      onChange={(event) => setNotifyCustomer(event.target.checked)}
                      className="rounded border border-slate-300 text-blue-600 focus:ring-blue-400"
                    />
                    Email the customer this update
                  </label>
                </div>
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-full bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200/80 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={updating}
                >
                  {updating ? 'Updating…' : 'Save update'}
                </button>
              </form>
            )}
          </aside>
        </div>
      </section>
      {previewSlip && (
        <Modal open={Boolean(previewSlip)} onClose={() => setPreviewSlip(null)} labelledBy="slip-preview-title" showFooter={false}>
          <div className="max-h-[90vh] w-[90vw] max-w-3xl overflow-hidden rounded-2xl bg-white">
            <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3">
              <h3 id="slip-preview-title" className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment slip preview</h3>
              <button
                type="button"
                onClick={() => setPreviewSlip(null)}
                className="rounded-full border border-slate-200 p-2 text-slate-400 transition hover:border-blue-300 hover:text-blue-600"
                aria-label="Close preview"
              >
                <FaTimes />
              </button>
            </div>
            <div className="max-h-[80vh] overflow-auto bg-slate-900/5 p-4">
              {previewSlip.startsWith('data:application/pdf') ? (
                <embed src={previewSlip} type="application/pdf" className="h-[70vh] w-full rounded-lg bg-white" />
              ) : (
                <img
                  src={previewSlip}
                  alt="Payment slip"
                  className="mx-auto max-h-[75vh] rounded-lg border border-slate-200 bg-white object-contain shadow-inner"
                />
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}







