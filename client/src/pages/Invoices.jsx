import { useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

const STATUS_OPTIONS = {
  invoice: [
    { value: 'issued', label: 'Issued' },
    { value: 'paid', label: 'Paid' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  quote: [
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
};

const STATUS_BADGE_CLASSES = {
  issued: 'bg-slate-100 text-slate-700',
  paid: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
};

const STATUS_LABELS = {
  issued: 'Issued',
  paid: 'Paid',
  cancelled: 'Cancelled',
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
};

export default function Invoices() {
  const { push } = useToast();
  const { formatCurrency, settings: globalSettings } = useSettings();

  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [showBuilder, setShowBuilder] = useState(false);
  const [builderType, setBuilderType] = useState('invoice');
  const [builderProducts, setBuilderProducts] = useState([]);
  const [builderCustomers, setBuilderCustomers] = useState([]);
  const [builderSelectedCustomer, setBuilderSelectedCustomer] = useState('');
  const [builderCart, setBuilderCart] = useState([]);
  const [builderSearch, setBuilderSearch] = useState('');
  const [builderSaving, setBuilderSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [convertingId, setConvertingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [outletFilter, setOutletFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [outlets, setOutlets] = useState([]);
  const [savedViews, setSavedViews] = useState([]);

  useEffect(() => {
    loadInvoices();
  }, []);

  useEffect(() => {
    // load outlets for filter dropdown
    (async () => {
      try {
        const list = await api.get('/outlets');
        setOutlets(list || []);
      } catch (err) {
        console.debug('Failed to load outlets', err);
      }
    })();

    // load saved views from localStorage
    try {
      const raw = localStorage.getItem('invoice_views');
      if (raw) setSavedViews(JSON.parse(raw));
    } catch (err) {
      console.debug('Failed to parse saved views', err);
    }
  }, []);

  const loadInvoices = async () => {
    try {
      const list = await api.get('/invoices');
      setInvoices(list);
    } catch (err) {
      console.error(err);
      push('Failed to load invoices', 'error');
    }
  };

  const handleDelete = async (invoiceId) => {
    if (!confirm('Delete this record? This cannot be undone.')) return;
    try {
      await api.del(`/invoices/${invoiceId}`);
      push('Invoice removed', 'info');
      loadInvoices();
    } catch (err) {
      console.error(err);
      push('Unable to delete invoice', 'error');
    }
  };

  const openBuilder = async (mode) => {
    setBuilderType(mode);
    setBuilderCart([]);
    setBuilderSearch('');
    setBuilderSaving(false);
    setShowBuilder(true);

    try {
      const [productsRes, customersRes] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
      ]);
      setBuilderProducts(productsRes);
      setBuilderCustomers(customersRes);
      if (customersRes.length > 0) {
        setBuilderSelectedCustomer(customersRes[0].id);
      }
    } catch (err) {
      console.error(err);
      push('Failed to prepare builder', 'error');
    }
  };

  const builderFilteredProducts = useMemo(() => {
    return builderProducts.filter((product) =>
      product.name.toLowerCase().includes(builderSearch.toLowerCase())
    );
  }, [builderProducts, builderSearch]);

  const addBuilderItem = (product) => {
    if (product.stock <= 0 && builderType === 'invoice') {
      push('Out of stock for invoice', 'error');
      return;
    }
    setBuilderCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const decrementBuilderItem = (productId) => {
    setBuilderCart((prev) => {
      const existing = prev.find((item) => item.id === productId);
      if (!existing) return prev;
      if (existing.quantity === 1) {
        return prev.filter((item) => item.id !== productId);
      }
      return prev.map((item) =>
        item.id === productId ? { ...item, quantity: item.quantity - 1 } : item
      );
    });
  };

  const builderSubtotal = builderCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const builderGstRate = globalSettings?.outlet?.gst_rate ?? globalSettings?.gst_rate ?? 0;
  const builderTax = builderSubtotal * (builderGstRate / 100);
  const builderTotal = builderSubtotal + builderTax;

  const submitBuilder = async () => {
    if (!builderSelectedCustomer || builderCart.length === 0) {
      push('Pick a customer and add items first', 'error');
      return;
    }

    setBuilderSaving(true);
    try {
      await api.post('/invoices', {
        customerId: Number(builderSelectedCustomer),
        items: builderCart,
        type: builderType,
      });
      push(builderType === 'invoice' ? 'Invoice created' : 'Quote created', 'info');
      setShowBuilder(false);
      loadInvoices();
    } catch (err) {
      console.error(err);
      push('Failed to save record', 'error');
    } finally {
      setBuilderSaving(false);
    }
  };

  const parseErrorMessage = (error, fallback) => {
    const raw = error?.message || fallback;
    if (!raw) return fallback;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) return parsed.error;
      if (parsed?.message) return parsed.message;
    } catch (parseErr) {
      console.debug('Failed to parse error payload', parseErr);
    }
    return raw.replace(/"/g, '');
  };

  const formatStatusLabel = (status) => STATUS_LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—');

  const handleStatusChange = async (invoice, nextStatus) => {
    if (!nextStatus || nextStatus === invoice.status) return;
    setStatusUpdatingId(invoice.id);
    try {
      await api.put(`/invoices/${invoice.id}/status`, { status: nextStatus });
      push(`Status updated to ${formatStatusLabel(nextStatus)}`, 'info');
      await loadInvoices();
    } catch (err) {
      console.error(err);
      push(parseErrorMessage(err, 'Failed to update status'), 'error');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleConvertQuote = async (invoice) => {
    if (invoice.type !== 'quote') return;
    if (!confirm('Convert this quote into an invoice?')) return;
    setConvertingId(invoice.id);
    try {
      await api.put(`/invoices/${invoice.id}/convert`, {});
      push('Quote converted to invoice', 'info');
      await loadInvoices();
    } catch (err) {
      console.error(err);
      push(parseErrorMessage(err, 'Failed to convert quote'), 'error');
    } finally {
      setConvertingId(null);
    }
  };

  const toggleSelectId = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (list) => {
    if (!selectAll) {
      // select visible invoices
      const ids = new Set(list.map((i) => i.id));
      setSelectedIds(ids);
      setSelectAll(true);
    } else {
      setSelectedIds(new Set());
      setSelectAll(false);
    }
  };

  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) {
      push('No invoices selected', 'error');
      return;
    }
    if (!bulkStatus) {
      push('Pick a status to apply', 'error');
      return;
    }
    if (!confirm(`Apply status "${bulkStatus}" to ${selectedIds.size} documents?`)) return;
    setBulkProcessing(true);
    try {
      // call status endpoint for each id sequentially to keep server load predictable
      for (const id of Array.from(selectedIds)) {
        try {
          await api.put(`/invoices/${id}/status`, { status: bulkStatus });
        } catch (err) {
          console.error('Bulk status update failed for', id, err);
        }
      }
      push('Bulk status update finished', 'info');
      await loadInvoices();
      setSelectedIds(new Set());
      setSelectAll(false);
      setBulkStatus('');
    } finally {
      setBulkProcessing(false);
    }
  };

  const bulkDownloadPdfs = async () => {
    if (selectedIds.size === 0) {
      push('No invoices selected', 'error');
      return;
    }
    if (!confirm(`Open PDF for ${selectedIds.size} documents in new tabs?`)) return;
    
    for (const id of Array.from(selectedIds)) {
      try {
        const linkResp = await api.post(`/invoices/${id}/pdf-link`);
        window.open(linkResp.url, '_blank');
      } catch (err) {
        push(`Failed to open PDF for invoice ${id}`, 'error');
      }
    }
  };

  const saveCurrentView = () => {
    const name = prompt('Name this view');
    if (!name) return;
    const view = {
      id: Date.now(),
      name,
      filters: { searchTerm, typeFilter, statusFilter, outletFilter, dateFrom, dateTo }
    };
    const next = [view, ...savedViews].slice(0, 12);
    setSavedViews(next);
    try {
      localStorage.setItem('invoice_views', JSON.stringify(next));
      push('View saved', 'info');
    } catch (err) {
      console.error('Failed to save view', err);
      push('Failed to save view', 'error');
    }
  };

  const loadView = (view) => {
    if (!view) return;
    setSearchTerm(view.filters.searchTerm || '');
    setTypeFilter(view.filters.typeFilter || 'all');
    setStatusFilter(view.filters.statusFilter || 'all');
    setOutletFilter(view.filters.outletFilter || 'all');
    setDateFrom(view.filters.dateFrom || '');
    setDateTo(view.filters.dateTo || '');
  };

  const deleteView = (id) => {
    if (!confirm('Delete this saved view?')) return;
    const next = savedViews.filter((v) => v.id !== id);
    setSavedViews(next);
    try { localStorage.setItem('invoice_views', JSON.stringify(next)); } catch (err) { console.debug(err); }
  };

  const exportCsv = () => {
    if (!filteredInvoices || filteredInvoices.length === 0) {
      push('No rows to export', 'error');
      return;
    }
    const rows = filteredInvoices.map((r) => ({
      id: r.id,
      type: r.type,
      customer: r.customer_name || '',
      date: r.created_at,
      total: r.total,
      status: r.status || '',
      outlet: r.outlet_name || ''
    }));
    const header = Object.keys(rows[0]);
    const csv = [header.join(',')].concat(rows.map((r) => header.map((h) => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoices_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    push('CSV exported', 'info');
  };

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      const matchesSearch =
        (invoice.customer_name && invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        String(invoice.id).includes(searchTerm);
      const matchesType = typeFilter === 'all' ? true : invoice.type === typeFilter;
      const matchesStatus = statusFilter === 'all' ? true : (invoice.status || '') === statusFilter;
      const matchesOutlet = outletFilter === 'all' ? true : (invoice.outlet_name || '') === outletFilter;

      let matchesDate = true;
      if (dateFrom) {
        const from = new Date(dateFrom);
        const created = new Date(invoice.created_at);
        if (created < from) matchesDate = false;
      }
      if (dateTo) {
        const to = new Date(dateTo);
        const created = new Date(invoice.created_at);
        // include the whole day for to
        to.setHours(23, 59, 59, 999);
        if (created > to) matchesDate = false;
      }
      return matchesSearch && matchesType;
    });
  }, [invoices, searchTerm, typeFilter]);

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Invoices &amp; Quotes</h1>
          <p className="text-sm text-gray-500">Manage billing documents, convert sales instantly, or issue formal quotations.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => openBuilder('invoice')}
            className="px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700"
          >
            New Invoice
          </button>
          <button
            onClick={() => openBuilder('quote')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700"
          >
            New Quote
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search by customer or ID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full md:w-72 px-4 py-2 border rounded-lg shadow-sm"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="w-full md:w-48 px-3 py-2 border rounded-lg"
        >
          <option value="all">All Documents</option>
          <option value="invoice">Invoices</option>
          <option value="quote">Quotes</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-full md:w-48 px-3 py-2 border rounded-lg"
        >
          <option value="all">Any Status</option>
          {Object.keys(STATUS_LABELS).map((s) => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>

        <select
          value={outletFilter}
          onChange={(e) => setOutletFilter(e.target.value)}
          className="w-full md:w-56 px-3 py-2 border rounded-lg"
        >
          <option value="all">Any Outlet</option>
          {outlets.map((o) => (
            <option key={o.id} value={o.name}>{o.name}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border rounded px-2 py-1" />
          <span className="text-sm text-gray-400">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border rounded px-2 py-1" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => saveCurrentView && saveCurrentView()} className="px-3 py-1 border rounded text-sm">Save View</button>
          <button onClick={() => exportCsv && exportCsv()} className="px-3 py-1 bg-gray-100 rounded text-sm">Export CSV</button>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleSelectAll(filteredInvoices)}
            className="px-3 py-1 border rounded bg-white text-sm"
          >
            {selectAll ? 'Unselect all' : 'Select visible'}
          </button>

          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            disabled={bulkProcessing}
          >
            <option value="">Bulk set status…</option>
            <optgroup label="Invoice">
              {STATUS_OPTIONS.invoice.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
            <optgroup label="Quote">
              {STATUS_OPTIONS.quote.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </optgroup>
          </select>
          <button onClick={applyBulkStatus} className="px-3 py-1 bg-blue-600 text-white rounded text-sm" disabled={bulkProcessing}>
            {bulkProcessing ? 'Applying…' : 'Apply'}
          </button>

          <button onClick={bulkDownloadPdfs} className="px-3 py-1 border rounded text-sm">
            Download PDFs
          </button>
        </div>
        <div className="text-sm text-gray-500">{selectedIds.size} selected</div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-4">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={() => toggleSelectAll(filteredInvoices)}
                />
              </th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="p-4 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Outlet</th>
              <th className="p-4 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredInvoices.map((invoice) => {
              const docType = invoice.type === 'quote' ? 'quote' : 'invoice';
              const statusOptions = STATUS_OPTIONS[docType] || [];
              const statusBadgeClass = STATUS_BADGE_CLASSES[invoice.status] || 'bg-gray-100 text-gray-600';
              return (
                <tr key={invoice.id} className="hover:bg-gray-50">
                  <td className="p-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(invoice.id)}
                      onChange={() => toggleSelectId(invoice.id)}
                    />
                  </td>
                  <td className="p-4 whitespace-nowrap font-medium text-gray-900">#{invoice.id}</td>
                  <td className="p-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                        invoice.type === 'quote' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {invoice.type || 'invoice'}
                    </span>
                  </td>
                  <td className="p-4 whitespace-nowrap">{invoice.customer_name || '—'}</td>
                  <td className="p-4 whitespace-nowrap text-sm text-gray-500">{new Date(invoice.created_at).toLocaleDateString()}</td>
                  <td className="p-4 whitespace-nowrap font-semibold">{formatCurrency(invoice.total)}</td>
                  <td className="p-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase ${statusBadgeClass}`}>
                        {formatStatusLabel(invoice.status)}
                      </span>
                      <select
                        value={invoice.status || ''}
                        onChange={(e) => handleStatusChange(invoice, e.target.value)}
                        className="border rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        disabled={statusUpdatingId === invoice.id}
                      >
                        {(!invoice.status || invoice.status === '') && <option value="">Set status…</option>}
                        {statusOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {statusUpdatingId === invoice.id && (
                        <span className="text-[10px] uppercase tracking-wide text-gray-400">Updating…</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 whitespace-nowrap text-sm text-gray-500">{invoice.outlet_name || '—'}</td>
                  <td className="p-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={async () => {
                          try {
                            const linkResp = await api.post(`/invoices/${invoice.id}/pdf-link`);
                            window.open(linkResp.url, '_blank');
                          } catch (err) {
                            push('Failed to open PDF', 'error');
                          }
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        PDF
                      </button>
                      {invoice.type === 'quote' && (
                        <button
                          onClick={() => handleConvertQuote(invoice)}
                          className="text-green-600 hover:underline disabled:text-gray-400"
                          disabled={convertingId === invoice.id}
                        >
                          {convertingId === invoice.id ? 'Converting…' : 'Convert'}
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(invoice.id)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredInvoices.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">No records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showBuilder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-xl font-semibold">{builderType === 'invoice' ? 'Create Invoice' : 'Create Quote'}</h2>
                <p className="text-sm text-gray-500">Select a customer and add products to build the document.</p>
              </div>
              <button onClick={() => setShowBuilder(false)} className="text-gray-500 hover:text-gray-700 text-lg">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Search products..."
                    value={builderSearch}
                    onChange={(e) => setBuilderSearch(e.target.value)}
                    className="flex-1 border rounded px-3 py-2"
                  />
                  <div className="text-sm text-gray-500">{builderProducts.length} products</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {builderFilteredProducts.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addBuilderItem(product)}
                      type="button"
                      className={`border rounded-lg p-4 text-left hover:shadow transition ${
                        product.stock > 0 || builderType === 'quote' ? 'bg-white' : 'bg-gray-100 cursor-not-allowed'
                      }`}
                      disabled={product.stock <= 0 && builderType === 'invoice'}
                    >
                      <div className="font-semibold text-gray-800">{product.name}</div>
                      <div className="text-sm text-gray-500 mb-2">{product.category} &gt; {product.subcategory}</div>
                      <div className="flex justify-between text-sm">
                        <span>{formatCurrency(product.price)}</span>
                        <span className={product.stock > 5 ? 'text-green-600' : 'text-red-600'}>
                          {product.stock} in stock
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg border p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Customer</label>
                  <select
                    value={builderSelectedCustomer}
                    onChange={(e) => setBuilderSelectedCustomer(e.target.value)}
                    className="mt-1 block w-full border rounded px-3 py-2"
                  >
                    {builderCustomers.map((customer) => (
                      <option key={customer.id} value={customer.id}>{customer.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {builderCart.length === 0 && <p className="text-center text-gray-500 text-sm">No items yet</p>}
                  {builderCart.map((item) => (
                    <div key={item.id} className="bg-white border rounded-md p-3">
                      <div className="font-semibold text-sm">{item.name}</div>
                      <div className="flex items-center justify-between text-sm text-gray-500 mt-1">
                        <span>{formatCurrency(item.price)} × {item.quantity}</span>
                        <button onClick={() => decrementBuilderItem(item.id)} className="text-red-500 hover:underline text-xs">Remove</button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatCurrency(builderSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-500">
                    <span>Tax ({builderGstRate}%)</span>
                    <span>{formatCurrency(builderTax)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-base">
                    <span>Total</span>
                    <span>{formatCurrency(builderTotal)}</span>
                  </div>
                </div>

                <button
                  onClick={submitBuilder}
                  disabled={builderSaving}
                  className="w-full bg-blue-600 text-white px-4 py-2 rounded-md font-semibold hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {builderSaving ? 'Saving…' : builderType === 'invoice' ? 'Create Invoice' : 'Create Quote'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
