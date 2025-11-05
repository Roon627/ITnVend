import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import InvoiceEditModal from '../components/InvoiceEditModal';
import { useStockUpdates, useOrderUpdates, useWebSocketRoom, useWebSocketEvent } from '../hooks/useWebSocket';
import { resolveMediaUrl } from '../lib/media';

export default function POS() {
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
  const [isPreorderCart, setIsPreorderCart] = useState(false);
  const [showPreorderPrompt, setShowPreorderPrompt] = useState(false);
  const [pendingPreorderProduct, setPendingPreorderProduct] = useState(null);
  const [pendingPreorderQuantity, setPendingPreorderQuantity] = useState(1);
  const [showPreorderModal, setShowPreorderModal] = useState(false);
  const [preorderSubmitting, setPreorderSubmitting] = useState(false);
  const [preorderForm, setPreorderForm] = useState({
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    deliveryAddress: '',
    notes: '',
    exchangeRate: 15.42,
    paymentReference: '',
    paymentDate: '',
    paymentBank: '',
  });

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
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [quantityInput, setQuantityInput] = useState({});
  const [activeTab, setActiveTab] = useState('products'); // products, history, held
  const [expandedHistoryId, setExpandedHistoryId] = useState(null);
  const [historyEditingId, setHistoryEditingId] = useState(null);

  const { settings: globalSettings, formatCurrency } = useSettings();
  const toast = useToast();
  const { user } = useAuth();
  const userRole = user?.role || '';
  const canManageTransactions = userRole === 'admin' || userRole === 'accounts';
  const searchInputRef = useRef(null);
  const payNowBtnRef = useRef(null);
  const selectedCustomer = selectedCustomerId
    ? customers.find((c) => String(c.id) === String(selectedCustomerId)) || null
    : null;

  const [shiftStartedAt, setShiftStartedAt] = useState(() => {
    try { return localStorage.getItem('pos_shift_started_at') || ''; } catch (e) { return ''; }
  });
  const [shiftId, setShiftId] = useState(() => {
    try { return localStorage.getItem('pos_shift_id') || null; } catch (e) { return null; }
  });
  const [shiftPending, setShiftPending] = useState(false);
  // Mobile cart/drawer state: hidden by default on small screens
  const [cartOpenMobile, setCartOpenMobile] = useState(false);

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
    } catch (e) { return ''; }
  };

  const humanizeLabel = (value) => {
    if (!value) return '—';
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };

  

  

  useEffect(() => {
    const isTransferPayment = paymentMethod === 'bank_transfer' || paymentMethod === 'transfer';
    if (!isTransferPayment) {
      resetPaymentDetails();
    }
  }, [paymentMethod, resetPaymentDetails]);

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
      try { localStorage.setItem('pos_shift_started_at', started); localStorage.setItem('pos_shift_id', String(shift.id)); } catch (e) {}
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
        try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch (e) {}
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

  useEffect(() => {
    if (!selectedCustomer) return;
    setPreorderForm((prev) => ({
      ...prev,
      customerName: prev.customerName || selectedCustomer.name || '',
      customerEmail: prev.customerEmail || selectedCustomer.email || '',
      customerPhone: prev.customerPhone || selectedCustomer.phone || '',
      deliveryAddress: prev.deliveryAddress || selectedCustomer.address || '',
    }));
  }, [selectedCustomer]);

  useEffect(() => {
    const candidate = Number(globalSettings?.exchange_rate || globalSettings?.outlet?.exchange_rate);
    if (Number.isFinite(candidate) && candidate > 0) {
      setPreorderForm((prev) => ({
        ...prev,
        exchangeRate: prev.exchangeRate || candidate,
      }));
    }
  }, [globalSettings]);

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
    const flag = item.availableForPreorder
      || item.available_for_preorder
      || item.preorder_enabled === 1
      || item.preorder_enabled === true
      || item.preorder_enabled === '1';
    return Boolean(flag);
  }, []);

  const normalizeProduct = useCallback((product) => {
    if (!product || typeof product !== 'object') return product;
    return {
      ...product,
      availableForPreorder: markPreorderFlag(product),
    };
  }, [markPreorderFlag]);

  const cartContainsPreorder = useCallback((items) => {
    if (!Array.isArray(items)) return false;
    return items.some((entry) => markPreorderFlag(entry));
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
      preorder: cartContainsPreorder(cart)
    };

    const updatedHeldOrders = [...heldOrders, heldOrder];
    saveHeldOrders(updatedHeldOrders);
    setCart([]);
    setIsPreorderCart(false);
    setShowPreorderModal(false);
    setShowPreorderPrompt(false);
    setPendingPreorderProduct(null);
    toast.push('Order held successfully', 'success');
  }, [cart, cartContainsPreorder, heldOrders, selectedCustomerId, toast]);

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
          } catch (e) { /* ignore */ }
        }
      } catch (e) {
        // ignore sync errors; fall back to localStorage
        console.debug('Failed to sync active shift', e?.message || e);
      }
    })();
  }, [loadInitialData, loadTransactionHistory]);

  // Reload history when switching to history tab
  useEffect(() => {
    if (activeTab === 'history') {
      loadTransactionHistory();
    }
  }, [activeTab, loadTransactionHistory]);

  // Held orders still persist locally because they are POS-specific drafts

  const addToCart = (product, customQuantity = null, forcePreorder = false) => {
    if (!product) return;

    const preorderItem = markPreorderFlag(product);
    const desiredQuantity = customQuantity || quantityInput[product.id] || 1;

    if (preorderItem && !forcePreorder && !isPreorderCart) {
      setPendingPreorderProduct(product);
      setPendingPreorderQuantity(desiredQuantity);
      setShowPreorderPrompt(true);
      return;
    }

    const skipStockCheck = preorderItem || isPreorderCart;
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
        updatedCart = [...currentCart, { ...product, quantity: desiredQuantity, availableForPreorder: preorderItem }];
      }
      setIsPreorderCart(cartContainsPreorder(updatedCart));
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
    const skipStockCheck = isPreorderCart || markPreorderFlag(product) || markPreorderFlag(cartEntry);
    if (!skipStockCheck && product && newQuantity > product.stock) {
      toast.push(`Only ${product.stock} items available in stock`, 'warning');
      return;
    }

    setCart((currentCart) =>
      {
        const updated = currentCart.map((item) =>
          item.id === productId ? { ...item, quantity: newQuantity } : item
        );
        setIsPreorderCart(cartContainsPreorder(updated));
        return updated;
      }
    );
  };

  const removeFromCart = (productId) => {
    setCart((currentCart) => {
      const updated = currentCart.filter((i) => i.id !== productId);
      setIsPreorderCart(cartContainsPreorder(updated));
      return updated;
    });
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('Are you sure you want to clear the cart?')) {
      setCart([]);
      setIsPreorderCart(false);
      setShowPreorderModal(false);
      setShowPreorderPrompt(false);
      setPendingPreorderProduct(null);
    }
  };

  

  const recallHeldOrder = (orderId) => {
    const order = heldOrders.find(o => o.id === orderId);
    if (order) {
      setCart(order.cart);
      setIsPreorderCart(cartContainsPreorder(order.cart));
      setSelectedCustomerId(order.customerId);
      // Remove from held orders
      const updatedHeldOrders = heldOrders.filter(o => o.id !== orderId);
      saveHeldOrders(updatedHeldOrders);
      toast.push('Order recalled successfully', 'success');
    }
  };

  const handlePayment = () => {
    if (isPreorderCart) {
      toast.push('Submit preorder carts via the preorder form.', 'warning');
      return;
    }
    const total = totalWithTax;
    const paid = parseFloat(paymentAmount) || 0;

    if (paid < total) {
      toast.push('Payment amount is less than total', 'error');
      return;
    }

    setChangeAmount(paid - total);
    handleCheckout('invoice');
  };

  const handleCheckout = async (type = 'invoice', extras = {}) => {
    const normalizedType = typeof type === 'string' ? type.toLowerCase() : 'invoice';
    const validItemsForCheckout = cart.filter(i => Number(i.quantity || 0) > 0);
    if (!selectedCustomerId || validItemsForCheckout.length === 0) {
      toast.push('Please select a customer and add items (quantity > 0) to the cart.', 'warning');
      return false;
    }

    if (isPreorderCart && normalizedType !== 'preorder') {
      toast.push('This cart contains preorder items. Submit it as a preorder.', 'warning');
      return false;
    }

    if (normalizedType === 'preorder') {
      const {
        customerName,
        customerEmail,
        customerPhone,
        deliveryAddress,
        notes,
        exchangeRate,
        paymentReference: preorderPaymentReference,
        paymentDate: preorderPaymentDate,
        paymentBank: preorderPaymentBank,
      } = extras || {};

      const nameValue = (customerName || '').trim() || selectedCustomer?.name || '';
      const emailValue = (customerEmail || '').trim() || selectedCustomer?.email || '';
      const phoneValue = (customerPhone || '').trim() || selectedCustomer?.phone || '';

      if (!nameValue) {
        toast.push('Customer name is required for preorders.', 'warning');
        return false;
      }
      if (!emailValue) {
        toast.push('Customer email is required for preorders.', 'warning');
        return false;
      }
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(emailValue)) {
        toast.push('Enter a valid email address.', 'warning');
        return false;
      }
      if (!phoneValue) {
        toast.push('Customer phone number is required for preorders.', 'warning');
        return false;
      }

      const exchangeValue = Number(exchangeRate);
      const payload = {
        customerId: Number(selectedCustomerId),
        customerName: nameValue,
        customerEmail: emailValue,
        customerPhone: phoneValue,
        deliveryAddress: (deliveryAddress || '').trim() || selectedCustomer?.address || '',
        notes: (notes || '').trim() || null,
        exchangeRate: Number.isFinite(exchangeValue) && exchangeValue > 0 ? exchangeValue : 15.42,
        subtotal: cartTotal,
        taxAmount,
        total: totalWithTax,
        items: validItemsForCheckout.map((item) => ({
          productId: item.id || item.product_id || null,
          productName: item.name || item.product_name,
          quantity: Number(item.quantity) || 0,
          price: Number(item.price) || 0,
        })),
        payment: {
          reference: (preorderPaymentReference || '').trim() || null,
          date: (preorderPaymentDate || '').trim() || null,
          bank: (preorderPaymentBank || '').trim() || null,
        },
      };

      try {
        await api.post('/preorders', payload);
        toast.push('Preorder submitted successfully', 'success');
        setShowPreorderModal(false);
        setIsPreorderCart(false);
        setCart([]);
        setQuantityInput({});
        setPreorderForm((prev) => ({
          ...prev,
          notes: '',
          paymentReference: '',
          paymentDate: '',
          paymentBank: '',
        }));
        setPendingPreorderProduct(null);
        return true;
      } catch (err) {
        const message = err?.message || 'Failed to submit preorder';
        toast.push(message, 'error');
        return false;
      }
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

      const linkResp = await api.post(`/invoices/${created.id}/pdf-link`);
      window.open(linkResp.url);

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
      toast.push(normalizedType === 'invoice' ? 'Failed to create invoice' : 'Failed to create quote', 'error');
      return false;
    }
  };

  const handlePreorderSubmit = async (event) => {
    event.preventDefault();
    if (preorderSubmitting) return;
    setPreorderSubmitting(true);
    const success = await handleCheckout('preorder', preorderForm);
    setPreorderSubmitting(false);
    if (!success) return;
    setShowPreorderModal(false);
  };

  const handlePreorderPromptConfirm = () => {
    if (!pendingPreorderProduct) {
      setShowPreorderPrompt(false);
      return;
    }
    setIsPreorderCart(true);
    setShowPreorderPrompt(false);
    addToCart(pendingPreorderProduct, pendingPreorderQuantity, true);
    setPendingPreorderProduct(null);
    setShowPreorderModal(true);
  };

  const handlePreorderPromptCancel = () => {
    setShowPreorderPrompt(false);
    setPendingPreorderProduct(null);
  };

  const handlePreorderFieldChange = (field) => (event) => {
    const value = event?.target?.value ?? '';
    setPreorderForm((prev) => ({
      ...prev,
      [field]: value,
    }));
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
    <div className="min-h-screen bg-gray-50">
      {/* Keyboard Shortcuts Help (styled) */}
  <div className="accent-gradient text-white text-sm py-2 px-4 text-center shadow-md">
        <span className="font-semibold">Keyboard Shortcuts:</span>
        <span className="mx-2">F1 / f: Search</span>
        <span className="mx-2">F2: Products</span>
        <span className="mx-2">F3: History</span>
        <span className="mx-2">F4: Hold</span>
        <span className="mx-2">F5: Payment</span>
        <span className="mx-2">c: Focus Cart</span>
      </div>

      <main className="p-4 sm:p-6">
  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 lg:gap-8">
          {/* Left Panel - Products/Categories/History */}
          <div className="lg:col-span-3">
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
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
              <div className="flex flex-wrap items-center gap-2 sm:gap-4 border-b overflow-x-auto pb-2">
                <button
                  onClick={() => setActiveTab('products')}
                  className={`whitespace-nowrap py-2 px-4 font-medium ${activeTab === 'products' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
                >
                  Products (F2)
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`whitespace-nowrap py-2 px-4 font-medium ${activeTab === 'history' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
                >
                  History (F3)
                </button>
                <button
                  onClick={() => setActiveTab('held')}
                  className={`whitespace-nowrap py-2 px-4 font-medium ${activeTab === 'held' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
                >
                  Held Orders ({heldOrders.length})
                </button>
              </div>
            </div>

            {activeTab === 'products' && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                {/* Search and Category Filters */}
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <input
                      ref={searchInputRef}
                      type="text"
                      placeholder="Search products... (F1)"
                      value={productSearchTerm}
                      onChange={(e) => setProductSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <select
                      value={selectedCategory}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All Categories</option>
                      {Object.keys(categories).map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Products Grid - larger cards with images and click-to-add */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                  {filteredProducts.map((p) => {
                    const imageSrc = resolveMediaUrl(
                      p.image_source || p.imageUrl || p.image || p.image_url || null
                    );
                    return (
                      <div
                        key={p.id}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') addToCart(p); }}
                        onClick={() => addToCart(p)}
                        className={`border rounded-lg overflow-hidden bg-white flex flex-col transition-all duration-200 cursor-pointer ${p.stock > 0 ? 'hover:shadow-2xl hover:scale-105' : 'opacity-60 grayscale'}`}
                        aria-label={`Add ${p.name} to cart`}
                      >
                      {/* Image (if present) */}
                      {imageSrc ? (
                        <img src={imageSrc} alt={p.name} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="h-40 w-full bg-gray-100 flex items-center justify-center text-gray-400">No image</div>
                      ) }

                      <div className="p-4 flex-1 flex flex-col">
                        <div className="flex justify-between items-start gap-2">
                          <h3 className="font-bold text-lg text-gray-800 truncate">{p.name}</h3>
                          <p className="text-blue-600 font-bold">{formatCurrency(p.price)}</p>
                        </div>
                        <p className={`mt-1 text-sm font-medium ${p.stock > 10 ? 'text-green-600' : p.stock > 0 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                        </p>
                        {p.category && (
                          <span className="inline-block bg-gray-50 text-gray-800 text-xs px-2 py-1 rounded mt-2">
                            {p.category}
                          </span>
                        )}

                        {p.stock > 0 && (
                          <div className="mt-4 flex flex-wrap items-center gap-3">
                            <input
                              onClick={(e) => e.stopPropagation()}
                              type="number"
                              min="1"
                              max={p.stock}
                              value={quantityInput[p.id] || 1}
                              onChange={(e) => setQuantityInput(prev => ({ ...prev, [p.id]: parseInt(e.target.value) || 1 }))}
                              className="w-20 px-2 py-1 border border-gray-300 rounded text-center text-sm"
                              aria-label={`Quantity for ${p.name}`}
                            />

                            <button
                              onClick={(e) => { e.stopPropagation(); addToCart(p, quantityInput[p.id] || 1); }}
                              className="flex-1 accent-btn px-4 py-2 rounded-md font-semibold min-w-[120px]"
                            >
                              Add
                            </button>

                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { e.stopPropagation(); addToCart(p, 5); }}
                                title="Quick add 5"
                                className="w-12 h-10 bg-gray-100 rounded-md text-sm hover:bg-gray-200"
                              >
                                +5
                              </button>
                            </div>
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
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Transaction History</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {transactionHistory.map((transaction) => {
                    const items = Array.isArray(transaction.items) ? transaction.items : [];
                    const statusLabel = humanizeLabel(transaction.status);
                    const paymentLabel = Array.isArray(transaction.payment_methods) && transaction.payment_methods.length > 0
                      ? transaction.payment_methods.map(humanizeLabel).join(', ')
                      : '';
                    const isExpanded = expandedHistoryId === transaction.id;
                    const typeIsQuote = (transaction.type || '').toLowerCase() === 'quote';
                    return (
                      <div key={transaction.id} className="border rounded-lg p-4 bg-white/70">
                        <div className="flex justify-between items-start gap-3">
                          <div>
                            <p className="font-semibold text-gray-800">{transaction.customer_name || 'Walk-in customer'}</p>
                            <p className="text-sm text-gray-600">
                              {transaction.created_at ? new Date(transaction.created_at).toLocaleString() : '—'}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">Status: {statusLabel}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-gray-900">{formatCurrency(transaction.total)}</p>
                            <span
                              className={`px-2 py-1 rounded text-xs font-semibold uppercase ${
                                typeIsQuote ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {humanizeLabel(transaction.type)}
                            </span>
                            <button
                              onClick={() => toggleHistoryDetails(transaction.id)}
                              className="block text-xs text-blue-600 hover:underline mt-2"
                            >
                              {isExpanded ? 'Hide details' : 'View details'}
                            </button>
                          </div>
                        </div>
                        <div className="text-sm text-gray-600 mt-2">
                          {items.length} items • {statusLabel}
                          {paymentLabel && (
                            <span className="ml-1">• Payment: {paymentLabel}</span>
                          )}
                        </div>
                        {isExpanded && (
                          <div className="mt-3 border-t pt-3 space-y-2 text-sm text-gray-700">
                            {items.length > 0 ? (
                              items.map((item, idx) => (
                                <div key={`${transaction.id}-${idx}`} className="flex justify-between">
                                  <span>{item.product_name || `#${item.product_id || '-'}`}</span>
                                  <span className="text-gray-500">
                                    {item.quantity} × {formatCurrency(item.price)}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <p className="text-gray-500">No line items recorded.</p>
                            )}
                          </div>
                        )}
                        <div className="mt-4 flex justify-end gap-3 text-sm">
                          <button
                            onClick={() => openHistoryPdf(transaction.id)}
                            className="text-blue-600 hover:underline"
                          >
                            Receipt
                          </button>
                          {canManageTransactions && (
                            <>
                              <button
                                onClick={() => openHistoryEditor(transaction.id)}
                                className="text-indigo-600 hover:underline"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleHistoryDelete(transaction.id)}
                                className="text-red-600 hover:underline"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {transactionHistory.length === 0 && (
                    <p className="text-gray-500 text-center py-8">No transactions yet</p>
                  )}
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
            <div id="pos-cart-panel" className="bg-white rounded-xl shadow-lg p-6 lg:sticky lg:top-6 lg:col-start-4">
              {/* Close button for mobile */}
              <div className="flex justify-end lg:hidden mb-4">
                <button onClick={() => setCartOpenMobile(false)} className="px-3 py-1 text-sm text-gray-500 rounded hover:bg-gray-100">Close</button>
              </div>
                {/* Shift controls: start/end shift and badge for active shift */}
                <div className="mb-4 flex items-center justify-between gap-3">
                  {shiftStartedAt ? (
                    <div className="flex items-center gap-3">
                      <div className="px-3 py-2 bg-yellow-50 text-yellow-800 rounded-md text-sm font-medium" title={new Date(shiftStartedAt).toLocaleString()}>
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
                            try { localStorage.removeItem('pos_shift_started_at'); localStorage.removeItem('pos_shift_id'); } catch (err) {}
                            setShiftStartedAt(''); setShiftId(null);
                            toast.push('Shift closed locally (server unavailable)', 'warning');
                            console.debug('Failed to stop shift', e?.message || e);
                          } finally { setShiftPending(false); }
                        }}
                        className="px-3 py-2 bg-gray-100 text-gray-800 rounded-md text-sm hover:bg-gray-200"
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
                            try { localStorage.setItem('pos_shift_started_at', now); localStorage.setItem('pos_shift_id', String(resp.id)); } catch (e) {}
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
                          try { localStorage.setItem('pos_shift_started_at', now); } catch (err) {}
                          setShiftStartedAt(now);
                          toast.push('Shift started locally (server unavailable)', 'warning');
                          console.debug('Failed to start shift', e?.message || e);
                        } finally { setShiftPending(false); }
                      }}
                      className="px-3 py-2 bg-yellow-500 text-white rounded-md text-sm hover:bg-yellow-600"
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
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
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
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  <select
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
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
                    <div key={item.id} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
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
                          <p className="font-bold text-sm">{formatCurrency(item.price * item.quantity)}</p>
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
                <div className="border-t pt-4">
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
                    {isPreorderCart ? (
                      <button
                        onClick={() => setShowPreorderModal(true)}
                        className="w-full accent-btn px-4 py-3 rounded-lg font-bold text-lg"
                      >
                        Finalize Preorder
                      </button>
                    ) : (
                      <button
                        ref={payNowBtnRef}
                        onClick={() => setShowPaymentModal(true)}
                        className="w-full accent-btn px-4 py-3 rounded-lg font-bold text-lg"
                        aria-label="Pay Now"
                      >
                        Pay Now (F5)
                      </button>
                    )}
                    <button
                      onClick={() => handleCheckout('quote')}
                      disabled={isPreorderCart}
                      className={`w-full btn-secondary px-4 py-3 rounded-lg font-semibold${isPreorderCart ? ' opacity-50 cursor-not-allowed' : ''}`}
                    >
                      Generate Quote
                    </button>
                    <button
                      onClick={handleHoldOrder}
                      className="w-full accent-outline px-4 py-3 rounded-lg font-semibold"
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

      {/* Preorder Prompt */}
      {showPreorderPrompt && pendingPreorderProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold mb-3">Start a preorder?</h3>
            <p className="text-sm text-gray-600">
              {pendingPreorderProduct.name} is only available as a preorder. Start a preorder cart to continue
              and capture the customer details.
            </p>
            <div className="mt-4">
              <p className="text-sm text-gray-700"><strong>Quantity:</strong> {pendingPreorderQuantity}</p>
              <p className="text-sm text-gray-700"><strong>Price:</strong> {formatCurrency(pendingPreorderProduct.price)}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button
                onClick={handlePreorderPromptConfirm}
                className="flex-1 accent-btn px-4 py-2 rounded font-semibold"
              >
                Start Preorder
              </button>
              <button
                onClick={handlePreorderPromptCancel}
                className="flex-1 accent-outline px-4 py-2 rounded font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preorder Modal */}
      {showPreorderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
              <div>
                <h3 className="text-2xl font-semibold">Preorder Details</h3>
                <p className="text-sm text-gray-600">Review the cart and fill out customer contact information.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPreorderModal(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="mb-6 border rounded-lg p-4 bg-gray-50">
              <h4 className="font-semibold text-gray-800 mb-3">Cart Summary</h4>
              <div className="space-y-2 text-sm text-gray-700">
                {validCartItems.map((item) => (
                  <div key={item.id} className="flex justify-between">
                    <span>{item.name} × {item.quantity}</span>
                    <span>{formatCurrency(Number(item.price || 0) * Number(item.quantity || 0))}</span>
                  </div>
                ))}
              </div>
              <div className="border-t mt-3 pt-3 text-sm text-gray-700 space-y-1">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tax ({gstRate}%)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>{formatCurrency(totalWithTax)}</span>
                </div>
              </div>
            </div>

            <form onSubmit={handlePreorderSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={preorderForm.customerName}
                    onChange={handlePreorderFieldChange('customerName')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Email *</label>
                  <input
                    type="email"
                    value={preorderForm.customerEmail}
                    onChange={handlePreorderFieldChange('customerEmail')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Customer Phone *</label>
                  <input
                    type="tel"
                    value={preorderForm.customerPhone}
                    onChange={handlePreorderFieldChange('customerPhone')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Exchange Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    value={preorderForm.exchangeRate}
                    onChange={handlePreorderFieldChange('exchangeRate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Address</label>
                <textarea
                  value={preorderForm.deliveryAddress}
                  onChange={handlePreorderFieldChange('deliveryAddress')}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Reference</label>
                  <input
                    type="text"
                    value={preorderForm.paymentReference}
                    onChange={handlePreorderFieldChange('paymentReference')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={preorderForm.paymentDate}
                    onChange={handlePreorderFieldChange('paymentDate')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Payment Bank</label>
                  <input
                    type="text"
                    value={preorderForm.paymentBank}
                    onChange={handlePreorderFieldChange('paymentBank')}
                    className="w-full px-3 py-2 border border-gray-300 rounded"
                    placeholder="Optional"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={preorderForm.notes}
                  onChange={handlePreorderFieldChange('notes')}
                  className="w-full px-3 py-2 border border-gray-300 rounded"
                  rows={3}
                  placeholder="Special instructions or preorder terms"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowPreorderModal(false)}
                  className="sm:w-auto w-full accent-outline px-4 py-2 rounded font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={preorderSubmitting}
                  className={`sm:w-auto w-full accent-btn px-4 py-2 rounded font-semibold${preorderSubmitting ? ' opacity-75 cursor-wait' : ''}`}
                >
                  {preorderSubmitting ? 'Submitting…' : 'Submit Preorder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold mb-4">Payment</h3>

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
          </div>
        </div>
      )}

      {/* Customer Modal */}
      {showCustomerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-semibold mb-4">Add New Customer</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={newCustomer.email}
                  onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleCreateCustomer}
                className="flex-1 bg-blue-500 text-white px-4 py-2 rounded font-semibold hover:bg-blue-600"
              >
                Create Customer
              </button>
              <button
                onClick={() => setShowCustomerModal(false)}
                className="flex-1 bg-gray-500 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt Modal */}
      {showReceipt && lastTransaction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-screen overflow-y-auto">
            <div className="text-center mb-4">
              <h3 className="text-xl font-bold">Receipt</h3>
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
                <p><strong>Payment:</strong> {lastTransaction.paymentMethod}</p>
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
                <div className="flex justify-between text-sm">
                  <span>Paid:</span>
                  <span>{formatCurrency(lastTransaction.paymentAmount)}</span>
                </div>
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
          </div>
        </div>
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
