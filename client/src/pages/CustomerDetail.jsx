import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const { push: toast } = useToast();

  useEffect(() => {
    api.get(`/customers/${id}`)
      .then(setCustomer)
      .catch(() => toast('Failed to load customer details', 'error'));

    api.get(`/customers/${id}/invoices`)
      .then(setInvoices)
      .catch(() => toast('Failed to load customer invoices', 'error'));
  }, [id, toast]);

  if (!customer) {
    return <div className="p-6">Loading customer...</div>;
  }

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <h1 className="text-3xl font-bold mb-4">{customer.name}</h1>
      <p className="text-gray-600 mb-6">{customer.email}</p>

      <h2 className="text-2xl font-semibold mb-4">Purchase History</h2>
      <div className="bg-white shadow rounded-lg">
        <ul className="divide-y divide-gray-200">
          {invoices.length > 0 ? (
            invoices.map((invoice) => (
              <li key={invoice.id} className="p-4 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <p className="font-semibold">Invoice #{invoice.id}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(invoice.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                    <p className="font-semibold">Total: {settings.currency} {invoice.total.toFixed(2)}</p>
                    <Link to={`/invoices/${invoice.id}/pdf`} target="_blank" className="text-blue-500 hover:underline text-sm">
                        View PDF
                    </Link>
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
