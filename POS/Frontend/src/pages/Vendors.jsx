import { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const toast = useToast();

  const fetchVendors = useCallback(async () => {
    try {
      const res = await api.get('/vendors', { params: { status: statusFilter } });
      setVendors(res || []);
    } catch (err) {
      console.error('Failed to load vendors', err);
      toast.push('Failed to load vendors', 'error');
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

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Vendors</h1>
        <p className="text-sm text-slate-500">Review vendor applications and manage vendor status from this dashboard.</p>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex rounded-md shadow-sm" role="group">
            {['pending', 'active', 'rejected'].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-2 border ${statusFilter === s ? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              >{s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Contact</th>
                <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                <th className="px-4 py-3 text-right text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{v.legal_name}</div>
                    <div className="text-xs text-gray-500">{v.website || ''}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    <div>{v.contact_person || ''}</div>
                    <div className="text-xs text-gray-400">{v.email} • {v.phone || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${v.status === 'active' ? 'bg-emerald-50 text-emerald-700' : v.status === 'rejected' ? 'bg-red-50 text-red-700' : 'bg-yellow-50 text-yellow-700'}`}>{v.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {v.status === 'pending' && (
                      <div className="inline-flex gap-2">
                        <button onClick={() => updateStatus(v.id, 'active')} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button>
                        <button onClick={() => updateStatus(v.id, 'rejected')} className="px-3 py-1 bg-red-50 text-red-700 rounded border">Reject</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {vendors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No vendors</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
