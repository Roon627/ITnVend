import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';

export default function VendorDashboard() {
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [blockedMessage, setBlockedMessage] = useState(null);
  const [loading, setLoading] = useState(true);
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
  const nextDue = unpaidInvoices[0]?.due_date || null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{vendor?.legal_name || 'Vendor Dashboard'}</h2>
          <p className="mt-1 text-sm text-slate-500">{vendor?.tagline || vendor?.public_description || 'Manage your storefront, listings, and monthly billing.'}</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex items-center gap-3 rounded-full bg-slate-50 px-4 py-2 text-sm text-slate-600">
            <span className="text-xs text-slate-500">Currency</span>
            <span className="font-semibold text-slate-900">{currencyCode}</span>
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Managed by ITnVend</span>
          </div>
          <Link to="/vendor/products" className="inline-flex items-center justify-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700">
            Manage products
          </Link>
          <button onClick={() => window.location.href = '/vendor/products'} className="inline-flex items-center justify-center gap-2 rounded-full border border-indigo-100 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50">
            Quick add
          </button>
        </div>
      </header>

      <section className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Active listings</div>
              <div className="text-2xl font-semibold">{totalProducts}</div>
            </div>
            <div className="text-indigo-600 bg-indigo-50 rounded-full w-12 h-12 flex items-center justify-center font-bold">{totalProducts}</div>
          </div>
          <div className="mt-3 text-sm text-slate-500">Listings you can manage in the product manager.</div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Outstanding balance</div>
              <div className="text-2xl font-semibold">{formatMoney(outstanding)}</div>
            </div>
            <div className="text-amber-600 bg-amber-50 rounded-full w-12 h-12 flex items-center justify-center font-bold">$</div>
          </div>
          <div className="mt-3 text-sm text-slate-500">{unpaidInvoices.length ? `Includes ${unpaidInvoices.length} open invoice${unpaidInvoices.length === 1 ? '' : 's'}.` : 'No open invoices.'}</div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Open invoices</div>
              <div className="text-2xl font-semibold">{unpaidInvoices.length}</div>
            </div>
            <div className="text-emerald-600 bg-emerald-50 rounded-full w-12 h-12 flex items-center justify-center font-bold">{unpaidInvoices.length}</div>
          </div>
          <div className="mt-3 text-sm text-slate-500">
            {nextDue ? `Next due ${new Date(nextDue).toLocaleDateString()}` : 'Nothing due right now.'}
          </div>
        </div>
      </section>
      {blockedMessage && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          {blockedMessage}
        </div>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="col-span-2 rounded-2xl border bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Recent products</h3>
            <Link to="/vendor/products" className="text-sm text-indigo-600">Open product manager →</Link>
          </div>
          {products.length === 0 ? (
            <div className="text-sm text-slate-500">No products found. Use Manage products to add new listings.</div>
          ) : (
            <div className="grid gap-3">
              {products.slice(0, 8).map((prod) => (
                <div key={prod.id} className="flex items-center gap-4 p-3 rounded hover:bg-slate-50">
                  <img src={prod.image || '/images/placeholder.png'} alt={prod.name} className="h-16 w-16 rounded object-cover" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{prod.name}</div>
                      <div className="text-sm text-slate-500">{new Intl.NumberFormat(undefined, { style: 'currency', currency: vendor?.currency || 'USD' }).format(prod.price)}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">SKU: {prod.sku || '—'} • {prod.stock} in stock</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link to="/vendor/products" className="text-sm rounded border px-2 py-1">Edit</Link>
                    <button onClick={() => { if (confirm(`Archive product "${prod.name}"?`)) { api.del(`/vendor/products/${prod.id}`).then(() => { setProducts(prev => prev.filter(x => x.id !== prod.id)); toast.push('Product archived', 'success'); }).catch(e => { toast.push('Archive failed', 'error'); console.error(e); }); } }} className="text-sm rounded bg-red-600 text-white px-2 py-1">Archive</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-4">
          <h3 className="text-lg font-semibold mb-3">Low stock</h3>
          {lowStock.length === 0 ? (
            <div className="text-sm text-slate-500">No low-stock items.</div>
          ) : (
            <ul className="space-y-3">
              {lowStock.map(p => (
                <li key={p.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={p.image || '/images/placeholder.png'} alt={p.name} className="h-10 w-10 rounded object-cover" />
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.stock} remaining</div>
                    </div>
                  </div>
                  <Link to="/vendor/products" className="text-sm text-indigo-600">Manage</Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 text-xs text-slate-400">Tip: Replenish stock to avoid lost sales.</div>
        </div>
      </section>

      <section className="mt-6 rounded-2xl border bg-white p-4">
        <h3 className="text-lg font-semibold mb-3">Billing activity</h3>
        {recentInvoices.length === 0 ? (
          <div className="text-sm text-slate-500">No invoices generated yet.</div>
        ) : (
          <div className="grid gap-3">
            {recentInvoices.map(inv => (
              <div key={inv.id} className="flex flex-col gap-1 rounded border border-slate-100 p-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Invoice {inv.invoice_number || inv.id}</div>
                  <div className="text-xs text-slate-500">
                    Issued {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString() : '—'} • Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'}`}>
                    {inv.status || 'unpaid'}
                  </span>
                  <div className="text-sm font-semibold">{formatMoney(inv.fee_amount)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Need to settle an invoice? Contact support after transferring the fee so we can mark it paid immediately.
        </p>
      </section>
      </div>
    </div>
  );
}
