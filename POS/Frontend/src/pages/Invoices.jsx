import { useEffect, useMemo, useState, useCallback } from 'react';
import { useWebSocketRoom, useWebSocketEvent } from '../hooks/useWebSocket';
import { FaTh, FaList } from 'react-icons/fa';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import InvoiceEditModal from '../components/InvoiceEditModal';
import Modal from '../components/Modal';
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
  vendor_fee: [
    { value: 'unpaid', label: 'Unpaid' },
    { value: 'paid', label: 'Paid' },
    { value: 'void', label: 'Void' },
  ],
};

const STATUS_BADGE_CLASSES = {
  issued: 'bg-muted/20 text-muted-foreground',
  paid: 'bg-success text-primary-foreground',
  cancelled: 'bg-red-100 text-red-600',
  draft: 'bg-muted/20 text-muted-foreground',
  sent: 'bg-primary/10 text-primary',
  accepted: 'bg-success text-primary-foreground',
  unpaid: 'bg-amber-100 text-amber-700',
  void: 'bg-slate-200 text-slate-600',
};

const STATUS_LABELS = {
  issued: 'Issued',
  paid: 'Paid',
  cancelled: 'Cancelled',
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  unpaid: 'Unpaid',
  void: 'Void',
};

export default function Invoices() {
  const { push } = useToast();
  const { formatCurrency, settings: globalSettings } = useSettings();
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canManageTransactions = userRole === 'admin' || userRole === 'accounts';
  const canManageVendorInvoices = userRole === 'admin' || userRole === 'manager';

  const [coreInvoices, setCoreInvoices] = useState([]);
  const [vendorInvoiceRows, setVendorInvoiceRows] = useState([]);
  const mappedVendorInvoices = useMemo(() => {
    return (vendorInvoiceRows || []).map((row) => ({
      id: `vendor-${row.id}`,
      raw_id: row.id,
      vendor_id: row.vendor_id,
      customer_name: row.vendor_name || `Vendor #${row.vendor_id}`,
      total: Number(row.fee_amount) || 0,
      status: row.status || 'unpaid',
      type: 'vendor_fee',
      created_at: row.issued_at || row.created_at,
      outlet_name: 'Vendor billing',
      invoice_number: row.invoice_number,
      vendorInvoice: true,
      due_date: row.due_date,
    }));
  }, [vendorInvoiceRows]);
  const invoices = useMemo(() => [...coreInvoices, ...mappedVendorInvoices], [coreInvoices, mappedVendorInvoices]);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');

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
  const [vendorActionState, setVendorActionState] = useState({ id: null, action: null });
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
  const UI_VIEW_KEY = 'ui_view_mode';
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem(UI_VIEW_KEY) || 'table';
    } catch {
      return 'table';
    }
  });
  // help moved to central Help page; keep a small link here instead
  const [shiftStartedAt, setShiftStartedAt] = useState(() => {
    try { return localStorage.getItem('pos_shift_started_at') || ''; } catch { return ''; }
  });
  // try to sync active shift from server when the page loads
  useEffect(() => {
    (async () => {
      try {
        const active = await api.get('/shifts/active');
        if (active && active.started_at) {
          setShiftStartedAt(active.started_at);
          try { localStorage.setItem('pos_shift_started_at', active.started_at); } catch { /* ignore localStorage errors */ }
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
        try { localStorage.setItem('pos_shift_started_at', started); } catch { /* ignore */ }
        setShiftStartedAt(started);
        push('Shift started', 'info');
      } catch (err) {
        console.debug('Failed to handle shift.started on invoices', err?.message || err);
      }
  });

  useWebSocketEvent('shift.stopped', (payload) => {
      try {
        const shift = payload?.shift;
        if (!shift) return;
        // clear local marker if it matches current marker
        const current = localStorage.getItem('pos_shift_id');
        if (current && String(current) === String(shift.id)) {
          try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch { /* ignore */ }
          setShiftStartedAt('');
        }
        push('Shift closed', 'info');
      } catch (err) {
        console.debug('Failed to handle shift.stopped on invoices', err?.message || err);
      }
  });
  // format a short relative label for shift badge

  useEffect(() => {
    try {
      localStorage.setItem(UI_VIEW_KEY, viewMode);
    } catch {
      // ignore persistence errors
    }
  }, [viewMode]);
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
    } catch {
      return '';
    }
  };

  const invoiceSummary = useMemo(() => {
    if (!Array.isArray(coreInvoices) || coreInvoices.length === 0) {
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

    const invoiceDocs = coreInvoices.filter((doc) => doc.type === 'invoice');
    const quoteDocs = coreInvoices.filter((doc) => doc.type === 'quote');
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
  }, [coreInvoices]);

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
      { value: 'invoice', label: 'Invoices', count: coreInvoices.filter((doc) => doc.type === 'invoice').length },
      { value: 'quote', label: 'Quotes', count: coreInvoices.filter((doc) => doc.type === 'quote').length },
      { value: 'vendor_fee', label: 'Vendor fees', count: mappedVendorInvoices.length },
    ],
    [invoices, coreInvoices, mappedVendorInvoices.length]
  );

  const vendorFilterOptions = useMemo(() => {
    const map = new Map();
    vendorInvoiceRows.forEach((row) => {
      if (!row.vendor_id) return;
      const label = row.vendor_name || `Vendor #${row.vendor_id}`;
      if (!map.has(row.vendor_id)) map.set(row.vendor_id, label);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label }));
  }, [vendorInvoiceRows]);

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
    if (typeFilter === 'vendor_fee') return STATUS_OPTIONS.vendor_fee;
    const merged = new Map();
    [...STATUS_OPTIONS.invoice, ...STATUS_OPTIONS.quote, ...STATUS_OPTIONS.vendor_fee].forEach((opt) => {
      if (!merged.has(opt.value)) merged.set(opt.value, opt);
    });
    return Array.from(merged.values());
  }, [typeFilter]);

  useEffect(() => {
    if (typeFilter !== 'vendor_fee' && vendorFilter !== 'all') {
      setVendorFilter('all');
    }
  }, [typeFilter, vendorFilter]);

  

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

  const loadInvoices = useCallback(async () => {
    try {
      const [list, vendorRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/reports/vendor-invoices').catch((err) => {
          console.debug('vendor-invoices fetch failed', err?.message || err);
          return null;
        }),
      ]);
      setCoreInvoices(list || []);
      setVendorInvoiceRows(vendorRes?.rows || []);
    } catch (err) {
      console.error(err);
      push('Failed to load invoices', 'error');
    }
  }, [push]);

  // Initial load once loadInvoices is defined to avoid TDZ
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  const openInvoiceEditor = (invoiceId) => {
    const target = invoices.find((doc) => doc.id === invoiceId);
    if (target?.vendorInvoice) {
      push('Vendor fee invoices are read-only.', 'error');
      return;
    }
    if (!canManageTransactions) {
      push('You need Admin or Accounts permissions to modify transactions.', 'error');
      return;
    }
    setEditingInvoiceId(invoiceId);
  };

  const handleDelete = async (invoiceId) => {
    const target = invoices.find((doc) => doc.id === invoiceId);
    if (target?.vendorInvoice) {
      push('Vendor fee invoices cannot be deleted here.', 'error');
      return;
    }
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

  const formatStatusLabel = (status) => STATUS_LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : '-');

  const handleStatusChange = async (invoice, nextStatus) => {
    if (invoice?.vendorInvoice) {
      push('Vendor fee invoice statuses are managed automatically.', 'error');
      return;
    }
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
    if (invoice.vendorInvoice) {
      push('Vendor fee invoices cannot be converted.', 'error');
      return;
    }
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

  const openVendorInvoicePreview = async (invoice) => {
    try {
      const payload = await api.get(`/vendors/${invoice.vendor_id}/invoices/${invoice.raw_id}/preview`);
      const html = payload?.html || '<p>No preview available.</p>';
      const w = window.open('', '_blank', 'noopener');
      if (w) {
        w.document.write(html);
        w.document.close();
      } else {
        push('Popup blocked. Allow popups for this site to preview invoices.', 'error');
      }
    } catch (err) {
      console.error(err);
      push('Failed to build preview', 'error');
    }
  };

  const handleVendorInvoiceAction = async (invoice, action) => {
    if (!invoice?.vendorInvoice) return;
    if (action !== 'pdf' && action !== 'preview' && !canManageVendorInvoices) {
      push('Only managers or admins can manage vendor fees.', 'error');
      return;
    }
    try {
      if (action === 'pdf') {
        window.open(`/api/vendors/${invoice.vendor_id}/invoices/${invoice.raw_id}/pdf`, '_blank', 'noopener');
        return;
      }
      if (action === 'preview') {
        await openVendorInvoicePreview(invoice);
        return;
      }
      setVendorActionState({ id: invoice.id, action });
      if (action === 'pay') {
        await api.post(`/vendors/${invoice.vendor_id}/invoices/${invoice.raw_id}/pay`, {});
        push('Vendor invoice marked as paid', 'success');
      } else if (action === 'void') {
        const reason = window.prompt('Reason for voiding this vendor invoice?');
        if (!reason) {
          setVendorActionState({ id: null, action: null });
          return;
        }
        await api.del(`/vendors/${invoice.vendor_id}/invoices/${invoice.raw_id}`, { body: { reason } });
        push('Vendor invoice voided', 'info');
      }
      await loadInvoices();
    } catch (err) {
      console.error(err);
      push(parseErrorMessage(err, 'Vendor invoice action failed'), 'error');
    } finally {
      setVendorActionState({ id: null, action: null });
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
      const ids = new Set(list.filter((invoice) => !invoice.vendorInvoice).map((i) => i.id));
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
      const target = invoices.find((doc) => doc.id === id);
      if (target?.vendorInvoice) continue;
      try {
        const linkResp = await api.post(`/invoices/${id}/pdf-link`);
        window.open(linkResp.url, '_blank');
      } catch (err) {
        push(`Failed to open PDF for invoice ${id}`, 'error');
        console.debug(err);
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
      const matchesVendor = typeFilter === 'vendor_fee'
        ? (vendorFilter === 'all' ? true : Number(invoice.vendor_id) === Number(vendorFilter))
        : true;

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
      return matchesSearch && matchesType && matchesStatus && matchesOutlet && matchesVendor && matchesDate;
    });
  }, [invoices, searchTerm, typeFilter, statusFilter, outletFilter, vendorFilter, dateFrom, dateTo]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 bg-background min-h-screen">
      <div className="mx-auto w-full max-w-7xl space-y-6 pb-12">
        <section className="rounded-lg border border-border bg-surface p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
                INVOICE HUB
              </span>
              <div className="space-y-2">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Invoices &amp; Quotes</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Track billing, monitor outstanding balances, and convert quotes without leaving the console.
                </p>
              </div>
              {shiftStartedAt ? (
                <div
                  className="hidden w-max items-center gap-2 rounded-full bg-muted/20 px-3 py-1 text-xs font-semibold text-muted-foreground lg:inline-flex"
                  aria-live="polite"
                  title={new Date(shiftStartedAt).toLocaleString()}
                >
                  Active shift - {formatShiftRelative(shiftStartedAt)}
                </div>
              ) : null}
            </div>
            <div className="flex w-full flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
              <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => openBuilder('invoice')}
                  className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  title="Open the invoice builder: add products, select customer, and create an invoice"
                >
                  New Invoice
                </button>
                <button
                  onClick={() => openBuilder('quote')}
                  className="w-full rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background"
                  title="Open the quote builder: prepare a quote you can send or convert later"
                >
                  New Quote
                </button>
              </div>
              <div className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1 shadow-sm sm:w-auto sm:justify-center">
                <button
                  onClick={() => setViewMode('table')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold transition ${
                    viewMode === 'table' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Show table view"
                  aria-pressed={viewMode === 'table'}
                  aria-label="Table view"
                >
                  <FaList className="text-sm" />
                  <span className="hidden sm:inline">Table</span>
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`flex items-center gap-2 rounded-md px-3 py-1 text-sm font-semibold transition ${
                    viewMode === 'cards' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Show card/grid view"
                  aria-pressed={viewMode === 'cards'}
                  aria-label="Cards view"
                >
                  <FaTh className="text-sm" />
                  <span className="hidden sm:inline">Cards</span>
                </button>
              </div>
              <a
                href="/help"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/20 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background sm:w-auto"
              >
                Help &amp; Guides
              </a>
              {shiftStartedAt ? (
                <div
                  className="w-full rounded-md bg-muted/20 px-3 py-2 text-center text-sm font-medium text-muted-foreground shadow-sm sm:w-auto lg:hidden"
                  aria-live="polite"
                  title={new Date(shiftStartedAt).toLocaleString()}
                >
                  Active shift - {formatShiftRelative(shiftStartedAt)}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.key}
              className="bg-surface border border-border rounded-lg p-4 shadow-sm transition hover:shadow"
            >
              <div className="text-sm text-muted-foreground uppercase tracking-wide">{card.title}</div>
              <div className="mt-2 text-2xl font-bold text-foreground">{card.primary}</div>
              <div className="mt-1 text-sm font-semibold text-primary">{card.secondary}</div>
              <div className="mt-2 text-sm text-muted-foreground">{card.footnote}</div>
            </div>
          ))}
        </section>

        <section className="bg-surface border border-border rounded-lg p-4 sm:p-5 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Document type</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {typeChips.map((chip) => (
                  <button
                    key={chip.value}
                    onClick={() => setTypeFilter(chip.value)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      typeFilter === chip.value
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/20 text-muted-foreground hover:text-foreground'
                    }`}
                    type="button"
                  >
                    {chip.label}
                    <span className="ml-2 text-[11px] font-semibold text-muted-foreground">{chip.count}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Status</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    statusFilter === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/20 text-muted-foreground hover:text-foreground'
                  }`}
                  type="button"
                >
                  All statuses
                  <span className="ml-2 text-[11px] font-semibold text-muted-foreground">{invoices.length}</span>
                </button>
                {statusChips
                  .filter((opt) => statusCounts[opt.value] || statusFilter === opt.value)
                  .map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setStatusFilter(opt.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        statusFilter === opt.value
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-muted/20 text-muted-foreground hover:text-foreground'
                      }`}
                      type="button"
                    >
                      {opt.label}
                      <span className="ml-2 text-[11px] font-semibold text-muted-foreground">
                        {statusCounts[opt.value] || 0}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Search
              <input
                type="text"
                placeholder="Customer, invoice number, amount..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Outlet
              <select
                value={outletFilter}
                onChange={(e) => setOutletFilter(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">Any outlet</option>
                {outlets.map((o) => (
                  <option key={o.id} value={o.name}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              From
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              To
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </label>
            {typeFilter === 'vendor_fee' && (
              <label className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground sm:col-span-2">
                Vendor
                <select
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All vendors</option>
                  {vendorFilterOptions.length === 0 && <option value="" disabled>No vendor invoices</option>}
                  {vendorFilterOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

          {savedViews.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/20 px-4 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved views</span>
              {savedViews.map((view) => (
                <span
                  key={view.id}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs text-muted-foreground shadow-sm"
                >
                  <button onClick={() => loadView(view)} className="font-semibold text-foreground hover:text-primary" type="button">
                    {view.name}
                  </button>
                  <button
                    onClick={() => deleteView(view.id)}
                    className="text-muted-foreground hover:text-red-500"
                    type="button"
                    aria-label={`Remove saved view ${view.name}`}
                  >
                    x
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="text-xs text-muted-foreground">
              Showing {filteredInvoices.length} of {invoices.length} documents
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={resetFilters} className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted/20" type="button">
                  Reset filters
                </button>
                <button onClick={saveCurrentView} className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-muted/20" type="button">
                  Save view
                </button>
              </div>
              <button onClick={exportCsv} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90" type="button">
                Export CSV
              </button>
            </div>
          </div>
        </section>

        <section className="bg-surface border border-border rounded-lg p-4 sm:p-5 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                onClick={() => toggleSelectAll(filteredInvoices)}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/20"
                type="button"
              >
                {selectAll ? 'Unselect all' : 'Select visible'}
              </button>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={bulkProcessing}
                >
                  <option value="">Bulk set status</option>
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
                <button
                  onClick={applyBulkStatus}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:bg-muted/20 disabled:text-muted-foreground"
                  disabled={bulkProcessing}
                  type="button"
                >
                  {bulkProcessing ? 'Applying...' : 'Apply'}
                </button>
              </div>
              <button
                onClick={bulkDownloadPdfs}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted/20"
                type="button"
              >
                Download PDFs
              </button>
            </div>
            <div className="text-sm text-muted-foreground">{selectedIds.size} selected</div>
          </div>
        </section>

        {viewMode === 'table' ? (
          <section className="space-y-4">
            <div className="overflow-x-auto border border-border rounded-lg shadow-sm bg-surface">
              <table className="min-w-[960px] w-full divide-y divide-border">
                <thead className="bg-muted/20 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-4">
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={() => toggleSelectAll(filteredInvoices)}
                      />
                    </th>
                    <th className="p-4">ID</th>
                    <th className="p-4">Type</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Total</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Outlet</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm text-foreground">
                  {filteredInvoices.map((invoice) => {
                    const docType = invoice.type === 'quote'
                      ? 'quote'
                      : invoice.type === 'vendor_fee'
                        ? 'vendor_fee'
                        : 'invoice';
                    const isVendorInvoice = invoice.vendorInvoice;
                    const statusOptions = STATUS_OPTIONS[docType] || [];
                    const statusBadgeClass = STATUS_BADGE_CLASSES[invoice.status] || 'bg-muted/20 text-muted-foreground';
                    return (
                      <tr key={invoice.id} className="transition hover:bg-muted/20">
                        <td className="p-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(invoice.id)}
                            onChange={() => toggleSelectId(invoice.id)}
                            disabled={isVendorInvoice}
                          />
                        </td>
                        <td className="p-4 whitespace-nowrap font-semibold">#{invoice.id}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${
                              invoice.type === 'quote'
                                ? 'bg-primary/10 text-primary'
                                : isVendorInvoice
                                  ? 'bg-amber-100 text-amber-700'
                                  : 'bg-success text-primary-foreground'
                            }`}
                          >
                            {invoice.type === 'vendor_fee' ? 'Vendor fee' : (invoice.type || 'invoice')}
                          </span>
                        </td>
                        <td className="p-4 whitespace-nowrap">{invoice.customer_name || '-'}</td>
                        <td className="p-4 whitespace-nowrap text-muted-foreground">
                          {invoice.created_at ? new Date(invoice.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="p-4 whitespace-nowrap font-semibold">{formatCurrency(invoice.total)}</td>
                        <td className="p-4 whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <span className={`w-max rounded-full px-2 py-1 text-xs font-semibold uppercase ${statusBadgeClass}`}>
                              {formatStatusLabel(invoice.status)}
                            </span>
                            {isVendorInvoice ? (
                              <>
                                {invoice.due_date && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Due {new Date(invoice.due_date).toLocaleDateString()}
                                  </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">Managed automatically</span>
                              </>
                            ) : (
                              <>
                                <select
                                  value={invoice.status || ''}
                                  onChange={(e) => handleStatusChange(invoice, e.target.value)}
                                  className="rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-muted/20"
                                  disabled={!canManageTransactions || statusUpdatingId === invoice.id}
                                >
                                  {(!invoice.status || invoice.status === '') && <option value="">Set status</option>}
                                  {statusOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                                {statusUpdatingId === invoice.id && (
                                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Updating...</span>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td className="p-4 whitespace-nowrap text-muted-foreground">{invoice.outlet_name || (isVendorInvoice ? 'Vendor billing' : '-')}</td>
                        <td className="p-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-3 text-xs font-semibold">
                            {isVendorInvoice ? (
                              <div className="flex flex-col items-end gap-2 text-xs">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    onClick={() => handleVendorInvoiceAction(invoice, 'preview')}
                                    className="text-primary hover:underline"
                                    type="button"
                                  >
                                    Preview
                                  </button>
                                  <button
                                    onClick={() => handleVendorInvoiceAction(invoice, 'pdf')}
                                    className="text-primary hover:underline"
                                    type="button"
                                  >
                                    PDF
                                  </button>
                                  {canManageVendorInvoices && invoice.status !== 'paid' && invoice.status !== 'void' && (
                                    <button
                                      onClick={() => handleVendorInvoiceAction(invoice, 'pay')}
                                      className="text-success hover:underline disabled:text-muted-foreground"
                                      disabled={vendorActionState.id === invoice.id}
                                      type="button"
                                    >
                                      {vendorActionState.id === invoice.id && vendorActionState.action === 'pay' ? 'Marking…' : 'Mark paid'}
                                    </button>
                                  )}
                                  {canManageVendorInvoices && invoice.status !== 'void' && (
                                    <button
                                      onClick={() => handleVendorInvoiceAction(invoice, 'void')}
                                      className="text-red-500 hover:underline disabled:text-muted-foreground"
                                      disabled={vendorActionState.id === invoice.id}
                                      type="button"
                                    >
                                      {vendorActionState.id === invoice.id && vendorActionState.action === 'void' ? 'Voiding…' : 'Void'}
                                    </button>
                                  )}
                                </div>
                                <span className="text-muted-foreground">Vendor billing</span>
                              </div>
                            ) : (
                              <>
                                {canManageTransactions && (
                                  <button
                                    onClick={() => openInvoiceEditor(invoice.id)}
                                    className="text-primary hover:underline"
                                    type="button"
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
                                      console.debug(err);
                                    }
                                  }}
                                  className="text-primary hover:underline"
                                  type="button"
                                >
                                  PDF
                                </button>
                                {canManageTransactions && invoice.type === 'quote' && (
                                  <button
                                    onClick={() => handleConvertQuote(invoice)}
                                    className="text-success hover:underline disabled:text-muted-foreground"
                                    disabled={convertingId === invoice.id}
                                    type="button"
                                  >
                                    {convertingId === invoice.id ? 'Converting...' : 'Convert'}
                                  </button>
                                )}
                                {canManageTransactions && (
                                  <button
                                    onClick={() => handleDelete(invoice.id)}
                                    className="text-red-500 hover:underline"
                                    type="button"
                                  >
                                    Delete
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredInvoices.length === 0 && (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted-foreground">No records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="rounded-lg border border-border bg-surface p-4 shadow-sm sm:p-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredInvoices.length === 0 && (
                  <div className="col-span-full rounded-md border border-border bg-muted/20 p-6 text-center text-muted-foreground">
                    No records found.
                  </div>
                )}
                {filteredInvoices.map((invoice) => {
                  const isVendorInvoice = invoice.vendorInvoice;
                  const statusBadgeClass = STATUS_BADGE_CLASSES[invoice.status] || 'bg-muted/20 text-muted-foreground';
                  return (
                    <div key={invoice.id} className="rounded-md border border-border bg-background p-4 transition hover:bg-muted/20">
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                          <div className="text-sm text-muted-foreground">#{invoice.id}</div>
                          <div className="text-lg font-semibold text-foreground">{invoice.customer_name || '-'}</div>
                          <div className="text-sm text-muted-foreground">{new Date(invoice.created_at).toLocaleDateString()}</div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="text-lg font-bold text-foreground">{formatCurrency(invoice.total)}</div>
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold uppercase ${statusBadgeClass}`}>
                            {formatStatusLabel(invoice.status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold">
                          <span className="text-muted-foreground">{invoice.outlet_name || (isVendorInvoice ? 'Vendor billing' : '-')}</span>
                          <div className="flex flex-wrap items-center gap-3">
                            {isVendorInvoice ? (
                              <span className="text-muted-foreground">Read-only</span>
                            ) : (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const linkResp = await api.post(`/invoices/${invoice.id}/pdf-link`);
                                      window.open(linkResp.url, '_blank');
                                    } catch (err) {
                                      push('Failed to open PDF', 'error');
                                      console.debug(err);
                                    }
                                  }}
                                  className="text-primary"
                                  type="button"
                                >
                                  PDF
                                </button>
                                {canManageTransactions && (
                                  <>
                                    <button onClick={() => openInvoiceEditor(invoice.id)} className="text-primary" type="button">Edit</button>
                                    <button onClick={() => handleDelete(invoice.id)} className="text-red-500" type="button">Delete</button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {showBuilder && (
          <Modal open={showBuilder} onClose={() => setShowBuilder(false)} labelledBy="builder-title">
            <div className="relative w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-auto rounded-xl border border-border bg-surface p-4 sm:p-6 text-foreground shadow-md sm:shadow-lg shadow-[0_2px_20px_rgba(0,0,0,0.05)] transition-all duration-200">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <h2 id="builder-title" className="text-2xl sm:text-xl lg:text-2xl font-semibold">{builderType === 'invoice' ? 'Create Invoice' : 'Create Quote'}</h2>
                  <p className="text-sm text-muted-foreground">
                    Steps: search products and click to add them, then pick a customer on the right, then review totals and save. Use the cart to remove items before publishing.
                  </p>
                </div>
                <button
                  onClick={() => setShowBuilder(false)}
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-muted/20 text-muted-foreground transition hover:bg-muted/30 hover:text-foreground"
                  aria-label="Close builder"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                    <input
                      type="text"
                      placeholder="Search products..."
                      value={builderSearch}
                      onChange={(e) => setBuilderSearch(e.target.value)}
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <div className="text-sm text-muted-foreground">{builderProducts.length} products</div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {builderFilteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addBuilderItem(product)}
                        type="button"
                        className={`rounded-md border border-border bg-background p-3 text-left transition hover:bg-muted/20 ${
                          product.stock > 0 || builderType === 'quote' ? '' : 'cursor-not-allowed'
                        }`}
                        disabled={product.stock <= 0 && builderType === 'invoice'}
                      >
                        <div className="font-semibold truncate">{product.name}</div>
                        <div className="mb-2 text-xs text-muted-foreground truncate">{product.category} &gt; {product.subcategory}</div>
                        <div className="flex justify-between text-sm">
                          <span className="font-semibold">{formatCurrency(product.price)}</span>
                          <span className={product.stock > 5 ? 'text-success' : 'text-red-500'}>
                            {product.stock} in stock
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
                  <div>
                    <label className="block text-sm font-semibold">Customer</label>
                    <select
                      value={builderSelectedCustomer}
                      onChange={(e) => setBuilderSelectedCustomer(e.target.value)}
                      className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      {builderCustomers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="max-h-60 space-y-3 overflow-y-auto">
                    {builderCart.length === 0 && <p className="text-center text-sm text-muted-foreground">No items yet</p>}
                    {builderCart.map((item) => (
                      <div key={item.id} className="rounded-md border border-border bg-background px-3 py-2">
                        <div className="text-sm font-semibold">{item.name}</div>
                        <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{formatCurrency(item.price)} x {item.quantity}</span>
                          <button onClick={() => decrementBuilderItem(item.id)} className="text-red-500 hover:underline" type="button">Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-2 border-t border-border pt-3 text-sm">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>{formatCurrency(builderSubtotal)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax ({builderGstRate}%)</span>
                      <span>{formatCurrency(builderTax)}</span>
                    </div>
                    <div className="flex justify-between text-base font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(builderTotal)}</span>
                    </div>
                  </div>

                  <button
                    onClick={submitBuilder}
                    disabled={builderSaving}
                    className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:bg-muted/20 disabled:text-muted-foreground"
                    type="button"
                  >
                    {builderSaving ? 'Saving...' : builderType === 'invoice' ? 'Create Invoice' : 'Create Quote'}
                  </button>
                </div>
              </div>
            </div>
          </Modal>
        )}

        {editingInvoiceId && (
          <InvoiceEditModal
            invoiceId={editingInvoiceId}
            onClose={() => setEditingInvoiceId(null)}
            onSaved={() => { setEditingInvoiceId(null); loadInvoices(); }}
          />
        )}
      </div>
    </div>
  );
}
