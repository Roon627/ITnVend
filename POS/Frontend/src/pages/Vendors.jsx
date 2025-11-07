import { useEffect, useMemo, useState, useCallback } from 'react';
import { FaBuilding, FaEnvelope, FaGlobe } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const STATUS_PILLS = [
  { id: 'pending', label: 'Pending', color: 'bg-amber-50 text-amber-700 border border-amber-100' },
  { id: 'active', label: 'Active', color: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
  { id: 'rejected', label: 'Rejected', color: 'bg-rose-50 text-rose-700 border border-rose-100' },
];

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

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
                  {vendor.status === 'pending' && (
                    <div className="mt-4 flex flex-wrap gap-2">
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
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
