import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useSettings } from '../components/SettingsContext';
import { FaBuilding, FaUsers, FaInbox, FaUserTie } from 'react-icons/fa';
import api from '../lib/api';
import Modal from '../components/Modal';
import { useToast } from '../components/ToastContext';
import { resolveMediaUrl } from '../lib/media';
import StatCard from '../components/StatCard';
import TableToolbar from '../components/TableToolbar';
import CustomerTable from '../components/CustomerTable';
// CustomerDetailModal is not used here any more; we'll reuse the inline CustomerModal for view/edit

const initialForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  gst_number: '',
  registration_number: '',
  is_business: false,
};

function ActionCard({ title, desc, to, requiredRole }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const allowed = !requiredRole || (user && (['admin','manager','accounts','cashier'].includes(user.role) && (function(){
    // role hierarchy: cashier < accounts < manager < admin
    const rank = { cashier:1, accounts:2, manager:3, admin:4 };
    return rank[user.role] >= (rank[requiredRole] || 0);
  })()));

  return (
    <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-col justify-between">
      <div>
        <div className="text-lg font-semibold">{title}</div>
        <div className="text-sm text-gray-500 mt-2">{desc}</div>
      </div>
      <div className="mt-4 flex items-center justify-end">
        <button onClick={() => navigate(to)} disabled={!allowed} className={`px-4 py-2 rounded ${allowed ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
          Open
        </button>
      </div>
    </div>
  );
}

function CustomerModal({ open, form, onClose, onChange, onSave, saving, mode = 'create' }) {
  // Use the shared portal Modal to avoid stacking-context issues and ensure the overlay covers the whole viewport
  const readOnly = mode === 'view';
  const title = mode === 'create' ? 'New customer' : mode === 'view' ? 'Customer details' : 'Edit customer';
  const subtitle = mode === 'create'
    ? 'Create a customer record for invoices and quotes'
    : mode === 'view'
      ? 'Read-only details pulled from the server' : 'Update customer details';

  // uploads: local preview state, sync to parent form via onChange when changed
  const [logoName, setLogoName] = useState(null);
  const [docNames, setDocNames] = useState([]);

  useEffect(() => {
    // initialize previews from form values if present
    if (form && form.logo_data) setLogoName((form.logo_name) || 'logo');
    else if (form && form.logo_url) {
      // derive a friendly name from the URL
      try {
        const parts = (form.logo_url || '').split('/');
          setLogoName(parts[parts.length - 1] || 'logo');
        } catch { setLogoName('logo'); }
    }
    if (form && form.documents) {
      try {
      // form.documents may be an array or JSON string
      const docs = Array.isArray(form.documents) ? form.documents : JSON.parse(form.documents || '[]');
      setDocNames(docs.map(d => d.name || d));
    } catch {
      setDocNames([]);
    }
    }
  }, [form]);

  const handleLogo = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    // Prefer multipart upload to /api/uploads; fallback to base64 if upload fails
    (async () => {
      try {
        const fd = new FormData();
        fd.append('file', f);
  const resp = await api.upload('/uploads', fd);
  const path = resp?.path || resp?.url || (resp?.data && (resp.data.path || resp.data.url));
        // prefer path (server returns { path, url })
        const publicPath = path || (resp?.data?.path) || (resp?.data?.url) || null;
        if (publicPath) {
          setLogoName(f.name);
          onChange('logo_url', publicPath);
          onChange('logo_name', f.name);
          return;
        }
      } catch {
        // ignore and fallback to base64
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result;
        setLogoName(f.name);
        onChange('logo_data', data);
        onChange('logo_name', f.name);
      };
      reader.readAsDataURL(f);
    })();
  };

  const handleDocs = (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    // Try multipart upload for each file, fall back to base64 if upload fails
    (async () => {
      const uploaded = [];
      const base64s = [];
      for (const f of list) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          const resp = await api.upload('/uploads', fd);
          const path = resp?.path || resp?.url || (resp?.data && (resp.data.path || resp.data.url));
          if (path) {
            uploaded.push({ name: f.name, path });
            continue;
          }
        } catch {
          // fall through to base64 fallback
        }
        // fallback to base64
        const asBase64 = await new Promise((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve(r.result);
          r.readAsDataURL(f);
        });
        base64s.push({ name: f.name, data: asBase64 });
      }

      const prev = Array.isArray(form.documents) ? form.documents : (form.documents ? JSON.parse(form.documents || '[]') : []);
      const merged = [...(prev || []), ...uploaded, ...base64s];
      onChange('documents', merged);
      setDocNames(merged.map(d => d.name || d));
    })();
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="customer-modal-title">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 id="customer-modal-title" className="text-lg font-semibold text-gray-800">{title}</h2>
            <p className="text-sm text-gray-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">✕</button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!readOnly) onSave();
          }}
          className="p-6 grid gap-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Name {mode !== 'view' && <span className="text-red-500">*</span>}
            <input name="name" value={form.name} onChange={(e) => onChange('name', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} required={!readOnly} readOnly={readOnly} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Email {mode !== 'view' && <span className="text-red-500">*</span>}
            <input name="email" type="email" value={form.email} onChange={(e) => onChange('email', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} required={!readOnly} readOnly={readOnly} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Phone
            <input name="phone" value={form.phone} onChange={(e) => onChange('phone', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} readOnly={readOnly} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Street address
            <input name="address" value={form.address} onChange={(e) => onChange('address', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} readOnly={readOnly} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Tax / GST number
            <input name="gst_number" value={form.gst_number} onChange={(e) => onChange('gst_number', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} readOnly={readOnly} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Registration number
            <input name="registration_number" value={form.registration_number} onChange={(e) => onChange('registration_number', e.target.value)} className={`border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 ${readOnly ? 'bg-gray-50' : ''}`} readOnly={readOnly} />
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-600">
            <input type="checkbox" name="is_business" checked={Boolean(form.is_business)} onChange={(e) => onChange('is_business', e.target.checked)} className="h-4 w-4 text-blue-600" disabled={readOnly} />
            Treat as business account (enables company-level reporting)
          </label>

          {Boolean(form.is_business) && (
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-gray-600">Business uploads</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/10 px-4 py-6 text-center text-sm text-gray-600 cursor-pointer">
                  Company logo (optional)
                  <input type="file" accept="image/*" onChange={handleLogo} className="hidden" disabled={readOnly} />
                  <div className="mt-2 text-xs text-muted-foreground">{logoName || 'No logo selected'}</div>
                </label>
                <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/10 px-4 py-6 text-center text-sm text-gray-600 cursor-pointer">
                  Supporting documents
                  <input type="file" multiple onChange={handleDocs} className="hidden" disabled={readOnly} />
                  <div className="mt-2 text-xs text-muted-foreground">{docNames.length ? docNames.join(', ') : 'No documents'}</div>
                </label>
              </div>
            </div>
          )}
          {/* Attachments viewer / preview for existing uploaded files */}
          {Boolean((form.attachments && form.attachments.length) || form.logo_url) && (
            <div className="md:col-span-2">
              <p className="text-sm font-semibold text-gray-600">Attachments</p>
              <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-4">
                {/* Logo preview */}
                {form.logo_url && (
                  <div className="flex flex-col items-center text-sm">
                    <img alt="logo" src={resolveMediaUrl(form.logo_url)} className="h-20 w-20 object-contain rounded-md border" />
                    <div className="mt-2 text-xs text-gray-600">Logo</div>
                  </div>
                )}
                {/* Other attachments */}
                {(Array.isArray(form.attachments) ? form.attachments : (form.attachments ? JSON.parse(form.attachments||'[]') : [])).map((a, idx) => (
                  <div key={a.path || idx} className="flex flex-col items-center text-sm">
                    {String(a.path || '').toLowerCase().match(/\.(png|jpe?g|gif|webp)$/) ? (
                      <img alt={a.name || 'file'} src={resolveMediaUrl(a.path)} className="h-20 w-20 object-cover rounded-md border" />
                    ) : (
                      <div className="h-20 w-20 flex items-center justify-center rounded-md border bg-gray-50 text-xs text-gray-600">{a.name || 'file'}</div>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                      <a className="text-xs text-blue-600" href={resolveMediaUrl(a.path)} target="_blank" rel="noreferrer">Open</a>
                      {mode !== 'view' && (
                        <button type="button" onClick={() => {
                          // mark for removal by adding to remove_attachments on parent form
                          const prev = Array.isArray(form.remove_attachments) ? form.remove_attachments.slice() : [];
                          if (!prev.includes(a.path)) prev.push(a.path);
                          onChange('remove_attachments', prev);
                          // also remove from attachments list in the form so UI updates
                          const existing = Array.isArray(form.attachments) ? form.attachments.slice() : (form.attachments ? JSON.parse(form.attachments||'[]') : []);
                          const remaining = existing.filter((x) => x.path !== a.path);
                          onChange('attachments', remaining);
                        }} className="text-xs text-red-600">Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="md:col-span-2 flex justify-end">
            <button type="button" onClick={onClose} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md">{readOnly ? 'Close' : 'Cancel'}</button>
            {!readOnly && (
              <button type="submit" disabled={saving} className="ml-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700">
                {saving ? 'Saving...' : mode === 'create' ? 'Save customer' : 'Save changes'}
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    vendors: 0,
    sellers: 0,
    pending: 0,
    business: 0,
    individuals: 0,
    outstandingCustomers: 0,
    outstandingTotal: 0,
  });
  const [custTab, setCustTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [form, setForm] = useState(initialForm);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  // detail modal state (shared for view + edit)
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailForm, setDetailForm] = useState(initialForm);
  const [detailMode, setDetailMode] = useState('view');
  const [detailSaving, setDetailSaving] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { formatCurrency } = useSettings();
  const [submissionCounts, setSubmissionCounts] = useState({ pendingVendors: 0, pendingCasual: 0 });

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 300);
    return () => clearTimeout(handle);
  }, [searchTerm]);

  const fetchSummary = useCallback(async () => {
    setLoadingSummary(true);
    try {
      const data = await api.get('/customers/summary');
      if (data) {
        setStats({
          total: data.totalCustomers || 0,
          vendors: data.activeVendors || 0,
          sellers: data.oneTimeSellers || 0,
          pending: data.pendingSubmissions || 0,
          business: data.businessCustomers || 0,
          individuals: data.individualCustomers || 0,
          outstandingCustomers: data.customersWithOutstanding || 0,
          outstandingTotal: data.totalOutstandingBalance || 0,
        });
        setSubmissionCounts({
          pendingVendors: data.pendingVendors || 0,
          pendingCasual: data.pendingCasualItems || 0,
        });
      }
    } catch (err) {
      console.error('Failed to load customer summary', err);
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    setLoadingCustomers(true);
    setError(null);
    try {
      let rows = [];

      if (custTab === 'vendors') {
        const vendors = await api.get('/vendors', { params: { status: 'active' } });
        rows = (vendors || []).map((v) => ({
          id: `vendor-${v.id}`,
          name: v.legal_name || v.contact_person || `Vendor ${v.id}`,
          email: v.email || null,
          phone: v.phone || null,
          address: v.address || null,
          is_business: 1,
          customer_type: 'vendor',
          vendor_id: v.id,
          status: v.status,
          total_invoices: 0,
          total_spent: 0,
          outstanding_balance: 0,
          last_activity: null,
          raw: v,
        }));
      } else if (custTab === 'vendor-requests') {
        const pending = await api.get('/vendors', { params: { status: 'pending' } });
        rows = (pending || []).map((v) => ({
          id: `vendor-${v.id}`,
          name: v.legal_name || v.contact_person || `Vendor ${v.id}`,
          email: v.email || null,
          phone: v.phone || null,
          address: v.address || null,
          is_business: 1,
          customer_type: 'vendor',
          vendor_id: v.id,
          status: v.status,
          total_invoices: 0,
          total_spent: 0,
          outstanding_balance: 0,
          last_activity: null,
          raw: v,
        }));
      } else if (custTab === 'one-time-requests') {
        const casual = await api.get('/casual-items', { params: { status: 'pending' } });
        rows = (casual || []).map((c) => ({
          id: `casual-${c.id}`,
          name: c.title,
          email: c.seller_email || null,
          phone: c.seller_phone || null,
          address: null,
          is_business: 0,
          customer_type: 'one-time-seller',
          casual_item_id: c.id,
          status: c.status,
          total_invoices: 0,
          total_spent: 0,
          outstanding_balance: 0,
          last_activity: null,
          raw: c,
        }));
      } else {
        const params = { includeMetrics: true };
        if (custTab === 'one-time-seller') params.type = 'one-time-seller';
        if (segmentFilter !== 'all') params.segment = segmentFilter;
        if (debouncedSearch) params.search = debouncedSearch;

        const res = await api.get('/customers', { params });
        rows = Array.isArray(res) ? res : [];

        if (custTab === 'all') {
          try {
            const vendorRows = await api.get('/vendors', { params: { status: 'active' } });
            const emails = new Set(rows.map((c) => (c.email || '').toString().toLowerCase()));
            const names = new Set(rows.map((c) => (c.name || '').toString().toLowerCase()));
            for (const v of vendorRows || []) {
              const vEmail = (v.email || '').toString().toLowerCase();
              const vName = (v.legal_name || v.contact_person || '').toString().toLowerCase();
              if ((vEmail && emails.has(vEmail)) || (vName && names.has(vName))) continue;
              rows.push({
                id: `vendor-${v.id}`,
                name: v.legal_name || v.contact_person || `Vendor ${v.id}`,
                email: v.email || null,
                phone: v.phone || null,
                address: v.address || null,
                is_business: 1,
                customer_type: 'vendor',
                vendor_id: v.id,
                total_invoices: 0,
                total_spent: 0,
                outstanding_balance: 0,
                last_activity: null,
                _synthetic: true,
              });
            }
          } catch (mergeErr) {
            console.debug('Could not merge vendor rows into customers list', mergeErr?.message || mergeErr);
          }
        }
      }

      setCustomers(rows);
    } catch (err) {
      console.error('Failed to load customers', err);
      setError(err?.message || 'Failed to load customers');
      toast.push('Failed to load customers', 'error');
    } finally {
      setLoadingCustomers(false);
    }
  }, [custTab, debouncedSearch, segmentFilter, toast]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // pick tab from URL query param if present (e.g. /customers?tab=vendors)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const urlTab = params.get('tab');
    if (urlTab && ['all', 'vendors', 'one-time-seller', 'vendor-requests', 'one-time-requests', 'pending'].includes(urlTab)) {
      setCustTab(urlTab);
    }
  }, [location.search]);

  useEffect(() => {
    if (!['all', 'one-time-seller'].includes(custTab) && segmentFilter !== 'all') {
      setSegmentFilter('all');
    }
  }, [custTab, segmentFilter]);

  const metrics = useMemo(() => ({
    total: stats.total || 0,
    business: stats.business || 0,
    individuals: stats.individuals || 0,
    withOutstanding: stats.outstandingCustomers || 0,
  }), [stats]);

  const emptyMessage = useMemo(() => {
    switch (custTab) {
      case 'vendors':
        return 'No active vendors found.';
      case 'vendor-requests':
        return 'No vendor submissions pending review.';
      case 'one-time-seller':
        return 'No one-time sellers found.';
      case 'one-time-requests':
        return 'No one-time seller submissions pending review.';
      default:
        return 'No customers match your filters right now.';
    }
  }, [custTab]);

  const filteredCustomers = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    return customers
      .filter((c) => {
        if (segmentFilter === 'business' && !c.is_business) return false;
        if (segmentFilter === 'individual' && c.is_business) return false;
        if (!term) return true;
        return (
          (c.name && c.name.toLowerCase().includes(term)) ||
          (c.email && c.email.toLowerCase().includes(term)) ||
          (c.phone && c.phone.toLowerCase().includes(term)) ||
          (c.gst_number && c.gst_number.toLowerCase().includes(term)) ||
          (c.registration_number && c.registration_number.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [customers, debouncedSearch, segmentFilter]);

  const openDetailModal = useCallback(async (customer, mode = 'view') => {
    // mode: 'view' | 'edit'
    if (!customer || !customer.id) {
      toast.push('Invalid customer selected', 'error');
      return;
    }
    setDetailMode(mode);
    setDetailModalOpen(true);
    setDetailSaving(false);
    try {
      let data;
      // support vendor rows which are represented as id: `vendor-<id>` in the list
      if (typeof customer.id === 'string' && customer.id.startsWith('vendor-')) {
        const vid = Number(customer.id.split('-')[1]);
        data = await api.get(`/vendors/${vid}`);
        const v = data || customer.raw || {};
        setDetailForm({
          id: `vendor-${v.id}`,
          name: v.legal_name || v.contact_person || `Vendor ${v.id}`,
          email: v.email || '',
          phone: v.phone || '',
          address: v.address || '',
          gst_number: v.gst_number || v.tax_number || '',
          registration_number: v.registration_number || v.reg_number || '',
          is_business: true,
          // include logo and attachments if present
          logo_url: v.logo_url || null,
          attachments: v.attachments || (v.attachments ? (typeof v.attachments === 'string' ? JSON.parse(v.attachments || '[]') : v.attachments) : []),
        });
      } else {
        data = await api.get(`/customers/${customer.id}`);
        const normalized = data || {};
        setDetailForm({
          id: normalized.id,
          name: normalized.name || '',
          email: normalized.email || '',
          phone: normalized.phone || '',
          address: normalized.address || '',
          gst_number: normalized.gst_number || normalized.tax_number || '',
          registration_number: normalized.registration_number || normalized.reg_number || '',
          is_business: Boolean(normalized.is_business || normalized.isBusiness || normalized.company),
          // include logo and attachments if present so view modal can show them
          logo_url: normalized.logo_url || null,
          attachments: normalized.attachments || (normalized.attachments ? (typeof normalized.attachments === 'string' ? JSON.parse(normalized.attachments || '[]') : normalized.attachments) : []),
        });
      }
    } catch (err) {
      console.error('Failed to load customer', err);
      toast.push('Failed to load customer details', 'error');
      setDetailModalOpen(false);
    }
  }, [toast]);

  const handleEdit = (customer, event) => {
    event?.stopPropagation();
    void openDetailModal(customer, 'edit');
  };

  const handleView = (customer, event) => {
    event?.stopPropagation();
    void openDetailModal(customer, 'view');
  };

  const handleCreateBill = (customer, event) => {
    event?.stopPropagation();
    navigate(`/pos?customer_id=${customer.id}`);
  };

  // Approve / reject handlers for vendor and casual item requests
  const handleApprove = async (id) => {
    try {
      if (custTab === 'vendor-requests') {
        await api.put(`/vendors/${id}/status`, { status: 'active' });
        toast.push('Vendor approved', 'success');
      } else if (custTab === 'one-time-requests') {
        await api.put(`/casual-items/${id}/approve`);
        toast.push('One-time item approved and published', 'success');
      }
      await fetchCustomers();
      await fetchSummary();
    } catch (err) {
      console.error('Approve failed', err);
      toast.push(err?.response?.data?.error || 'Failed to approve', 'error');
    }
  };

  const handleReject = async (id) => {
    try {
      if (custTab === 'vendor-requests') {
        await api.put(`/vendors/${id}/status`, { status: 'rejected' });
        toast.push('Vendor rejected', 'info');
      } else if (custTab === 'one-time-requests') {
        await api.put(`/casual-items/${id}/reject`, { reason: 'Rejected by staff' });
        toast.push('One-time item rejected', 'info');
      }
      await fetchCustomers();
      await fetchSummary();
    } catch (err) {
      console.error('Reject failed', err);
      toast.push(err?.response?.data?.error || 'Failed to reject', 'error');
    }
  };

  const handleDetailSave = useCallback(async () => {
    if (!detailForm || !detailForm.id) return;
    // basic validation
    if (!detailForm.name || !detailForm.email) {
      toast.push('Name and email are required.', 'error');
      return;
    }
    setDetailSaving(true);
    try {
      // If this is a synthetic vendor row (id like 'vendor-<id>'), call vendor-specific endpoints
      if (typeof detailForm.id === 'string' && detailForm.id.startsWith('vendor-')) {
        const vid = Number(detailForm.id.split('-')[1]);
        // If we have a logo change, use the admin vendor logo endpoint which accepts a logo_url
        if (detailForm.logo_url) {
          await api.patch(`/vendors/${vid}/logo`, { logo_url: detailForm.logo_url });
          toast.push('Vendor logo updated', 'success');
        } else {
          // No vendor-specific update endpoint for other fields in this UI; fall back to a best-effort customers update
          // Attempt to find the linked customer_id (if present) and update that customer instead
          try {
            // If the vendor object was loaded into detailForm.attachments/raw, try to extract customer_id
            const maybeVendor = detailForm.raw || {};
            const linkedCustomerId = maybeVendor.customer_id || maybeVendor.customerId || null;
            if (linkedCustomerId) {
              const payload = {
                name: detailForm.name,
                email: detailForm.email,
                phone: detailForm.phone || null,
                address: detailForm.address || null,
                gst_number: detailForm.gst_number || null,
                registration_number: detailForm.registration_number || null,
                is_business: detailForm.is_business ? 1 : 0,
              };
              if (detailForm.logo_data) payload.logo_data = detailForm.logo_data;
              if (detailForm.documents) payload.documents = detailForm.documents;
              if (detailForm.attachments) payload.attachments = detailForm.attachments;
              if (detailForm.remove_attachments) payload.remove_attachments = detailForm.remove_attachments;
              await api.put(`/customers/${linkedCustomerId}`, payload);
              toast.push('Vendor customer record updated', 'success');
            } else {
              // As a last resort, surface a helpful error instead of sending an invalid id to customers endpoint
              throw new Error('Vendor updates (other than logo) must be performed via the vendor admin flow');
            }
          } catch (innerErr) {
            console.error('Failed to update vendor-linked customer', innerErr);
            throw innerErr;
          }
        }

        setDetailModalOpen(false);
        // refresh list and summary
        await fetchCustomers();
        await fetchSummary();
        return;
      }

      // Regular customer update
      const payload = {
        name: detailForm.name,
        email: detailForm.email,
        phone: detailForm.phone || null,
        address: detailForm.address || null,
        gst_number: detailForm.gst_number || null,
        registration_number: detailForm.registration_number || null,
        is_business: detailForm.is_business ? 1 : 0,
      };
      // include uploads/attachment changes if present
      if (detailForm.logo_data) payload.logo_data = detailForm.logo_data;
      if (detailForm.documents) payload.documents = detailForm.documents;
      if (detailForm.logo_url) payload.logo_url = detailForm.logo_url;
      if (detailForm.attachments) payload.attachments = detailForm.attachments;
      if (detailForm.remove_attachments) payload.remove_attachments = detailForm.remove_attachments;
      await api.put(`/customers/${detailForm.id}`, payload);
      toast.push('Customer updated', 'success');
      setDetailModalOpen(false);
      // refresh list and summary
      await fetchCustomers();
      await fetchSummary();
    } catch (err) {
      console.error('Failed to save customer', err);
      toast.push(err?.response?.data?.error || err?.message || 'Failed to update customer', 'error');
    } finally {
      setDetailSaving(false);
    }
  }, [detailForm, fetchCustomers, fetchSummary, toast]);

  const segmentChips = [
    { value: 'all', label: 'All', count: metrics.total },
    { value: 'business', label: 'Business', count: metrics.business },
    { value: 'individual', label: 'Individuals', count: metrics.individuals },
  ];

  const custTabs = [
    { key: 'all', label: 'All Customers' },
    { key: 'vendors', label: 'Vendors (Active)' },
    { key: 'one-time-seller', label: 'One-time Sellers (Active)' },
    { key: 'vendor-requests', label: 'Vendor Requests' },
    { key: 'one-time-requests', label: 'One-Time Requests' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 p-6 pb-24 space-y-8">
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-sm shadow-blue-100/50 backdrop-blur">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-blue-600">
              Customer hub
            </span>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Customers</h1>
              <p className="text-sm text-slate-500">
                Maintain a clean CRM across business clients and individual buyers. Track registration details and jump into profiles quickly.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCustomerModalOpen(true)}
              className="btn-primary inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-semibold"
            >
              <FaUsers /> New customer
            </button>
          </div>
        </header>
      </section>

      {/* Top stats cards - unified overview */}
      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm shadow-blue-100/40 backdrop-blur">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <StatCard icon={<FaUsers />} title="Total Customers" value={stats.total} link="/customers" bgColor="bg-indigo-50" textColor="text-indigo-800" />
        <StatCard icon={<FaBuilding />} title="Vendors" value={stats.vendors} link="/customers?tab=vendors" bgColor="bg-green-50" textColor="text-green-800" />
        <StatCard icon={<FaUserTie />} title="One-Time Sellers" value={stats.sellers} link="/customers?tab=one-time-seller" bgColor="bg-yellow-50" textColor="text-yellow-800" />
        <StatCard
          icon={<FaInbox />}
          title="Pending Submissions"
          value={`${stats.pending} (${submissionCounts.pendingVendors} vendor / ${submissionCounts.pendingCasual} casual)`}
          link="/submissions"
          bgColor="bg-pink-50"
          textColor="text-pink-800"
        />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm shadow-blue-100/40 backdrop-blur">
        <nav className="flex flex-wrap gap-2">
          {custTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setCustTab(t.key);
                // attach route so the tab is linkable and bookmarkable
                navigate(`/customers?tab=${t.key}`);
              }}
              className={`group relative inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all ${
                custTab===t.key
                  ? 'bg-blue-600 text-white shadow shadow-blue-300/60'
                  : 'bg-white/70 text-slate-500 hover:bg-blue-50 hover:text-blue-600'
              }`}>
              {t.label}
            </button>
          ))}
        </nav>
      </section>

      {/* legacy metrics area is replaced by the StatCard grid above */}

  {/* Customer creation moved to modal to keep the page clean */}
      {customerModalOpen && (
        <CustomerModal
          open={customerModalOpen}
          form={form}
          onClose={() => { setCustomerModalOpen(false); setForm(initialForm); }}
          onChange={(name, value) => setForm((prev) => ({ ...prev, [name]: value }))}
          onSave={async () => {
            // reuse handleAdd logic but without an event
            if (!form.name || !form.email) {
              toast.push('Name and email are required.', 'error');
              return;
            }
            try {
              setCustomerSaving(true);
              await api.post('/customers', form);
              toast.push('Customer added', 'info');
              setForm(initialForm);
              setCustomerModalOpen(false);
              await fetchCustomers();
              await fetchSummary();
            } catch (err) {
              toast.push(err?.response?.data?.error || 'Failed to add customer', 'error');
            } finally {
              setCustomerSaving(false);
            }
          }}
          saving={customerSaving}
        />
      )}

      <section className="rounded-2xl border border-slate-200/70 bg-white/90 p-6 shadow-md shadow-blue-100/50 backdrop-blur">
        <TableToolbar
          onSearch={(v) => setSearchTerm(v)}
          onAddCustomer={() => setCustomerModalOpen(true)}
          searchTerm={searchTerm}
          loading={loadingCustomers || loadingSummary}
        />

        {error && (
          <div className="mt-3 rounded-md border border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        {['all', 'one-time-seller'].includes(custTab) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {segmentChips.map((chip) => {
              const active = segmentFilter === chip.value;
              return (
                <button
                  key={chip.value}
                  type="button"
                  onClick={() => setSegmentFilter(chip.value)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700 shadow-sm'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                  }`}
                >
                  <span>{chip.label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${active ? 'bg-white text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                    {chip.count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-4">
          <CustomerTable
            customers={filteredCustomers}
            onEdit={(c) => handleEdit(c)}
            onView={(c) => handleView(c)}
            onCreateBill={(c) => handleCreateBill(c)}
            tab={custTab}
            onApprove={handleApprove}
            onReject={handleReject}
            loading={loadingCustomers}
            emptyMessage={emptyMessage}
            formatCurrency={formatCurrency}
          />
        </div>
      </section>

      {/* Shared detail modal used for both view and edit modes */}
      {detailModalOpen && (
        <CustomerModal
          open={detailModalOpen}
          form={detailForm}
          mode={detailMode}
          onClose={() => setDetailModalOpen(false)}
          onChange={(name, value) => setDetailForm((p) => ({ ...p, [name]: value }))}
          onSave={handleDetailSave}
          saving={detailSaving}
        />
      )}
    </div>
  );
}
