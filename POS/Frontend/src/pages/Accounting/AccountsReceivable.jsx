import React from 'react';
import { api } from '../../lib/api';
import { useSettings } from '../../components/SettingsContext';

export default function AccountsReceivable({ receivables = [], onRefresh }) {
  const { formatCurrency, currencySymbol } = useSettings();

  const handlePayment = async (receivableId, paymentAmount, paymentDate) => {
    try {
      await api.put(`/api/accounts/receivable/${receivableId}/payment`, {
        payment_amount: paymentAmount,
        payment_date: paymentDate,
        payment_method: 'cash',
        reference: `Payment received for receivable ${receivableId}`
      });
      onRefresh && onRefresh();
    } catch (error) {
      console.error('Error recording payment:', error);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Accounts Receivable</h2>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice ID
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
            {receivables.map((receivable) => (
              <tr key={receivable.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {receivable.customer_name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {receivable.invoice_id}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {new Date(receivable.due_date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(receivable.amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(receivable.paid_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                    receivable.status === 'paid'
                      ? 'bg-green-100 text-green-800'
                      : receivable.status === 'partial'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {receivable.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  {receivable.status !== 'paid' && (
                    <button
                      onClick={() => {
                        const paymentAmount = prompt(`Enter payment amount (${currencySymbol})`, (receivable.amount - receivable.paid_amount).toFixed(2));
                        if (paymentAmount) {
                          handlePayment(receivable.id, parseFloat(paymentAmount), new Date().toISOString().split('T')[0]);
                        }
                      }}
                      className="text-green-600 hover:text-green-900"
                    >
                      Record Payment
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
