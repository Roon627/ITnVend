import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useSettings } from '../../components/SettingsContext';
import ReconcileModal from './ReconcileModal';

export default function AccountsPayable({ invoices = [], onRefresh }) {
  const { formatCurrency, currencySymbol } = useSettings();
  const [showForm, setShowForm] = useState(false);
  const [showReconcile, setShowReconcile] = useState(false);
  const [reconcilePayload, setReconcilePayload] = useState(null);
  const [formData, setFormData] = useState({
    vendor_id: '',
    invoice_number: '',
    invoice_date: new Date().toISOString().split('T')[0],
    due_date: '',
    amount: 0,
    description: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/accounts/payable', formData);
      setShowForm(false);
      setFormData({
        vendor_id: '',
        invoice_number: '',
        invoice_date: new Date().toISOString().split('T')[0],
        due_date: '',
        amount: 0,
        description: ''
      });
      onRefresh && onRefresh();
    } catch (error) {
      console.error('Error creating payable invoice:', error);
    }
  };

  const handlePayment = async (invoiceId, paymentAmount, paymentDate) => {
    try {
      await api.put(`/api/accounts/payable/${invoiceId}/payment`, {
        payment_amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: 'check',
        reference: `Payment for invoice ${invoiceId}`
      });
      onRefresh && onRefresh();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  const openReconcile = (invoice) => {
    setReconcilePayload({ invoiceId: invoice.id, amount: invoice.amount });
    setShowReconcile(true);
  };

  // Poll for new invoices every 30s while the document is visible.
  // This keeps the UI reasonably up-to-date without a full realtime backend.
  useEffect(() => {
    if (typeof onRefresh !== 'function') return;

    const INTERVAL = 30000; // 30 seconds
    let timer = null;

    const startPolling = () => {
      if (timer) return;
      timer = setInterval(() => {
        try {
          if (!document.hidden) onRefresh();
        } catch (err) {
          console.error('Error during payables polling refresh', err);
        }
      }, INTERVAL);
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // refresh immediately when tab regains focus then resume polling
        onRefresh();
        startPolling();
      }
    };

    // start polling if visible now
    if (!document.hidden) startPolling();

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [onRefresh]);

  const onReconcileSubmit = async (payload) => {
    try {
      // if invoiceId present, call payable payment endpoint
      if (payload.invoiceId) {
        await handlePayment(payload.invoiceId, payload.amount, new Date().toISOString().split('T')[0]);
      }
      // optionally, create a generic reconcile entry endpoint if backend supports it
      onRefresh && onRefresh();
    } catch (err) {
      console.error('Reconcile submit error', err);
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Accounts Payable</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          Add Invoice
        </button>
      </div>

      {showForm && (
        <div className="mb-6 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-4">Add Payable Invoice</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Vendor ID</label>
                <input
                  type="text"
                  value={formData.vendor_id}
                  onChange={(e) => setFormData({...formData, vendor_id: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Invoice Number</label>
                <input
                  type="text"
                  value={formData.invoice_number}
                  onChange={(e) => setFormData({...formData, invoice_number: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Invoice Date</label>
                <input
                  type="date"
                  value={formData.invoice_date}
                  onChange={(e) => setFormData({...formData, invoice_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Due Date</label>
                <input
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: parseFloat(e.target.value) || 0})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                rows="3"
              />
            </div>
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Create Invoice
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setFormData({
                    vendor_id: '',
                    invoice_number: '',
                    invoice_date: new Date().toISOString().split('T')[0],
                    due_date: '',
                    amount: 0,
                    description: ''
                  });
                }}
                className="bg-gray-500 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Vendor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice Number
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Due Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paid
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {invoices.map((invoice) => (
              <tr key={invoice.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {invoice.vendor_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {invoice.invoice_number}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(invoice.due_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(invoice.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(invoice.paid_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    invoice.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : invoice.status === 'partial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {invoice.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {invoice.status !== 'paid' && (
                    <>
                      <button
                        onClick={() => openReconcile(invoice)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        Reconcile
                      </button>
                      <button
                        onClick={() => {
                          const paymentAmount = prompt(`Enter payment amount (${currencySymbol})`, (invoice.amount - invoice.paid_amount).toFixed(2));
                          if (paymentAmount) {
                            handlePayment(invoice.id, parseFloat(paymentAmount), new Date().toISOString().split('T')[0]);
                          }
                        }}
                        className="text-green-600 hover:text-green-900"
                      >
                        Record Payment
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReconcileModal open={showReconcile} onClose={() => setShowReconcile(false)} onSubmit={onReconcileSubmit} />
    </div>
  );
}
