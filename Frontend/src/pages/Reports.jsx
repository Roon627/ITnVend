import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useSettings } from '../components/SettingsContext';

// Components split into modules for lighter renders
import SalesReport from './reports/SalesReport';
import InventoryReport from './reports/InventoryReport';
import CustomerReport from './reports/CustomerReport';
import FinancialReports from './reports/FinancialReports';

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
  const [salesInvoices, setSalesInvoices] = useState([]);
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
      setSalesInvoices(filteredInvoices);
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
              {activeTab === 'sales' && <SalesReport data={salesReport} invoices={salesInvoices} dateRange={dateRange} onExport={exportToCSV} lastUpdated={salesLastUpdated} />}
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

// components moved to modules to reduce bundle size and simplify maintenance

export default Reports;