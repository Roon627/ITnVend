import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheckCircle } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import Modal from '../../components/Modal';

export default function VendorDashboard() {
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [blockedMessage, setBlockedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invoicePreview, setInvoicePreview] = useState(null);
  const [invoicePreviewLoading, setInvoicePreviewLoading] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let mounted = true;
    (async function fetchAll() {
      setLoading(true);
      setBlockedMessage(null);
      try {
        const vRes = await api.get('/vendor/me');
        if (!mounted) return;
        setVendor(vRes || null);

        const handleBlocked = (err) => {
          const status = err?.status || err?.response?.status;
          if (status === 423) {
            setBlockedMessage(err?.data?.error || err?.message || 'Your vendor account is temporarily disabled due to unpaid monthly fees.');
            return true;
          }
          return false;
        };

        let pRes = [];
        try {
          pRes = await api.get('/vendor/me/products');
        } catch (err) {
          if (!handleBlocked(err)) throw err;
        }

        let invoiceRes = [];
        try {
          invoiceRes = await api.get('/vendor/me/invoices');
        } catch (err) {
          if (!handleBlocked(err)) throw err;
        }
        if (!mounted) return;
        setProducts(Array.isArray(pRes) ? pRes : []);
        setInvoices(Array.isArray(invoiceRes) ? invoiceRes : []);
      } catch (err) {
        console.error('Failed to load vendor dashboard', err);
        toast.push('Failed to load vendor dashboard. Ensure you are signed in as vendor.', 'error');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [toast]);

  if (loading) return <div className="p-6">Loading…</div>;

  // Derived metrics
  const totalProducts = products.length;
  const lowStock = products.filter(p => (p.stock || 0) <= 5).slice(0, 6);
  const unpaidInvoices = invoices.filter((inv) => inv.status === 'unpaid');
  const outstanding = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.fee_amount) || 0), 0);
  const currencyCode = vendor?.currency || 'USD';
  const formatMoney = (value) =>
    new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(Number(value || 0));
  const recentInvoices = invoices.slice(0, 6);
  const nextDue = unpaidInvoices
    .slice()
    .sort((a, b) => new Date(a.due_date || a.issued_at || 0) - new Date(b.due_date || b.issued_at || 0))[0];
  const showcaseProducts = products.slice(0, 6);
  const isVerified = Number(vendor?.verified ?? 0) === 1;

  async function downloadInvoice(invoice) {
    if (!invoice?.id) return;
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('ITnvend_token') : null;
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(`/api/vendor/invoices/${invoice.id}/pdf`, { headers });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${invoice.invoice_number || `invoice-${invoice.id}`}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.push('Invoice downloaded', 'success');
    } catch (err) {
      console.error('Invoice download failed', err);
      toast.push('Failed to download invoice', 'error');
    }
  }

  async function previewInvoice(invoice) {
    if (!invoice?.id) return;
    setInvoicePreview({ invoice, html: '' });
    setInvoicePreviewLoading(true);
    try {
      const res = await api.get(`/vendor/invoices/${invoice.id}/preview`);
      setInvoicePreview({ invoice, html: res?.html || '' });
    } catch (err) {
      console.error('Preview failed', err);
      toast.push('Failed to preview invoice', 'error');
      setInvoicePreview(null);
    } finally {
      setInvoicePreviewLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 via-sky-600 to-indigo-700 p-8 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.25),_transparent_55%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-white/70">Vendor dashboard</p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-black">{vendor?.legal_name || 'Vendor'}</h1>
                {isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                    <FaCheckCircle />
                    Verified
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-2xl text-sm text-white/80">
                {vendor?.tagline || vendor?.public_description || 'Sync your storefront, keep tabs on invoices, and stay connected to the marketplace.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/vendor/products"
                className="inline-flex items-center justify-center rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white backdrop-blur hover:bg-white/25"
              >
                Manage products
              </Link>
              <Link
                to="/vendor/settings"
                className="inline-flex items-center justify-center rounded-full border border-white/40 px-5 py-2 text-sm font-semibold text-white/90 hover:bg-white/10"
              >
                Profile settings
              </Link>
            </div>
          </div>
          <div className="relative mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/20 p-4 shadow-lg shadow-emerald-900/30">
              <p className="text-xs uppercase tracking-wide text-white/70">Active listings</p>
              <p className="mt-2 text-3xl font-bold">{totalProducts}</p>
            </div>
            <div className="rounded-2xl bg-white/20 p-4 shadow-lg shadow-emerald-900/30">
              <p className="text-xs uppercase tracking-wide text-white/70">Outstanding balance</p>
              <p className="mt-2 text-3xl font-bold">{formatMoney(outstanding)}</p>
              <p className="text-xs text-white/70">{unpaidInvoices.length ? `${unpaidInvoices.length} invoice(s)` : 'All settled'}</p>
            </div>
            <div className="rounded-2xl bg-white/20 p-4 shadow-lg shadow-emerald-900/30">
              <p className="text-xs uppercase tracking-wide text-white/70">Currency</p>
              <p className="mt-2 text-3xl font-bold">{currencyCode}</p>
            </div>
            <div className="rounded-2xl bg-white/20 p-4 shadow-lg shadow-emerald-900/30">
              <p className="text-xs uppercase tracking-wide text-white/70">Next due date</p>
              <p className="mt-2 text-3xl font-bold">{nextDue ? new Date(nextDue.due_date || nextDue.issued_at).toLocaleDateString() : '—'}</p>
            </div>
          </div>
        </section>

        {blockedMessage && (
          <div className="rounded-2xl border border-amber-400 bg-amber-500/20 p-4 text-sm text-amber-100">
            {blockedMessage}
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="col-span-2 space-y-6">
            <div className="rounded-2xl bg-white/5 p-6 shadow-xl shadow-black/40">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Recent products</h2>
                  <p className="text-sm text-slate-300">Newest listings visible on your public profile.</p>
                </div>
                <Link to="/vendor/products" className="text-sm font-semibold text-emerald-200 hover:text-white">
                  Product manager →
                </Link>
              </div>
              {showcaseProducts.length === 0 ? (
                <div className="rounded-xl border border-white/10 p-6 text-sm text-slate-300">
                  No products yet. Use “Manage products” to add your first listing.
                </div>
              ) : (
                <div className="space-y-3">
                  {showcaseProducts.map((prod) => (
                    <div key={prod.id} className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/5 p-3 sm:flex-row sm:items-center">
                      <img src={prod.image || '/images/placeholder.png'} alt={prod.name} className="h-16 w-16 rounded-xl object-cover" />
                      <div className="flex-1">
                        <p className="font-semibold text-white">{prod.name}</p>
                        <p className="text-xs text-slate-300">
                          SKU {prod.sku || '—'} · {prod.stock} in stock · {formatMoney(prod.price)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Link to="/vendor/products" className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:border-white/40">
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Archive ${prod.name}?`)) {
                              api.del(`/vendor/products/${prod.id}`)
                                .then(() => {
                                  setProducts((prev) => prev.filter((p) => p.id !== prod.id));
                                  toast.push('Product archived', 'success');
                                })
                                .catch(() => toast.push('Archive failed', 'error'));
                            }
                          }}
                          className="rounded-full bg-rose-500/80 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-500"
                        >
                          Archive
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white/5 p-6 shadow-xl shadow-black/40">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Low stock</h2>
                  <p className="text-sm text-slate-300">Items below 5 units of inventory.</p>
                </div>
                <Link to="/vendor/products" className="text-sm font-semibold text-emerald-200 hover:text-white">
                  Restock →
                </Link>
              </div>
              {lowStock.length === 0 ? (
                <div className="rounded-xl border border-white/10 p-6 text-sm text-slate-300">Everything is fully stocked.</div>
              ) : (
                <ul className="space-y-3">
                  {lowStock.map((item) => (
                    <li key={item.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="flex items-center gap-3">
                        <img src={item.image || '/images/placeholder.png'} alt={item.name} className="h-10 w-10 rounded-lg object-cover" />
                        <div>
                          <p className="text-sm font-semibold text-white">{item.name}</p>
                          <p className="text-xs text-slate-300">{item.stock} remaining</p>
                        </div>
                      </div>
                      <Link to="/vendor/products" className="text-xs font-semibold text-emerald-200 hover:text-white">
                        Adjust →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-lg">
              <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
              <p className="text-sm text-slate-500">Download invoices or see what’s outstanding.</p>
              {recentInvoices.length === 0 ? (
                <div className="mt-4 rounded-xl border border-slate-100 p-4 text-sm text-slate-500">No invoices generated yet.</div>
              ) : (
                <div className="mt-4 space-y-3">
                  {recentInvoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-xl border border-slate-100 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">#{invoice.invoice_number || invoice.id}</p>
                          <p className="text-xs text-slate-500">
                            Issued {invoice.issued_at ? new Date(invoice.issued_at).toLocaleDateString() : '—'} · Due{' '}
                            {invoice.due_date ? new Date(invoice.due_date).toLocaleDateString() : '—'}
                          </p>
                          {invoice.void_reason && <p className="text-xs text-rose-500">Voided: {invoice.void_reason}</p>}
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            invoice.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700'
                              : invoice.status === 'void'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {invoice.status}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="font-semibold text-slate-900">{formatMoney(invoice.fee_amount)}</p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => previewInvoice(invoice)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
                          >
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadInvoice(invoice)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-slate-400"
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl shadow-black/40">
              <h2 className="text-lg font-semibold text-white">Need help?</h2>
              <p className="mt-1 text-sm text-slate-300">
                Email <a href="mailto:support@itnvend.com" className="text-emerald-200 hover:text-white">support@itnvend.com</a> with your invoice number after payment so we can re-enable the dashboard instantly.
              </p>
            </div>
          </div>
        </section>
      </div>
      <Modal open={Boolean(invoicePreview)} onClose={() => setInvoicePreview(null)}>
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Invoice preview — {invoicePreview?.invoice?.invoice_number || invoicePreview?.invoice?.id || ''}</h3>
            <button onClick={() => setInvoicePreview(null)} className="text-sm text-slate-500">Close</button>
          </div>
          {invoicePreviewLoading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading preview…</div>
          ) : invoicePreview?.html ? (
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-100">
              <div dangerouslySetInnerHTML={{ __html: invoicePreview.html }} />
            </div>
          ) : (
            <div className="py-6 text-sm text-slate-500">No preview available.</div>
          )}
        </div>
      </Modal>
    </div>
  );
}
