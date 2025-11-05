import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { useSettings } from '../components/SettingsContext';
import { FaBuilding, FaUsers, FaInbox, FaUserTie } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import StatCard from '../components/StatCard';
import TableToolbar from '../components/TableToolbar';
import CustomerTable from '../components/CustomerTable';
import CustomerDetailModal from '../components/CustomerDetailModal';

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

function CustomerModal({ open, form, onClose, onChange, onSave, saving }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <header className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">New customer</h2>
            <p className="text-sm text-gray-500">Create a customer record for invoices and quotes</p>
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">✕</button>
        </header>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave();
          }}
          className="p-6 grid gap-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Name <span className="text-red-500">*</span>
            <input name="name" value={form.name} onChange={(e) => onChange('name', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Email <span className="text-red-500">*</span>
            <input name="email" type="email" value={form.email} onChange={(e) => onChange('email', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Phone
            <input name="phone" value={form.phone} onChange={(e) => onChange('phone', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Street address
            <input name="address" value={form.address} onChange={(e) => onChange('address', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Tax / GST number
            <input name="gst_number" value={form.gst_number} onChange={(e) => onChange('gst_number', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Registration number
            <input name="registration_number" value={form.registration_number} onChange={(e) => onChange('registration_number', e.target.value)} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-600">
            <input type="checkbox" name="is_business" checked={form.is_business} onChange={(e) => onChange('is_business', e.target.checked)} className="h-4 w-4 text-blue-600" />
            Treat as business account (enables company-level reporting)
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button type="button" onClick={onClose} className="inline-flex items-center gap-2 px-4 py-2 border rounded-md">Cancel</button>
            <button type="submit" disabled={saving} className="ml-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700">
              {saving ? 'Saving...' : 'Save customer'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
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

  const handleEdit = (customer, event) => {
    event?.stopPropagation();
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const handleView = (customer, event) => {
    event?.stopPropagation();
    setSelectedCustomer(customer);
    setDetailOpen(true);
  };

  const handleCreateBill = (customer, event) => {
    event?.stopPropagation();
    navigate(`/invoices/create?customer_id=${customer.id}`);
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
    <div className="p-6 space-y-6 bg-gray-50 min-h-full">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500">
            Maintain a clean CRM across business clients and individual buyers. Track registration details and jump into profiles quickly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCustomerModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold shadow hover:bg-blue-700"
          >
            <FaUsers /> New Customer
          </button>
        </div>
      </header>

      {/* Top stats cards - unified overview */}
      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
      </section>

      <section className="mt-6 bg-white border rounded p-3">
        <nav className="flex gap-2">
          {custTabs.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setCustTab(t.key);
                // attach route so the tab is linkable and bookmarkable
                navigate(`/customers?tab=${t.key}`);
              }}
              className={`px-3 py-1 rounded ${custTab===t.key ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}>
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

      <section className="bg-white border border-gray-100 rounded-lg shadow-sm p-6">
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

      {/* Detail modal for viewing/editing an existing customer */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          isOpen={detailOpen}
          onClose={() => setDetailOpen(false)}
          onSave={(updated) => {
            // merge into current list
            setCustomers((prev) => prev.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)));
            setDetailOpen(false);
            toast.push('Customer updated', 'info');
            fetchSummary();
          }}
        />
      )}
    </div>
  );
}
