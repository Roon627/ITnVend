import { useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { FaCheck, FaTimes, FaSearch } from 'react-icons/fa';

export default function Submissions() {
  const [tab, setTab] = useState('vendors');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ vendors: [], casual_items: [], others: [] });
  const [selected, setSelected] = useState(null);
  const toast = useToast();

  async function fetchSubmissions() {
    setLoading(true);
    try {
      const res = await api.get('/submissions');
      setData(res || { vendors: [], casual_items: [], others: [] });
    } catch (err) {
      console.error('Failed to load submissions', err);
      toast.push('Failed to load submissions', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSubmissions(); }, []);

  async function approveVendor(id) {
    try {
      await api.put(`/vendors/${id}/status`, { status: 'active' });
      toast.push('Vendor approved and added to customers', 'success');
      fetchSubmissions();
    } catch (err) {
      console.error(err);
      toast.push(err?.response?.data?.error || 'Failed to approve vendor', 'error');
    }
  }

  async function rejectVendor(id) {
    if (!window.confirm('Reject this vendor application?')) return;
    try {
      await api.put(`/vendors/${id}/status`, { status: 'rejected' });
      toast.push('Vendor rejected', 'info');
      fetchSubmissions();
    } catch (err) {
      console.error(err);
      toast.push(err?.response?.data?.error || 'Failed to reject vendor', 'error');
    }
  }

  async function approveCasual(id) {
    try {
      await api.put(`/casual-items/${id}/approve`);
      toast.push('Casual item approved and published', 'success');
      fetchSubmissions();
    } catch (err) {
      console.error(err);
      toast.push(err?.response?.data?.error || 'Failed to approve item', 'error');
    }
  }

  async function rejectCasual(id) {
    if (!window.confirm('Reject this submission?')) return;
    try {
      await api.put(`/casual-items/${id}/reject`, { reason: 'Rejected by staff' });
      toast.push('Submission rejected', 'info');
      fetchSubmissions();
    } catch (err) {
      console.error(err);
      toast.push(err?.response?.data?.error || 'Failed to reject', 'error');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24 space-y-6">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50 backdrop-blur">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
              Review queue
            </span>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Submissions</h1>
              <p className="text-sm text-slate-500">Approve or reject vendor applications and one-time seller listings before they join the hub.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FaSearch className="text-blue-500" />
            <span>Keep a close pulse on your marketplace intake.</span>
          </div>
        </header>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm shadow-blue-100/40 backdrop-blur">
        <nav className="flex flex-wrap gap-2">
          <button
            onClick={() => setTab('vendors')}
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
              tab==='vendors'
                ? 'bg-blue-600 text-white shadow shadow-blue-300/60'
                : 'bg-white/70 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            Vendors ({data.vendors?.length || 0})
          </button>
          <button
            onClick={() => setTab('casual')}
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
              tab==='casual'
                ? 'bg-blue-600 text-white shadow shadow-blue-300/60'
                : 'bg-white/70 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            One-time sellers ({data.casual_items?.length || 0})
          </button>
          <button
            onClick={() => setTab('others')}
            className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
              tab==='others'
                ? 'bg-blue-600 text-white shadow shadow-blue-300/60'
                : 'bg-white/70 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
            }`}
          >
            Other ({data.others?.length || 0})
          </button>
        </nav>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-md shadow-blue-100/50 backdrop-blur space-y-4">
        {loading && <div className="text-sm text-gray-500">Loading...</div>}

        {tab === 'vendors' && (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.map((v) => (
                <tr key={v.id} className="transition hover:bg-blue-50/40">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{v.legal_name}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{v.email || v.contact_person}</td>
                  <td className="px-4 py-3 text-sm capitalize text-slate-600">{v.status}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setSelected({ type: 'vendor', row: v }); }} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600">View</button>
                      <button onClick={() => approveVendor(v.id)} className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-emerald-200/70 transition hover:-translate-y-0.5">
                        <FaCheck />
                      </button>
                      <button onClick={() => rejectVendor(v.id)} className="inline-flex items-center justify-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">
                        <FaTimes />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.vendors.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">No vendor submissions</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'casual' && (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Title</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Seller</th>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Price</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.casual_items.map((c) => (
                <tr key={c.id} className="transition hover:bg-blue-50/40">
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">{c.title}</td>
                  <td className="px-4 py-3 text-sm text-slate-500">{c.seller_name || c.seller_email}</td>
                  <td className="px-4 py-3 text-sm text-slate-600">{c.asking_price}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setSelected({ type: 'casual', row: c }); }} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600">View</button>
                      <button onClick={() => approveCasual(c.id)} className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-emerald-200/70 transition hover:-translate-y-0.5">
                        <FaCheck />
                      </button>
                      <button onClick={() => rejectCasual(c.id)} className="inline-flex items-center justify-center rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">
                        <FaTimes />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.casual_items.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">No casual submissions</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'others' && (
          <div className="text-sm text-slate-500">No other submissions configured yet.</div>
        )}
      </section>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-6">
          <div className="w-full max-w-3xl overflow-auto rounded-2xl border border-slate-200/70 bg-white/95 shadow-2xl shadow-slate-900/20">
            <header className="flex flex-col gap-2 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {selected.type === 'vendor' ? 'Vendor application' : 'One-time submission'}
                </span>
                <h2 className="text-lg font-semibold text-slate-800">Review details</h2>
                <p className="text-xs text-slate-500">Make sure the submission aligns with your marketplace standards.</p>
              </div>
              <button onClick={() => setSelected(null)} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600">Close</button>
            </header>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              {selected.type === 'vendor' ? (
                <>
                  <div>
                    <div className="text-sm font-semibold">Legal name</div>
                    <div className="text-gray-700">{selected.row.legal_name}</div>
                    <div className="text-sm font-semibold mt-3">Contact person / Email</div>
                    <div className="text-gray-700">{selected.row.contact_person} {selected.row.email ? `• ${selected.row.email}` : ''}</div>
                    <div className="text-sm font-semibold mt-3">Phone</div>
                    <div className="text-gray-700">{selected.row.phone}</div>
                    <div className="text-sm font-semibold mt-3">Address</div>
                    <div className="text-gray-700">{selected.row.address}</div>
                    <div className="text-sm font-semibold mt-3">Capabilities / Notes</div>
                    <div className="text-gray-700 whitespace-pre-wrap">{selected.row.capabilities || selected.row.notes}</div>
                  </div>
                  <div>
                    {selected.row.logo_url && (
                      <img src={selected.row.logo_url.startsWith('http') ? selected.row.logo_url : `/images/${selected.row.logo_url}`} alt="logo" className="h-44 w-full rounded-xl bg-slate-50 object-contain p-4" />
                    )}
                    <div className="mt-4">
                      <div className="text-sm font-semibold">Commission rate</div>
                      <div className="text-gray-700">{(selected.row.commission_rate != null) ? `${(selected.row.commission_rate*100).toFixed(1)}%` : '—'}</div>
                    </div>
                    <div className="mt-4">
                      <button onClick={() => approveVendor(selected.row.id)} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow shadow-emerald-200/70 transition hover:-translate-y-0.5 mr-2">Approve</button>
                      <button onClick={() => rejectVendor(selected.row.id)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">Reject</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-sm font-semibold">Title</div>
                    <div className="text-gray-800">{selected.row.title}</div>
                    <div className="text-sm font-semibold mt-3">Description</div>
                    <div className="text-gray-700 whitespace-pre-wrap">{selected.row.description}</div>
                    <div className="text-sm font-semibold mt-3">Condition</div>
                    <div className="text-gray-700">{selected.row.condition}</div>
                    <div className="text-sm font-semibold mt-3">User category</div>
                    <div className="text-gray-700">{selected.row.user_category || '—'}{selected.row.user_subcategory ? ` › ${selected.row.user_subcategory}` : ''}</div>
                    <div className="text-sm font-semibold mt-3">User tag</div>
                    <div className="text-gray-700">{selected.row.user_tag || '—'}</div>
                    <div className="text-sm font-semibold mt-3">Asking price</div>
                    <div className="text-gray-700">{selected.row.asking_price}</div>
                    <div className="text-sm font-semibold mt-3">Seller</div>
                    <div className="text-gray-700">{selected.row.seller_name || selected.row.seller_email}</div>
                    {selected.row.invoice_id && (
                      <div className="mt-3 text-sm"><a href={`/invoices/${selected.row.invoice_id}`} className="text-blue-600">View invoice #{selected.row.invoice_id}</a></div>
                    )}
                  </div>
                  <div>
                    <div className="grid gap-3">
                      {(selected.row.photos || '').split(',').filter(Boolean).map((p, idx) => (
                        <img key={idx} src={p.startsWith('http') ? p : `/images/${p}`} alt={`photo-${idx}`} className="h-44 w-full rounded-xl object-cover shadow-sm shadow-slate-200/60" />
                      ))}
                    </div>
                    <div className="mt-4">
                      <button onClick={() => approveCasual(selected.row.id)} className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow shadow-emerald-200/70 transition hover:-translate-y-0.5 mr-2">Approve</button>
                      <button onClick={() => rejectCasual(selected.row.id)} className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">Reject</button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
