import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../components/CartContext';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import api from '../lib/api';

const QUOTE_TYPES = [
  { value: 'individual', label: 'I am an individual', helper: 'We will treat this as a one-off quotation.' },
  { value: 'vendor', label: 'Register me as a vendor', helper: 'Provide company details so we can onboard you as a supplier.' },
  { value: 'existing', label: 'I am already registered', helper: 'Reference your existing account so we can route this request.' },
];

const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'transfer', label: 'Bank transfer (attach slip)' },
];

export default function Checkout() {
  const { cart, cartTotal, clearCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isQuote = new URLSearchParams(location.search).get('quote') === 'true';
  const { formatCurrency, currencyCode } = useSettings();
  const cartHasPreorder = useMemo(
    () => cart.some((item) => item?.preorder || item?.availableForPreorder || item?.preorder_enabled === 1 || item?.preorder_enabled === '1'),
    [cart]
  );

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    registrationNumber: '',
    existingAccountRef: '',
  });
  const [quoteType, setQuoteType] = useState('individual');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentSlip, setPaymentSlip] = useState(null);
  const [paymentSlipName, setPaymentSlipName] = useState('');
  const [uploadError, setUploadError] = useState('');

  const requiresSlip = !isQuote && (paymentMethod === 'transfer' || cartHasPreorder);

  useEffect(() => {
    if (cartHasPreorder && paymentMethod !== 'transfer') {
      setPaymentMethod('transfer');
    }
  }, [cartHasPreorder, paymentMethod]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleQuoteTypeChange = (event) => {
    const value = event.target.value;
    setQuoteType(value);
  };

  const handlePaymentMethodChange = (event) => {
    const value = event.target.value;
    if (cartHasPreorder && value !== 'transfer') {
      toast.push('Preorder items require bank transfer payment.', 'error');
      return;
    }
    setPaymentMethod(value);
    if (value !== 'transfer') {
      setPaymentSlip(null);
      setPaymentSlipName('');
      setPaymentReference('');
      setUploadError('');
    }
  };

  const handleSlipChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setPaymentSlip(null);
      setPaymentSlipName('');
      setUploadError('');
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setUploadError('Payment slip must be smaller than 6MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setPaymentSlip(e.target?.result || null);
      setPaymentSlipName(file.name);
      setUploadError('');
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);
  };

  const resetState = () => {
    clearCart();
    setForm({
      name: '',
      email: '',
      phone: '',
      companyName: '',
      registrationNumber: '',
      existingAccountRef: '',
    });
    setQuoteType('individual');
    setPaymentMethod('cod');
    setPaymentReference('');
    setPaymentSlip(null);
    setPaymentSlipName('');
    setUploadError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.name || !form.email) {
      toast.push('Please fill in your name and email.', 'error');
      return;
    }
    if (cartHasPreorder && !form.phone) {
      toast.push('Preorder items require a contact phone number.', 'error');
      return;
    }
    if (isQuote) {
      if (quoteType === 'vendor' && !form.companyName) {
        toast.push('Company name is required for vendor registration.', 'error');
        return;
      }
      if (quoteType === 'existing' && !form.existingAccountRef) {
        toast.push('Please provide your existing account reference.', 'error');
        return;
      }
      const cartLines = cart.map((item) => `${item.name} (Qty: ${item.quantity})`).join('\n');
      const contextLines = [
        `Request type: ${quoteType}`,
        form.phone ? `Phone: ${form.phone}` : null,
        form.companyName ? `Company: ${form.companyName}` : null,
        quoteType === 'vendor' && form.registrationNumber ? `Registration number: ${form.registrationNumber}` : null,
        quoteType === 'existing' ? `Existing account reference: ${form.existingAccountRef || '-'}` : null,
      ].filter(Boolean);

      try {
        await api.post('/quotes', {
          company_name: form.companyName || null,
          contact_name: form.name,
          email: form.email,
          phone: form.phone || null,
          details: `${contextLines.join('\n')}\n\nItems:\n${cartLines || '(cart empty)'}\n\nEstimated total: ${formatCurrency(cartTotal)} ${currencyCode}`,
          submission_type: quoteType,
          existing_customer_ref: quoteType === 'existing' ? form.existingAccountRef || null : null,
          registration_number: quoteType === 'vendor' ? form.registrationNumber || null : null,
          cart: cart.map((item) => ({
            id: item.id,
            product_id: item.id,
            quantity: item.quantity,
            price: item.price,
          })),
        });
        toast.push('Quote request sent successfully!', 'success');
        const quoteSummary = {
          quoteType,
          phone: form.phone || null,
          company: form.companyName || null,
          registrationNumber: quoteType === 'vendor' ? form.registrationNumber || null : null,
          existingAccountRef: quoteType === 'existing' ? form.existingAccountRef || null : null,
        };
        const summaryItems = cart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        }));
        resetState();
        navigate('/confirmation', {
          state: {
            type: 'quote',
            cart: summaryItems,
            total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
            quote: quoteSummary,
          },
        });
      } catch (err) {
        console.error('Quote request failed', err);
        toast.push(err?.message || 'Failed to send quote request.', 'error');
      }
      return;
    }

    // Direct checkout
    if (cartHasPreorder && paymentMethod !== 'transfer') {
      toast.push('Preorder items must be paid via bank transfer.', 'error');
      return;
    }
    if (requiresSlip && !paymentSlip) {
      toast.push('Please attach the payment slip for bank transfer.', 'error');
      return;
    }
    try {
      const customerPayload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        company: form.companyName || null,
      };
      await api.post('/orders', {
        customer: customerPayload,
        cart,
        payment: {
          method: paymentMethod,
          reference: paymentMethod === 'transfer' ? paymentReference || null : null,
          slip: paymentMethod === 'transfer' ? paymentSlip : null,
        },
        source: 'estore',
        isPreorder: cartHasPreorder,
      });
      toast.push('Order placed successfully!', 'success');
      const orderSummary = {
        items: cart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        })),
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        paymentMethod,
        paymentReference: paymentMethod === 'transfer' ? paymentReference || null : null,
      };
      resetState();
      navigate('/confirmation', { state: { type: 'order', order: orderSummary } });
    } catch (err) {
      console.error('Order submission failed', err);
      toast.push(err?.message || 'Failed to place order.', 'error');
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{isQuote ? 'Request a Quote' : 'Guest Checkout'}</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div>
          <h2 className="text-2xl font-semibold mb-4">Your Information</h2>
          <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-md space-y-6">
            {cartHasPreorder && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                <p className="font-semibold">Preorder checkout</p>
                <p className="mt-1 text-rose-500">
                  We will reserve preorder items once we verify your bank transfer. Please attach the payment slip and include a phone number so our operations team can reach you quickly.
                </p>
              </div>
            )}
            {isQuote && (
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-3">How should we process this request?</legend>
                <div className="space-y-3">
                  {QUOTE_TYPES.map((option) => (
                    <label
                      key={option.value}
                      className={`flex gap-3 rounded-md border p-3 cursor-pointer transition ${
                        quoteType === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="quoteType"
                        value={option.value}
                        checked={quoteType === option.value}
                        onChange={handleQuoteTypeChange}
                        className="mt-1"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-gray-800">{option.label}</span>
                        <span className="block text-xs text-gray-500">{option.helper}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-gray-700 font-semibold mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="name"
                  id="name"
                  value={form.name}
                  onChange={handleFieldChange}
                  className="w-full p-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-gray-700 font-semibold mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  value={form.email}
                  onChange={handleFieldChange}
                  className="w-full p-2 border rounded-md"
                  required
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-gray-700 font-semibold mb-2">
                  Phone {cartHasPreorder ? <span className="text-red-500">*</span> : <span className="text-xs text-gray-400">(optional)</span>}
                </label>
                <input
                  type="tel"
                  name="phone"
                  id="phone"
                  value={form.phone}
                  onChange={handleFieldChange}
                  className="w-full p-2 border rounded-md"
                  required={cartHasPreorder}
                />
              </div>
              <div>
                <label htmlFor="companyName" className="block text-gray-700 font-semibold mb-2">
                  Company / Organization {isQuote && quoteType === 'vendor' ? <span className="text-red-500">*</span> : null}
                </label>
                <input
                  type="text"
                  name="companyName"
                  id="companyName"
                  value={form.companyName}
                  onChange={handleFieldChange}
                  className="w-full p-2 border rounded-md"
                  required={isQuote && quoteType === 'vendor'}
                />
              </div>
              {isQuote && quoteType === 'vendor' && (
                <div>
                  <label htmlFor="registrationNumber" className="block text-gray-700 font-semibold mb-2">
                    Vendor registration / tax number (optional)
                  </label>
                  <input
                    type="text"
                    name="registrationNumber"
                    id="registrationNumber"
                    value={form.registrationNumber}
                    onChange={handleFieldChange}
                    className="w-full p-2 border rounded-md"
                  />
                </div>
              )}
              {isQuote && quoteType === 'existing' && (
                <div>
                  <label htmlFor="existingAccountRef" className="block text-gray-700 font-semibold mb-2">
                    Existing account reference <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="existingAccountRef"
                    id="existingAccountRef"
                    value={form.existingAccountRef}
                    onChange={handleFieldChange}
                    className="w-full p-2 border rounded-md"
                    required
                  />
                </div>
              )}
            </div>

            {!isQuote && (
              <fieldset className="space-y-4">
                <legend className="text-sm font-semibold text-gray-700">Payment method</legend>
                <div className="space-y-3">
                  {PAYMENT_METHODS.map((option) => {
                    const disabled = cartHasPreorder && option.value !== 'transfer';
                    return (
                      <label
                        key={option.value}
                        className={`flex items-center gap-3 rounded-md border p-3 transition ${
                          disabled
                            ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400'
                            : 'cursor-pointer'
                        } ${
                          paymentMethod === option.value ? 'border-blue-500 bg-blue-50' : !disabled ? 'border-gray-200 hover:border-blue-200' : ''
                        }`}
                      >
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={option.value}
                          checked={paymentMethod === option.value}
                          onChange={handlePaymentMethodChange}
                          className="mt-1"
                          disabled={disabled}
                        />
                        <span className="text-sm font-semibold text-gray-800">{option.label}</span>
                      </label>
                    );
                  })}
                </div>
                {paymentMethod === 'transfer' && (
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="paymentReference" className="block text-gray-700 font-semibold mb-2">
                        Transfer reference (optional)
                      </label>
                      <input
                        type="text"
                        name="paymentReference"
                        id="paymentReference"
                        value={paymentReference}
                        onChange={(event) => setPaymentReference(event.target.value)}
                        className="w-full p-2 border rounded-md"
                        placeholder="Transaction ID or narration"
                      />
                    </div>
                    <div>
                      <label className="block text-gray-700 font-semibold mb-2">
                        Payment slip <span className="text-red-500">*</span>
                      </label>
                      <div className="flex flex-col gap-2">
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          onChange={handleSlipChange}
                          className="w-full"
                        />
                        {paymentSlipName && <p className="text-xs text-gray-500">Selected: {paymentSlipName}</p>}
                        {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                        {paymentSlip && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentSlip(null);
                              setPaymentSlipName('');
                              setUploadError('');
                            }}
                            className="self-start text-xs text-blue-600 hover:underline"
                          >
                            Remove attachment
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </fieldset>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-md hover:bg-blue-700 transition-colors"
            >
              {isQuote ? 'Submit Quote Request' : 'Place Order'}
            </button>
          </form>
        </div>

        <div>
          <h2 className="text-2xl font-semibold mb-4">Order Summary</h2>
          <div className="bg-white p-6 rounded-lg shadow-md space-y-4">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between items-center border-b py-2 text-sm">
                <div>
                  <p className="font-semibold text-gray-800">{item.name}</p>
                  <p className="text-gray-500">x {item.quantity}</p>
                </div>
                <p className="font-semibold">{formatCurrency(item.price * item.quantity)}</p>
              </div>
            ))}
            <div className="flex justify-between items-center font-bold text-xl mt-4">
              <p>Total</p>
              <p>{formatCurrency(cartTotal)}</p>
            </div>
            {!isQuote && paymentMethod === 'transfer' && (
              <p className="text-xs text-gray-500">
                Once we verify the payment slip we will confirm your order via email.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
