import React, { useState, useEffect, useCallback } from 'react';
import { FaDownload, FaPrint, FaCheckCircle, FaExclamationTriangle, FaCalculator } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useSettings } from '../../components/SettingsContext';

const MonthlyOperations = () => {
  const { formatCurrency } = useSettings();
  const toast = useToast();

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyData, setMonthlyData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const loadMonthlyData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/operations/monthly', {
        params: { month: selectedMonth }
      });
      setMonthlyData(response);
    } catch (error) {
      console.error('Failed to load monthly data:', error);
      toast.push('Failed to load monthly data', 'error');
      setMonthlyData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, toast]);

  // Load monthly data when month changes
  useEffect(() => {
    loadMonthlyData();
  }, [loadMonthlyData]);

  const processMonthlyClose = async () => {
    if (!window.confirm(`Process monthly close for ${selectedMonth}? This will finalize the month's transactions and prepare for the next month.`)) {
      return;
    }

    setProcessing(true);
    try {
      await api.post('/api/operations/monthly/process', {
        month: selectedMonth
      });

      toast.push('Monthly close processed successfully', 'success');
      await loadMonthlyData(); // Refresh data
    } catch (error) {
      console.error('Failed to process monthly close:', error);
      toast.push(error?.message || 'Failed to process monthly close', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const calculateDepreciation = async () => {
    if (!window.confirm('Calculate depreciation for this month? This will post depreciation entries to the general ledger.')) {
      return;
    }

    try {
      await api.post('/api/operations/monthly/depreciation', {
        month: selectedMonth
      });
      toast.push('Depreciation calculated successfully', 'success');
      await loadMonthlyData();
    } catch (error) {
      console.error('Failed to calculate depreciation:', error);
      toast.push('Failed to calculate depreciation', 'error');
    }
  };

  const exportReport = () => {
    if (!monthlyData) return;

    const csvContent = generateMonthlyCSV(monthlyData);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `monthly-report-${selectedMonth}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const generateMonthlyCSV = (data) => {
    const lines = [
      'Monthly Operations Report',
      `Month: ${selectedMonth}`,
      '',
      'Financial Summary',
      `Total Revenue: ${formatCurrency(data.financial?.totalRevenue || 0)}`,
      `Total Expenses: ${formatCurrency(data.financial?.totalExpenses || 0)}`,
      `Net Income: ${formatCurrency(data.financial?.netIncome || 0)}`,
      `Opening Balance: ${formatCurrency(data.financial?.openingBalance || 0)}`,
      `Closing Balance: ${formatCurrency(data.financial?.closingBalance || 0)}`,
      '',
      'Inventory Summary',
      `Opening Inventory: ${formatCurrency(data.inventory?.openingValue || 0)}`,
      `Purchases: ${formatCurrency(data.inventory?.purchases || 0)}`,
      `Sales: ${formatCurrency(data.inventory?.sales || 0)}`,
      `Closing Inventory: ${formatCurrency(data.inventory?.closingValue || 0)}`,
      `Inventory Turnover: ${data.inventory?.turnoverRatio?.toFixed(2) || 0}`,
      '',
      'Key Metrics',
      `Total Transactions: ${data.metrics?.totalTransactions || 0}`,
      `Average Transaction Value: ${formatCurrency(data.metrics?.avgTransactionValue || 0)}`,
      `New Customers: ${data.metrics?.newCustomers || 0}`,
      `Returning Customers: ${data.metrics?.returningCustomers || 0}`
    ];
    return lines.join('\n');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Monthly Operations</h2>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Select Month</label>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportReport}
              disabled={!monthlyData}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaDownload /> Export
            </button>
            <button
              onClick={() => window.print()}
              disabled={!monthlyData}
              className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FaPrint /> Print
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading monthly data...</p>
        </div>
      ) : monthlyData ? (
        <div className="space-y-6">
          {/* Status Indicator */}
          <div className={`p-4 rounded-lg ${monthlyData.closed ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            <div className="flex items-center">
              {monthlyData.closed ? (
                <FaCheckCircle className="w-5 h-5 text-green-600 mr-3" />
              ) : (
                <FaExclamationTriangle className="w-5 h-5 text-yellow-600 mr-3" />
              )}
              <div>
                <h3 className={`font-medium ${monthlyData.closed ? 'text-green-800' : 'text-yellow-800'}`}>
                  {monthlyData.closed ? 'Month Closed' : 'Month Open'}
                </h3>
                <p className={`text-sm ${monthlyData.closed ? 'text-green-700' : 'text-yellow-700'}`}>
                  {monthlyData.closed
                    ? `Closed on ${new Date(monthlyData.closedAt).toLocaleString()}`
                    : 'This month is still open for transactions'
                  }
                </p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(monthlyData.financial?.totalRevenue || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Total Expenses</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(monthlyData.financial?.totalExpenses || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Net Income</p>
                <p className={`text-2xl font-bold ${(monthlyData.financial?.netIncome || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(monthlyData.financial?.netIncome || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Closing Balance</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(monthlyData.financial?.closingBalance || 0)}
                </p>
              </div>
            </div>
          </div>

          {/* Inventory Summary */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Opening Value</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(monthlyData.inventory?.openingValue || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Purchases</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(monthlyData.inventory?.purchases || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">COGS</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(monthlyData.inventory?.sales || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Closing Value</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(monthlyData.inventory?.closingValue || 0)}
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-500">Inventory Turnover Ratio</span>
                <span className="text-lg font-semibold text-gray-900">
                  {monthlyData.inventory?.turnoverRatio?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>
          </div>

          {/* Key Metrics */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Performance Metrics</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Total Transactions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {monthlyData.metrics?.totalTransactions || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Avg Transaction Value</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formatCurrency(monthlyData.metrics?.avgTransactionValue || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">New Customers</p>
                <p className="text-2xl font-bold text-green-600">
                  {monthlyData.metrics?.newCustomers || 0}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Returning Customers</p>
                <p className="text-2xl font-bold text-blue-600">
                  {monthlyData.metrics?.returningCustomers || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Monthly Actions */}
          {!monthlyData.closed && (
            <div className="bg-white p-6 rounded-lg shadow border">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Operations</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={calculateDepreciation}
                  className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <FaCalculator /> Calculate Depreciation
                </button>
                <button
                  onClick={processMonthlyClose}
                  disabled={processing}
                  className="inline-flex items-center gap-2 px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Close Month'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No data available for the selected month.</p>
        </div>
      )}
    </div>
  );
};

export default MonthlyOperations;