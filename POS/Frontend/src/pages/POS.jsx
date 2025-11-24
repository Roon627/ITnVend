import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import InvoiceEditModal from '../components/InvoiceEditModal';
import Modal from '../components/Modal';
import AvailabilityTag from '../components/AvailabilityTag';
import { useStockUpdates, useOrderUpdates, useWebSocketRoom, useWebSocketEvent } from '../hooks/useWebSocket';
import { resolveMediaUrl } from '../lib/media';

const AVAILABILITY_STATUS_VALUES = new Set(['in_stock', 'preorder', 'vendor', 'used']);

const normalizeAvailabilityStatusValue = (value, fallback = 'in_stock') => {
  if (value == null) return fallback;
  const normalized = value.toString().toLowerCase();
  if (AVAILABILITY_STATUS_VALUES.has(normalized)) {
    return normalized;
  }
  return fallback;
};

export default function POS() {
  const location = useLocation();
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [productSearchTerm, setProductSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [heldOrders, setHeldOrders] = useState([]);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [changeAmount, setChangeAmount] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastTransaction, setLastTransaction] = useState(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentSlipPath, setPaymentSlipPath] = useState(null);
  const [paymentSlipPreview, setPaymentSlipPreview] = useState(null);
  const [paymentSlipUploading, setPaymentSlipUploading] = useState(false);

  // UI state
  const [activeTab, setActiveTab] = useState('products'); // products, history, held
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [historyEditingId, setHistoryEditingId] = useState(null);
  const [shiftStartedAt, setShiftStartedAt] = useState(() => {
    try { return localStorage.getItem('pos_shift_started_at') || ''; } catch { return ''; }
  });
  const [shiftId, setShiftId] = useState(() => {
    try { return localStorage.getItem('pos_shift_id') || null; } catch { return null; }
  });
  const [shiftPending, setShiftPending] = useState(false);
  const [cartOpenMobile, setCartOpenMobile] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [quantityInput, setQuantityInput] = useState({});
  const [pendingCustomerSelection, setPendingCustomerSelection] = useState(null);

  // Contexts and refs
  const { settings: globalSettings, formatCurrency } = useSettings();
  const toast = useToast();
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canManageTransactions = userRole === 'admin' || userRole === 'accounts';
  const searchInputRef = useRef(null);
  const payNowBtnRef = useRef(null);
  const resetPaymentDetails = useCallback(() => {
    setPaymentReference('');
    setPaymentSlipPath(null);
    setPaymentSlipPreview(null);
    setPaymentSlipUploading(false);
  }, []);

  const closePaymentModal = useCallback(() => {
    setShowPaymentModal(false);
    resetPaymentDetails();
  }, [resetPaymentDetails]);

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
    } catch { return ''; }
  };

  const humanizeLabel = (value) => {
    if (value == null) return '';
    const s = String(value);
    // Replace underscores/dashes with spaces, split camelCase, collapse spaces
    const spaced = s
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    // Capitalize words
    return spaced.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substr(1).toLowerCase());
  };

  const handlePaymentSlipUpload = async (file) => {
    if (!file) return;
    setPaymentSlipUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const now = new Date();
      const category = `payment_slips/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
      formData.append('category', category);
      const result = await api.upload('/uploads', formData);
      const storedPath = result?.path || result?.url || '';
      const previewUrl = result?.url || storedPath;
      setPaymentSlipPath(storedPath || null);
      setPaymentSlipPreview(previewUrl || null);
      toast.push('Transfer slip uploaded', 'info');
    } catch (err) {
      toast.push(err?.message || 'Failed to upload transfer slip', 'error');
    } finally {
      setPaymentSlipUploading(false);
    }
  };

  const clearPaymentSlip = () => {
    setPaymentSlipPath(null);
    setPaymentSlipPreview(null);
    setPaymentSlipUploading(false);
  };

  

  // WebSocket real-time updates
  useWebSocketRoom('staff', !!user); // Join staff room when user is logged in

  // join outlet room so we receive shift events for this outlet
  const outletId = globalSettings?.outlet?.id;
  useWebSocketRoom(outletId ? `outlet:${outletId}` : null, !!outletId);

  // Listen for shift events so POS UI updates immediately
  useWebSocketEvent('shift.started', (payload) => {
    try {
      const shift = payload?.shift;
      if (!shift) return;
      const started = shift.started_at || new Date().toISOString();
      try { localStorage.setItem('pos_shift_started_at', started); localStorage.setItem('pos_shift_id', String(shift.id)); } catch {
        console.debug('Failed to persist shift start to localStorage');
      }
      setShiftStartedAt(started);
      setShiftId(shift.id || null);
      toast.push('Shift started', 'info');
    } catch (e) {
      console.debug('Failed to handle shift.started', e);
    }
  });

  useWebSocketEvent('shift.stopped', (payload) => {
    try {
      const shift = payload?.shift;
      // if the stopped shift matches our current shift, clear it
      if (shift && String(shift.id) === String(shiftId)) {
        try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch {
          console.debug('Failed to clear shift keys from localStorage');
        }
        setShiftStartedAt('');
        setShiftId(null);
        toast.push('Shift closed', 'info');
      } else {
        // If another shift was closed in this outlet, show a notification
        toast.push('A shift was closed', 'info');
      }
    } catch (e) {
      console.debug('Failed to handle shift.stopped', e);
    }
  });

  // Close mobile cart when switching tabs to improve UX
  useEffect(() => {
    setCartOpenMobile(false);
  }, [activeTab]);

  // POS checkout no longer manages preorder-specific customer overrides

  useStockUpdates((data) => {
    // Update product stock in real-time
    setProducts(prevProducts =>
      prevProducts.map(product =>
        product.id === data.productId
          ? { ...product, stock: data.newStock }
          : product
      )
    );
    toast.push(`${data.productName} stock updated to ${data.newStock}`, 'info');
  });

  useOrderUpdates((data) => {
    // Show notification for new orders
    toast.push(`New order received from ${data.customer.name}`, 'success');
    // Could also update any order lists or counters here
  });

  const markPreorderFlag = useCallback((item) => {
    if (!item || typeof item !== 'object') return false;
    const status = normalizeAvailabilityStatusValue(item.availability_status || item.availabilityStatus, null);
    if (status === 'preorder') return true;
    const flag = item.availableForPreorder
      || item.available_for_preorder
      || item.preorder_enabled === 1
      || item.preorder_enabled === true
      || item.preorder_enabled === '1';
    return Boolean(flag);
  }, []);

  const normalizeProduct = useCallback((product) => {
    if (!product || typeof product !== 'object') return product;
    const preorderFlag = markPreorderFlag(product);
    const availabilityStatus = normalizeAvailabilityStatusValue(
      product.availability_status || product.availabilityStatus || (preorderFlag ? 'preorder' : null),
      preorderFlag ? 'preorder' : 'in_stock'
    );
    return {
      ...product,
      availabilityStatus,
      availability_status: availabilityStatus,
      availableForPreorder: preorderFlag,
    };
  }, [markPreorderFlag]);

  // Hold order handler (memoized so keyboard effect can depend on it safely)
  const handleHoldOrder = useCallback(() => {
    if (cart.length === 0) {
      toast.push('Cart is empty', 'warning');
      return;
    }

    const orderName = prompt('Enter a name for this held order:');
    if (!orderName) return;

    const heldOrder = {
      id: Date.now(),
      name: orderName,
      cart,
      customerId: selectedCustomerId,
      timestamp: new Date().toISOString(),
    };

    const updatedHeldOrders = [...heldOrders, heldOrder];
    saveHeldOrders(updatedHeldOrders);
    setCart([]);
    toast.push('Order held successfully', 'success');
  }, [cart, heldOrders, selectedCustomerId, toast]);

  // Keyboard shortcuts (placed after handleHoldOrder to avoid TDZ)
  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'f1':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'f':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'c':
          e.preventDefault();
          if (payNowBtnRef.current) {
            payNowBtnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            payNowBtnRef.current.focus();
          }
          break;
        case 'f2':
          e.preventDefault();
          setActiveTab('products');
          break;
        case 'f3':
          e.preventDefault();
          setActiveTab('history');
          break;
        case 'f4':
          e.preventDefault();
          handleHoldOrder();
          break;
        case 'f5':
          e.preventDefault();
          setShowPaymentModal(true);
          break;
        case 'escape':
          e.preventDefault();
          if (showPaymentModal) closePaymentModal();
          if (showCustomerModal) setShowCustomerModal(false);
          if (showReceipt) setShowReceipt(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showPaymentModal, showCustomerModal, showReceipt, closePaymentModal, handleHoldOrder]);

  const loadInitialData = useCallback(async () => {
    try {
      const [productsData, customersData, categoriesData] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
        api.get('/products/categories')
      ]);

      setProducts(Array.isArray(productsData) ? productsData.map(normalizeProduct) : []);
      setCustomers(Array.isArray(customersData) ? customersData : []);
      setCategories(categoriesData && typeof categoriesData === 'object' ? categoriesData : {});

      if (Array.isArray(customersData) && customersData.length > 0) {
        setSelectedCustomerId(customersData[0].id);
      }
    } catch (error) {
      console.debug('Failed to load initial POS data', error);
      toast.push('Failed to load data', 'error');
    }
  }, [normalizeProduct, toast]);

  const loadHeldOrders = () => {
    const held = JSON.parse(localStorage.getItem('pos_held_orders') || '[]');
    setHeldOrders(held);
  };

  const loadTransactionHistory = useCallback(async () => {
    try {
      const history = await api.get('/transactions/recent', { params: { limit: 50 } });
      const normalized = Array.isArray(history) ? history : [];
      setTransactionHistory(normalized);
      setExpandedHistoryId((prev) => (prev && normalized.some((entry) => entry.id === prev) ? prev : null));
    } catch (error) {
      console.error('Failed to load transaction history', error);
      toast.push('Failed to load transaction history', 'error');
      setTransactionHistory([]);
      setExpandedHistoryId(null);
    }
  }, [toast]);

  const saveHeldOrders = (orders) => {
    localStorage.setItem('pos_held_orders', JSON.stringify(orders));
    setHeldOrders(orders);
  };

  // Initial data load and shift sync
  useEffect(() => {
    loadInitialData();
    loadHeldOrders();
    loadTransactionHistory();
    // attempt to sync active shift from server
    (async () => {
      try {
        const active = await api.get('/shifts/active');
        if (active) {
          setShiftStartedAt(active.started_at || '');
          setShiftId(active.id || null);
          try {
            localStorage.setItem('pos_shift_started_at', active.started_at);
            localStorage.setItem('pos_shift_id', String(active.id));
          } catch {
            console.debug('Failed to persist active shift to localStorage');
          }
        }
      } catch (e) {
        // ignore sync errors; fall back to localStorage
        console.debug('Failed to sync active shift', e?.message || e);
      }
    })();
  }, [loadInitialData, loadTransactionHistory]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const incomingCustomer = params.get('customer_id');
    if (incomingCustomer) {
      setPendingCustomerSelection(Number(incomingCustomer));
    }
  }, [location.search]);

  useEffect(() => {
    if (!pendingCustomerSelection || customers.length === 0) return;
    const match = customers.find((c) => Number(c.id) === Number(pendingCustomerSelection));
    if (match) {
      setSelectedCustomerId(match.id);
      setCustomerSearchTerm(match.name || '');
      const params = new URLSearchParams(location.search);
      if (params.has('customer_id')) {
        params.delete('customer_id');
        const query = params.toString();
        navigate({ pathname: location.pathname, search: query ? `?${query}` : '' }, { replace: true });
      }
      toast.push(`Loaded ${match.name} into the bill`, 'success');
      setPendingCustomerSelection(null);
    }
  }, [pendingCustomerSelection, customers, location.pathname, location.search, navigate, toast]);

  // Reload history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadTransactionHistory();
    }
  }, [activeTab, loadTransactionHistory]);

  // Held orders still persist locally because they are POS-specific drafts

  const addToCart = (product, customQuantity = null) => {
    if (!product) return;

    const availabilityStatus = normalizeAvailabilityStatusValue(
      product.availability_status || product.availabilityStatus || (product.preorder_enabled ? 'preorder' : null),
      'in_stock'
    );
    const isPreorderItem = availabilityStatus === 'preorder' || markPreorderFlag(product);
    const desiredQuantity = customQuantity || quantityInput[product.id] || 1;

    const skipStockCheck = isPreorderItem;
    if (!skipStockCheck) {
      if (product.stock <= 0) {
        toast.push('This item is out of stock.', 'warning');
        return;
      }
      if (desiredQuantity > product.stock) {
        toast.push(`Only ${product.stock} items available in stock`, 'warning');
        return;
      }
    }

    setCart((currentCart) => {
      const existing = currentCart.find((i) => i.id === product.id);
      let updatedCart;
      if (existing) {
        const newQuantity = existing.quantity + desiredQuantity;
        if (!skipStockCheck && newQuantity > product.stock) {
          toast.push(`Cannot add more than ${product.stock} items`, 'warning');
          return currentCart;
        }
        updatedCart = currentCart.map((i) =>
          i.id === product.id ? { ...i, quantity: newQuantity } : i
        );
      } else {
        updatedCart = [...currentCart, { ...product, quantity: desiredQuantity }];
      }
      return updatedCart;
    });

    setQuantityInput((prev) => ({ ...prev, [product.id]: 1 }));
  };

  const updateCartQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    const cartEntry = cart.find((item) => item.id === productId);
    const skipStockCheck = markPreorderFlag(product) || markPreorderFlag(cartEntry);
    if (!skipStockCheck && product && newQuantity > product.stock) {
      toast.push(`Only ${product.stock} items available in stock`, 'warning');
      return;
    }

    setCart((currentCart) =>
      currentCart.map((item) =>
        item.id === productId ? { ...item, quantity: newQuantity } : item
      )
    );
  };

  const removeFromCart = (productId) => {
    setCart((currentCart) => currentCart.filter((i) => i.id !== productId));
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('Are you sure you want to clear the cart?')) {
      setCart([]);
    }
  };

  

  const recallHeldOrder = (orderId) => {
    const order = heldOrders.find(o => o.id === orderId);
    if (order) {
      setCart(order.cart);
      setSelectedCustomerId(order.customerId);
      const updatedHeldOrders = heldOrders.filter(o => o.id !== orderId);
      saveHeldOrders(updatedHeldOrders);
      toast.push('Order recalled successfully', 'success');
    }
  };

  const handlePayment = () => {
    const total = totalWithTax;
    const paid = parseFloat(paymentAmount) || 0;

    if (paid < total) {
      toast.push('Payment amount is less than total', 'error');
      return;
    }

    setChangeAmount(paid - total);
    handleCheckout('invoice');
  };

  const handleCheckout = async (type = 'invoice') => {
    const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'invoice';
    const validItemsForCheckout = cart.filter(i => Number(i.quantity || 0) > 0);
    if (!selectedCustomerId || validItemsForCheckout.length === 0) {
      toast.push('Please select a customer and add items (quantity > 0) to the cart.', 'warning');
      return false;
    }

    try {
      const paymentInfo = normalizedType === 'invoice' ? {
        method: paymentMethod,
        amount: parseFloat(paymentAmount) || totalWithTax,
        reference: paymentReference || null,
        slipPath: paymentSlipPath || null,
      } : null;

      const payload = {
        customerId: Number(selectedCustomerId),
        items: validItemsForCheckout,
        type: normalizedType,
        ...(paymentInfo ? { paymentInfo } : {}),
      };
      const created = await api.post('/invoices', payload);

      const transaction = {
        id: created.id,
        type: normalizedType,
        customerId: selectedCustomerId,
        customerName: customers.find(c => c.id == selectedCustomerId)?.name,
        items: validItemsForCheckout,
        subtotal: cartTotal,
        taxAmount,
        total: totalWithTax,
        paymentMethod,
        paymentAmount: parseFloat(paymentAmount) || totalWithTax,
        changeAmount,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(transaction);
      setShowPaymentModal(false);
      await loadTransactionHistory();

  // Do not automatically open/save PDF after checkout. Allow users to
  // manually open the receipt/pdf from the history or the Print button.
  // (Previously we auto-opened the PDF here.)

      api.get('/products').then((data) => setProducts(Array.isArray(data) ? data.map(normalizeProduct) : []));

      setCart([]);
      setPaymentAmount('');
      setChangeAmount(0);
      setPaymentMethod('cash');
      resetPaymentDetails();
      setShowReceipt(true);

      toast.push(normalizedType === 'invoice' ? 'Invoice created successfully' : 'Quote generated successfully', 'success');
      return true;
    } catch (err) {
      console.debug('Checkout failed', err);
      toast.push(normalizedType === 'invoice' ? 'Failed to create invoice' : 'Failed to create quote', 'error');
      return false;
    }
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.name) {
      toast.push('Customer name is required', 'error');
      return;
    }

    try {
      const created = await api.post('/customers', newCustomer);
      setCustomers(prev => [...prev, created]);
      setSelectedCustomerId(created.id);
      setShowCustomerModal(false);
      setNewCustomer({ name: '', email: '', phone: '' });
      toast.push('Customer created successfully', 'success');
    } catch (error) {
      console.debug('Create customer failed', error);
      toast.push('Failed to create customer', 'error');
    }
  };

  const toggleHistoryDetails = (invoiceId) => {
    setExpandedHistoryId((prev) => (prev === invoiceId ? null : invoiceId));
  };

  const openHistoryPdf = async (invoiceId) => {
    try {
      const linkResp = await api.post(`/invoices/${invoiceId}/pdf-link`);
      if (linkResp?.url) {
        window.open(linkResp.url, '_blank');
      }
    } catch (error) {
      console.debug('Open receipt failed', error);
      toast.push('Failed to open receipt', 'error');
    }
  };

  const openHistoryEditor = (invoiceId) => {
    if (!canManageTransactions) {
      toast.push('You need Admin or Accounts permissions to modify transactions.', 'error');
      return;
    }
    setHistoryEditingId(invoiceId);
  };

  const handleHistoryDelete = async (invoiceId) => {
    if (!canManageTransactions) {
      toast.push('You need Admin or Accounts permissions to delete transactions.', 'error');
      return;
    }
    if (!confirm('Delete this record? This cannot be undone.')) return;
    try {
      await api.del(`/invoices/${invoiceId}`);
      toast.push('Transaction removed', 'info');
      setExpandedHistoryId((prev) => (prev === invoiceId ? null : prev));
      await loadTransactionHistory();
    } catch (error) {
      console.error(error);
      toast.push('Unable to delete transaction', 'error');
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
    c.email?.toLowerCase().includes(customerSearchTerm.toLowerCase())
  );

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearchTerm.toLowerCase());
    const matchesCategory = !selectedCategory || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Only consider items with positive quantity for totals and tax
  const validCartItems = cart.filter(i => Number(i.quantity || 0) > 0);
  const cartTotal = validCartItems.reduce((t, i) => t + Number(i.price || 0) * Number(i.quantity || 0), 0);
  const gstRate = globalSettings?.outlet?.gst_rate ?? globalSettings?.gst_rate ?? 0;
  const taxAmount = +(cartTotal * (gstRate / 100));
  const totalWithTax = +(cartTotal + taxAmount);
  const isTransferPayment = paymentMethod === 'bank_transfer' || paymentMethod === 'transfer';

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-background min-h-screen space-y-6">
      <main>
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
          {/* Left Panel - Products/Categories/History */}
          <div>
            {/* Mobile cart toggle */}
            <div className="mb-4 lg:hidden flex justify-end">
              <button
                onClick={() => setCartOpenMobile((s) => !s)}
                className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-md"
                aria-expanded={cartOpenMobile}
                aria-controls="pos-cart-panel"
              >
                Cart ({cart.length})
              </button>
            </div>
            {/* Tab Navigation */}
            <div className="flex items-center justify-between bg-surface border border-border rounded-lg px-4 py-2 mb-6 shadow-sm">
              <div className="flex gap-4 overflow-x-auto text-sm font-medium text-muted-foreground">
                <button
                  onClick={() => setActiveTab('products')}
                  className={`pb-2 border-b-2 border-transparent hover:text-foreground hover:border-primary transition ${activeTab === 'products' ? 'text-foreground border-primary font-semibold' : ''}`}
                >
                  Products (F2)
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`pb-2 border-b-2 border-transparent hover:text-foreground hover:border-primary transition ${activeTab === 'history' ? 'text-foreground border-primary font-semibold' : ''}`}
                >
                  History (F3)
                </button>
                <button
                  onClick={() => setActiveTab('held')}
                  className={`pb-2 border-b-2 border-transparent hover:text-foreground hover:border-primary transition ${activeTab === 'held' ? 'text-foreground border-primary font-semibold' : ''}`}
                >
                  Held Orders ({heldOrders.length})
                </button>
              </div>

              <div className="text-xs text-muted-foreground font-mono opacity-70 hover:opacity-100 transition">
                Shortcuts: F1 Search | F2 Products | F3 History | F4 Hold | F5 Payment | C Focus Cart
              </div>
            </div>

            {activeTab === 'products' && (
              <div className="bg-surface border border-border rounded-lg p-4 shadow-sm">
                {/* Search and Category Filters */}
                <div className="flex flex-wrap md:flex-nowrap gap-3 items-center justify-between bg-surface border border-border rounded-lg p-3 shadow-sm mb-6">
                  <div className="relative flex-1">
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search products... (F1)"
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 text-sm border border-border rounded-md bg-background text-foreground focus:ring-primary focus:border-primary"
                    />
                    {/* Simple search icon */}
                    <svg className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="11" cy="11" r="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="text-sm border border-border rounded-md bg-background text-foreground px-3 py-2 focus:ring-primary focus:border-primary"
                  >
                    <option value="">All Categories</option>
                    {Object.keys(categories).map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {/* Products Grid - responsive cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredProducts.map((p) => {
                    const imageSrc = resolveMediaUrl(
                      p.image_source || p.imageUrl || p.image || p.image_url || null
                    );
                    const badgeStatus = normalizeAvailabilityStatusValue(
                      p.availabilityStatus || p.availability_status || (p.availableForPreorder ? 'preorder' : null),
                      p.availableForPreorder ? 'preorder' : 'in_stock'
                    );
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') addToCart(p); }}
                        onClick={() => addToCart(p)}
                        className={`bg-surface border border-border rounded-lg shadow-sm hover:shadow-md transition-transform hover:scale-[1.01] overflow-hidden flex flex-col ${p.stock > 0 ? '' : 'opacity-60 grayscale'}`}
                        aria-label={`Add ${p.name} to cart`}
                      >
                      <div className="relative">
                        {imageSrc ? (
                          <img src={imageSrc} alt={p.name} className="w-full h-48 object-cover transition-transform hover:scale-105" />
                        ) : (
                          <div className="w-full h-48 bg-muted/10 flex items-center justify-center text-muted-foreground">No image</div>
                        )}
                        <AvailabilityTag availabilityStatus={badgeStatus} />
                      </div>

                      <div className="p-4 space-y-2 flex-1 flex flex-col">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-semibold text-foreground truncate">{p.name}</h3>
                          <p className="font-bold text-foreground">{formatCurrency(p.price)}</p>
                        </div>
                        <p className={`text-xs ${p.stock > 10 ? 'text-emerald-600' : p.stock > 0 ? 'text-amber-600' : 'text-rose-600'}`}>
                          {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                        </p>
                        {p.category && (
                          <p className="text-xs text-muted-foreground">{p.category}</p>
                        )}

                        {p.stock > 0 && (
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center rounded-md border border-border overflow-hidden">
                              <input
                                onClick={(e) => e.stopPropagation()}
                                type="number"
                                min="1"
                                max={p.stock}
                                value={quantityInput[p.id] || 1}
                                onChange={(e) => setQuantityInput(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 1 }))}
                                className="w-12 text-center text-sm bg-background text-foreground border-none"
                              />
                              <button
                                onClick={(e) => { e.stopPropagation(); addToCart(p, 5); }}
                                title="Quick add 5"
                                className="px-3 text-sm font-medium bg-muted text-foreground hover:bg-muted/70"
                              >
                                +5
                              </button>
                            </div>

                            <button
                              onClick={(e) => { e.stopPropagation(); addToCart(p, quantityInput[p.id] || 1); }}
                              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:bg-primary/90"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 bg-background space-y-4">
                <div className="max-w-5xl mx-auto w-full">
                  <header className="mb-4">
                    <div className="space-y-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">TRANSACTIONS</span>
                      <div>
                        <h1 className="text-3xl font-bold text-foreground">Transaction History</h1>
                        <p className="text-sm text-muted-foreground">View recent invoices, payments, and cancelled transactions.</p>
                      </div>
                    </div>
                    <div className="border-b border-border mt-3"></div>
                  </header>

                  <div className="max-w-5xl mx-auto w-full">
                    <div className="bg-white rounded-xl shadow-sm border border-border overflow-hidden">
                      <div className="overflow-y-auto max-h-[60vh] space-y-3 p-4 scrollbar-hide">
                        {transactionHistory.length > 0 ? (
                          transactionHistory.map((transaction) => {
                        const items = Array.isArray(transaction.items) ? transaction.items : [];
                        const statusLabel = humanizeLabel(transaction.status);
                        const paymentLabel = Array.isArray(transaction.payment_methods) && transaction.payment_methods.length > 0
                          ? transaction.payment_methods.map(humanizeLabel).join(', ')
                          : '';
                        const isExpanded = expandedHistoryId === transaction.id;
                        const statusRaw = (transaction.status || '').toLowerCase();

                        return (
                          <div
                            key={transaction.id}
                            className={`bg-white border border-border rounded-lg shadow-sm hover:shadow-md transition p-4 flex flex-col sm:flex-row sm:items-center justify-between`}
                            style={{ maxWidth: '100%' }}
                          >
                            <div className="flex-1">
                              <h3 className="font-semibold text-foreground">{transaction.customer_name || 'Walk-in customer'}</h3>
                              <p className="text-xs text-muted-foreground">{transaction.created_at ? new Date(transaction.created_at).toLocaleString() : '—'}</p>
                              <p className="text-sm mt-1 text-muted-foreground">{items.length} items • {statusLabel}{paymentLabel ? ` • Payment: ${paymentLabel}` : ''}</p>
                            </div>

                            <div className="flex flex-col sm:items-end mt-3 sm:mt-0">
                              <p className="text-lg font-semibold text-foreground">{formatCurrency(transaction.total)}</p>
                              <span className={`text-xs font-medium mt-0.5 ${
                                statusRaw === 'paid' ? 'text-emerald-600' : statusRaw === 'cancelled' ? 'text-rose-600' : 'text-amber-600'
                              }`}>{(transaction.status || '').toUpperCase()}</span>

                              <div className="flex gap-3 mt-2 text-xs flex-wrap justify-end">
                                <button onClick={() => openHistoryPdf(transaction.id)} className="text-primary hover:underline">Receipt</button>
                                {canManageTransactions && (
                                  <>
                                    <button onClick={() => openHistoryEditor(transaction.id)} className="text-muted-foreground hover:underline">Edit</button>
                                    <button onClick={() => handleHistoryDelete(transaction.id)} className="text-rose-500 hover:underline">Delete</button>
                                  </>
                                )}
                                <button onClick={() => toggleHistoryDetails(transaction.id)} className="text-muted-foreground hover:underline">{isExpanded ? 'Hide' : 'Details'}</button>
                              </div>
                            </div>

                            {isExpanded && (
                              <div className="w-full mt-3 border-t pt-3 text-sm text-muted-foreground">
                                {items.length > 0 ? (
                                  items.map((item, idx) => (
                                    <div key={`${transaction.id}-${idx}`} className="flex justify-between py-1">
                                      <span>{item.product_name || `#${item.product_id || '-'}`}</span>
                                      <span className="text-muted-foreground">{item.quantity} × {formatCurrency(item.price)}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-muted-foreground">No line items recorded.</p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-20 text-muted-foreground">
                        <svg className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M8 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M16 3v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        <p>No transactions found yet</p>
                        <p className="text-sm">Create invoices to see them appear here.</p>
                      </div>
                    )}
                      </div>
                    </div>
                  </div>

                  {/* Summary container under the history to add visual weight */}
                  <div className="mt-4 max-w-5xl mx-auto w-full">
                    <div className="bg-white border border-border rounded-lg p-4 shadow-sm">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-muted-foreground">Total transactions</div>
                          <div className="text-lg font-semibold text-foreground">{transactionHistory.length}</div>
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground">Total value</div>
                          <div className="text-lg font-semibold text-foreground">{formatCurrency(transactionHistory.reduce((s, t) => s + (Number(t.total) || 0), 0))}</div>
                        </div>

                        <div>
                          <div className="text-xs text-muted-foreground">Cancelled</div>
                          <div className="text-lg font-semibold text-rose-600">{transactionHistory.filter(t => (t.status || '').toLowerCase() === 'cancelled').length}</div>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-3">Tip: Use filters to narrow results. Click a transaction to view details or print a receipt.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'held' && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Held Orders</h3>
                <div className="space-y-4">
                  {heldOrders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <h4 className="font-semibold">{order.name}</h4>
                          <p className="text-sm text-gray-600">
                            {new Date(order.timestamp).toLocaleString()}
                          </p>
                          <p className="text-sm text-gray-600">
                            {order.cart.length} items • {customers.find(c => c.id == order.customerId)?.name}
                          </p>
                        </div>
                        <button
                          onClick={() => recallHeldOrder(order.id)}
                          className="btn-primary px-4 py-2"
                        >
                          Recall
                        </button>
                      </div>
                      <div className="text-sm">
                        Total: {formatCurrency(order.cart.reduce((t, i) => t + i.price * i.quantity, 0))}
                      </div>
                    </div>
                  ))}
                  {heldOrders.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No held orders</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Cart and Customer */}
          <div className={`row-start-1 lg:row-auto ${cartOpenMobile ? '' : 'hidden lg:block'}`}>
            <div id="pos-cart-panel" className="bg-surface border border-border rounded-lg shadow-sm p-4 lg:sticky lg:top-6">
              {/* Close button for mobile */}
              <div className="flex justify-end lg:hidden mb-4">
                <button onClick={() => setCartOpenMobile(false)} className="px-3 py-1 text-sm text-gray-500 rounded hover:bg-gray-100">Close</button>
              </div>
                {/* Shift controls: start/end shift and badge for active shift */}
                <div className="mb-4 flex items-center justify-between gap-3">
                  {shiftStartedAt ? (
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 bg-muted/10 text-muted-foreground rounded-md text-sm font-medium" title={new Date(shiftStartedAt).toLocaleString()}>
                        Shift started {formatShiftRelative(shiftStartedAt)}
                      </div>
                      <button
                        onClick={async () => {
                          // stop shift: prefer server call, fall back to local clear
                          setShiftPending(true);
                          try {
                            const idToStop = shiftId || (await api.get('/shifts/active'))?.id;
                            if (idToStop) {
                              await api.post(`/shifts/${idToStop}/stop`, {});
                            }
                            localStorage.removeItem('pos_shift_started_at');
                            localStorage.removeItem('pos_shift_id');
                            setShiftStartedAt('');
                            setShiftId(null);
                            toast.push('Shift closed', 'info');
                          } catch (e) {
                            // fallback: clear local marker and notify user
                            try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch {
                              console.debug('Failed to clear shift keys from localStorage');
                            }
                            setShiftStartedAt(''); setShiftId(null);
                            toast.push('Shift closed locally (server unavailable)', 'warning');
                            console.debug('Failed to stop shift', e?.message || e);
                          } finally { setShiftPending(false); }
                        }}
                        className="px-3 py-2 bg-surface text-foreground rounded-md text-sm border border-border hover:bg-muted/50"
                        disabled={shiftPending}
                      >
                        {shiftPending ? 'Closing…' : 'End shift'}
                      </button>
                      <a href="/reports" className="px-3 py-2 bg-blue-50 text-blue-700 rounded-md text-sm">Reconcile</a>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setShiftPending(true);
                        try {
                          // try server start first
                          const payload = {};
                          const resp = await api.post('/shifts/start', payload);
                          if (resp && resp.started_at) {
                            const now = resp.started_at;
                            try { localStorage.setItem('pos_shift_started_at', now); localStorage.setItem('pos_shift_id', String(resp.id)); } catch {
                              console.debug('Failed to persist shift start to localStorage');
                            }
                            setShiftStartedAt(now);
                            setShiftId(resp.id || null);
                            toast.push('Shift started', 'info');
                          } else {
                            // fallback to local mark
                            const now = new Date().toISOString();
                            localStorage.setItem('pos_shift_started_at', now);
                            setShiftStartedAt(now);
                            toast.push('Shift started locally (server returned unexpected response)', 'warning');
                          }
                        } catch (e) {
                          // network error: fallback to local marker and notify
                          const now = new Date().toISOString();
                          try { localStorage.setItem('pos_shift_started_at', now); } catch {
                            console.debug('Failed to persist local shift marker');
                          }
                          setShiftStartedAt(now);
                          toast.push('Shift started locally (server unavailable)', 'warning');
                          console.debug('Failed to start shift', e?.message || e);
                        } finally { setShiftPending(false); }
                      }}
                      className="px-3 py-2 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90"
                      disabled={shiftPending}
                    >
                      {shiftPending ? 'Starting…' : 'Start shift'}
                    </button>
                  )}
                </div>
              {/* Customer Selection */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">Customer</label>
                  <button
                    onClick={() => setShowCustomerModal(true)}
                    className="text-primary hover:underline text-sm font-medium"
                  >
                    + Add Customer
                  </button>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    placeholder="Search customers..."
                    value={customerSearchTerm}
                    onChange={(e) => setCustomerSearchTerm(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground"
                  />
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground"
                  >
                    {filteredCustomers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Cart */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Cart ({cart.length} items)</h3>
                  {cart.length > 0 && (
                    <button
                      onClick={clearCart}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                  {cart.length === 0 && (
                    <p className="text-gray-500 text-center py-8">Your cart is empty</p>
                  )}
                  {cart.map((item) => (
                      <div key={item.id} className="flex justify-between items-center bg-surface p-3 rounded-lg border border-border">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{item.name}</p>
                        <p className="text-xs text-gray-600">{formatCurrency(item.price)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateCartQuantity(item.id, item.quantity - 1)}
                            className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded text-xs font-bold"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateCartQuantity(item.id, item.quantity + 1)}
                            className="w-6 h-6 bg-gray-200 hover:bg-gray-300 rounded text-xs font-bold"
                          >
                            +
                          </button>
                        </div>
                          <div className="text-right min-w-16">
                            <p className="font-bold text-sm text-foreground">{formatCurrency(item.price * item.quantity)}</p>
                          </div>
                        <button
                          onClick={() => removeFromCart(item.id)}
                            className="text-red-500 hover:text-red-700 font-bold text-lg ml-2"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totals and Actions */}
              {cart.length > 0 && (
                <div className="border-t pt-4 border-border">
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax ({gstRate}%)</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span>{formatCurrency(totalWithTax)}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <button
                      ref={payNowBtnRef}
                      onClick={() => setShowPaymentModal(true)}
                      className="w-full bg-primary text-primary-foreground font-semibold py-2 rounded-md mb-3 hover:bg-primary/90"
                      aria-label="Pay Now"
                    >
                      Pay Now (F5)
                    </button>
                    <button
                      onClick={() => handleCheckout('quote')}
                      className="w-full border border-border px-4 py-2 rounded-md font-semibold"
                    >
                      Generate Quote
                    </button>
                    <button
                      onClick={handleHoldOrder}
                      className="w-full border border-border px-4 py-2 rounded-md font-semibold"
                    >
                      Hold Order (F4)
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>


      {/* Mobile sticky cart bar */}
      {cart.length > 0 && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 p-3 bg-surface border-t border-border shadow-md flex items-center gap-3">
          <div className="flex-1 text-sm font-medium text-foreground">{cart.length} items • {formatCurrency(totalWithTax)}</div>
          <button onClick={() => setCartOpenMobile(true)} className="px-4 py-2 bg-primary text-primary-foreground rounded-md">Go to Cart</button>
        </div>
      )}
      {/* Payment Modal (uses shared Modal with align="start") */}
      {showPaymentModal && (
        <Modal open={showPaymentModal} onClose={closePaymentModal} labelledBy="payment-title" align="start" className="bg-white rounded-lg p-4 w-full max-w-md mx-4">
          <h3 id="payment-title" className="text-xl font-semibold mb-4">Payment</h3>

          <div className="mb-4">
            <p className="text-lg font-semibold">Total: {formatCurrency(totalWithTax)}</p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="cash">Cash</option>
              <option value="card">Card</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="check">Check</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Amount</label>
            <input
              type="number"
              step="0.01"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder={formatCurrency(totalWithTax)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              autoFocus
            />
          </div>

          {parseFloat(paymentAmount) > totalWithTax && (
            <div className="mb-4 p-3 bg-green-50 rounded">
              <p className="text-green-800 font-medium">Change: {formatCurrency(parseFloat(paymentAmount) - totalWithTax)}</p>
            </div>
          )}

          {paymentMethod !== 'cash' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reference Number</label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Enter transfer reference"
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          )}

          {isTransferPayment && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Slip</label>
              {paymentSlipPreview ? (
                <div className="space-y-2">
                  <img
                    src={resolveMediaUrl(paymentSlipPreview)}
                    alt="Transfer slip"
                    className="max-h-40 w-full rounded border object-contain"
                  />
                  <div className="flex items-center gap-3">
                    <a
                      href={resolveMediaUrl(paymentSlipPreview)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline"
                    >
                      Open
                    </a>
                    <button
                      type="button"
                      onClick={clearPaymentSlip}
                      className="text-sm text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePaymentSlipUpload(file);
                      if (e.target) e.target.value = '';
                    }}
                    disabled={paymentSlipUploading}
                    className="text-sm"
                  />
                  {paymentSlipUploading && <span className="text-sm text-gray-500">Uploading…</span>}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={handlePayment}
              disabled={isTransferPayment && paymentSlipUploading}
              className="flex-1 bg-green-500 text-white px-4 py-2 rounded font-semibold hover:bg-green-600"
            >
              Complete Payment
            </button>
            <button
              onClick={closePaymentModal}
              className="flex-1 bg-gray-500 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <Modal
          open={showCustomerModal}
          onClose={() => setShowCustomerModal(false)}
          labelledBy="add-customer-title"
          className="bg-white rounded-lg shadow-xl w-full max-w-3xl sm:max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden"
        >
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between px-6 py-5 border-b border-slate-200/60">
              <div>
                <h2 id="add-customer-title" className="text-lg font-semibold text-slate-900">Add new customer</h2>
                <p className="text-sm text-slate-500">Capture quick details so this sale is linked to the right customer.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCustomerModal(false)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                aria-label="Close add customer modal"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </header>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateCustomer();
              }}
              className="flex-1 overflow-y-auto px-6 py-6 grid gap-4 sm:grid-cols-2"
            >
              <div className="sm:col-span-2 flex flex-col gap-1 text-sm text-slate-600">
                <label htmlFor="pos-new-customer-name" className="font-medium text-slate-700">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="pos-new-customer-name"
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="border border-slate-200 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              <div className="flex flex-col gap-1 text-sm text-slate-600">
                <label htmlFor="pos-new-customer-email" className="font-medium text-slate-700">Email</label>
                <input
                  id="pos-new-customer-email"
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                  className="border border-slate-200 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-1 text-sm text-slate-600">
                <label htmlFor="pos-new-customer-phone" className="font-medium text-slate-700">Phone</label>
                <input
                  id="pos-new-customer-phone"
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="border border-slate-200 rounded px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="sm:col-span-2 mt-4 flex flex-col gap-3 border-t border-slate-200/60 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Create customer
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastTransaction && (
        <Modal open={showReceipt} onClose={() => setShowReceipt(false)} labelledBy="receipt-title" align="start" className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
          <div className="text-center mb-4">
            <h3 id="receipt-title" className="text-xl font-bold">Receipt</h3>
            <p className="text-sm text-gray-600">Transaction #{lastTransaction.id}</p>
          </div>

          <div className="border-t border-b py-4 my-4">
            <div className="text-center mb-4">
              <p className="font-semibold">{globalSettings?.outlet?.name || 'ITnVend'}</p>
              <p className="text-sm text-gray-600">{globalSettings?.outlet?.store_address}</p>
            </div>

            <div className="mb-4">
              <p><strong>Customer:</strong> {lastTransaction.customerName}</p>
              <p><strong>Date:</strong> {new Date(lastTransaction.timestamp).toLocaleString()}</p>
              <p><strong>Payment:</strong> {lastTransaction.type === 'quote' ? 'Pending' : (lastTransaction.paymentMethod || 'N/A')}</p>
            </div>

            <div className="space-y-2 mb-4">
              {lastTransaction.items.map((item, index) => (
                <div key={index} className="flex justify-between text-sm">
                  <span>{item.name} x{item.quantity}</span>
                  <span>{formatCurrency(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="border-t pt-2 space-y-1">
              <div className="flex justify-between text-sm">
                <span>Subtotal:</span>
                <span>{formatCurrency(lastTransaction.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Tax:</span>
                <span>{formatCurrency(lastTransaction.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Total:</span>
                <span>{formatCurrency(lastTransaction.total)}</span>
              </div>
              {lastTransaction.type !== 'quote' && (
                <div className="flex justify-between text-sm">
                  <span>Paid:</span>
                  <span>{formatCurrency(lastTransaction.paymentAmount)}</span>
                </div>
              )}
              {lastTransaction.changeAmount > 0 && (
                <div className="flex justify-between text-sm font-semibold">
                  <span>Change:</span>
                  <span>{formatCurrency(lastTransaction.changeAmount)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="text-center text-sm text-gray-600 mb-4">
            Thank you for your business!
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-blue-500 text-white px-4 py-2 rounded font-semibold hover:bg-blue-600"
            >
              Print Receipt
            </button>
            <button
              onClick={() => setShowReceipt(false)}
              className="flex-1 bg-gray-500 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600"
            >
              Close
            </button>
          </div>
        </Modal>
      )}

      {historyEditingId && (
        <InvoiceEditModal
          invoiceId={historyEditingId}
          onClose={() => setHistoryEditingId(null)}
          onSaved={() => {
            setHistoryEditingId(null);
            loadTransactionHistory();
            api.get('/products').then(setProducts);
          }}
        />
      )}
    </div>
  );
}
