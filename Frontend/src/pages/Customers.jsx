import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaBuilding, FaSearch, FaTrashAlt, FaUser, FaUsers, FaArrowRight } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

const initialForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  gst_number: '',
  registration_number: '',
  is_business: false,
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState('all');
  const [form, setForm] = useState(initialForm);
  const toast = useToast();
  const navigate = useNavigate();
  const ADMIN_BASE = import.meta.env.VITE_ONLY_ADMIN === '1' ? '' : '/admin';

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setCustomers(res || []);
    } catch (err) {
      toast.push('Failed to load customers', 'error');
    }
  };

  const metrics = useMemo(() => {
    const total = customers.length;
    const business = customers.filter((c) => c.is_business).length;
    const individuals = total - business;
    const withOutstanding = customers.filter((c) => Number(c.outstanding_balance) > 0).length;
    return { total, business, individuals, withOutstanding };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, searchTerm, segmentFilter]);

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleAdd = async (event) => {
    event.preventDefault();
    if (!form.name || !form.email) {
      toast.push('Name and email are required.', 'error');
      return;
    }
    try {
      await api.post('/customers', form);
      toast.push('Customer added', 'info');
      setForm(initialForm);
      fetchCustomers();
    } catch (err) {
      toast.push(err?.response?.data?.error || 'Failed to add customer', 'error');
    }
  };

  const handleDelete = async (id, event) => {
    event?.stopPropagation();
    if (!window.confirm('Delete this customer?')) return;
    try {
      await api.del(`/customers/${id}`);
      toast.push('Customer deleted', 'info');
      fetchCustomers();
    } catch (err) {
      toast.push('Failed to delete customer', 'error');
    }
  };

  const segmentChips = [
    { value: 'all', label: 'All', count: metrics.total },
    { value: 'business', label: 'Business', count: metrics.business },
    { value: 'individual', label: 'Individuals', count: metrics.individuals },
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
        <button
          onClick={() => document.getElementById('customer-form')?.scrollIntoView({ behavior: 'smooth' })}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold shadow hover:bg-blue-700"
        >
          <FaUsers /> Add customer
        </button>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Total customers</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{metrics.total}</div>
          <div className="text-xs text-gray-400 mt-1">Across all segments</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Business accounts</div>
          <div className="mt-2 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FaBuilding className="text-blue-500" /> {metrics.business}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {metrics.total ? Math.round((metrics.business / metrics.total) * 100) : 0}% of customer base
          </div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Individuals</div>
          <div className="mt-2 text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FaUser className="text-pink-500" /> {metrics.individuals}
          </div>
          <div className="text-xs text-gray-400 mt-1">Ideal for POS or B2C workflows</div>
        </div>
        <div className="bg-white border border-gray-100 rounded-lg p-4 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-gray-500 font-semibold">Outstanding balances</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{metrics.withOutstanding}</div>
          <div className="text-xs text-gray-400 mt-1">With open invoices</div>
        </div>
      </section>

      <section id="customer-form" className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Add a customer</h2>
          <span className="text-xs text-gray-400 uppercase tracking-wide">
            Create records for invoices and quotations
          </span>
        </div>
        <form onSubmit={handleAdd} className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Name <span className="text-red-500">*</span>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Email <span className="text-red-500">*</span>
            <input
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Phone
            <input
              name="phone"
              value={form.phone}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Street address
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Tax / GST number
            <input
              name="gst_number"
              value={form.gst_number}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-gray-600">
            Registration number
            <input
              name="registration_number"
              value={form.registration_number}
              onChange={handleChange}
              className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="flex items-center gap-3 text-sm text-gray-600">
            <input
              type="checkbox"
              name="is_business"
              checked={form.is_business}
              onChange={handleChange}
              className="h-4 w-4 text-blue-600"
            />
            Treat as business account (enables company-level reporting)
          </label>
          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700"
            >
              <FaUsers /> Save customer
            </button>
          </div>
        </form>
      </section>

      <section className="bg-white border border-gray-100 rounded-lg shadow-sm p-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2 flex-1">
            <FaSearch className="text-gray-400" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name, email, GST, registration..."
              className="w-full border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            {segmentChips.map((chip) => (
              <button
                key={chip.value}
                onClick={() => setSegmentFilter(chip.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  segmentFilter === chip.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-400'
                }`}
              >
                {chip.label}
                <span className={`ml-2 text-[10px] font-semibold ${segmentFilter === chip.value ? 'text-blue-100' : 'text-gray-400'}`}>
                  {chip.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Tax / Reg</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredCustomers.map((customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`${ADMIN_BASE}/customers/${customer.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900">{customer.name}</div>
                    {customer.address && <div className="text-xs text-gray-500 mt-1">{customer.address}</div>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>{customer.email || '—'}</div>
                    <div className="text-xs text-gray-400">{customer.phone || 'No phone'}</div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    <div>{customer.gst_number || '—'}</div>
                    <div className="text-xs text-gray-400">{customer.registration_number || ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                        customer.is_business ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {customer.is_business ? <FaBuilding /> : <FaUser />}
                      {customer.is_business ? 'Business' : 'Individual'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={(e) => handleDelete(customer.id, e)}
                        className="text-red-500 hover:text-red-700"
                        aria-label={`Delete ${customer.name}`}
                      >
                        <FaTrashAlt />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`${ADMIN_BASE}/customers/${customer.id}`);
                        }}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-700"
                      >
                        View <FaArrowRight />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredCustomers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-gray-500 text-sm">
                    No customers match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
