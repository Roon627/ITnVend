import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [settings, setSettings] = useState({ currency: 'MVR' });
  const { push: toast } = useToast();

  useEffect(() => {
    api.get('/invoices')
      .then(setInvoices)
      .catch(() => toast('Failed to load invoices', 'error'));
    api.get('/settings')
      .then(data => setSettings(data))
      .catch(() => toast('Failed to load settings', 'error'));
  }, [toast]);

  const filteredInvoices = invoices.filter(invoice =>
    (invoice.customer_name && invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    String(invoice.id).includes(searchTerm)
  );

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Invoices</h1>
        <input
          type="text"
          placeholder="Search by customer or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-64 px-4 py-2 border rounded-lg shadow-sm"
        />
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice ID</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
              <th className="p-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => (
              <tr key={invoice.id} className="hover:bg-gray-50">
                <td className="p-4 whitespace-nowrap font-medium text-gray-900">#{invoice.id}</td>
                <td className="p-4 whitespace-nowrap">{invoice.customer_name}</td>
                <td className="p-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.created_at).toLocaleDateString()}</td>
                <td className="p-4 whitespace-nowrap font-semibold">{settings.currency} {invoice.total.toFixed(2)}</td>
                <td className="p-4 whitespace-nowrap text-sm text-gray-500">{invoice.outlet_name}</td>
                <td className="p-4 whitespace-nowrap text-right">
                  <a href={`http://localhost:4000/api/invoices/${invoice.id}/pdf`} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                    View PDF
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
