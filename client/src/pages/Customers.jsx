import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useNavigate } from 'react-router-dom';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', gst_number: '', registration_number: '', is_business: false });
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res);
    } catch (err) {
      toast.push('Failed to load customers', 'error');
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };
  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/customers', form);
      setForm({ name: '', email: '', phone: '', address: '', gst_number: '', registration_number: '', is_business: false });
      fetchCustomers();
      toast.push('Customer added', 'info');
    } catch (err) {
      toast.push('Failed to add customer', 'error');
    }
  };
  const handleDelete = async (id, e) => { e?.stopPropagation(); if (!confirm('Delete this customer?')) return; try { await api.del(`/customers/${id}`); fetchCustomers(); toast.push('Customer deleted', 'info'); } catch (err) { toast.push('Failed to delete customer', 'error'); } };
  const handleRowClick = (id) => {
    navigate(`/customers/${id}`);
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.phone || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.gst_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Customers</h2>
      <div className="bg-white p-4 rounded-md shadow mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="p-2 border rounded" />
          <input name="email" value={form.email} onChange={handleChange} placeholder="Email" className="p-2 border rounded" />
          <input name="phone" value={form.phone} onChange={handleChange} placeholder="Phone" className="p-2 border rounded" />
          <input name="gst_number" value={form.gst_number} onChange={handleChange} placeholder="GST Number" className="p-2 border rounded" />
          <input name="registration_number" value={form.registration_number} onChange={handleChange} placeholder="Registration No" className="p-2 border rounded" />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_business" checked={form.is_business} onChange={handleChange} /> <span>Business</span>
          </label>
          <textarea name="address" value={form.address} onChange={handleChange} placeholder="Address" className="p-2 border rounded col-span-1 sm:col-span-3" />
          <div />
          <button className="bg-blue-600 text-white px-4 py-2 rounded">Add Customer</button>
        </form>
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search customers..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full p-2 border rounded"
        />
      </div>
      <div className="bg-white p-4 rounded-md shadow">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left"><th className="p-2">Name</th><th className="p-2">Email</th><th className="p-2">Actions</th></tr>
          </thead>
          <tbody>
            {filteredCustomers.map(c => (
              <tr key={c.id} onClick={() => handleRowClick(c.id)} className="cursor-pointer hover:bg-gray-100">
                <td className="p-2 border-t">{c.name}</td>
                <td className="p-2 border-t">{c.email}</td>
                <td className="p-2 border-t">{c.phone || '—'}</td>
                <td className="p-2 border-t">{c.gst_number || '—'}</td>
                <td className="p-2 border-t">
                  <button onClick={(e) => handleDelete(c.id, e)} className="text-red-600">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
