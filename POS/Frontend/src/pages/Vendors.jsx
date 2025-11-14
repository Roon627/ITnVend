import { useEffect, useMemo, useState, useCallback } from 'react';
import { FaBuilding, FaEnvelope, FaGlobe, FaKey } from 'react-icons/fa';
import api, { setAuthToken } from '../lib/api';
import { useToast } from '../components/ToastContext';
import Modal from '../components/Modal';

const STATUS_PILLS = [
  { id: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 border border-amber-100' },
  { id: 'active', label: 'Active', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  { id: 'rejected', label: 'Rejected', color: 'bg-rose-50 text-rose-700 border border-rose-100' },
];

const VENDOR_PORTAL_SOURCE =
  (import.meta.env?.VITE_VENDOR_PORTAL_URL ||
    import.meta.env?.VITE_POS_VENDOR_URL ||
    '').trim();

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [tokensModalOpen, setTokensModalOpen] = useState(false);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensList, setTokensList] = useState([]);
  const [tokensVendor, setTokensVendor] = useState(null);
  const [credModalOpen, setCredModalOpen] = useState(false);
  const [credLoading, setCredLoading] = useState(false);
  const [credData, setCredData] = useState(null);
  const vendorPortalBase = useMemo(() => {
    if (VENDOR_PORTAL_SOURCE) return VENDOR_PORTAL_SOURCE.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin.replace(/\/$/, '');
    }
    return '';
  }, []);

  const fetchVendors = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/vendors', { params: { status: statusFilter } });
      setVendors(res || []);
    } catch (err) {
      console.error('Failed to load vendors', err);
      toast.push('Failed to load vendors', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  async function updateStatus(id, nextStatus) {
    try {
      await api.put(`/vendors/${id}/status`, { status: nextStatus });
      toast.push(`Vendor ${nextStatus}`, 'success');
      fetchVendors();
    } catch (err) {
      console.error('Failed to update status', err);
      toast.push(err?.message || 'Failed to update vendor status', 'error');
    }
  }

  async function resendCredentialsUI(id) {
    try {
      await api.post(`/vendors/${id}/resend-credentials`);
      toast.push('Credentials regenerated (email attempted)', 'success');
      fetchVendors();
    } catch (err) {
      console.error('Failed to resend credentials', err);
      toast.push(err?.data?.error || err?.message || 'Failed to resend credentials', 'error');
    }
  }

  async function showCredentials(vendor) {
    setCredLoading(true);
    setCredModalOpen(true);
    setCredData(null);
    try {
      const res = await api.post(`/vendors/${vendor.id}/resend-credentials`, { reveal: true });
      if (res?.revealed) {
        setCredData(res.revealed);
        toast.push('Credentials shown — copy or share as needed', 'info');
      } else {
        setCredData({ username: vendor.email, loginUrl: `${window.location.origin}/vendor/login` });
        toast.push('Credentials regenerated; email attempted', 'success');
      }
      fetchVendors();
    } catch (err) {
      console.error('Failed to show credentials', err);
      toast.push(err?.data?.error || err?.message || 'Failed to retrieve credentials', 'error');
      setCredModalOpen(false);
    } finally {
      setCredLoading(false);
    }
  }

  async function sendPasswordReset(vendor) {
    if (!vendor?.email) return toast.push('Vendor has no email', 'error');
    try {
      await api.post('/vendors/password-reset/request', { email: vendor.email });
      toast.push('Password reset email sent (if address exists)', 'success');
    } catch (err) {
      console.error('Failed to send password reset', err);
      toast.push(err?.data?.error || err?.message || 'Failed to request password reset', 'error');
    }
  }

  async function impersonateVendor(id) {
    try {
      const adminToken = typeof window !== 'undefined' ? localStorage.getItem('ITnvend_token') : null;
      const res = await api.post(`/vendors/${id}/impersonate`);
      if (res?.token) {
        const base = vendorPortalBase || (typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '');
        const dashboardUrl = base.endsWith('/vendor/dashboard') ? base : `${base}/vendor/dashboard`;
        const url = `${dashboardUrl}?impersonation_token=${encodeURIComponent(res.token)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
        if (adminToken) {
          window.setTimeout(() => {
            setAuthToken(adminToken);
          }, 750);
        }
        toast.push('Opened vendor dashboard in new tab (impersonation)', 'success');
      } else {
        toast.push('Failed to impersonate vendor', 'error');
      }
    } catch (err) {
      console.error('Impersonation failed', err);
      toast.push(err?.data?.error || err?.message || 'Failed to impersonate vendor', 'error');
    }
  }

  async function openTokensModal(vendor) {
    setTokensVendor(vendor);
    setTokensModalOpen(true);
    setTokensLoading(true);
    try {
      const res = await api.get(`/vendors/${vendor.id}/password-reset-tokens`);
      setTokensList(res || []);
    } catch (err) {
      console.error('Failed to load tokens', err);
      toast.push('Failed to load reset tokens', 'error');
      setTokensList([]);
    } finally {
      setTokensLoading(false);
    }
  }

  const statusSummary = useMemo(() => {
    if (!vendors?.length) return {};
    return vendors.reduce((acc, vendor) => {
      const key = vendor.status || 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [vendors]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24 space-y-8">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/40 backdrop-blur">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
              Vendor ops
            </span>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Partner applications</h1>
              <p className="text-sm text-slate-500">Approve marketplace partners, manage contact points, and keep onboarding tidy.</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            {STATUS_PILLS.map((pill) => (
              <div key={pill.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                <div className="text-xl font-semibold text-slate-900">{statusSummary[pill.id] || 0}</div>
                <div className="text-xs uppercase tracking-wide text-slate-500">{pill.label}</div>
              </div>
            ))}
          </div>
        </header>
        <div className="mt-6 flex flex-wrap gap-3">
          {STATUS_PILLS.map((pill) => (
            <button
              key={pill.id}
              type="button"
              onClick={() => setStatusFilter(pill.id)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                statusFilter === pill.id ? pill.color : 'border border-slate-200 text-slate-600 bg-white'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-white/60 bg-white/90 p-6 shadow-xl shadow-blue-100/50 backdrop-blur">
        {loading ? (
          <div className="py-10 text-center text-sm text-slate-500">Loading vendor applications…</div>
        ) : vendors.length === 0 ? (
          <div className="py-10 text-center text-slate-500">No vendors in this state.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {vendors.map((vendor) => {
              const StatusIcon = vendor.status === 'active' ? FaBuilding : vendor.status === 'rejected' ? FaEnvelope : FaBuilding;
              const statusPill = STATUS_PILLS.find((p) => p.id === vendor.status) || STATUS_PILLS[0];
              return (
                <article key={vendor.id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-slate-400">Business</p>
                      <h3 className="text-lg font-semibold text-slate-900">{vendor.legal_name}</h3>
                      {vendor.website && (
                        <a href={vendor.website.startsWith('http') ? vendor.website : `https://${vendor.website}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-sky-600">
                          <FaGlobe /> {vendor.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusPill.color}`}>{statusPill.label}</span>
                  </div>
                  <div className="mt-4 grid gap-3 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <FaEnvelope className="text-slate-400" />
                      <span>{vendor.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span>{vendor.contact_person || 'No contact listed'}</span>
                      {vendor.phone && <span className="text-xs text-slate-400">• {vendor.phone}</span>}
                    </div>
                    {vendor.capabilities && (
                      <p className="text-xs text-slate-500 line-clamp-2">{vendor.capabilities}</p>
                    )}
                  </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {vendor.status === 'pending' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => updateStatus(vendor.id, 'active')}
                            className="flex-1 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => updateStatus(vendor.id, 'rejected')}
                            className="flex-1 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-700"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => resendCredentialsUI(vendor.id)} className="rounded-full border px-4 py-2 text-sm font-semibold">Resend credentials</button>
                          <button type="button" onClick={() => sendPasswordReset(vendor)} className="rounded-full border px-4 py-2 text-sm font-semibold">Send password reset</button>
                          <button type="button" onClick={() => impersonateVendor(vendor.id)} className="rounded-full bg-blue-600 text-white px-4 py-2 text-sm font-semibold">Login as vendor</button>
                          <button type="button" onClick={() => openTokensModal(vendor)} className="rounded-full border px-4 py-2 text-sm font-semibold inline-flex items-center gap-2"><FaKey />View tokens</button>
                          <button type="button" onClick={() => showCredentials(vendor)} className="rounded-full border px-4 py-2 text-sm font-semibold">Show credentials</button>
                        </>
                      )}
                    </div>
                  
                </article>
              );
            })}
          </div>
        )}
      </section>
      <Modal open={tokensModalOpen} onClose={() => setTokensModalOpen(false)}>
        <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Password reset tokens — {tokensVendor?.legal_name}</h3>
            <button onClick={() => setTokensModalOpen(false)} className="text-sm text-slate-500">Close</button>
          </div>
          <div className="mt-3">
            {tokensLoading ? (
              <div className="text-sm text-slate-500">Loading…</div>
            ) : tokensList.length === 0 ? (
              <div className="text-sm text-slate-500">No tokens found for this vendor.</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-2">Preview</th>
                    <th className="px-2 py-2">Used</th>
                    <th className="px-2 py-2">Expires at</th>
                    <th className="px-2 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tokensList.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-2 py-2 font-mono">{t.token_hash_preview || '—'}</td>
                      <td className="px-2 py-2">{t.used ? 'Yes' : 'No'}</td>
                      <td className="px-2 py-2">{t.expires_at || '—'}</td>
                      <td className="px-2 py-2">{t.created_at || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>
      <Modal open={credModalOpen} onClose={() => setCredModalOpen(false)}>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Vendor credentials — {tokensVendor?.legal_name || ''}</h3>
            <button onClick={() => setCredModalOpen(false)} className="text-sm text-slate-500">Close</button>
          </div>
          <div className="mt-4">
            {credLoading ? (
              <div className="text-sm text-slate-500">Generating credentials…</div>
            ) : credData ? (
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-slate-400">Login URL</div>
                  <div className="text-sm text-blue-600">{credData.loginUrl}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Username</div>
                  <div className="text-sm font-mono">{credData.username}</div>
                </div>
                {credData.temporaryPassword && (
                  <div>
                    <div className="text-xs text-slate-400">Temporary password</div>
                    <div className="text-sm font-mono">{credData.temporaryPassword}</div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => navigator.clipboard.writeText(credData.loginUrl)} className="rounded-full border px-3 py-2 text-sm">Copy login URL</button>
                  <button onClick={() => navigator.clipboard.writeText(credData.username)} className="rounded-full border px-3 py-2 text-sm">Copy username</button>
                  {credData.temporaryPassword && (
                    <button onClick={() => navigator.clipboard.writeText(credData.temporaryPassword)} className="rounded-full border px-3 py-2 text-sm">Copy password</button>
                  )}
                </div>
                <div className="text-xs text-slate-500">Note: sharing temporary passwords is sensitive — prefer sending via email. If emails are not arriving, check SMTP settings and server logs.</div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No credential data available.</div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
