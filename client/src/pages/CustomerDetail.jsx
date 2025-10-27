import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const { push: toast } = useToast();
  const { formatCurrency } = useSettings();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);

  useEffect(() => {
    api.get(`/customers/${id}`)
      .then((c) => { setCustomer(c); setForm(c); })
      .catch(() => toast('Failed to load customer details', 'error'));

    api.get(`/customers/${id}/invoices`)
      .then(setInvoices)
      .catch(() => toast('Failed to load customer invoices', 'error'));
  }, [id, toast]);

  if (!customer) {
    return <div className="p-6">Loading customer...</div>;
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const save = async () => {
    try {
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        address: form.address || null,
        gst_number: form.gst_number || null,
        registration_number: form.registration_number || null,
        is_business: form.is_business ? 1 : 0,
      };
      const updated = await api.put(`/customers/${id}`, payload);
      setCustomer(updated);
      setForm(updated);
      setEditing(false);
      toast('Customer updated', 'info');
    } catch (err) {
      console.error(err);
      toast('Failed to update customer', 'error');
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-start gap-6">
        <div>
          <h1 className="text-3xl font-bold mb-2">{customer.name}</h1>
          <p className="text-gray-600 mb-2">{customer.email}</p>
          <p className="text-gray-600 mb-2">Phone: {customer.phone || '—'}</p>
          <p className="text-gray-600 mb-2">GST: {customer.gst_number || '—'}</p>
          <p className="text-gray-600 mb-2">Reg #: {customer.registration_number || '—'}</p>
          <p className="text-gray-600 mb-4">{customer.address || ''}</p>
          <div className="flex gap-3">
            <button onClick={() => setEditing((s) => !s)} className="px-3 py-2 bg-blue-600 text-white rounded">{editing ? 'Cancel' : 'Edit'}</button>
          </div>
        </div>
        {editing && form && (
          <div className="bg-white p-4 rounded shadow">
            <div className="grid grid-cols-1 gap-2">
              <input name="name" value={form.name} onChange={handleChange} className="border px-2 py-1" />
              <input name="email" value={form.email} onChange={handleChange} className="border px-2 py-1" />
              <input name="phone" value={form.phone || ''} onChange={handleChange} className="border px-2 py-1" />
              <input name="gst_number" value={form.gst_number || ''} onChange={handleChange} className="border px-2 py-1" placeholder="GST Number" />
              <input name="registration_number" value={form.registration_number || ''} onChange={handleChange} className="border px-2 py-1" placeholder="Registration No" />
              <textarea name="address" value={form.address || ''} onChange={handleChange} className="border px-2 py-1" rows={3} />
              <label className="flex items-center gap-2"><input type="checkbox" name="is_business" checked={!!form.is_business} onChange={handleChange} /> Business</label>
              <div className="text-right">
                <button onClick={save} className="px-3 py-2 bg-green-600 text-white rounded">Save</button>
              </div>
            </div>
          </div>
        )}
      </div>

      <h2 className="text-2xl font-semibold mt-6 mb-4">Purchase History</h2>
      <div className="bg-white shadow rounded-lg">
        <ul className="divide-y divide-gray-200">
          {invoices.length > 0 ? (
            invoices.map((invoice) => (
              <li key={invoice.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p className="font-semibold">Invoice #{invoice.id}</p>
                  <p className="text-sm text-gray-500">{new Date(invoice.created_at).toLocaleString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatCurrency(invoice.total)}</p>
                  <Link to={`/invoices/${invoice.id}/pdf`} target="_blank" className="text-blue-500 hover:underline text-sm">View PDF</Link>
                </div>
              </li>
            ))
          ) : (
            <li className="p-4 text-center text-gray-500">No invoices found for this customer.</li>
          )}
        </ul>
      </div>
    </div>
  );
}
