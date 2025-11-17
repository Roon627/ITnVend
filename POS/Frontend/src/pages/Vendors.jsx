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
  const [billingModalOpen, setBillingModalOpen] = useState(false);
  const [billingVendor, setBillingVendor] = useState(null);
  const [billingInvoices, setBillingInvoices] = useState([]);
  const [billingForm, setBillingForm] = useState({ monthlyFee: '', billingStartDate: '' });
  const [billingLoading, setBillingLoading] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editVendor, setEditVendor] = useState(null);
  const [editSaving, setEditSaving] = useState(false);
  const [invoiceActionId, setInvoiceActionId] = useState(null);
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

  const closeBillingModal = () => {
    setBillingModalOpen(false);
    setBillingVendor(null);
    setBillingInvoices([]);
    setBillingForm({ monthlyFee: '', billingStartDate: '' });
  };

  function openEditModal(vendor) {
    setEditVendor({
      id: vendor.id,
      legal_name: vendor.legal_name || '',
      contact_person: vendor.contact_person || '',
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      website: vendor.website || '',
      capabilities: vendor.capabilities || '',
      notes: vendor.notes || '',
      tagline: vendor.tagline || '',
      public_description: vendor.public_description || '',
      monthly_fee: vendor.monthly_fee != null ? Number(vendor.monthly_fee).toFixed(2) : '',
      billing_start_date: vendor.billing_start_date ? vendor.billing_start_date.slice(0, 10) : '',
    });
    setEditModalOpen(true);
  }

  async function saveVendorDetails() {
    if (!editVendor) return;
    setEditSaving(true);
    try {
      const payload = {
        legal_name: editVendor.legal_name,
        contact_person: editVendor.contact_person,
        email: editVendor.email,
        phone: editVendor.phone,
        address: editVendor.address,
        website: editVendor.website,
        capabilities: editVendor.capabilities,
        notes: editVendor.notes,
        tagline: editVendor.tagline,
        public_description: editVendor.public_description,
        monthly_fee: editVendor.monthly_fee === '' ? null : Number(editVendor.monthly_fee),
        billing_start_date: editVendor.billing_start_date || null,
      };
      await api.put(`/vendors/${editVendor.id}`, payload);
      toast.push('Vendor updated', 'success');
      setEditModalOpen(false);
      setEditVendor(null);
      fetchVendors();
    } catch (err) {
      console.error('Failed to update vendor', err);
      toast.push(err?.data?.error || err?.message || 'Failed to update vendor', 'error');
    } finally {
      setEditSaving(false);
    }
  }




  async function loadBillingInvoices(vendorId) {
    if (!vendorId) return;
    setBillingLoading(true);
    try {
      const res = await api.get(`/vendors/${vendorId}/invoices`);
      setBillingInvoices((res && res.invoices) || (Array.isArray(res) ? res : []));
    } catch (err) {
      console.error('Failed to load billing invoices', err);
      toast.push(err?.data?.error || err?.message || 'Failed to load vendor invoices', 'error');
      setBillingInvoices([]);
    } finally {
      setBillingLoading(false);
    }
  }

  function openBillingModal(vendor) {
    if (!vendor) return;
    setBillingVendor(vendor);
    setBillingForm({
      monthlyFee: vendor?.monthly_fee != null ? String(Number(vendor.monthly_fee).toFixed(2)) : '',
      billingStartDate: vendor?.billing_start_date ? vendor.billing_start_date.slice(0, 10) : '',
    });
    setBillingInvoices([]);
    setBillingModalOpen(true);
    loadBillingInvoices(vendor.id);
  }

  async function saveBillingSettings() {
    if (!billingVendor) return;
    try {
      const payload = {
        monthly_fee: billingForm.monthlyFee === '' ? null : Number(billingForm.monthlyFee),
        billing_start_date: billingForm.billingStartDate || null,
      };
      await api.patch(`/vendors/${billingVendor.id}/billing`, payload);
      toast.push('Billing settings updated', 'success');
      setBillingVendor((prev) =>
        prev ? { ...prev, monthly_fee: payload.monthly_fee, billing_start_date: payload.billing_start_date } : prev
      );
      fetchVendors();
    } catch (err) {
      console.error('Failed to update billing', err);
      toast.push(err?.data?.error || err?.message || 'Failed to update billing settings', 'error');
    }
  }

  async function generateManualInvoice() {
    if (!billingVendor) return;
    try {
      await api.post(`/vendors/${billingVendor.id}/invoices/generate`, {});
      toast.push('Invoice generated', 'success');
      loadBillingInvoices(billingVendor.id);
    } catch (err) {
      console.error('Failed to generate invoice', err);
      toast.push(err?.data?.error || err?.message || 'Failed to generate invoice', 'error');
    }
  }

  async function markInvoicePaid(invoice) {
    if (!billingVendor || !invoice) return;
    try {
      setInvoiceActionId(invoice.id);
      await api.post(`/vendors/${billingVendor.id}/invoices/${invoice.id}/pay`, {});
      toast.push('Invoice marked as paid', 'success');
      loadBillingInvoices(billingVendor.id);
      fetchVendors();
    } catch (err) {
      console.error('Failed to mark invoice paid', err);
      toast.push(err?.data?.error || err?.message || 'Failed to mark invoice as paid', 'error');
    } finally {
      setInvoiceActionId(null);
    }
  }

  async function reactivateVendorFromModal() {
    if (!billingVendor) return;
    try {
      await api.post(`/vendors/${billingVendor.id}/reactivate`, {
        billing_start_date: billingForm.billingStartDate || null,
      });
      toast.push('Vendor reactivated', 'success');
      fetchVendors();
    } catch (err) {
      console.error('Failed to reactivate vendor', err);
      toast.push(err?.data?.error || err?.message || 'Failed to reactivate vendor', 'error');
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
                          <button type="button" onClick={() => openEditModal(vendor)} className="rounded-full border px-4 py-2 text-sm font-semibold">Edit details</button>
                          <button type="button" onClick={() => openBillingModal(vendor)} className="rounded-full border px-4 py-2 text-sm font-semibold">Billing</button>
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

      <Modal open={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Edit vendor — {editVendor?.legal_name || ''}</h3>
            <button onClick={() => setEditModalOpen(false)} className="text-sm text-slate-500">Close</button>
          </div>
          <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); saveVendorDetails(); }}>
            <label className="text-sm font-medium text-slate-600">
              Legal name
              <input value={editVendor?.legal_name || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, legal_name: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" required />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Contact person
              <input value={editVendor?.contact_person || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, contact_person: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Email
              <input type="email" value={editVendor?.email || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, email: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Phone
              <input value={editVendor?.phone || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, phone: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Address
              <input value={editVendor?.address || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, address: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Website
              <input value={editVendor?.website || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, website: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Monthly fee (MVR)
              <input type="number" step="0.01" value={editVendor?.monthly_fee || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, monthly_fee: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Billing start date
              <input type="date" value={editVendor?.billing_start_date || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, billing_start_date: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Capabilities / scope
              <textarea value={editVendor?.capabilities || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, capabilities: e.target.value }))} rows="2" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Notes (internal)
              <textarea value={editVendor?.notes || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, notes: e.target.value }))} rows="2" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Tagline
              <input value={editVendor?.tagline || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, tagline: e.target.value }))} className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-600 md:col-span-2">
              Public description
              <textarea value={editVendor?.public_description || ''} onChange={(e) => setEditVendor((prev) => ({ ...prev, public_description: e.target.value }))} rows="3" className="mt-1 w-full rounded border border-slate-200 px-3 py-2" />
            </label>
            <div className="md:col-span-2 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setEditModalOpen(false)} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">Cancel</button>
              <button type="submit" disabled={editSaving} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-50">{editSaving ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </div>
      </Modal>

      <Modal open={billingModalOpen} onClose={closeBillingModal}>
        <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Billing controls — {billingVendor?.legal_name || ''}</h3>
            <button onClick={closeBillingModal} className="text-sm text-slate-500">Close</button>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium text-slate-600">
              Monthly fee (MVR)
              <input
                type="number"
                min="0"
                step="0.01"
                value={billingForm.monthlyFee}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, monthlyFee: e.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
            <label className="text-sm font-medium text-slate-600">
              Billing start date
              <input
                type="date"
                value={billingForm.billingStartDate}
                onChange={(e) => setBillingForm((prev) => ({ ...prev, billingStartDate: e.target.value }))}
                className="mt-1 w-full rounded border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" onClick={saveBillingSettings} className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600">Save billing settings</button>
            <button type="button" onClick={generateManualInvoice} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-600">Generate invoice</button>
            <button type="button" onClick={reactivateVendorFromModal} className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-600">Reactivate account</button>
          </div>
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-600">Recent invoices</h4>
              {billingLoading && <span className="text-xs text-slate-400">Loading…</span>}
            </div>
            {billingInvoices.length === 0 && !billingLoading ? (
              <p className="mt-3 text-sm text-slate-500">No invoices on file.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-2">Invoice #</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Status</th>
                      <th className="px-2 py-2">Due</th>
                      <th className="px-2 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t text-slate-600">
                        <td className="px-2 py-2">{inv.invoice_number || inv.id}</td>
                        <td className="px-2 py-2">MVR {Number(inv.fee_amount || 0).toFixed(2)}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${inv.status === 'paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                            {inv.status || 'unpaid'}
                          </span>
                        </td>
                        <td className="px-2 py-2">{inv.due_date ? new Date(inv.due_date).toLocaleDateString() : '—'}</td>
                        <td className="px-2 py-2">
                          {inv.status === 'paid' ? (
                            <span className="text-xs text-slate-400">Settled</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => markInvoicePaid(inv)}
                              disabled={invoiceActionId === inv.id}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {invoiceActionId === inv.id ? 'Marking…' : 'Mark paid'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
