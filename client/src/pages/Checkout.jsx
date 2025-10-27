import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../components/CartContext';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import api from '../lib/api';

export default function Checkout() {
  const { cart, cartTotal, clearCart } = useCart();
  const [customer, setCustomer] = useState({ name: '', email: '' });
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isQuote = new URLSearchParams(location.search).get('quote') === 'true';
  const { formatCurrency, currencyCode } = useSettings();

  const handleChange = (e) => {
    setCustomer({ ...customer, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!customer.name || !customer.email) {
      toast.push('Please fill in your name and email.', 'error');
      return;
    }

    if (isQuote) {
      // Handle quote request
      const quoteDetails = cart.map(item => `${item.name} (Qty: ${item.quantity})`).join('\n');
      try {
        await api.post('/quotes', {
          contact_name: customer.name,
          email: customer.email,
          details: `Quote request for the following items:\n${quoteDetails}\n\nTotal Value: ${currencyCode} ${cartTotal.toFixed(2)}`
        });
        toast.push('Quote request sent successfully!', 'success');
        clearCart();
        navigate('/store');
      } catch (err) {
        toast.push('Failed to send quote request.', 'error');
      }
    } else {
      // Handle guest order
      try {
        await api.post('/orders', { customer, cart });
        toast.push('Order placed successfully!', 'success');
        clearCart();
        navigate('/store');
      } catch (err) {
        toast.push('Failed to place order.', 'error');
      }
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{isQuote ? 'Request a Quote' : 'Guest Checkout'}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Your Information</h2>
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md">
            <div className="mb-4">
              <label htmlFor="name" className="block text-gray-700 font-semibold mb-2">Full Name</label>
              <input type="text" name="name" id="name" value={customer.name} onChange={handleChange} className="w-full p-2 border rounded-md" required />
            </div>
            <div className="mb-6">
              <label htmlFor="email" className="block text-gray-700 font-semibold mb-2">Email Address</label>
              <input type="email" name="email" id="email" value={customer.email} onChange={handleChange} className="w-full p-2 border rounded-md" required />
            </div>
            <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors">
              {isQuote ? 'Submit Quote Request' : 'Place Order'}
            </button>
          </form>
        </div>
        <div>
          <h2 className="text-2xl font-semibold mb-4">Order Summary</h2>
          <div className="bg-white p-6 rounded-lg shadow-md">
            {cart.map(item => (
              <div key={item.id} className="flex justify-between items-center border-b py-2">
                <p>{item.name} <span className="text-gray-500">x {item.quantity}</span></p>
                <p>{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
            <div className="flex justify-between items-center font-bold text-xl mt-4">
              <p>Total</p>
              <p>{formatCurrency(cartTotal)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
