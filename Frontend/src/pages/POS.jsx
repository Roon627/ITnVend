import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import { useAuth } from '../components/AuthContext';
import { useStockUpdates, useOrderUpdates, useWebSocketRoom } from '../hooks/useWebSocket';

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
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', email: '', phone: '' });
  const [quantityInput, setQuantityInput] = useState({});
  const [activeTab, setActiveTab] = useState('products'); // products, history, held
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [stockModalProduct, setStockModalProduct] = useState(null);
  const [stockModalValue, setStockModalValue] = useState('');
  const [stockModalReason, setStockModalReason] = useState('');

  const { settings: globalSettings, formatCurrency } = useSettings();
  const toast = useToast();
  const { user } = useAuth();
  const searchInputRef = useRef(null);
  const payNowBtnRef = useRef(null);

  useEffect(() => {
    loadInitialData();
    loadHeldOrders();
    loadTransactionHistory();

    // Keyboard shortcuts
    const handleKeyPress = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'f1':
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'f':
          // quick 'f' also focuses search for faster keyboards
          e.preventDefault();
          searchInputRef.current?.focus();
          break;
        case 'c':
          // focus the Pay Now button / cart area
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
          if (showPaymentModal) setShowPaymentModal(false);
          if (showCustomerModal) setShowCustomerModal(false);
          if (showReceipt) setShowReceipt(false);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showPaymentModal, showCustomerModal, showReceipt]);

  // WebSocket real-time updates
  useWebSocketRoom('staff', !!user); // Join staff room when user is logged in

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

  const loadInitialData = async () => {
    try {
      const [productsData, customersData, categoriesData] = await Promise.all([
        api.get('/products'),
        api.get('/customers'),
        api.get('/products/categories')
      ]);

  setProducts(productsData);
  setCustomers(Array.isArray(customersData) ? customersData : []);
  setCategories(categoriesData);

      if (customersData.length > 0) {
        setSelectedCustomerId(customersData[0].id);
      }
    } catch (error) {
      toast.push('Failed to load data', 'error');
    }
  };

  const loadHeldOrders = () => {
    const held = JSON.parse(localStorage.getItem('pos_held_orders') || '[]');
    setHeldOrders(held);
  };

  const loadTransactionHistory = () => {
    const history = JSON.parse(localStorage.getItem('pos_transaction_history') || '[]');
    setTransactionHistory(history.slice(-50)); // Keep last 50 transactions
  };

  const saveHeldOrders = (orders) => {
    localStorage.setItem('pos_held_orders', JSON.stringify(orders));
    setHeldOrders(orders);
  };

  const saveTransactionHistory = (transaction) => {
    const history = JSON.parse(localStorage.getItem('pos_transaction_history') || '[]');
    history.unshift(transaction);
    const limitedHistory = history.slice(0, 50);
    localStorage.setItem('pos_transaction_history', JSON.stringify(limitedHistory));
    setTransactionHistory(limitedHistory);
  };

  const addToCart = (product, customQuantity = null) => {
    if (product.stock <= 0) return;

    const quantity = customQuantity || quantityInput[product.id] || 1;

    if (quantity > product.stock) {
      toast.push(`Only ${product.stock} items available in stock`, 'warning');
      return;
    }

    setCart((currentCart) => {
      const existing = currentCart.find((i) => i.id === product.id);
      if (existing) {
        const newQuantity = existing.quantity + quantity;
        if (newQuantity > product.stock) {
          toast.push(`Cannot add more than ${product.stock} items`, 'warning');
          return currentCart;
        }
        return currentCart.map((i) =>
          i.id === product.id ? { ...i, quantity: newQuantity } : i
        );
      }
      return [...currentCart, { ...product, quantity }];
    });

    // Clear quantity input for this product
    setQuantityInput(prev => ({ ...prev, [product.id]: 1 }));
  };

  const updateCartQuantity = (productId, newQuantity) => {
    if (newQuantity <= 0) {
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (product && newQuantity > product.stock) {
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

  const handleHoldOrder = () => {
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
      timestamp: new Date().toISOString()
    };

    const updatedHeldOrders = [...heldOrders, heldOrder];
    saveHeldOrders(updatedHeldOrders);
    setCart([]);
    toast.push('Order held successfully', 'success');
  };

  const recallHeldOrder = (orderId) => {
    const order = heldOrders.find(o => o.id === orderId);
    if (order) {
      setCart(order.cart);
      setSelectedCustomerId(order.customerId);
      // Remove from held orders
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
    setShowPaymentModal(false);
    handleCheckout('invoice');
  };

  const handleCheckout = async (type = 'invoice') => {
    if (!selectedCustomerId || cart.length === 0) {
      toast.push('Please select a customer and add items to the cart.', 'warning');
      return;
    }

    try {
      const payload = { customerId: Number(selectedCustomerId), items: cart, type };
      const created = await api.post('/invoices', payload);

      // Create transaction record
      const transaction = {
        id: created.id,
        type,
        customerId: selectedCustomerId,
        customerName: customers.find(c => c.id == selectedCustomerId)?.name,
        items: cart,
        subtotal: cartTotal,
        taxAmount,
        total: totalWithTax,
        paymentMethod,
        paymentAmount: parseFloat(paymentAmount) || totalWithTax,
        changeAmount,
        timestamp: new Date().toISOString()
      };

      setLastTransaction(transaction);
      saveTransactionHistory(transaction);

      // Get signed PDF link and open it
      const linkResp = await api.post(`/invoices/${created.id}/pdf-link`);
      window.open(linkResp.url);

      // Reload products to update stock
      api.get('/products').then(setProducts);

      // Clear cart and reset
      setCart([]);
      setPaymentAmount('');
      setChangeAmount(0);
      setPaymentMethod('cash');
      setShowReceipt(true);

      toast.push(type === 'invoice' ? 'Invoice created successfully' : 'Quote generated successfully', 'success');
    } catch (err) {
      toast.push(type === 'invoice' ? 'Failed to create invoice' : 'Failed to create quote', 'error');
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
      toast.push('Failed to create customer', 'error');
    }
  };

  const handleOpenStockModal = (product) => {
    setStockModalProduct(product);
    setStockModalValue(product.stock ?? 0);
    setStockModalReason('');
    setStockModalOpen(true);
  };

  const handleSaveStock = async () => {
    if (!stockModalProduct) return;
    // Only managers/admins allowed to perform official stock adjustments
    const allowed = user && ['manager', 'admin'].includes(user.role);
    if (!allowed) {
      toast.push('Only managers or administrators may adjust stock', 'warning');
      return;
    }
    // enforce reason client-side (server also validates)
    if (!stockModalReason || String(stockModalReason).trim().length === 0) {
      toast.push('Please provide a reason for this stock adjustment (required)', 'warning');
      return;
    }

    const newStock = parseInt(stockModalValue, 10) || 0;
    try {
      const res = await api.post(`/products/${stockModalProduct.id}/adjust-stock`, { new_stock: newStock, reason: String(stockModalReason).trim() });
      // refresh products
      api.get('/products').then(setProducts);
      toast.push('Stock updated', 'success');
      setStockModalOpen(false);
      setStockModalProduct(null);
      setStockModalReason('');
    } catch (err) {
      console.error('Failed to update stock', err);
      toast.push('Failed to update stock', 'error');
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

  const cartTotal = cart.reduce((t, i) => t + i.price * i.quantity, 0);
  const gstRate = globalSettings?.outlet?.gst_rate ?? globalSettings?.gst_rate ?? 0;
  const taxAmount = +(cartTotal * (gstRate / 100));
  const totalWithTax = +(cartTotal + taxAmount);

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

      <main className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Left Panel - Products/Categories/History */}
          <div className="lg:col-span-3">
            {/* Tab Navigation */}
            <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
              <div className="flex space-x-4 border-b">
                <button
                  onClick={() => setActiveTab('products')}
                  className={`py-2 px-4 font-medium ${activeTab === 'products' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
                >
                  Products (F2)
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`py-2 px-4 font-medium ${activeTab === 'history' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
                >
                  History (F3)
                </button>
                <button
                  onClick={() => setActiveTab('held')}
                  className={`py-2 px-4 font-medium ${activeTab === 'held' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500'}`}
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
                  {filteredProducts.map((p) => (
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
                      { (p.image || p.image_url) ? (
                        <img src={p.image || p.image_url} alt={p.name} className="h-40 w-full object-cover" />
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
                          <div className="mt-4 flex items-center gap-3">
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
                              className="flex-1 accent-btn px-4 py-2 rounded-md font-semibold"
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
                              { (user && ['manager','admin'].includes(user.role)) ? (
                                <button
                                  onClick={(e) => { e.stopPropagation(); setStockModalProduct(p); setStockModalValue(p.stock ?? 0); setStockModalReason(''); setStockModalOpen(true); }}
                                  title="Edit stock"
                                  className="w-10 h-10 bg-gray-50 rounded-md text-sm hover:bg-gray-100 flex items-center justify-center"
                                  aria-label={`Edit stock for ${p.name}`}
                                >
                                  ✎
                                </button>
                              ) : (
                                <button
                                  disabled
                                  title="Edit stock (manager only)"
                                  className="w-10 h-10 bg-gray-50 rounded-md text-sm opacity-40 cursor-not-allowed flex items-center justify-center"
                                >
                                  ✎
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-semibold mb-4">Transaction History</h3>
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {transactionHistory.map((transaction) => (
                    <div key={transaction.id} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="font-semibold">{transaction.customerName}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(transaction.timestamp).toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg">{formatCurrency(transaction.total)}</p>
                          <span className={`px-2 py-1 rounded text-xs ${
                            transaction.type === 'invoice' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {transaction.type}
                          </span>
                        </div>
                      </div>
                      <div className="text-sm text-gray-600">
                        {transaction.items.length} items • {transaction.paymentMethod}
                      </div>
                    </div>
                  ))}
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
          <div className="row-start-1 lg:row-auto">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6 lg:col-start-4">
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
                <div className="flex gap-2">
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
                            <button
                              ref={payNowBtnRef}
                              onClick={() => setShowPaymentModal(true)}
                              className="w-full accent-btn px-4 py-3 rounded-lg font-bold text-lg"
                              aria-label="Pay Now"
                            >
                              Pay Now (F5)
                            </button>
                    <button
                      onClick={() => handleCheckout('quote')}
                      className="w-full btn-secondary px-4 py-3 rounded-lg font-semibold"
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

            <div className="flex gap-2">
              <button
                onClick={handlePayment}
                className="flex-1 bg-green-500 text-white px-4 py-2 rounded font-semibold hover:bg-green-600"
              >
                Complete Payment
              </button>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 bg-gray-500 text-white px-4 py-2 rounded font-semibold hover:bg-gray-600"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Edit Modal */}
      {stockModalOpen && stockModalProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold mb-4">Edit Stock — {stockModalProduct.name}</h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Stock quantity</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setStockModalValue((v) => String(Math.max(0, (parseInt(v, 10) || 0) - 1)))}
                  className="w-10 h-10 bg-gray-100 rounded-md"
                  type="button"
                >
                  -
                </button>
                <input
                  type="number"
                  value={stockModalValue}
                  onChange={(e) => setStockModalValue(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                />
                <button
                  onClick={() => setStockModalValue((v) => String((parseInt(v, 10) || 0) + 1))}
                  className="w-10 h-10 bg-gray-100 rounded-md"
                  type="button"
                >
                  +
                </button>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Reason (required for audit)</label>
              <input
                type="text"
                value={stockModalReason}
                onChange={(e) => setStockModalReason(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g. Received shipment, inventory correction, damaged"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveStock} className="btn-primary px-4 py-2">Save</button>
              <button onClick={() => setStockModalOpen(false)} className="btn-muted px-4 py-2">Cancel</button>
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
    </div>
  );
}
