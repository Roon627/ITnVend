import { useCallback, useEffect, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

function PhotoGrid({ photos }) {
  if (!photos) return null;
  const list = typeof photos === 'string' ? photos.split(',').filter(Boolean) : photos;
  return (
    <div className="flex gap-2 flex-wrap">
      {list.map((p, i) => (
        <img key={i} src={p} alt={`photo-${i}`} className="h-20 w-20 object-cover rounded" />
      ))}
    </div>
  );
}

export default function OneTimeSellers() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/casual-items', { params: { status: filter } });
      setItems(res || []);
    } catch (err) {
      console.error('Failed to load casual items', err);
      toast.push('Failed to load casual items', 'error');
    } finally {
      setLoading(false);
    }
  }, [filter, toast]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function approve(id) {
    try {
      const res = await api.put(`/casual-items/${id}/approve`);
      toast.push(res?.message || 'Approved', 'success');
      fetchItems();
    } catch (err) {
      console.error('Approve failed', err);
      toast.push(err?.message || 'Failed to approve', 'error');
    }
  }

  async function reject(id) {
    try {
      await api.put(`/casual-items/${id}/reject`, { reason: 'Rejected by staff' });
      toast.push('Rejected', 'info');
      fetchItems();
    } catch (err) {
      console.error('Reject failed', err);
      toast.push(err?.message || 'Failed to reject', 'error');
    }
  }

  return (
    <div className="p-6">
      <header className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">One-time sellers</h1>
          <p className="text-sm text-gray-500">Review listings submitted by casual sellers</p>
        </div>
      </header>

      <div className="mb-4">
        <div className="inline-flex rounded-md shadow-sm" role="group">
          {['pending','approved','rejected'].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-2 border ${filter===s? 'bg-blue-600 text-white' : 'bg-white text-gray-700'}`}
              disabled={loading}
            >
              {s.charAt(0).toUpperCase()+s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded shadow-sm overflow-hidden">
        <table className="min-w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-semibold">Item</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Seller</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Price / Fees</th>
              <th className="px-4 py-3 text-left text-sm font-semibold">Photos</th>
              <th className="px-4 py-3 text-right text-sm font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">Loading…</td>
              </tr>
            )}
            {items.map((it) => (
              <tr key={it.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-semibold">{it.title}</div>
                  <div className="text-xs text-gray-500">{it.description}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{it.seller_name}</div>
                  <div className="text-xs text-gray-400">{it.seller_email} • {it.seller_phone || '—'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">MVR {it.asking_price || 0}</div>
                  <div className="text-xs text-gray-500">Listing fee: {it.listing_fee || 0} • Featured: {it.featured ? 'Yes' : 'No'}</div>
                </td>
                <td className="px-4 py-3">
                  <PhotoGrid photos={it.photos} />
                </td>
                <td className="px-4 py-3 text-right">
                  {it.status === 'pending' && (
                    <div className="inline-flex gap-2">
                      <button onClick={() => approve(it.id)} className="px-3 py-1 bg-green-600 text-white rounded">Approve</button>
                      <button onClick={() => reject(it.id)} className="px-3 py-1 bg-red-50 text-red-700 rounded border">Reject</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No items</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
