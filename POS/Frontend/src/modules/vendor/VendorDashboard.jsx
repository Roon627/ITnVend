import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useAuth } from '../../components/AuthContext';

export default function VendorDashboard() {
  const [vendor, setVendor] = useState(null);
  const [products, setProducts] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const { user } = useAuth();

  useEffect(() => {
    let mounted = true;
    (async function fetchAll() {
      setLoading(true);
      try {
        const [vRes, pRes, payRes] = await Promise.all([
          api.get('/vendor/me'),
          api.get('/vendor/me/products'),
          api.get('/vendor/me/payouts'),
        ]);
        if (!mounted) return;
        setVendor(vRes || null);
        setProducts(pRes || []);
        setPayouts(payRes || []);
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
  const totalGross = payouts.reduce((s, p) => s + (Number(p.gross_sales) || 0), 0);
  const totalPayable = payouts.reduce((s, p) => s + (Number(p.payable_amount) || 0), 0);
  const pendingPayouts = payouts.filter(p => p.status === 'pending' || p.status === 'unpaid').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24">
      <div className="mx-auto max-w-5xl">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold tracking-tight">{vendor?.legal_name || 'Vendor Dashboard'}</h2>
          <p className="mt-1 text-sm text-slate-500">{vendor?.tagline || vendor?.public_description || 'Manage your storefront, listings and payouts.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-3 rounded-full bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <span className="text-xs text-slate-500">Currency</span>
            <span className="font-medium">{vendor?.currency || 'USD'}</span>
            {user && (user.role === 'manager' || user.role === 'admin' || user.role === 'owner') ? (
              <Link to="/vendors" className="ml-3 text-xs text-indigo-600">Change</Link>
            ) : (
              <Link to="/vendors" className="ml-3 text-xs text-indigo-600">Admin</Link>
            )}
          </div>
          <Link to="/vendor/products" className="inline-flex items-center gap-2 rounded bg-indigo-600 text-white px-4 py-2 shadow hover:bg-indigo-700">+ Manage products</Link>
          <button onClick={() => window.location.href = '/vendor/products'} className="inline-flex items-center gap-2 rounded border px-4 py-2 text-sm">Quick add</button>
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
              <div className="text-xs text-slate-500">Total gross sales</div>
              <div className="text-2xl font-semibold">{new Intl.NumberFormat(undefined, { style: 'currency', currency: vendor?.currency || 'USD' }).format(totalGross)}</div>
            </div>
            <div className="text-amber-600 bg-amber-50 rounded-full w-12 h-12 flex items-center justify-center font-bold">$</div>
          </div>
          <div className="mt-3 text-sm text-slate-500">Across recorded payouts.</div>
        </div>

        <div className="rounded-2xl border bg-white p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-500">Pending payouts</div>
              <div className="text-2xl font-semibold">{pendingPayouts}</div>
            </div>
            <div className="text-emerald-600 bg-emerald-50 rounded-full w-12 h-12 flex items-center justify-center font-bold">{pendingPayouts}</div>
          </div>
          <div className="mt-3 text-sm text-slate-500">Payable: {new Intl.NumberFormat(undefined, { style: 'currency', currency: vendor?.currency || 'USD' }).format(totalPayable)}</div>
        </div>
      </section>

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
        <h3 className="text-lg font-semibold mb-3">Recent payouts</h3>
        {payouts.length === 0 ? (
          <div className="text-sm text-slate-500">No payouts recorded.</div>
        ) : (
          <div className="grid gap-3">
            {payouts.slice(0, 6).map(pay => (
              <div key={pay.id} className="flex items-center justify-between p-3 rounded hover:bg-slate-50">
                <div>
                  <div className="font-medium">Payout #{pay.id} • {pay.period || ''}</div>
                  <div className="text-xs text-slate-500">Gross: {pay.gross_sales} • Commission: {pay.commission_amount}</div>
                </div>
                <div className="text-sm font-semibold">{pay.payable_amount}</div>
              </div>
            ))}
          </div>
        )}
      </section>
      </div>
    </div>
  );
}
