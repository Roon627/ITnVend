import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useSettings } from '../components/SettingsContext';

// Helper: normalize server timestamps into a Date object robustly.
// - Accepts ISO strings, 'YYYY-MM-DD HH:MM:SS', 'YYYY-MM-DD', timestamps, or Date objects.
// - If the server returns naive local timestamps like '2024-01-02 15:04:05', we treat
//   them as UTC by converting to '2024-01-02T15:04:05Z' to avoid local timezone parsing issues.
function parseServerTimestamp(ts) {
  if (!ts) return null;
  if (ts instanceof Date) return ts;
  // numbers (epoch ms)
  if (typeof ts === 'number') return new Date(ts);
  const s = String(ts).trim();
  // YYYY-MM-DD HH:MM:SS
  const reDateTime = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/;
  const reDateOnly = /^\d{4}-\d{2}-\d{2}$/;
  try {
    if (reDateTime.test(s)) {
      return new Date(s.replace(' ', 'T') + 'Z');
    }
    if (reDateOnly.test(s)) {
      return new Date(s + 'T00:00:00Z');
    }
    // Fallback — let Date parse (works for ISO strings including timezone)
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  } catch (err) {
    // fall through
  }
  return null;
}

const Reports = () => {
  const { formatCurrency } = useSettings();
  const [activeTab, setActiveTab] = useState('sales');
  const [salesReport, setSalesReport] = useState({});
  const [inventoryReport, setInventoryReport] = useState([]);
  const [customerReport, setCustomerReport] = useState([]);
  const [financialReports, setFinancialReports] = useState({});
  const [salesLastUpdated, setSalesLastUpdated] = useState(null);
  const [inventoryLastUpdated, setInventoryLastUpdated] = useState(null);
  const [customersLastUpdated, setCustomersLastUpdated] = useState(null);
  const [financialLastUpdated, setFinancialLastUpdated] = useState(null);
  const [dateRange, setDateRange] = useState({
    start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadReport();
  }, [activeTab, dateRange]);

  // Poll the active report periodically to provide near-real-time updates.
  // Skip polling when the document is hidden or a load is already in progress.
  useEffect(() => {
    const POLL_INTERVAL = 30000; // 30s
    const tick = async () => {
      if (document.hidden) return;
      if (loading) return;
      try {
        switch (activeTab) {
          case 'sales':
            await loadSalesReport();
            break;
          case 'inventory':
            await loadInventoryReport();
            break;
          case 'customers':
            await loadCustomerReport();
            break;
          case 'financial':
            await loadFinancialReports();
            break;
          default:
            break;
        }
      } catch (err) {
        // swallow errors here; loadReport handles logging during user-triggered loads
        console.debug('Polling load failed', err);
      }
    };

    const id = setInterval(tick, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [activeTab, dateRange, loading]);

  const loadReport = async () => {
    setLoading(true);
    try {
      switch (activeTab) {
        case 'sales':
          await loadSalesReport();
          break;
        case 'inventory':
          await loadInventoryReport();
          break;
        case 'customers':
          await loadCustomerReport();
          break;
        case 'financial':
          await loadFinancialReports();
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSalesReport = async () => {
    try {
      const [invoices, products] = await Promise.all([
        api.get('/api/invoices'),
        api.get('/api/products')
      ]);

      // Filter invoices by date range (inclusive end-of-day)
      const start = new Date(`${dateRange.start_date}T00:00:00`);
      const end = new Date(`${dateRange.end_date}T23:59:59.999`);
      const filteredInvoices = invoices.filter((invoice) => {
        const invoiceDate = parseServerTimestamp(invoice.created_at);
        if (!invoiceDate) return false;
        return invoiceDate >= start && invoiceDate <= end;
      });

      // Calculate sales metrics
      const totalSales = filteredInvoices
        .filter(inv => inv.type === 'invoice')
        .reduce((sum, inv) => sum + inv.total, 0);

      const totalQuotes = filteredInvoices
        .filter(inv => inv.type === 'quote')
        .reduce((sum, inv) => sum + inv.total, 0);

      const paidInvoices = filteredInvoices
        .filter(inv => inv.type === 'invoice' && inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);

      const outstandingInvoices = filteredInvoices
        .filter(inv => inv.type === 'invoice' && inv.status !== 'paid')
        .reduce((sum, inv) => sum + inv.total, 0);

      // Group sales by product
      const productSales = {};
      for (const invoice of filteredInvoices.filter(inv => inv.type === 'invoice')) {
        // Note: This would need actual invoice_items data to be accurate
        // For now, we'll show basic invoice totals
      }

      setSalesReport({
        totalSales,
        totalQuotes,
        paidInvoices,
        outstandingInvoices,
        invoiceCount: filteredInvoices.filter(inv => inv.type === 'invoice').length,
        quoteCount: filteredInvoices.filter(inv => inv.type === 'quote').length,
        productSales
      });
      setSalesLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading sales report:', error);
    }
  };

  const loadInventoryReport = async () => {
    try {
      const products = await api.get('/api/products');
      const categories = await api.get('/api/products/categories');

      // Calculate inventory metrics
      const totalProducts = products.length;
      const totalValue = products.reduce((sum, product) => sum + (product.price * product.stock), 0);
      const lowStockItems = products.filter(product => product.stock < 10);
      const outOfStockItems = products.filter(product => product.stock === 0);

      // Group by category
      const categoryStats = {};
      for (const product of products) {
        const category = product.category || 'Uncategorized';
        if (!categoryStats[category]) {
          categoryStats[category] = {
            count: 0,
            totalValue: 0,
            totalStock: 0
          };
        }
        categoryStats[category].count++;
        categoryStats[category].totalValue += product.price * product.stock;
        categoryStats[category].totalStock += product.stock;
      }

      setInventoryReport({
        products,
        totalProducts,
        totalValue,
        lowStockItems,
        outOfStockItems,
        categoryStats
      });
      setInventoryLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading inventory report:', error);
    }
  };

  const loadCustomerReport = async () => {
    try {
      const customers = await api.get('/api/customers');

      // Get customer invoice data
      const customerStats = await Promise.all(
        customers.map(async (customer) => {
          try {
            const invoices = await api.get(`/api/customers/${customer.id}/invoices`);
            const totalSpent = invoices
              .filter(inv => inv.type === 'invoice')
              .reduce((sum, inv) => sum + inv.total, 0);
            const invoiceCount = invoices.filter(inv => inv.type === 'invoice').length;
            const lastPurchase = invoices.length > 0
              ? (() => {
                  const dates = invoices
                    .map(inv => parseServerTimestamp(inv.created_at))
                    .filter(Boolean)
                    .map(d => d.getTime());
                  return dates.length ? new Date(Math.max(...dates)) : null;
                })()
              : null;

            return {
              ...customer,
              totalSpent,
              invoiceCount,
              lastPurchase,
              averageOrderValue: invoiceCount > 0 ? totalSpent / invoiceCount : 0
            };
          } catch (error) {
            return {
              ...customer,
              totalSpent: 0,
              invoiceCount: 0,
              lastPurchase: null,
              averageOrderValue: 0
            };
          }
        })
      );

      setCustomerReport(customerStats);
      setCustomersLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading customer report:', error);
    }
  };

  const loadFinancialReports = async () => {
    try {
      const [trialBalance, balanceSheet, profitLoss] = await Promise.all([
        api.get('/api/accounts/reports/trial-balance'),
        api.get('/api/accounts/reports/balance-sheet'),
        api.get('/api/accounts/reports/profit-loss', {
          params: {
            start_date: dateRange.start_date,
            end_date: dateRange.end_date
          }
        })
      ]);

      setFinancialReports({
        trialBalance,
        balanceSheet,
        profitLoss
      });
      setFinancialLastUpdated(new Date());
    } catch (error) {
      console.error('Error loading financial reports:', error);
    }
  };

  const exportToCSV = (data, filename) => {
    if (!data || data.length === 0) return;

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row =>
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value || '';
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const tabs = [
    { id: 'sales', label: 'Sales Reports', icon: '📊' },
    { id: 'inventory', label: 'Inventory Reports', icon: '📦' },
    { id: 'customers', label: 'Customer Reports', icon: '👥' },
    { id: 'financial', label: 'Financial Reports', icon: '💰' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
            <div className="flex space-x-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input
                  type="date"
                  value={dateRange.start_date}
                  onChange={(e) => setDateRange({...dateRange, start_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input
                  type="date"
                  value={dateRange.end_date}
                  onChange={(e) => setDateRange({...dateRange, end_date: e.target.value})}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Navigation Tabs */}
        <div className="mb-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="bg-white shadow rounded-lg">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading report...</p>
            </div>
          ) : (
            <div className="p-6">
              {activeTab === 'sales' && <SalesReport data={salesReport} onExport={exportToCSV} lastUpdated={salesLastUpdated} />}
              {activeTab === 'inventory' && <InventoryReport data={inventoryReport} onExport={exportToCSV} lastUpdated={inventoryLastUpdated} />}
              {activeTab === 'customers' && <CustomerReport data={customerReport} onExport={exportToCSV} lastUpdated={customersLastUpdated} />}
              {activeTab === 'financial' && <FinancialReports data={financialReports} onExport={exportToCSV} lastUpdated={financialLastUpdated} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Sales Report Component
const SalesReport = ({ data, onExport, lastUpdated }) => {
  const { formatCurrency } = useSettings();
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Sales Report</h2>
        <div className="flex items-end gap-4">
          {lastUpdated && (
            <div className="text-xs text-gray-500 mr-2" aria-live="polite">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </div>
          )}
          <button
            onClick={() => onExport([data], 'sales-report.csv')}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Sales</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(data.totalSales || 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-xl">📄</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Total Invoices</p>
              <p className="text-2xl font-bold text-green-900">{data.invoiceCount || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-xl">⏳</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Outstanding</p>
              <p className="text-2xl font-bold text-yellow-900">{formatCurrency(data.outstandingInvoices || 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-purple-500 rounded-lg">
              <span className="text-white text-xl">📝</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Total Quotes</p>
              <p className="text-2xl font-bold text-purple-900">{formatCurrency(data.totalQuotes || 0)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Sales Summary</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Invoice Status</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Paid Invoices:</span>
                <span className="font-semibold">{formatCurrency(data.paidInvoices || 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Outstanding Invoices:</span>
                <span className="font-semibold">{formatCurrency(data.outstandingInvoices || 0)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Document Counts</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span>Total Invoices:</span>
                <span className="font-semibold">{data.invoiceCount || 0}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Quotes:</span>
                <span className="font-semibold">{data.quoteCount || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Inventory Report Component
const InventoryReport = ({ data, onExport }) => {
  const { formatCurrency } = useSettings();
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Inventory Report</h2>
        <button
          onClick={() => onExport(data.products || [], 'inventory-report.csv')}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          type="button"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-xl">📦</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Products</p>
              <p className="text-2xl font-bold text-blue-900">{data.totalProducts || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Total Value</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(data.totalValue || 0)}</p>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-xl">⚠️</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Low Stock Items</p>
              <p className="text-2xl font-bold text-yellow-900">{data.lowStockItems?.length || 0}</p>
            </div>
          </div>
        </div>
        <div className="bg-red-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-red-500 rounded-lg">
              <span className="text-white text-xl">❌</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-red-600">Out of Stock</p>
              <p className="text-2xl font-bold text-red-900">{data.outOfStockItems?.length || 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Inventory by Category</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Value
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(data.categoryStats || {}).map(([category, stats]) => (
                <tr key={category}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {category}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stats.count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stats.totalStock}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(stats.totalValue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-semibold mb-4">Low Stock Alert</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Product Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Current Stock
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data.lowStockItems?.map((product) => (
                <tr key={product.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {product.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {product.stock}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(product.price)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      product.stock === 0
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {product.stock === 0 ? 'Out of Stock' : 'Low Stock'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// Customer Report Component
const CustomerReport = ({ data, onExport }) => {
  const { formatCurrency } = useSettings();
  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Customer Report</h2>
        <button
          onClick={() => onExport(data, 'customer-report.csv')}
          className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          type="button"
        >
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-blue-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg">
              <span className="text-white text-xl">👥</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-blue-600">Total Customers</p>
              <p className="text-2xl font-bold text-blue-900">{data.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-green-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-green-500 rounded-lg">
              <span className="text-white text-xl">💰</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-green-600">Total Revenue</p>
              <p className="text-2xl font-bold text-green-900">
                {formatCurrency(data.reduce((sum, customer) => sum + customer.totalSpent, 0))}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-yellow-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-500 rounded-lg">
              <span className="text-white text-xl">📊</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-yellow-600">Active Customers</p>
              <p className="text-2xl font-bold text-yellow-900">
                {data.filter(customer => customer.invoiceCount > 0).length}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-purple-50 p-6 rounded-lg">
          <div className="flex items-center">
            <div className="p-2 bg-purple-500 rounded-lg">
              <span className="text-white text-xl">📈</span>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-purple-600">Avg Order Value</p>
              <p className="text-2xl font-bold text-purple-900">
                {formatCurrency(data.length > 0 ? (data.reduce((sum, customer) => sum + customer.averageOrderValue, 0) / data.length) : 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Customer Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Spent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Invoice Count
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Avg Order Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Purchase
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((customer) => (
              <tr key={customer.id}>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {customer.name}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(customer.totalSpent)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.invoiceCount}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {formatCurrency(customer.averageOrderValue)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.lastPurchase ? new Date(customer.lastPurchase).toLocaleDateString() : 'Never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Financial Reports Component
const FinancialReports = ({ data, onExport, lastUpdated }) => {
  const { formatCurrency } = useSettings();
  const [activeReport, setActiveReport] = useState('trial-balance');

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Financial Reports</h2>
        <div className="flex space-x-2">
          {lastUpdated && (
            <div className="text-xs text-gray-500 mr-2" aria-live="polite">Last updated: {new Date(lastUpdated).toLocaleString()}</div>
          )}
          <select
            value={activeReport}
            onChange={(e) => setActiveReport(e.target.value)}
            className="border border-gray-300 rounded-md shadow-sm p-2"
          >
            <option value="trial-balance">Trial Balance</option>
            <option value="balance-sheet">Balance Sheet</option>
            <option value="profit-loss">Profit & Loss</option>
          </select>
          <button
            onClick={() => onExport(
              activeReport === 'trial-balance' ? data.trialBalance || [] :
              activeReport === 'balance-sheet' ? [data.balanceSheet?.totals || {}] :
              [data.profitLoss?.totals || {}],
              `${activeReport}-report.csv`
            )}
            className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            Export CSV
          </button>
        </div>
      </div>

      {activeReport === 'trial-balance' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Trial Balance</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Number
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Account Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Debit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Balance
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.trialBalance?.map((account) => (
                  <tr key={account.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {account.account_number}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {account.name}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                      {account.type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.debit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {formatCurrency(account.credit_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(account.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReport === 'balance-sheet' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Balance Sheet</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h4 className="text-lg font-medium mb-4">Assets</h4>
              <div className="space-y-2">
                {data.balanceSheet?.assets?.map((asset) => (
                  <div key={asset.account_number} className="flex justify-between">
                    <span>{asset.name}</span>
                    <span>{formatCurrency(asset.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Assets</span>
                    <span>{formatCurrency(data.balanceSheet?.totals?.assets)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Liabilities & Equity</h4>
              <div className="space-y-2">
                {data.balanceSheet?.liabilities?.map((liability) => (
                  <div key={liability.account_number} className="flex justify-between">
                    <span>{liability.name}</span>
                    <span>{formatCurrency(liability.balance)}</span>
                  </div>
                ))}
                {data.balanceSheet?.equity?.map((equity) => (
                  <div key={equity.account_number} className="flex justify-between">
                    <span>{equity.name}</span>
                    <span>{formatCurrency(equity.balance)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Liabilities & Equity</span>
                    <span>{formatCurrency(data.balanceSheet?.totals?.liabilitiesAndEquity)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeReport === 'profit-loss' && (
        <div>
          <h3 className="text-xl font-semibold mb-4">Profit & Loss Statement</h3>
          <div className="space-y-6">
            <div>
              <h4 className="text-lg font-medium mb-4">Revenue</h4>
              <div className="space-y-2">
                {data.profitLoss?.revenue?.map((rev) => (
                  <div key={rev.account_number} className="flex justify-between">
                    <span>{rev.name}</span>
                    <span>{formatCurrency(rev.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Revenue</span>
                    <span>{formatCurrency(data.profitLoss?.totals?.revenue)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Expenses</h4>
              <div className="space-y-2">
                {data.profitLoss?.expenses?.map((exp) => (
                  <div key={exp.account_number} className="flex justify-between">
                    <span>{exp.name}</span>
                    <span>{formatCurrency(exp.amount)}</span>
                  </div>
                ))}
                <div className="border-t pt-2 font-semibold">
                  <div className="flex justify-between">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(data.profitLoss?.totals?.expenses)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t pt-4">
              <div className="flex justify-between text-xl font-bold">
                <span>Net Income</span>
                <span>{formatCurrency(data.profitLoss?.totals?.netIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;