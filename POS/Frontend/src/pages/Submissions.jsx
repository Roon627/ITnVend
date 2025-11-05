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
    <div className="p-6 bg-gray-50 min-h-full">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Submissions</h1>
          <p className="text-sm text-gray-500">Review incoming vendor applications and one-time seller listings.</p>
        </div>
      </header>

      <div className="bg-white border rounded p-4 mb-4">
        <nav className="flex gap-2">
          <button onClick={() => setTab('vendors')} className={`px-3 py-1 rounded ${tab==='vendors'?'bg-blue-600 text-white':'bg-gray-100'}`}>
            Vendors ({data.vendors?.length || 0})
          </button>
          <button onClick={() => setTab('casual')} className={`px-3 py-1 rounded ${tab==='casual'?'bg-blue-600 text-white':'bg-gray-100'}`}>
            One-Time Sellers ({data.casual_items?.length || 0})
          </button>
          <button onClick={() => setTab('others')} className={`px-3 py-1 rounded ${tab==='others'?'bg-blue-600 text-white':'bg-gray-100'}`}>
            Other ({data.others?.length || 0})
          </button>
        </nav>
      </div>

      <div className="bg-white border rounded p-4">
        {loading && <div className="text-sm text-gray-500">Loading...</div>}

        {tab === 'vendors' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Contact</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Status</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.vendors.map((v) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{v.legal_name}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{v.email || v.contact_person}</td>
                  <td className="px-4 py-2">{v.status}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setSelected({ type: 'vendor', row: v }); }} className="px-3 py-1 bg-gray-200 text-gray-800 rounded">View</button>
                      <button onClick={() => approveVendor(v.id)} className="px-3 py-1 bg-emerald-500 text-white rounded"><FaCheck /></button>
                      <button onClick={() => rejectVendor(v.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded"><FaTimes /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.vendors.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No vendor submissions</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'casual' && (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Title</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Seller</th>
                <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500">Price</th>
                <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.casual_items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">{c.title}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{c.seller_name || c.seller_email}</td>
                  <td className="px-4 py-2">{c.asking_price}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <button onClick={() => { setSelected({ type: 'casual', row: c }); }} className="px-3 py-1 bg-gray-200 text-gray-800 rounded">View</button>
                      <button onClick={() => approveCasual(c.id)} className="px-3 py-1 bg-emerald-500 text-white rounded"><FaCheck /></button>
                      <button onClick={() => rejectCasual(c.id)} className="px-3 py-1 bg-red-100 text-red-600 rounded"><FaTimes /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {data.casual_items.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-500">No casual submissions</td></tr>
              )}
            </tbody>
          </table>
        )}

        {tab === 'others' && (
          <div className="text-sm text-gray-500">No other submissions configured yet.</div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-6">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-auto">
            <header className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">{selected.type === 'vendor' ? 'Vendor application' : 'One-time item'}</h2>
                <p className="text-sm text-gray-500">Details submitted</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSelected(null)} className="px-3 py-1 rounded bg-gray-100">Close</button>
              </div>
            </header>
            <div className="p-6 grid gap-4 md:grid-cols-2">
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
                      <img src={selected.row.logo_url.startsWith('http') ? selected.row.logo_url : `/images/${selected.row.logo_url}`} alt="logo" className="w-full h-48 object-contain bg-gray-50 p-4" />
                    )}
                    <div className="mt-4">
                      <div className="text-sm font-semibold">Commission rate</div>
                      <div className="text-gray-700">{(selected.row.commission_rate != null) ? `${(selected.row.commission_rate*100).toFixed(1)}%` : '—'}</div>
                    </div>
                    <div className="mt-4">
                      <button onClick={() => approveVendor(selected.row.id)} className="px-3 py-2 bg-emerald-500 text-white rounded mr-2">Approve</button>
                      <button onClick={() => rejectVendor(selected.row.id)} className="px-3 py-2 bg-red-100 text-red-600 rounded">Reject</button>
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
                    <div className="grid gap-2">
                      {(selected.row.photos || '').split(',').filter(Boolean).map((p, idx) => (
                        <img key={idx} src={p.startsWith('http') ? p : `/images/${p}`} alt={`photo-${idx}`} className="w-full h-40 object-cover rounded" />
                      ))}
                    </div>
                    <div className="mt-4">
                      <button onClick={() => approveCasual(selected.row.id)} className="px-3 py-2 bg-emerald-500 text-white rounded mr-2">Approve</button>
                      <button onClick={() => rejectCasual(selected.row.id)} className="px-3 py-2 bg-red-100 text-red-600 rounded">Reject</button>
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
