import { useEffect, useMemo, useState } from 'react';
import { useWebSocketRoom, useWebSocketEvent } from '../hooks/useWebSocket';
import { FaTh, FaList } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import InvoiceEditModal from '../components/InvoiceEditModal';
import { useAuth } from '../components/AuthContext';

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
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canManageTransactions = userRole === 'admin' || userRole === 'accounts';

  const [invoices, setInvoices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [showBuilder, setShowBuilder] = useState(false);
  // help moved to central Help page; keep a small link here instead
  const [shiftStartedAt, setShiftStartedAt] = useState(() => {
    try { return localStorage.getItem('pos_shift_started_at') || ''; } catch (e) { return ''; }
  });
  // try to sync active shift from server when the page loads
  useEffect(() => {
    (async () => {
      try {
        const active = await api.get('/shifts/active');
        if (active && active.started_at) {
          setShiftStartedAt(active.started_at);
          try { localStorage.setItem('pos_shift_started_at', active.started_at); } catch (e) {}
        }
      } catch (err) {
        // ignore: keep localStorage fallback
        console.debug('Failed to sync active shift on invoices page', err?.message || err);
      }
    })();
  }, []);

  // Join outlet room and listen for shift events so invoice header badge updates in real-time
  const outletId = globalSettings?.outlet?.id;
  useWebSocketRoom(outletId ? `outlet:${outletId}` : null, !!outletId);

  useWebSocketEvent('shift.started', (payload) => {
    try {
      const shift = payload?.shift;
      if (!shift) return;
      const started = shift.started_at || new Date().toISOString();
      try { localStorage.setItem('pos_shift_started_at', started); } catch (e) {}
      setShiftStartedAt(started);
      push('Shift started', 'info');
    } catch (e) {
      console.debug('Failed to handle shift.started on invoices', e);
    }
  });

  useWebSocketEvent('shift.stopped', (payload) => {
    try {
      const shift = payload?.shift;
      if (!shift) return;
      // clear local marker if it matches current marker
      const current = localStorage.getItem('pos_shift_id');
      if (current && String(current) === String(shift.id)) {
        try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch (e) {}
        setShiftStartedAt('');
      }
      push('Shift closed', 'info');
    } catch (e) {
      console.debug('Failed to handle shift.stopped on invoices', e);
    }
  });
  // format a short relative label for shift badge
  const formatShiftRelative = (iso) => {
    if (!iso) return '';
    try {
      const then = new Date(iso).getTime();
      const now = Date.now();
      const mins = Math.floor((now - then) / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return `${mins}m ago`;
      if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
      return `${Math.floor(mins / 1440)}d ago`;
    } catch (e) {
      return '';
    }
  };
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
  const [editingInvoiceId, setEditingInvoiceId] = useState(null);
  // Use a global UI preference key so the view mode can be shared across pages
  const UI_VIEW_KEY = 'ui_view_mode';
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(UI_VIEW_KEY) || 'table';
    } catch (e) {
      return 'table';
    }
  }); // 'table' or 'cards'

  // persist view preference globally
  useEffect(() => {
    try {
      localStorage.setItem(UI_VIEW_KEY, viewMode);
    } catch (e) {
      // ignore
    }
  }, [viewMode]);

  const invoiceSummary = useMemo(() => {
    if (!Array.isArray(invoices) || invoices.length === 0) {
      return {
        invoiceCount: 0,
        invoiceTotal: 0,
        outstanding: 0,
        quoteCount: 0,
        quoteTotal: 0,
        acceptedQuoteTotal: 0,
        acceptedQuoteCount: 0,
        monthRevenue: 0,
      };
    }
    const invoiceDocs = invoices.filter((doc) => doc.type !== 'quote');
    const quoteDocs = invoices.filter((doc) => doc.type === 'quote');
    const invoiceTotal = invoiceDocs.reduce((sum, doc) => sum + (Number(doc.total) || 0), 0);
    const outstanding = invoiceDocs
      .filter((doc) => (doc.status || 'issued') !== 'paid')
      .reduce((sum, doc) => sum + (Number(doc.total) || 0), 0);
    const quoteTotal = quoteDocs.reduce((sum, doc) => sum + (Number(doc.total) || 0), 0);
    const acceptedQuoteDocs = quoteDocs.filter((doc) => (doc.status || '') === 'accepted');
    const acceptedQuoteTotal = acceptedQuoteDocs.reduce((sum, doc) => sum + (Number(doc.total) || 0), 0);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthRevenue = invoiceDocs
      .filter((doc) => doc.created_at && new Date(doc.created_at) >= monthStart)
      .reduce((sum, doc) => sum + (Number(doc.total) || 0), 0);
    return {
      invoiceCount: invoiceDocs.length,
      invoiceTotal,
      outstanding,
      quoteCount: quoteDocs.length,
      quoteTotal,
      acceptedQuoteTotal,
      acceptedQuoteCount: acceptedQuoteDocs.length,
      monthRevenue,
    };
  }, [invoices]);

  const summaryCards = useMemo(
    () => [
      {
        key: 'invoices',
        title: 'Invoices',
        primary: invoiceSummary.invoiceCount,
        secondary: formatCurrency(invoiceSummary.invoiceTotal),
        footnote: `${formatCurrency(invoiceSummary.monthRevenue)} collected this month`,
      },
      {
        key: 'outstanding',
        title: 'Outstanding balance',
        primary: formatCurrency(invoiceSummary.outstanding),
        secondary: `${invoiceSummary.invoiceCount ? Math.round((invoiceSummary.outstanding / (invoiceSummary.invoiceTotal || 1)) * 100) : 0}% of total`,
        footnote: 'Excludes paid invoices',
      },
      {
        key: 'quotes',
        title: 'Quotes in pipeline',
        primary: invoiceSummary.quoteCount,
        secondary: formatCurrency(invoiceSummary.quoteTotal),
        footnote: `${invoiceSummary.acceptedQuoteCount} accepted worth ${formatCurrency(invoiceSummary.acceptedQuoteTotal)}`,
      },
      {
        key: 'avg',
        title: 'Average document value',
        primary: invoiceSummary.invoiceCount + invoiceSummary.quoteCount > 0
          ? formatCurrency((invoiceSummary.invoiceTotal + invoiceSummary.quoteTotal) / (invoiceSummary.invoiceCount + invoiceSummary.quoteCount))
          : formatCurrency(0),
        secondary: `${invoiceSummary.invoiceCount + invoiceSummary.quoteCount} documents tracked`,
        footnote: 'Across invoices and quotes',
      },
    ],
    [invoiceSummary, formatCurrency]
  );

  const typeChips = useMemo(
    () => [
      { value: 'all', label: 'All', count: invoices.length },
      { value: 'invoice', label: 'Invoices', count: invoices.filter((doc) => doc.type !== 'quote').length },
      { value: 'quote', label: 'Quotes', count: invoices.filter((doc) => doc.type === 'quote').length },
    ],
    [invoices]
  );

  const statusCounts = useMemo(() => {
    const counts = {};
    invoices.forEach((doc) => {
      const key = doc.status || (doc.type === 'quote' ? 'draft' : 'issued');
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [invoices]);

  const statusChips = useMemo(() => {
    if (typeFilter === 'invoice') return STATUS_OPTIONS.invoice;
    if (typeFilter === 'quote') return STATUS_OPTIONS.quote;
    const merged = new Map();
    [...STATUS_OPTIONS.invoice, ...STATUS_OPTIONS.quote].forEach((opt) => {
      if (!merged.has(opt.value)) merged.set(opt.value, opt);
    });
    return Array.from(merged.values());
  }, [typeFilter]);

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

  const openInvoiceEditor = (invoiceId) => {
    if (!canManageTransactions) {
      push('You need Admin or Accounts permissions to modify transactions.', 'error');
      return;
    }
    setEditingInvoiceId(invoiceId);
  };

  const handleDelete = async (invoiceId) => {
    if (!canManageTransactions) {
      push('You need Admin or Accounts permissions to delete transactions.', 'error');
      return;
    }
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
    if (!canManageTransactions) {
      push('You need Admin or Accounts permissions to update status.', 'error');
      return;
    }
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
    if (!canManageTransactions) {
      push('You need Admin or Accounts permissions to convert documents.', 'error');
      return;
    }
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

  const resetFilters = () => {
    setSearchTerm('');
    setTypeFilter('all');
    setStatusFilter('all');
    setOutletFilter('all');
    setDateFrom('');
    setDateTo('');
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
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-gray-500">Track billing, monitor outstanding balances, and convert quotes without leaving the console.</p>
            <a href="/help" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 underline">Help</a>
          </div>
        </div>
          <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={() => openBuilder('invoice')}
              className="px-4 py-2 bg-green-600 text-white rounded-md font-semibold hover:bg-green-700"
              title="Open the invoice builder: add products, select customer, and create an invoice"
            >
              New Invoice
            </button>
            <button
              onClick={() => openBuilder('quote')}
              className="px-4 py-2 bg-blue-600 text-white rounded-md font-semibold hover:bg-blue-700"
              title="Open the quote builder: prepare a quote you can send or convert later"
            >
              New Quote
            </button>

            {/* View toggle: table or card (grid) */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2 py-1 rounded-md text-sm font-semibold border flex items-center gap-2 ${viewMode === 'table' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
                title="Show table view"
                aria-pressed={viewMode === 'table'}
                aria-label="Table view"
              >
                <FaList className="inline-block text-sm" />
                <span className="hidden sm:inline">Table</span>
              </button>
              <button
                onClick={() => setViewMode('cards')}
                className={`px-2 py-1 rounded-md text-sm font-semibold border flex items-center gap-2 ${viewMode === 'cards' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}
                title="Show card/grid view"
                aria-pressed={viewMode === 'cards'}
                aria-label="Cards view"
              >
                <FaTh className="inline-block text-sm" />
                <span className="hidden sm:inline">Cards</span>
              </button>
            </div>

            {/* Shift controls have been moved to POS page for convenience — show active shift badge here */}
            {shiftStartedAt ? (
              <div className="px-3 py-2 bg-yellow-50 text-yellow-800 rounded-md text-sm font-medium" aria-live="polite" title={new Date(shiftStartedAt).toLocaleString()}>
                Shift started {formatShiftRelative(shiftStartedAt)}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {/* Help moved to the central Help page — click the link above to open full guidance */}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 mb-6">
        {summaryCards.map((card) => (
          <div key={card.key} className="rounded-lg bg-white shadow-sm border border-gray-100 p-4">
            <div className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-2">{card.title}</div>
            <div className="text-2xl font-bold text-gray-900">{card.primary}</div>
            <div className="text-sm text-blue-600 font-semibold mt-1">{card.secondary}</div>
            <div className="text-xs text-gray-400 mt-2">{card.footnote}</div>
          </div>
        ))}
      </div>

      <div className="bg-white shadow-sm rounded-lg p-4 mb-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {typeChips.map((chip) => (
            <button
              key={chip.value}
              onClick={() => setTypeFilter(chip.value)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${
                typeFilter === chip.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'
              }`}
            >
              {chip.label}
              <span className={`ml-2 text-xs font-semibold ${typeFilter === chip.value ? 'text-blue-100' : 'text-gray-400'}`}>
                {chip.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              statusFilter === 'all' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'border-gray-200 text-gray-600 hover:border-blue-300'
            }`}
          >
            All statuses
            <span className="ml-2 text-[10px] font-semibold text-gray-400">{invoices.length}</span>
          </button>
          {statusChips
            .filter((opt) => statusCounts[opt.value] || statusFilter === opt.value)
            .map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  statusFilter === opt.value ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600 hover:border-blue-300'
                }`}
              >
                {opt.label}
                <span className={`ml-2 text-[10px] font-semibold ${statusFilter === opt.value ? 'text-blue-100' : 'text-gray-400'}`}>
                  {statusCounts[opt.value] || 0}
                </span>
              </button>
            ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Search
            <input
              type="text"
              placeholder="Customer, invoice number, amount..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-2 border rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Outlet
            <select
              value={outletFilter}
              onChange={(e) => setOutletFilter(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">Any outlet</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </label>
        </div>

        {savedViews.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
            <span className="text-xs uppercase tracking-wider text-gray-400 font-semibold">Saved views</span>
            {savedViews.map((view) => (
              <span
                key={view.id}
                className="inline-flex items-center gap-2 bg-gray-100 text-gray-700 px-3 py-1 rounded-full text-xs"
              >
                <button onClick={() => loadView(view)} className="font-semibold hover:text-blue-600">
                  {view.name}
                </button>
                <button
                  onClick={() => deleteView(view.id)}
                  className="text-gray-400 hover:text-red-500"
                  type="button"
                  aria-label={`Remove saved view ${view.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap justify-between items-center gap-3 pt-2 border-t border-gray-100">
          <div className="text-xs text-gray-500">
            Showing {filteredInvoices.length} of {invoices.length} documents
          </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex gap-2">
              <button onClick={resetFilters} className="px-3 py-1 border rounded text-xs text-gray-600 hover:border-gray-400 hover:bg-gray-50">
                Reset filters
              </button>
              <button onClick={saveCurrentView} className="px-3 py-1 border rounded text-xs text-gray-600 hover:border-blue-400 hover:bg-blue-50">
                Save view
              </button>
            </div>
            <div className="border-l border-gray-300 pl-3">
              <button onClick={exportCsv} className="px-3 py-1 bg-gray-900 text-white rounded text-xs hover:bg-gray-700">
                Export CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => toggleSelectAll(filteredInvoices)}
            className="px-3 py-1 border rounded bg-white text-sm hover:bg-gray-50"
          >
            {selectAll ? 'Unselect all' : 'Select visible'}
          </button>

          <div className="flex items-center gap-2 border-l border-gray-300 pl-3">
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
            <button onClick={applyBulkStatus} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700" disabled={bulkProcessing}>
              {bulkProcessing ? 'Applying…' : 'Apply'}
            </button>
          </div>

          <div className="border-l border-gray-300 pl-3">
            <button onClick={bulkDownloadPdfs} className="px-3 py-1 border rounded text-sm hover:bg-gray-50">
              Download PDFs
            </button>
          </div>
        </div>
        <div className="text-sm text-gray-500">{selectedIds.size} selected</div>
      </div>

      {viewMode === 'table' ? (
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
                          disabled={!canManageTransactions || statusUpdatingId === invoice.id}
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
                        {canManageTransactions && (
                          <button
                            onClick={() => openInvoiceEditor(invoice.id)}
                            className="text-indigo-600 hover:underline"
                          >
                            Edit
                          </button>
                        )}
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
                        {canManageTransactions && invoice.type === 'quote' && (
                          <button
                            onClick={() => handleConvertQuote(invoice)}
                            className="text-green-600 hover:underline disabled:text-gray-400"
                            disabled={convertingId === invoice.id}
                          >
                            {convertingId === invoice.id ? 'Converting…' : 'Convert'}
                          </button>
                        )}
                        {canManageTransactions && (
                          <button
                            onClick={() => handleDelete(invoice.id)}
                            className="text-red-600 hover:underline"
                          >
                            Delete
                          </button>
                        )}
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
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInvoices.length === 0 && (
              <div className="col-span-full text-center text-gray-500 p-6">No records found.</div>
            )}
            {filteredInvoices.map((invoice) => {
              const statusBadgeClass = STATUS_BADGE_CLASSES[invoice.status] || 'bg-gray-100 text-gray-600';
              return (
                <div key={invoice.id} className="border rounded-lg p-4 bg-white hover:shadow">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-sm text-gray-500">#{invoice.id} • <span className="uppercase text-xs font-semibold">{invoice.type || 'invoice'}</span></div>
                      <div className="font-semibold text-lg text-gray-900 mt-1">{invoice.customer_name || '—'}</div>
                      <div className="text-sm text-gray-500 mt-1">{new Date(invoice.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">{formatCurrency(invoice.total)}</div>
                      <div className={`inline-block mt-2 px-2 py-1 rounded text-xs font-semibold ${statusBadgeClass}`}>{formatStatusLabel(invoice.status)}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-gray-500">{invoice.outlet_name || '—'}</div>
                    <div className="flex items-center gap-3">
                      <button onClick={async () => { try { const linkResp = await api.post(`/invoices/${invoice.id}/pdf-link`); window.open(linkResp.url, '_blank'); } catch (err) { push('Failed to open PDF', 'error'); } }} className="text-blue-600 text-sm">PDF</button>
                      {canManageTransactions && (
                        <>
                          <button onClick={() => openInvoiceEditor(invoice.id)} className="text-indigo-600 text-sm">Edit</button>
                          <button onClick={() => handleDelete(invoice.id)} className="text-red-600 text-sm">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showBuilder && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-xl font-semibold">{builderType === 'invoice' ? 'Create Invoice' : 'Create Quote'}</h2>
                <p className="text-sm text-gray-500">Steps: search products and click to add them → pick a customer on the right → review totals and click to create. Use the cart to remove items before saving.</p>
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

      {editingInvoiceId && (
        <InvoiceEditModal
          invoiceId={editingInvoiceId}
          onClose={() => setEditingInvoiceId(null)}
          onSaved={() => { setEditingInvoiceId(null); loadInvoices(); }}
        />
      )}
    </div>
  );
}
