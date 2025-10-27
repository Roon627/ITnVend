import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

export default function POS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const { settings: globalSettings, formatCurrency } = useSettings();

  const toast = useToast();

  useEffect(() => {
    api.get('/products').then(setProducts).catch((e) => toast.push('Failed to load products', 'error'));
    api.get('/customers').then((data) => {
      setCustomers(data);
      if (data.length > 0) setSelectedCustomerId(data[0].id);
    }).catch(() => toast.push('Failed to load customers', 'error'));
  }, []);

  const addToCart = (product) => {
    if (product.stock <= 0) return;
    setCart((currentCart) => {
      const existing = currentCart.find((i) => i.id === product.id);
      if (existing) return currentCart.map((i) => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...currentCart, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId) => {
    setCart((currentCart) => {
      const existing = currentCart.find((i) => i.id === productId);
      if (!existing) return currentCart;
      if (existing.quantity === 1) return currentCart.filter((i) => i.id !== productId);
      return currentCart.map((i) => i.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
    });
  };

  const handleCheckout = async (type = 'invoice') => {
    if (!selectedCustomerId || cart.length === 0) {
      alert('Please select a customer and add items to the cart.');
      return;
    }
    try {
      const payload = { customerId: Number(selectedCustomerId), items: cart, type };
      const created = await api.post('/invoices', payload);
      window.open(`/api/invoices/${created.id}/pdf`);
      api.get('/products').then(setProducts);
      setCart([]);
      toast.push(type === 'invoice' ? 'Invoice created' : 'Quote generated', 'info');
    } catch (err) {
      toast.push(type === 'invoice' ? 'Failed to create invoice' : 'Failed to create quote', 'error');
    }
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const cartTotal = cart.reduce((t, i) => t + i.price * i.quantity, 0);
  const gstRate = globalSettings?.outlet?.gst_rate ?? globalSettings?.gst_rate ?? 0;
  const taxAmount = +(cartTotal * (gstRate / 100));
  const totalWithTax = +(cartTotal + taxAmount);

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold text-gray-700">Products</h2>
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-1/2 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                {filtered.map((p) => (
                  <div key={p.id} className={`border rounded-lg p-4 flex flex-col items-center text-center transition-all duration-300 ${p.stock > 0 ? 'hover:shadow-xl hover:scale-105' : 'opacity-50'}`}>
                    <div className="flex-grow">
                      <h3 className="font-bold text-lg text-gray-800">{p.name}</h3>
                      <p className="text-gray-600 font-semibold">{formatCurrency(p.price)}</p>
                      <p className={`text-sm font-medium ${p.stock > 10 ? 'text-green-600' : 'text-red-600'}`}>{p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}</p>
                    </div>
                    <button onClick={() => addToCart(p)} disabled={p.stock <= 0} className="mt-4 w-full bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">Add</button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="row-start-1 lg:row-auto">
            <div className="bg-white rounded-xl shadow-lg p-6 sticky top-6">
              <h2 className="text-2xl font-semibold mb-4 text-gray-700">Order</h2>
              <div className="mb-4">
                <label htmlFor="customer" className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
                <select id="customer" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md">
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {cart.length === 0 && <p className="text-gray-500 text-center">Your cart is empty</p>}
                {cart.map((item) => (
                  <div key={item.id} className="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-sm text-gray-600">{formatCurrency(item.price)} x {item.quantity}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-lg">{formatCurrency(item.price * item.quantity)}</p>
                      <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700 font-bold text-xl">&times;</button>
                    </div>
                  </div>
                ))}
              </div>
              {cart.length > 0 && (
                <div className="border-t mt-4 pt-4">
                  <div className="space-y-2 mb-4">
                    <div className="flex justify-between font-medium text-base">
                      <span>Subtotal</span>
                      <span>{formatCurrency(cartTotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>Tax ({gstRate}%)</span>
                      <span>{formatCurrency(taxAmount)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-xl">
                      <span>Total</span>
                      <span>{formatCurrency(totalWithTax)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={() => handleCheckout('invoice')}
                      className="w-full bg-green-500 text-white px-4 py-3 rounded-lg font-bold text-lg hover:bg-green-600 transition-colors disabled:bg-gray-400"
                    >
                      Create Invoice
                    </button>
                    <button
                      onClick={() => handleCheckout('quote')}
                      className="w-full bg-blue-500 text-white px-4 py-3 rounded-lg font-semibold hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                    >
                      Generate Quote
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
