import { useEffect, useState } from 'react';
import api from '../lib/api';
import resolveMediaUrl from '../lib/media';
import { useToast } from '../components/ToastContext';
import { FaCheck, FaTimes, FaSearch, FaFileAlt } from 'react-icons/fa';

const DOCUMENT_KEYS = [
  'documents',
  'document_urls',
  'submitted_documents',
  'attachments',
  'files',
  'uploaded_files',
  'documents_json',
  'supporting_documents',
  'support_docs',
  'docs',
];

function normalizeDocumentEntries(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeDocumentEntries(entry));
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return normalizeDocumentEntries(parsed);
    } catch {
      return trimmed
        .split(/[\n,;]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }
  }
  if (typeof value === 'object') {
    const nested = [];
    Object.values(value).forEach((entry) => {
      if (!entry) return;
      if (typeof entry === 'string') {
        nested.push(...normalizeDocumentEntries(entry));
      } else if (typeof entry === 'object') {
        const candidate = entry.url || entry.href || entry.path || entry.file || entry.location;
        if (candidate) nested.push(...normalizeDocumentEntries(candidate));
      }
    });
    return nested;
  }
  return [];
}

function extractDocumentList(row) {
  if (!row) return [];
  const results = new Set();
  DOCUMENT_KEYS.forEach((key) => {
    if (row[key]) {
      normalizeDocumentEntries(row[key]).forEach((entry) => {
        const trimmed = typeof entry === 'string' ? entry.trim() : '';
        if (trimmed) results.add(trimmed);
      });
    }
  });
  return Array.from(results);
}

function isImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url.split('?')[0] || '');
}

function DocumentCard({ url, index }) {
  const resolved = resolveMediaUrl(url);
  if (!resolved) return null;
  const image = isImageUrl(resolved);
  const name = decodeURIComponent(resolved.split('/').pop() || `Document ${index + 1}`);
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm">
      <div className="relative flex h-36 w-full items-center justify-center overflow-hidden rounded-xl bg-slate-100">
        {image ? (
          <img src={resolved} alt={name} className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <FaFileAlt className="text-3xl text-slate-400" />
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span className="truncate pr-2" title={name}>
          {name || `Document ${index + 1}`}
        </span>
        <a
          href={resolved}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-blue-600 hover:underline"
        >
          Open
        </a>
      </div>
    </div>
  );
}

export default function Submissions() {
  const [tab, setTab] = useState('vendors');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({ vendors: [], casual_items: [], others: [] });
  const [selected, setSelected] = useState(null);
  const toast = useToast();
  const vendorDocuments = selected?.type === 'vendor' ? extractDocumentList(selected.row) : [];

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-6">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200/70 bg-white shadow-2xl shadow-slate-900/20">
            <header className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {selected.type === 'vendor' ? 'Vendor application' : 'One-time submission'}
                </span>
                <h2 className="text-lg font-semibold text-slate-800">Review details</h2>
                <p className="text-xs text-slate-500">Confirm everything looks correct before approving.</p>
              </div>
              <button onClick={() => setSelected(null)} className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-blue-400 hover:text-blue-600">Close</button>
            </header>
            <div className="grid gap-6 p-6 md:grid-cols-2">
              {selected.type === 'vendor' ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Legal name</div>
                      <div className="text-gray-800">{selected.row.legal_name}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Contact person / Email</div>
                      <div className="text-gray-700">
                        {selected.row.contact_person || '—'}
                        {selected.row.email ? ` • ${selected.row.email}` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Phone</div>
                      <div className="text-gray-700">{selected.row.phone || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Address</div>
                      <div className="text-gray-700 whitespace-pre-wrap">{selected.row.address || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Capabilities / Notes</div>
                      <div className="text-gray-700 whitespace-pre-wrap">
                        {selected.row.capabilities || selected.row.notes || 'Not provided'}
                      </div>
                    </div>
                    {selected.row.bank_details && (
                      <div>
                        <div className="text-xs font-semibold uppercase text-slate-500">Bank / payout details</div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-sm text-slate-700 whitespace-pre-wrap">
                          {selected.row.bank_details}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    {(() => {
                      const vendorLogo = resolveMediaUrl(selected.row.logo_url);
                      if (!vendorLogo) return null;
                      return (
                        <img
                          src={vendorLogo}
                          alt={`${selected.row.legal_name} logo`}
                          className="h-44 w-full rounded-2xl border border-slate-100 bg-slate-50 object-contain p-4"
                          loading="lazy"
                        />
                      );
                    })()}
                    <div>
                      <div className="text-xs font-semibold uppercase text-slate-500">Commission rate</div>
                      <div className="text-gray-700">
                        {selected.row.commission_rate != null
                          ? `${(selected.row.commission_rate * 100).toFixed(1)}%`
                          : '—'}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        onClick={() => approveVendor(selected.row.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow shadow-emerald-200/70 transition hover:-translate-y-0.5 sm:flex-none"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => rejectVendor(selected.row.id)}
                        className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 sm:flex-none"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  <div className="md:col-span-2 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-slate-700">Submitted documents</h3>
                      <span className="text-xs text-slate-500">
                        {vendorDocuments.length} file(s)
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {vendorDocuments.length > 0 ? (
                        vendorDocuments.map((doc, idx) => (
                          <DocumentCard key={`${doc}-${idx}`} url={doc} index={idx} />
                        ))
                      ) : (
                        <p className="text-sm text-slate-500">No supporting files were attached to this submission.</p>
                      )}
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
                        <img
                          key={idx}
                          src={resolveMediaUrl(p)}
                          alt={`photo-${idx}`}
                          className="h-44 w-full rounded-xl object-cover shadow-sm shadow-slate-200/60"
                          loading="lazy"
                        />
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
