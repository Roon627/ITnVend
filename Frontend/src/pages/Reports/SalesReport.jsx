import React, { useState } from 'react';
import { useSettings } from '../../components/SettingsContext';
import { parseServerTimestamp } from './utils';

const SalesReport = ({ data, invoices = [], dateRange, onExport, lastUpdated }) => {
  const { formatCurrency } = useSettings();
  const [reportType, setReportType] = useState('day-end');

  const buildExportRows = (rows) => {
    return rows.map((inv) => ({
      id: inv.id || inv.invoice_number || '',
      date: (parseServerTimestamp(inv.created_at) || '').toISOString?.() || inv.created_at || '',
      type: inv.type || '',
      status: inv.status || '',
      total: inv.total ?? '',
      customer_name: inv.customer?.name || inv.customer_name || '',
      customer_email: inv.customer?.email || inv.customer_email || ''
    }));
  };

  const handleExport = () => {
    let start;
    let end;
    if (reportType === 'day-end') {
      start = new Date(`${dateRange.start_date}T00:00:00Z`);
      end = new Date(`${dateRange.start_date}T23:59:59.999Z`);
    } else if (reportType === 'monthly') {
      const ref = dateRange?.start_date ? new Date(`${dateRange.start_date}T00:00:00Z`) : new Date();
      start = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1, 0, 0, 0));
      end = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 0, 23, 59, 59, 999));
    } else {
      start = new Date(`${dateRange.start_date}T00:00:00Z`);
      end = new Date(`${dateRange.end_date}T23:59:59.999Z`);
    }

    const rows = invoices.filter((inv) => {
      const d = parseServerTimestamp(inv.created_at);
      return d && d >= start && d <= end;
    });

    const exportRows = buildExportRows(rows);
    const filename = `sales-report-${reportType}-${(start.toISOString().split('T')[0]||'')}.csv`;
    onExport(exportRows, filename);
  };

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
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Export:</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="border rounded px-2 py-1 text-sm">
              <option value="day-end">Day end (selected day)</option>
              <option value="monthly">Monthly (selected month)</option>
              <option value="custom-range">Custom range</option>
            </select>
            <button onClick={handleExport} className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-3 rounded" type="button">Export</button>
          </div>
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

export default SalesReport;
