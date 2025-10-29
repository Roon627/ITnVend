import React, { useState, useEffect } from 'react';
import { FaSearch, FaUndo, FaExclamationTriangle, FaCheckCircle, FaTimes } from 'react-icons/fa';
import api from '../../lib/api';
import { useToast } from '../../components/ToastContext';
import { useSettings } from '../../components/SettingsContext';

const ReversePurchases = () => {
  const { formatCurrency } = useSettings();
  const toast = useToast();

  const [searchTerm, setSearchTerm] = useState('');
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState(null);
  const [showReverseModal, setShowReverseModal] = useState(false);
  const [reverseReason, setReverseReason] = useState('');
  const [processing, setProcessing] = useState(false);

  // Load purchases on component mount and when search changes
  useEffect(() => {
    loadPurchases();
  }, [searchTerm]);

  const loadPurchases = async () => {
    setLoading(true);
    try {
      const response = await api.get('/api/purchases', {
        params: {
          search: searchTerm,
          limit: 50,
          includeReversed: false // Only show non-reversed purchases
        }
      });
      setPurchases(response.purchases || []);
    } catch (error) {
      console.error('Failed to load purchases:', error);
      toast.push('Failed to load purchases', 'error');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleReversePurchase = async () => {
    if (!selectedPurchase || !reverseReason.trim()) {
      toast.push('Please provide a reason for the reversal', 'error');
      return;
    }

    if (!window.confirm(`Are you sure you want to reverse purchase #${selectedPurchase.id}? This will adjust inventory and create reversal entries.`)) {
      return;
    }

    setProcessing(true);
    try {
      await api.post(`/api/purchases/${selectedPurchase.id}/reverse`, {
        reason: reverseReason.trim()
      });

      toast.push('Purchase reversed successfully', 'success');
      setShowReverseModal(false);
      setSelectedPurchase(null);
      setReverseReason('');
      await loadPurchases(); // Refresh the list
    } catch (error) {
      console.error('Failed to reverse purchase:', error);
      toast.push(error?.message || 'Failed to reverse purchase', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const canReversePurchase = (purchase) => {
    // Can only reverse purchases that are not already reversed and within a reasonable time frame
    const purchaseDate = new Date(purchase.purchaseDate);
    const now = new Date();
    const daysDiff = (now - purchaseDate) / (1000 * 60 * 60 * 24);

    return !purchase.reversed && daysDiff <= 30; // Allow reversal within 30 days
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Reverse Purchases</h2>
        <div className="text-sm text-gray-600">
          Reverse purchase transactions to correct errors or handle returns
        </div>
      </div>

      {/* Search */}
      <div className="bg-white p-4 rounded-lg shadow border">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="relative">
              <FaSearch className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by purchase ID, supplier, or product..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Purchases List */}
      <div className="bg-white rounded-lg shadow border">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading purchases...</p>
          </div>
        ) : purchases.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No purchases found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Purchase ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Supplier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Items
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Amount
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
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      #{purchase.id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(purchase.purchaseDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {purchase.supplierName || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {purchase.items?.length || 0} items
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatCurrency(purchase.totalAmount || 0)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        purchase.reversed
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {purchase.reversed ? 'Reversed' : 'Active'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      {canReversePurchase(purchase) ? (
                        <button
                          onClick={() => {
                            setSelectedPurchase(purchase);
                            setShowReverseModal(true);
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                        >
                          <FaUndo /> Reverse
                        </button>
                      ) : (
                        <span className="text-gray-400 text-sm">
                          {purchase.reversed ? 'Already reversed' : 'Cannot reverse'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reverse Purchase Modal */}
      {showReverseModal && selectedPurchase && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center mb-4">
                <FaExclamationTriangle className="w-6 h-6 text-yellow-600 mr-3" />
                <h3 className="text-lg font-medium text-gray-900">Reverse Purchase</h3>
              </div>

              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  You are about to reverse purchase #{selectedPurchase.id}
                </p>
                <div className="bg-gray-50 p-3 rounded text-sm">
                  <p><strong>Date:</strong> {new Date(selectedPurchase.purchaseDate).toLocaleDateString()}</p>
                  <p><strong>Supplier:</strong> {selectedPurchase.supplierName || 'N/A'}</p>
                  <p><strong>Amount:</strong> {formatCurrency(selectedPurchase.totalAmount || 0)}</p>
                  <p><strong>Items:</strong> {selectedPurchase.items?.length || 0}</p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for reversal *
                </label>
                <textarea
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  placeholder="Please provide a detailed reason for reversing this purchase..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowReverseModal(false);
                    setSelectedPurchase(null);
                    setReverseReason('');
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReversePurchase}
                  disabled={processing || !reverseReason.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {processing ? 'Processing...' : 'Reverse Purchase'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReversePurchases;