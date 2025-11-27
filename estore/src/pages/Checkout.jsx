import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../components/CartContext';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';
import api from '../lib/api';
import InlineValidationCard from '../components/InlineValidationCard';
import RegularCustomerLookup from '../components/checkout/RegularCustomerLookup';
import PreorderPolicySnippet from '../components/checkout/PreorderPolicySnippet';
import { useOrderSummaryControls } from '../components/checkout/OrderSummaryContext';
import { getSaleInfo } from '../lib/sale';

const QUOTE_TYPES = [
  { value: 'individual', label: 'I am an individual', helper: 'We will treat this as a one-off quotation.' },
  { value: 'vendor', label: 'Register me as a vendor', helper: 'Provide company details so we can onboard you as a supplier.' },
  { value: 'existing', label: 'I am already registered', helper: 'Reference your existing account so we can route this request.' },
];

const PAYMENT_METHODS = [
  { value: 'cod', label: 'Cash on delivery' },
  { value: 'transfer', label: 'Bank transfer (attach slip)' },
  { value: 'qr_code', label: 'QR Code Payment' },
];

const DELIVERY_OPTIONS = [
  { id: 'digital', label: 'Instant digital delivery', fee: 0, helper: 'No courier needed — we email download links & activation notes.' },
  { id: 'pickup', label: 'Store pickup', fee: 0, helper: 'Collect from our ITnVend retail desk.' },
  { id: 'standard', label: 'Standard delivery (Male / Hulhumalé)', fee: 35, helper: 'Courier drop-off during working hours.' },
  { id: 'shop_ship', label: 'Shop & Ship (sea freight)', fee: 150, helper: 'Inter-island freight via Shop & Ship partners.' },
];

const CHECKOUT_SESSION_KEY = 'estore_checkout_draft';

export default function Checkout() {
  const { cart, clearCart, removeFromCart } = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const isQuote = new URLSearchParams(location.search).get('quote') === 'true';
  // Support buy-now flow: ProductDetail navigates with state { buyNowItem } (full product) or { buyNowItemId } or ?buyNow=<id>
  const buyNowItem = (location && location.state && location.state.buyNowItem) || null;
  const buyNowItemId = buyNowItem?.id || (location && location.state && location.state.buyNowItemId) || new URLSearchParams(location.search).get('buyNow');

  const displayCart = useMemo(() => {
    if (buyNowItem) {
      const qtyFromCart = cart.find((c) => String(c.id) === String(buyNowItem.id))?.quantity || buyNowItem.quantity || 1;
      return [{ ...buyNowItem, quantity: qtyFromCart }];
    }
    if (!buyNowItemId) return cart;
    return cart.filter((item) => String(item.id) === String(buyNowItemId));
  }, [cart, buyNowItem, buyNowItemId]);

  const saleAwareCart = useMemo(
    () =>
      displayCart.map((item) => {
        const sale = getSaleInfo(item);
        const effectivePrice = Number.isFinite(sale.effectivePrice) ? sale.effectivePrice : item.price || 0;
        return {
          ...item,
          effectivePrice,
          _sale: sale,
        };
      }),
    [displayCart]
  );
  const displayTotal = useMemo(
    () => saleAwareCart.reduce((sum, item) => sum + (item.effectivePrice || 0) * (item.quantity || 0), 0),
    [saleAwareCart]
  );
  const baseSubtotal = useMemo(
    () =>
      saleAwareCart.reduce((sum, item) => {
        const base = item._sale?.basePrice ?? item.price ?? item.effectivePrice ?? 0;
        return sum + base * (item.quantity || 0);
      }, 0),
    [saleAwareCart]
  );
  const saleSavingsTotal = useMemo(
    () =>
      saleAwareCart.reduce((sum, item) => {
        if (!item?._sale?.isOnSale) return sum;
        const base = item._sale.basePrice || 0;
        const eff = item.effectivePrice || 0;
        return sum + Math.max(0, base - eff) * (item.quantity || 0);
      }, 0),
    [saleAwareCart]
  );
  const hasSaleSavings = saleSavingsTotal > 0;
  const totalDue = useMemo(() => displayTotal + deliveryFee - discountAmount, [displayTotal, deliveryFee, discountAmount]);
  const { formatCurrency, getAccountTransferDetails, getPaymentQrCodeUrl } = useSettings();
  const cartHasPreorder = useMemo(
    () => displayCart.some((item) => item?.preorder || item?.availableForPreorder || item?.preorder_enabled === 1 || item?.preorder_enabled === '1'),
    [displayCart]
  );

  const { setOverride: setSummaryOverride } = useOrderSummaryControls() || {};
  const defaultDeliveryOption = DELIVERY_OPTIONS.find((opt) => opt.id === 'standard') || DELIVERY_OPTIONS[0];
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    companyName: '',
    registrationNumber: '',
    existingAccountRef: '',
    shippingAddress: '',
    billingAddress: '',
    deliveryPreference: defaultDeliveryOption?.label || '',
    deliveryInstructions: '',
  });
  const [quoteType, setQuoteType] = useState('individual');
  const [paymentMethod, setPaymentMethod] = useState('cod');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentSlip, setPaymentSlip] = useState(null);
  const [paymentSlipName, setPaymentSlipName] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [paymentSlipPreview, setPaymentSlipPreview] = useState('');
  const [slipValidation, setSlipValidation] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [deliveryOption, setDeliveryOption] = useState(defaultDeliveryOption?.id || DELIVERY_OPTIONS[0].id);
  const [deliveryFee, setDeliveryFee] = useState(defaultDeliveryOption?.fee || 0);
  const [useRegularLookup, setUseRegularLookup] = useState(false);
  const [regularQuery, setRegularQuery] = useState('');
  const [regularStatus, setRegularStatus] = useState('idle');
  const [regularError, setRegularError] = useState('');
  const [regularMatch, setRegularMatch] = useState(null);
  const [activeStep, setActiveStep] = useState(1);
  const totalSteps = 2;
  const paymentSlipInputRef = useRef(null);

  const requiresSlip = !isQuote && (paymentMethod === 'transfer' || paymentMethod === 'qr_code' || cartHasPreorder);
  const digitalOnly = useMemo(
    () =>
      displayCart.length > 0 &&
      displayCart.every((item) => ((item.productTypeLabel || item.type || '') || '').toString().toLowerCase() === 'digital'),
    [displayCart]
  );
  const requiresAddress = !digitalOnly;
  const visibleDeliveryOptions = useMemo(
    () => (digitalOnly ? DELIVERY_OPTIONS.filter((opt) => opt.id === 'digital') : DELIVERY_OPTIONS.filter((opt) => opt.id !== 'digital')),
    [digitalOnly]
  );
  const selectedDeliveryOption = useMemo(() => {
    const match = visibleDeliveryOptions.find((opt) => opt.id === deliveryOption);
    if (match) return match;
    return visibleDeliveryOptions[0] || defaultDeliveryOption;
  }, [visibleDeliveryOptions, deliveryOption, defaultDeliveryOption]);
  const summaryItems = useMemo(
    () =>
      saleAwareCart.map((item) => ({
        ...item,
        image: item.image || item.imageUrl || item.image_source || null,
      })),
    [saleAwareCart]
  );
  const requiresVendorCompany = isQuote && quoteType === 'vendor';
  const requiresExistingRef = isQuote && quoteType === 'existing';
  const stepOneComplete = Boolean(
    (form.name || '').trim() &&
    (form.email || '').trim() &&
    (form.phone || '').trim() &&
    (!requiresVendorCompany || (form.companyName || '').trim()) &&
    (!requiresExistingRef || (form.existingAccountRef || '').trim())
  );
  const summaryDeliveryLabel = digitalOnly ? 'Digital fulfillment' : selectedDeliveryOption?.label || 'Delivery';
  const discountAmount = 0;
  const clearSessionDraft = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.removeItem(CHECKOUT_SESSION_KEY);
    } catch (err) {
      console.warn('Failed to clear checkout draft', err);
    }
  }, []);

  const clearPaymentSlipState = (preserveError = false) => {
    setPaymentSlip(null);
    setPaymentSlipName('');
    setPaymentSlipPreview('');
    if (!preserveError) {
      setUploadError('');
    }
    if (paymentSlipInputRef.current) {
      paymentSlipInputRef.current.value = '';
    }
  };

  useEffect(() => {
    if (cartHasPreorder && paymentMethod !== 'transfer' && paymentMethod !== 'qr_code') {
      setPaymentMethod('transfer');
    }
  }, [cartHasPreorder, paymentMethod]);

  useEffect(() => {
    if (digitalOnly) {
      const digitalOption = DELIVERY_OPTIONS.find((opt) => opt.id === 'digital');
      if (digitalOption && deliveryOption !== 'digital') {
        setDeliveryOption('digital');
        setDeliveryFee(digitalOption.fee || 0);
        setForm((prev) => ({ ...prev, deliveryPreference: digitalOption.label }));
      }
    } else if (deliveryOption === 'digital') {
      if (defaultDeliveryOption) {
        setDeliveryOption(defaultDeliveryOption.id);
        setDeliveryFee(defaultDeliveryOption.fee || 0);
        setForm((prev) => ({ ...prev, deliveryPreference: defaultDeliveryOption.label }));
      }
    }
  }, [digitalOnly, deliveryOption, defaultDeliveryOption, setForm]);

  useEffect(() => {
    const nextFee = selectedDeliveryOption?.fee || 0;
    if (nextFee !== deliveryFee) {
      setDeliveryFee(nextFee);
    }
  }, [selectedDeliveryOption, deliveryFee]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(CHECKOUT_SESSION_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed.form) {
        setForm((prev) => ({ ...prev, ...parsed.form }));
      }
      if (parsed.quoteType) setQuoteType(parsed.quoteType);
      if (parsed.paymentMethod) setPaymentMethod(parsed.paymentMethod);
      if (parsed.deliveryOption) {
        const option = DELIVERY_OPTIONS.find((opt) => opt.id === parsed.deliveryOption);
        if (option) {
          setDeliveryOption(option.id);
          setDeliveryFee(option.fee);
          setForm((prev) => ({ ...prev, deliveryPreference: option.label }));
        }
      }
    } catch (err) {
      console.warn('Failed to load checkout draft', err);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        CHECKOUT_SESSION_KEY,
        JSON.stringify({ form, quoteType, paymentMethod, deliveryOption })
      );
    } catch (err) {
      console.warn('Failed to persist checkout draft', err);
    }
  }, [form, quoteType, paymentMethod, deliveryOption]);

  useEffect(() => {
    if (typeof setSummaryOverride !== 'function') return undefined;
    setSummaryOverride({
      items: summaryItems,
      deliveryFee,
      deliveryLabel: summaryDeliveryLabel,
      discount: discountAmount,
      triggerLabel: 'View cart',
    });
    return () => setSummaryOverride(null);
  }, [setSummaryOverride, summaryItems, deliveryFee, summaryDeliveryLabel, discountAmount]);

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
    if (cartHasPreorder && value !== 'transfer' && value !== 'qr_code') {
      toast.push('Preorder items require bank transfer or QR code payment.', 'error');
      return;
    }
    setPaymentMethod(value);
    if (value !== 'transfer') {
      setPaymentReference('');
      clearPaymentSlipState();
    }
  };

  const clearRegularMatch = () => {
    setRegularMatch(null);
    setRegularStatus('idle');
    setRegularError('');
  };

  const handleDeliveryOptionChange = (event) => {
    const value = event.target.value;
    const option = DELIVERY_OPTIONS.find((opt) => opt.id === value) || DELIVERY_OPTIONS[0];
    setDeliveryOption(option.id);
    setDeliveryFee(option.fee);
    setForm((prev) => ({ ...prev, deliveryPreference: option.label }));
  };

  const handleRegularToggle = (value) => {
    setUseRegularLookup(value);
    if (!value) {
      clearRegularMatch();
    }
  };

  const applyCustomerProfile = useCallback(
    (customerData) => {
      if (!customerData) return;
      setRegularMatch({
        name: customerData.name,
        email: customerData.email,
        phone: customerData.phone,
        delivery_preference: customerData.delivery_preference || customerData.deliveryPreference || '',
      });
      setForm((prev) => ({
        ...prev,
        name: customerData.name || prev.name,
        email: customerData.email || prev.email,
        phone: customerData.phone || prev.phone,
        companyName: customerData.company || customerData.company_name || prev.companyName,
        shippingAddress: customerData.address || customerData.shipping_address || prev.shippingAddress,
        billingAddress: customerData.billing_address || prev.billingAddress,
        deliveryPreference: customerData.delivery_preference || prev.deliveryPreference,
        deliveryInstructions: customerData.delivery_notes || prev.deliveryInstructions,
      }));
      if (customerData.delivery_preference) {
        const normalized = customerData.delivery_preference.toString().toLowerCase();
        const optionMatch = DELIVERY_OPTIONS.find(
          (opt) =>
            opt.id === normalized ||
            opt.label.toLowerCase() === normalized ||
            normalized.includes(opt.id) ||
            opt.label.toLowerCase().includes(normalized)
        );
        if (optionMatch) {
          setDeliveryOption(optionMatch.id);
          setDeliveryFee(optionMatch.fee);
        }
      }
    },
    [setDeliveryOption, setDeliveryFee]
  );

  const handleRegularLookup = useCallback(async () => {
    const term = regularQuery.trim();
    if (!term) {
      setRegularError('Enter a name, email, or phone number to search.');
      return;
    }
    setRegularStatus('searching');
    setRegularError('');
    try {
      const result = await api.get('/customers', { params: { search: term, includeMetrics: 'false' } });
      if (Array.isArray(result) && result.length) {
        applyCustomerProfile(result[0]);
        setRegularStatus('found');
        toast.push('Customer profile loaded. Edit anything you wish to update.', 'info');
      } else {
        setRegularMatch(null);
        setRegularStatus('not-found');
        setRegularError("We couldn't find a match. You can continue manually.");
      }
    } catch (err) {
      setRegularStatus('error');
      setRegularError(err?.message || 'Lookup failed. Please try again.');
    }
  }, [regularQuery, applyCustomerProfile, toast]);

  const handleSlipChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      clearPaymentSlipState();
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only image files (JPG, PNG, GIF, or WebP) are accepted for payment slips.');
      clearPaymentSlipState(true);
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      setUploadError('Payment slip must be smaller than 6MB.');
      clearPaymentSlipState(true);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result;
      if (!dataUrl || typeof dataUrl !== 'string') {
        setUploadError('Failed to read file. Please try again.');
        clearPaymentSlipState(true);
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (img.width < 200 || img.height < 200) {
          setUploadError('Image is too small. Upload a clear photo or screenshot of the transfer slip.');
          clearPaymentSlipState(true);
          return;
        }
        setPaymentSlip(dataUrl);
        setPaymentSlipName(file.name);
        setPaymentSlipPreview(dataUrl);
        setSlipValidation(null);
        setUploadError('');
      };
      img.onerror = () => {
        setUploadError('Unable to read image. Please upload a valid image file.');
        clearPaymentSlipState(true);
      };
      img.src = dataUrl;
    };
    reader.onerror = () => {
      setUploadError('Failed to read file. Please try again.');
      clearPaymentSlipState(true);
    };
    reader.readAsDataURL(file);
  };

  async function validateSlipPublic(slipDataUrl, reference, expectedAmount) {
    try {
      const payload = { slip: slipDataUrl, transactionId: reference || '', expectedAmount };
      const res = await api.post('/validate-slip-public', payload);
      return res;
    } catch (err) {
      console.error('Slip validation failed', err);
      return { error: err?.message || 'Validation failed' };
    }
  }

  const detectSlipType = (text, confidence = null) => {
    if (typeof confidence === 'number' && confidence < 35) return false;
    if (!text || !text.trim()) return false;
    const s = text.toLowerCase();

    const negativePhrases = ['does not contain', 'no text', 'no visible', 'not contain any visible', 'unable to read', 'could not'];
    for (const np of negativePhrases) if (s.includes(np)) return false;

    const mustHave = ['deposit', 'transfer', 'transaction', 'amount', 'mvr', 'bank', 'account', 'reference'];
    const negative = ['invoice', 'note', 'photo', 'random'];
    for (const n of negative) if (s.includes(n)) return false;

    for (const k of mustHave) if (s.includes(k)) return true;

    const chars = text.replace(/\s+/g, '');
    const alnum = (chars.match(/[A-Za-z0-9]/g) || []).length;
    const ratio = chars.length > 0 ? alnum / chars.length : 0;
    if (chars.length < 20 || ratio < 0.35) return false;

    const numberPattern = /\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d{1,2})?\b/;
    if (numberPattern.test(s)) return true;

    return false;
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
      shippingAddress: '',
      billingAddress: '',
      deliveryPreference: defaultDeliveryOption?.label || '',
      deliveryInstructions: '',
    });
    setQuoteType('individual');
    setPaymentMethod('cod');
    setPaymentReference('');
    clearPaymentSlipState();
    setUseRegularLookup(false);
    setRegularQuery('');
    setRegularStatus('idle');
    setRegularError('');
    setRegularMatch(null);
    setDeliveryOption(defaultDeliveryOption?.id || DELIVERY_OPTIONS[0].id);
    setDeliveryFee(defaultDeliveryOption?.fee || 0);
  };

  const handleSubmit = async (event) => {
    if (event?.preventDefault) event.preventDefault();
    if (!saleAwareCart.length) {
      toast.push('Your cart is empty.', 'warning');
      return;
    }
    if (!form.name || !form.email || !form.phone) {
      toast.push('Please complete your contact details.', 'error');
      return;
    }
    if (isQuote) {
      try {
        setSubmitting(true);
        await api.post('/quotes/request', {
          quoteType,
          contact: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            company: form.companyName || null,
            registrationNumber: quoteType === 'vendor' ? form.registrationNumber || null : null,
            existingAccountRef: quoteType === 'existing' ? form.existingAccountRef || null : null,
            shippingAddress: form.shippingAddress || null,
            billingAddress: form.billingAddress || null,
            deliveryPreference: form.deliveryPreference || selectedDeliveryOption?.label || null,
            deliveryInstructions: form.deliveryInstructions || null,
          },
          items: saleAwareCart.map((item) => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.effectivePrice,
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
        const summaryItems = saleAwareCart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.effectivePrice,
        }));
        resetState();
        navigate('/confirmation', {
          state: {
            type: 'quote',
            cart: summaryItems,
            total: displayTotal,
            quote: quoteSummary,
          },
        });
      } catch (err) {
        console.error('Quote request failed', err);
        toast.push(err?.message || 'Failed to send quote request.', 'error');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (cartHasPreorder && paymentMethod !== 'transfer') {
      toast.push('Preorder items must be paid via bank transfer.', 'error');
      return;
    }
    if (requiresSlip && !paymentSlip) {
      toast.push('Please attach the payment slip for bank transfer.', 'error');
      return;
    }
    if (paymentMethod === 'transfer' && !paymentReference.trim()) {
      toast.push('Please enter the bank transfer reference.', 'error');
      return;
    }
    if (paymentMethod === 'transfer') {
      if (!paymentSlip) {
        toast.push('Please attach the payment slip for bank transfer.', 'error');
        return;
      }
      const trimmedReference = paymentReference.trim();
      const validation = await validateSlipPublic(paymentSlip, trimmedReference, displayTotal);
      if (validation && validation.error) {
        toast.push(validation.error || 'Slip validation failed', 'error');
        return;
      }
      const looksLikeSlip = detectSlipType(validation?.extractedText || '', validation?.confidence);
      if (!looksLikeSlip) {
        toast.push("Hmm, this doesn't look like a payment slip. Please upload the correct transfer receipt.", 'warning');
        setSlipValidation(validation || null);
        return;
      }
      if (!validation || !validation.match) {
        const extracted = validation?.extractedText || '';
        toast.push('Payment slip does not match the provided reference. Please re-check your slip or reference.', 'error');
        setSlipValidation(validation || { match: false, extractedText: extracted, confidence: validation?.confidence || 0 });
        return;
      }
      setSlipValidation(validation);
    }
    try {
      setSubmitting(true);
      const customerPayload = {
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        company: form.companyName || null,
        shipping_address: form.shippingAddress || null,
        billing_address: form.billingAddress || null,
        delivery_preference: form.deliveryPreference || selectedDeliveryOption?.label || null,
        delivery_notes: form.deliveryInstructions || null,
      };
      const trimmedReference = paymentMethod === 'transfer' ? paymentReference.trim() : '';
      const createdOrder = await api.post('/orders', {
        customer: customerPayload,
        cart: saleAwareCart,
        payment: {
          method: paymentMethod,
          reference: paymentMethod === 'transfer' ? trimmedReference : null,
          slip: paymentMethod === 'transfer' ? paymentSlip : null,
        },
        source: 'estore',
        isPreorder: cartHasPreorder,
      });
      toast.push('Order placed successfully!', 'success');
      clearSessionDraft();
      const orderSummary = {
        items: saleAwareCart.map((item) => ({
          id: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.effectivePrice,
        })),
        total: displayTotal,
        savings: saleSavingsTotal,
        paymentMethod,
        paymentReference: paymentMethod === 'transfer' ? trimmedReference || null : null,
        orderId: createdOrder?.orderId || null,
        trackingToken: createdOrder?.trackingToken || null,
        trackingExpiresAt: createdOrder?.trackingTokenExpiresAt || null,
      };
      if (buyNowItemId) {
        saleAwareCart.forEach((it) => removeFromCart(it.id));
      } else {
        resetState();
      }
      navigate('/confirmation', { state: { type: 'order', order: orderSummary } });
    } catch (err) {
      console.error('Order submission failed', err);
      toast.push(err?.message || 'Failed to place order.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">{isQuote ? 'Request a Quote' : 'Guest Checkout'}</h1>
      <div className="grid grid-cols-1 gap-12 items-start md:grid-cols-2">
        <div>
          <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl bg-white p-6 shadow-lg">
            {cartHasPreorder && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
                <p className="font-semibold">Preorder checkout</p>
                <p className="mt-1 text-rose-500">
                  We will reserve preorder items once we verify your bank transfer. Please attach the payment slip and include a reachable phone number.
                </p>
              </div>
            )}
            <div className="rounded-2xl border border-rose-100 bg-white/80 p-4 shadow-inner">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Step {activeStep} / {totalSteps}</p>
                  <p className="text-sm font-medium text-slate-600">
                    {activeStep === 1 ? 'Contact & account details' : (digitalOnly ? 'Digital fulfilment' : 'Delivery & payment')}
                  </p>
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: totalSteps }).map((_, idx) => (
                    <span
                      key={`step-dot-${idx}`}
                      className={`h-2 w-10 rounded-full transition ${idx + 1 <= activeStep ? 'bg-rose-500' : 'bg-rose-100'}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            {activeStep === 1 ? (
              <div className="space-y-6">
                {isQuote && (
                  <fieldset>
                    <legend className="text-sm font-semibold text-gray-700 mb-3">How should we process this request?</legend>
                    <div className="space-y-3">
                      {QUOTE_TYPES.map((option) => (
                        <label
                          key={option.value}
                          className={`flex gap-3 rounded-xl border p-3 transition ${
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
                <RegularCustomerLookup
                  enabled={useRegularLookup}
                  onToggle={handleRegularToggle}
                  query={regularQuery}
                  onQueryChange={setRegularQuery}
                  status={regularStatus}
                  error={regularError}
                  onSubmit={handleRegularLookup}
                  match={regularMatch}
                  onClearMatch={clearRegularMatch}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label htmlFor="name" className="block text-gray-700 font-semibold mb-2">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      id="name"
                      value={form.name}
                      onChange={handleFieldChange}
                      className="w-full rounded-md border p-2"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="block text-gray-700 font-semibold mb-2">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      id="email"
                      value={form.email}
                      onChange={handleFieldChange}
                      className="w-full rounded-md border p-2"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="phone" className="block text-gray-700 font-semibold mb-2">
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      id="phone"
                      value={form.phone}
                      onChange={handleFieldChange}
                      className="w-full rounded-md border p-2"
                      required
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="companyName" className="block text-gray-700 font-semibold mb-2">
                      Company / Organization {requiresVendorCompany ? <span className="text-red-500">*</span> : null}
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      id="companyName"
                      value={form.companyName}
                      onChange={handleFieldChange}
                      className="w-full rounded-md border p-2"
                      required={requiresVendorCompany}
                    />
                  </div>
                  {requiresVendorCompany && (
                    <div className="sm:col-span-2">
                      <label htmlFor="registrationNumber" className="block text-gray-700 font-semibold mb-2">
                        Vendor registration / tax number (optional)
                      </label>
                      <input
                        type="text"
                        name="registrationNumber"
                        id="registrationNumber"
                        value={form.registrationNumber}
                        onChange={handleFieldChange}
                        className="w-full rounded-md border p-2"
                      />
                    </div>
                  )}
                  {requiresExistingRef && (
                    <div className="sm:col-span-2">
                      <label htmlFor="existingAccountRef" className="block text-gray-700 font-semibold mb-2">
                        Existing account reference <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="existingAccountRef"
                        id="existingAccountRef"
                        value={form.existingAccountRef}
                        onChange={handleFieldChange}
                        className="w-full rounded-md border p-2"
                        required
                      />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-slate-400">Complete the required contact fields to continue.</p>
                  <button
                    type="button"
                    onClick={() => setActiveStep(2)}
                    disabled={!stepOneComplete}
                    className="inline-flex items-center justify-center rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-600 disabled:pointer-events-none disabled:opacity-40"
                  >
                    Continue to {digitalOnly ? 'digital fulfilment' : 'delivery'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {requiresAddress ? (
                  <div className="grid gap-4">
                    <div>
                      <label htmlFor="shippingAddress" className="block text-gray-700 font-semibold mb-2">Shipping / delivery address</label>
                      <textarea
                        name="shippingAddress"
                        id="shippingAddress"
                        rows={2}
                        value={form.shippingAddress}
                        onChange={handleFieldChange}
                        className="w-full rounded-md border p-2"
                        placeholder="Apartment, island, street — especially for Shop & Ship deliveries"
                      />
                    </div>
                    <div>
                      <label htmlFor="billingAddress" className="block text-gray-700 font-semibold mb-2">Billing address (optional)</label>
                      <textarea
                        name="billingAddress"
                        id="billingAddress"
                        rows={2}
                        value={form.billingAddress}
                        onChange={handleFieldChange}
                        className="w-full rounded-md border p-2"
                        placeholder="Only if different from shipping"
                      />
                    </div>
                    <div>
                      <label htmlFor="deliveryOption" className="block text-gray-700 font-semibold mb-2">Delivery preference</label>
                      <select
                        id="deliveryOption"
                        value={deliveryOption}
                        onChange={handleDeliveryOptionChange}
                        className="w-full rounded-md border p-2"
                      >
                        {visibleDeliveryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} {option.fee ? `(+ ${formatCurrency(option.fee)})` : '(included)'}
                          </option>
                        ))}
                      </select>
                      {selectedDeliveryOption?.helper && (
                        <p className="text-xs text-gray-500 mt-1">{selectedDeliveryOption.helper}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="deliveryInstructions" className="block text-gray-700 font-semibold mb-2">Delivery instructions (optional)</label>
                      <textarea
                        name="deliveryInstructions"
                        id="deliveryInstructions"
                        rows={2}
                        value={form.deliveryInstructions}
                        onChange={handleFieldChange}
                        className="w-full rounded-md border p-2"
                        placeholder="Gate codes, preferred times, ferry contacts…"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/80 p-4 text-sm text-sky-700">
                    <p className="font-semibold text-sky-900">Instant digital delivery</p>
                    <p className="mt-1">
                      We will send download links, license keys and any technical notes straight to {form.email || 'your email'} as soon as payment is verified.
                    </p>
                  </div>
                )}
                {!isQuote && (
                  <fieldset className="space-y-4">
                    <legend className="text-sm font-semibold text-gray-700">Payment method</legend>
                    {cartHasPreorder && <PreorderPolicySnippet />}
                    <div className="space-y-3">
                      {PAYMENT_METHODS.map((option) => {
                        const disabled = cartHasPreorder && option.value !== 'transfer' && option.value !== 'qr_code';
                        return (
                          <label
                            key={option.value}
                            className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                              disabled ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400' : 'cursor-pointer'
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
                    {paymentMethod === 'transfer' && getAccountTransferDetails() && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                        <h3 className="font-semibold text-amber-800 mb-2">Bank Transfer Details</h3>
                        <div className="text-sm text-amber-700 whitespace-pre-line">{getAccountTransferDetails()}</div>
                      </div>
                    )}
                    {paymentMethod === 'qr_code' && getPaymentQrCodeUrl() && (
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                        <h3 className="font-semibold text-blue-800 mb-2">QR Code Payment</h3>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                          <img
                            src={getPaymentQrCodeUrl()}
                            alt="Payment QR Code"
                            className="w-48 h-48 object-contain border border-gray-200 rounded-lg"
                          />
                          <div className="text-sm text-blue-700">
                            <p className="mb-2">Scan this QR code with your banking app to make payment.</p>
                            <p className="font-medium">Enter the transaction reference below after payment.</p>
                          </div>
                        </div>
                      </div>
                    )}
                    {(paymentMethod === 'transfer' || paymentMethod === 'qr_code') && (
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="paymentReference" className="block text-gray-700 font-semibold mb-2">
                            {paymentMethod === 'qr_code' ? 'Transaction reference' : 'Transfer reference'} <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            name="paymentReference"
                            id="paymentReference"
                            value={paymentReference}
                            onChange={(event) => setPaymentReference(event.target.value)}
                            className="w-full rounded-md border p-2"
                            placeholder={paymentMethod === 'qr_code' ? 'Enter transaction ID from your app' : 'Transaction ID or narration'}
                            required
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            {paymentMethod === 'qr_code'
                              ? 'Upload an image that clearly shows this transaction reference.'
                              : 'Upload an image that clearly shows this reference number.'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-gray-700 font-semibold mb-2">
                            {paymentMethod === 'qr_code' ? 'Payment confirmation' : 'Payment slip'} <span className="text-red-500">*</span>
                          </label>
                          <div className="flex flex-col gap-3 md:flex-row">
                            <div className="flex-1 space-y-2">
                              <input
                                type="file"
                                accept="image/*"
                                onChange={handleSlipChange}
                                className="w-full"
                                ref={paymentSlipInputRef}
                              />
                              {paymentSlipName && <p className="text-xs text-gray-500">Selected: {paymentSlipName}</p>}
                              {uploadError && <p className="text-xs text-red-500">{uploadError}</p>}
                              {paymentSlipPreview && (
                                <button
                                  type="button"
                                  onClick={clearPaymentSlipState}
                                  className="inline-flex items-center gap-1 rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100"
                                >
                                  Remove image
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </fieldset>
                )}
                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => setActiveStep(1)}
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Back to contact
                  </button>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-60"
                    disabled={submitting}
                  >
                    {submitting ? (isQuote ? 'Sending…' : 'Submitting…') : isQuote ? 'Submit Quote Request' : 'Place Order'}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
        <div className="space-y-6">
          <div className="rounded-3xl border border-rose-100 bg-gradient-to-b from-white via-rose-50 to-sky-50/60 p-6 shadow-xl shadow-rose-100/70">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-500">Live order snapshot</p>
                <p className="text-3xl font-extrabold text-slate-900">{formatCurrency(totalDue)}</p>
                <p className="text-xs text-slate-500">{summaryDeliveryLabel}</p>
                {hasSaleSavings && (
                  <p className="text-xs font-semibold text-emerald-600">You save {formatCurrency(saleSavingsTotal)}</p>
                )}
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-right text-sm text-slate-500">
                <p>{saleAwareCart.length} item{saleAwareCart.length === 1 ? '' : 's'}</p>
                <p>{digitalOnly ? 'Digital delivery' : selectedDeliveryOption?.label || 'Delivery'} </p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              {saleAwareCart.map((item) => {
                const typeLabel = (item.productTypeLabel || item.type || '').toString().toLowerCase();
                const isDigitalItem = typeLabel === 'digital';
                const sale = item._sale || getSaleInfo(item);
                const hasSale = sale?.isOnSale;
                const basePrice = sale?.basePrice || item.price || item.effectivePrice || 0;
                const unitPrice = item.effectivePrice ?? basePrice;
                const lineSavings = hasSale ? Math.max(0, basePrice - unitPrice) * (item.quantity || 0) : 0;
                return (
                  <div key={`${item.id}-${item.name}`} className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-white/80 p-3 shadow-sm">
                    <div className="relative h-14 w-14 overflow-hidden rounded-2xl bg-rose-50">
                      {item.image ? (
                        <img src={item.image || item.imageUrl || item.image_source} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-rose-400">
                          {item.name?.slice(0, 2)?.toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-1 -right-1 rounded-full bg-slate-900/90 px-2 py-0.5 text-[10px] font-semibold text-white">
                        ×{item.quantity}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-slate-900 line-clamp-2">{item.name}</p>
                        <div className="text-right">
                          <span className="text-sm font-semibold text-slate-900">{formatCurrency(unitPrice * item.quantity)}</span>
                          {hasSale && (
                            <div className="text-[11px] text-slate-400 line-through">{formatCurrency(basePrice * item.quantity)}</div>
                          )}
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                        {isDigitalItem && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-600">Digital</span>}
                        {item.preorder && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-600">Preorder</span>}
                        {hasSale && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-600">
                            Sale {Math.round(sale.discountPercent || 0)}%
                          </span>
                        )}
                      </div>
                      {isDigitalItem && (item.technical_details || item.technicalDetails) && (
                        <p className="mt-1 text-xs text-slate-500 line-clamp-2">{item.technical_details || item.technicalDetails}</p>
                      )}
                      {lineSavings > 0 && (
                        <p className="mt-1 text-xs font-semibold text-emerald-600">
                          You save {formatCurrency(lineSavings)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
              {!saleAwareCart.length && <p className="text-sm text-slate-400">Your cart is empty.</p>}
            </div>
            <div className="mt-5 rounded-2xl border border-rose-100 bg-white/70 p-4 text-sm text-slate-700">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{formatCurrency(baseSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Sale savings</span>
                <span className={saleSavingsTotal ? 'text-emerald-600 font-semibold' : ''}>
                  {saleSavingsTotal ? `- ${formatCurrency(saleSavingsTotal)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>{digitalOnly ? 'Digital delivery' : 'Delivery'}</span>
                <span>{deliveryFee ? formatCurrency(deliveryFee) : 'Included'}</span>
              </div>
              <div className="flex justify-between">
                <span>Discount</span>
                <span className={discountAmount ? 'text-emerald-600' : ''}>
                  {discountAmount ? `- ${formatCurrency(discountAmount)}` : '—'}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between text-lg font-semibold text-slate-900">
                <span>Balance</span>
                <span>{formatCurrency(totalDue)}</span>
              </div>
            </div>
          </div>
          {paymentSlipPreview && (
            <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-lg">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Slip preview</h3>
              <div className="w-full rounded-lg border border-gray-200 bg-white p-2">
                <div className="mx-auto max-w-sm">
                  <img src={paymentSlipPreview} alt="Slip preview" className="w-full h-auto max-h-48 object-contain rounded" />
                </div>
                {slipValidation && (
                  <div className="mt-2">
                    <InlineValidationCard
                      status={slipValidation.match ? 'ok' : 'mismatch'}
                      confidence={slipValidation.confidence}
                      extractedText={slipValidation.extractedText}
                      onReplace={() => {
                        if (paymentSlipInputRef.current) paymentSlipInputRef.current.click();
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="relative flex flex-col items-center gap-4 rounded-2xl bg-white/95 px-8 py-6 shadow-2xl">
            <div className="relative h-20 w-20">
              <div className="absolute inset-0 animate-ping rounded-full border-4 border-blue-200" />
              <div className="absolute inset-2 rounded-full border-4 border-transparent border-t-blue-500 border-l-blue-400 animate-spin" />
              <div className="relative flex h-full w-full items-center justify-center rounded-full bg-blue-600 text-white font-semibold text-lg">
                {isQuote ? 'QR' : 'OR'}
              </div>
            </div>
            <div className="text-sm font-medium text-slate-700">
              {isQuote ? 'Sending your quote request…' : 'Submitting your order…'}
            </div>
            <div className="text-xs text-slate-500 text-center max-w-xs">
              We’re locking in your items and syncing with the team. Hang tight for a moment.
            </div>
          </div>
        </div>
      )}
    </div>
  );

}
