import React, { useState, useEffect } from 'react';
import { FaLock, FaUnlock, FaCalculator, FaCheckCircle, FaExclamationTriangle, FaPrint } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useSettings } from '../../components/SettingsContext';

const DayClose = () => {
  const { formatCurrency } = useSettings();
  const toast = useToast();

  const [shiftData, setShiftData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [cashCounts, setCashCounts] = useState({
    ones: 0,
    fives: 0,
    tens: 0,
    twenties: 0,
    fifties: 0,
    hundreds: 0,
    coins: 0
  });
  const [actualCash, setActualCash] = useState(0);
  const [discrepancy, setDiscrepancy] = useState(0);
  const [notes, setNotes] = useState('');

  // Load current shift data
  useEffect(() => {
    loadShiftData();
  }, []);

  // Calculate actual cash when counts change
  useEffect(() => {
    const calculated = calculateActualCash();
    setActualCash(calculated);
    if (shiftData?.expectedCash !== undefined) {
      setDiscrepancy(calculated - shiftData.expectedCash);
    }
  }, [cashCounts, shiftData]);

  const loadShiftData = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/operations/shift/current');
      setShiftData(response);
    } catch (error) {
      console.error('Failed to load shift data:', error);
      toast.push('Failed to load shift data', 'error');
      setShiftData(null);
    } finally {
      setLoading(false);
    }
  };

  const calculateActualCash = () => {
    return (
      cashCounts.ones * 1 +
      cashCounts.fives * 5 +
      cashCounts.tens * 10 +
      cashCounts.twenties * 20 +
      cashCounts.fifties * 50 +
      cashCounts.hundreds * 100 +
      cashCounts.coins
    );
  };

  const handleCashCountChange = (denomination, value) => {
    const numValue = parseFloat(value) || 0;
    setCashCounts(prev => ({
      ...prev,
      [denomination]: numValue
    }));
  };

  const startNewShift = async () => {
    if (!window.confirm('Start a new shift? This will close the current shift if open.')) {
      return;
    }

    setProcessing(true);
    try {
      const response = await api.post('/api/operations/shift/start', {
        startingCash: 0 // Could be configurable
      });
      toast.push('New shift started successfully', 'success');
      await loadShiftData();
    } catch (error) {
      console.error('Failed to start new shift:', error);
      toast.push('Failed to start new shift', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const closeShift = async () => {
    if (Math.abs(discrepancy) > 1) { // Allow small discrepancies
      if (!window.confirm(`There is a cash discrepancy of ${formatCurrency(discrepancy)}. Are you sure you want to close the shift?`)) {
        return;
      }
    }

    setProcessing(true);
    try {
      await api.post('/api/operations/shift/close', {
        actualCash,
        cashCounts,
        discrepancy,
        notes: notes.trim()
      });

      toast.push('Shift closed successfully', 'success');
      await loadShiftData();
      // Reset form
      setCashCounts({
        ones: 0, fives: 0, tens: 0, twenties: 0, fifties: 0, hundreds: 0, coins: 0
      });
      setActualCash(0);
      setDiscrepancy(0);
      setNotes('');
    } catch (error) {
      console.error('Failed to close shift:', error);
      toast.push('Failed to close shift', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const printShiftReport = () => {
    if (!shiftData) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>Shift Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; }
            .section { margin-bottom: 20px; }
            .total { font-weight: bold; font-size: 1.2em; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Shift Close Report</h1>
            <p>Shift: ${shiftData.shiftId || 'Current'}</p>
            <p>Date: ${new Date().toLocaleDateString()}</p>
          </div>

          <div class="section">
            <h3>Sales Summary</h3>
            <p>Total Sales: ${formatCurrency(shiftData.totalSales || 0)}</p>
            <p>Cash Sales: ${formatCurrency(shiftData.cashSales || 0)}</p>
            <p>Card Sales: ${formatCurrency(shiftData.cardSales || 0)}</p>
            <p>Transactions: ${shiftData.transactionCount || 0}</p>
          </div>

          <div class="section">
            <h3>Cash Reconciliation</h3>
            <p>Expected Cash: ${formatCurrency(shiftData.expectedCash || 0)}</p>
            <p>Actual Cash: ${formatCurrency(actualCash)}</p>
            <p>Discrepancy: ${formatCurrency(discrepancy)}</p>
          </div>

          <div class="section">
            <h3>Cash Count Details</h3>
            <table>
              <tr><th>Denomination</th><th>Count</th><th>Amount</th></tr>
              <tr><td>$100</td><td>${cashCounts.hundreds}</td><td>${formatCurrency(cashCounts.hundreds * 100)}</td></tr>
              <tr><td>$50</td><td>${cashCounts.fifties}</td><td>${formatCurrency(cashCounts.fifties * 50)}</td></tr>
              <tr><td>$20</td><td>${cashCounts.twenties}</td><td>${formatCurrency(cashCounts.twenties * 20)}</td></tr>
              <tr><td>$10</td><td>${cashCounts.tens}</td><td>${formatCurrency(cashCounts.tens * 10)}</td></tr>
              <tr><td>$5</td><td>${cashCounts.fives}</td><td>${formatCurrency(cashCounts.fives * 5)}</td></tr>
              <tr><td>$1</td><td>${cashCounts.ones}</td><td>${formatCurrency(cashCounts.ones * 1)}</td></tr>
              <tr><td>Coins</td><td>-</td><td>${formatCurrency(cashCounts.coins)}</td></tr>
              <tr class="total"><td>Total</td><td>-</td><td>${formatCurrency(actualCash)}</td></tr>
            </table>
          </div>

          ${notes ? `<div class="section"><h3>Notes</h3><p>${notes}</p></div>` : ''}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading shift data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Day Close / Shift Reconciliation</h2>
        <div className="flex items-center gap-4">
          {shiftData?.isOpen ? (
            <div className="flex items-center gap-2 text-green-600">
              <FaUnlock className="w-4 h-4" />
              <span className="text-sm font-medium">Shift Open</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-600">
              <FaLock className="w-4 h-4" />
              <span className="text-sm font-medium">Shift Closed</span>
            </div>
          )}
        </div>
      </div>

      {shiftData ? (
        <div className="space-y-6">
          {/* Shift Summary */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Shift Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Total Sales</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(shiftData.totalSales || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Cash Sales</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(shiftData.cashSales || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Card Sales</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(shiftData.cardSales || 0)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-500">Transactions</p>
                <p className="text-2xl font-bold text-gray-900">
                  {shiftData.transactionCount || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Cash Reconciliation */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cash Reconciliation</h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Cash Count Form */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Cash Count</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$100</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.hundreds}
                        onChange={(e) => handleCashCountChange('hundreds', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.hundreds * 100)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$50</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.fifties}
                        onChange={(e) => handleCashCountChange('fifties', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.fifties * 50)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$20</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.twenties}
                        onChange={(e) => handleCashCountChange('twenties', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.twenties * 20)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$10</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.tens}
                        onChange={(e) => handleCashCountChange('tens', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.tens * 10)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$5</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.fives}
                        onChange={(e) => handleCashCountChange('fives', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.fives * 5)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">$1</label>
                      <input
                        type="number"
                        min="0"
                        value={cashCounts.ones}
                        onChange={(e) => handleCashCountChange('ones', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.ones * 1)}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Coins</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashCounts.coins}
                        onChange={(e) => handleCashCountChange('coins', e.target.value)}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="text-right pt-6">
                      <span className="text-sm text-gray-600">
                        {formatCurrency(cashCounts.coins)}
                      </span>
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-semibold">Actual Cash:</span>
                      <span className="text-lg font-bold text-blue-600">
                        {formatCurrency(actualCash)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reconciliation Summary */}
              <div>
                <h4 className="text-md font-medium text-gray-900 mb-3">Reconciliation</h4>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Expected Cash:</span>
                    <span className="font-medium">{formatCurrency(shiftData.expectedCash || 0)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Actual Cash:</span>
                    <span className="font-medium">{formatCurrency(actualCash)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Discrepancy:</span>
                      <span className={`font-bold ${Math.abs(discrepancy) > 1 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(discrepancy)}
                      </span>
                    </div>
                  </div>

                  {Math.abs(discrepancy) > 1 && (
                    <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded">
                      <FaExclamationTriangle className="w-4 h-4 text-yellow-600" />
                      <span className="text-sm text-yellow-800">
                        Cash discrepancy detected. Please verify count.
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Notes (Optional)
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Add any notes about the shift close..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="bg-white p-6 rounded-lg shadow border">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="flex flex-wrap gap-4">
              {shiftData.isOpen ? (
                <>
                  <button
                    onClick={printShiftReport}
                    className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <FaPrint /> Print Report
                  </button>
                  <button
                    onClick={closeShift}
                    disabled={processing}
                    className="inline-flex items-center gap-2 px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {processing ? 'Closing...' : 'Close Shift'}
                  </button>
                </>
              ) : (
                <button
                  onClick={startNewShift}
                  disabled={processing}
                  className="inline-flex items-center gap-2 px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Starting...' : 'Start New Shift'}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="text-gray-500">No shift data available.</p>
          <button
            onClick={startNewShift}
            disabled={processing}
            className="mt-4 inline-flex items-center gap-2 px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Starting...' : 'Start First Shift'}
          </button>
        </div>
      )}
    </div>
  );
};

export default DayClose;