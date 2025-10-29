import React, { useState, useEffect } from 'react';
import { FaDownload, FaPrint, FaCheckCircle, FaExclamationTriangle, FaSignature, FaUser } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useSettings } from '../../components/SettingsContext';

const DayEnd = () => {
  const { formatCurrency } = useSettings();
  const toast = useToast();

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [dayEndData, setDayEndData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Load day end data when date changes
  useEffect(() => {
    loadDayEndData();
  }, [selectedDate]);

  const loadDayEndData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/operations/day-end', {
        params: { date: selectedDate }
      });
      setDayEndData(response);
    } catch (error) {
      console.error('Failed to load day end data:', error);
      toast.push('Failed to load day end data', 'error');
      setDayEndData(null);
    } finally {
      setLoading(false);
    }
  };

  const processDayEnd = async () => {
    if (!window.confirm(`Process day end for ${selectedDate}? This will finalize the day's transactions.`)) {
      return;
    }

    setProcessing(true);
    try {
      const response = await api.post('/api/operations/day-end/process', {
        date: selectedDate
      });

      toast.push('Day end processed successfully', 'success');
      await loadDayEndData(); // Refresh data
    } catch (error) {
      console.error('Failed to process day end:', error);
      toast.push(error?.message || 'Failed to process day end', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const exportReport = () => {
    if (!dayEndData) return;

    const csvContent = generateDayEndCSV(dayEndData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `day-end-${selectedDate}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const generateDayEndCSV = (data) => {
    const lines = [
      'Day End Report',
      `Date: ${selectedDate}`,
      `Outlet: ${data.outlet?.name || 'N/A'}`,
      `Cashier: ${data.cashier?.name || 'N/A'}`,
      '',
      'Summary',
      `Total Sales: ${formatCurrency(data.sales?.totalSales || 0)}`,
      `Total Transactions: ${data.sales?.transactionCount || 0}`,
      `Cash Sales: ${formatCurrency(data.sales?.cashSales || 0)}`,
      `Card Sales: ${formatCurrency(data.sales?.cardSales || 0)}`,
      '',
      'Card Reconciliation',
      `Card Machine Slips: ${data.cardReconciliation?.cardSlipsCount || 0}`,
      `Card Slips Total: ${formatCurrency(data.cardReconciliation?.cardSlipsTotal || 0)}`,
      `System Card Sales: ${formatCurrency(data.cardReconciliation?.systemCardSales || 0)}`,
      `Card Variance: ${formatCurrency(data.cardReconciliation?.variance || 0)}`,
      '',
      'Cash Reconciliation',
      `Expected Cash: ${formatCurrency(data.cash?.expectedCash || 0)}`,
      `Cash In: ${formatCurrency(data.cash?.cashIn || 0)}`,
      `Cash Out: ${formatCurrency(data.cash?.cashOut || 0)}`,
      `Net Cash: ${formatCurrency(data.cash?.netCash || 0)}`,
      '',
      'Inventory Movement',
      `Items Sold: ${data.inventory?.itemsSold || 0}`,
      `Items Added: ${data.inventory?.itemsAdded || 0}`,
      `Items Removed: ${data.inventory?.itemsRemoved || 0}`,
      '',
      'Top Products',
      'Product,Quantity,Revenue',
      ...Object.entries(data.topProducts || {}).map(([product, data]) =>
        `"${product}",${data.quantity},${formatCurrency(data.revenue)}`
      )
    ];
    return lines.join('\n');
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Day End Report</h1>
        <div className="flex gap-4">
          <button
            onClick={exportReport}
            disabled={!dayEndData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <FaDownload /> Export CSV
          </button>
          <button
            onClick={() => window.print()}
            disabled={!dayEndData}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <FaPrint /> Print Report
          </button>
          <button
            onClick={processDayEnd}
            disabled={processing || !dayEndData}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            <FaCheckCircle /> Process Day End
          </button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading day end data...</p>
        </div>
      ) : dayEndData ? (
        <div className="bg-white rounded-lg shadow-lg p-8 print:shadow-none print:p-4">
          {/* Report Header */}
          <div className="border-b-2 border-gray-300 pb-6 mb-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                  {dayEndData.outlet?.logo && (
                    <img
                      src={dayEndData.outlet.logo}
                      alt="Outlet Logo"
                      className="w-16 h-16 object-contain"
                    />
                  )}
                  <div>
                    <h2 className="text-2xl font-bold text-gray-800">{dayEndData.outlet?.name || 'Outlet Name'}</h2>
                    <p className="text-gray-600">{dayEndData.outlet?.address || 'Outlet Address'}</p>
                    <p className="text-gray-600">{dayEndData.outlet?.phone || 'Phone: N/A'}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <strong>Report Date:</strong> {new Date(selectedDate).toLocaleDateString()}
                  </div>
                  <div>
                    <strong>Generated:</strong> {new Date().toLocaleString()}
                  </div>
                  <div className="flex items-center gap-2">
                    <FaUser className="text-gray-500" />
                    <strong>Cashier:</strong> {dayEndData.cashier?.name || 'N/A'}
                  </div>
                  <div>
                    <strong>Cashier ID:</strong> {dayEndData.cashier?.id || 'N/A'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sales Summary */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Sales Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="font-semibold text-blue-800">Total Sales</h4>
                <p className="text-2xl font-bold text-blue-600">{formatCurrency(dayEndData.sales?.totalSales || 0)}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="font-semibold text-green-800">Total Transactions</h4>
                <p className="text-2xl font-bold text-green-600">{dayEndData.sales?.transactionCount || 0}</p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="font-semibold text-purple-800">Average Transaction</h4>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency((dayEndData.sales?.totalSales || 0) / (dayEndData.sales?.transactionCount || 1))}
                </p>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Payment Methods</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-gray-800">Cash</h4>
                <p className="text-xl font-bold text-gray-600">{formatCurrency(dayEndData.sales?.cashSales || 0)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-gray-800">Card</h4>
                <p className="text-xl font-bold text-gray-600">{formatCurrency(dayEndData.sales?.cardSales || 0)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-gray-800">Other</h4>
                <p className="text-xl font-bold text-gray-600">{formatCurrency(dayEndData.sales?.otherSales || 0)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-gray-800">Discounts</h4>
                <p className="text-xl font-bold text-red-600">-{formatCurrency(dayEndData.sales?.discounts || 0)}</p>
              </div>
            </div>
          </div>

          {/* Card Reconciliation */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Card Reconciliation</h3>
            <div className="bg-blue-50 p-6 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="text-center">
                  <h4 className="font-semibold text-blue-800">Card Machine Slips</h4>
                  <p className="text-2xl font-bold text-blue-600">{dayEndData.cardReconciliation?.cardSlipsCount || 0}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-blue-800">Card Slips Total</h4>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(dayEndData.cardReconciliation?.cardSlipsTotal || 0)}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-blue-800">System Card Sales</h4>
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(dayEndData.cardReconciliation?.systemCardSales || 0)}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-blue-800">Variance</h4>
                  <p className={`text-2xl font-bold ${dayEndData.cardReconciliation?.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(dayEndData.cardReconciliation?.variance || 0)}
                  </p>
                </div>
              </div>
              {dayEndData.cardReconciliation?.variance !== 0 && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FaExclamationTriangle className="text-red-600" />
                    <span className="font-semibold text-red-800">Card Reconciliation Discrepancy:</span>
                    <span className={`font-bold ${dayEndData.cardReconciliation.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(Math.abs(dayEndData.cardReconciliation.variance))}
                      {dayEndData.cardReconciliation.variance > 0 ? ' excess' : ' shortfall'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cash Reconciliation */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Cash Reconciliation</h3>
            <div className="bg-yellow-50 p-6 rounded-lg">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center">
                  <h4 className="font-semibold text-yellow-800">Expected Cash</h4>
                  <p className="text-xl font-bold text-yellow-600">{formatCurrency(dayEndData.cash?.expectedCash || 0)}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-yellow-800">Cash In</h4>
                  <p className="text-xl font-bold text-green-600">{formatCurrency(dayEndData.cash?.cashIn || 0)}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-yellow-800">Cash Out</h4>
                  <p className="text-xl font-bold text-red-600">-{formatCurrency(dayEndData.cash?.cashOut || 0)}</p>
                </div>
                <div className="text-center">
                  <h4 className="font-semibold text-yellow-800">Net Cash</h4>
                  <p className={`text-xl font-bold ${dayEndData.cash?.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(dayEndData.cash?.netCash || 0)}
                  </p>
                </div>
              </div>
              {dayEndData.cash?.variance !== 0 && (
                <div className="mt-4 p-3 bg-red-100 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FaExclamationTriangle className="text-red-600" />
                    <span className="font-semibold text-red-800">Cash Variance:</span>
                    <span className={`font-bold ${dayEndData.cash.variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(dayEndData.cash.variance)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Inventory Movement</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-red-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-red-800">Items Sold</h4>
                <p className="text-2xl font-bold text-red-600">{dayEndData.inventory?.itemsSold || 0}</p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-green-800">Items Added</h4>
                <p className="text-2xl font-bold text-green-600">{dayEndData.inventory?.itemsAdded || 0}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg text-center">
                <h4 className="font-semibold text-blue-800">Items Removed</h4>
                <p className="text-2xl font-bold text-blue-600">{dayEndData.inventory?.itemsRemoved || 0}</p>
              </div>
            </div>
          </div>

          {/* Top Products */}
          <div className="mb-8">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Top Products</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white border border-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 border-b text-left">Product</th>
                    <th className="px-4 py-2 border-b text-right">Quantity Sold</th>
                    <th className="px-4 py-2 border-b text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(dayEndData.topProducts || {}).map(([product, data], index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-2 border-b">{product}</td>
                      <td className="px-4 py-2 border-b text-right">{data.quantity}</td>
                      <td className="px-4 py-2 border-b text-right">{formatCurrency(data.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Signatures */}
          <div className="border-t-2 border-gray-300 pt-6 mt-8">
            <h3 className="text-xl font-bold text-gray-800 mb-6">Signatures</h3>
            <div className="grid grid-cols-2 gap-8">
              <div className="text-center">
                <div className="border-b border-gray-400 pb-8 mb-2"></div>
                <p className="font-semibold">{dayEndData.cashier?.name || 'Cashier Name'}</p>
                <p className="text-sm text-gray-600">Cashier Signature</p>
                <p className="text-xs text-gray-500">Date: {new Date().toLocaleDateString()}</p>
              </div>
              <div className="text-center">
                <div className="border-b border-gray-400 pb-8 mb-2"></div>
                <p className="font-semibold">Supervisor Name</p>
                <p className="text-sm text-gray-600 flex items-center justify-center gap-2">
                  <FaSignature /> Supervisor Signature
                </p>
                <p className="text-xs text-gray-500">Date: {new Date().toLocaleDateString()}</p>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-300 text-center text-sm text-gray-600">
            <p>Report generated by ITnVend POS System</p>
            <p>This is an official day end report for accounting purposes</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <FaExclamationTriangle className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No data available</h3>
          <p className="mt-1 text-sm text-gray-500">No day end data found for the selected date.</p>
        </div>
      )}
    </div>
  );
};

export default DayEnd;