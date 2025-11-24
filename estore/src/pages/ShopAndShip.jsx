import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaCloudUploadAlt, FaInfoCircle, FaQrcode } from 'react-icons/fa';
import api from '../lib/api';
import { useSettings } from '../components/SettingsContext';

const DEFAULT_RATE = 15.42;
const STOREFRONT_API_KEY = import.meta.env.VITE_STOREFRONT_API_KEY || '';
const STOREFRONT_API_SECRET = import.meta.env.VITE_STOREFRONT_API_SECRET || '';

const SHOP_STEPS = [
  { id: 1, title: 'Cart links', description: 'Share what we should buy' },
  { id: 2, title: 'Contact & delivery', description: 'How we reach you' },
  { id: 3, title: 'Payment details', description: 'Exchange rate & slip' },
  { id: 4, title: 'Review & submit', description: 'Confirm before sending' },
];

const SHOP_HIGHLIGHTS = [
  { label: 'Reference bank rate', value: `1 USD = ${DEFAULT_RATE} MVR`, helper: 'Updated daily (BML/MIB)' },
  { label: 'Delivery coverage', value: 'Malé & Hulhumalé', helper: 'Door pickup or contactless' },
  { label: 'Average clearance', value: '5–7 days', helper: 'After parcel arrives' },
];

const PAYMENT_LABELS = {
  bank_transfer: 'Bank transfer',
  qr_code: 'QR payment',
  cash: 'Cash on pickup',
};

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

let cryptoJsHmac = null;

async function createSignature(secret, message) {
  if (!secret) return '';
  const webCrypto =
    (typeof globalThis !== 'undefined' && globalThis.crypto) ||
    (typeof window !== 'undefined' ? window.crypto : null);
  const encoder = new TextEncoder();
  if (webCrypto?.subtle) {
    try {
      const keyData = encoder.encode(secret);
      const cryptoKey = await webCrypto.subtle.importKey('raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const signatureBuffer = await webCrypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
      const bytes = new Uint8Array(signatureBuffer);
      let hex = '';
      for (let i = 0; i < bytes.length; i += 1) {
        hex += bytes[i].toString(16).padStart(2, '0');
      }
      return hex;
    } catch (err) {
      console.warn('Web crypto HMAC failed, falling back to software implementation', err);
    }
  }

  if (!cryptoJsHmac) {
    const [{ default: hmacSHA256 }, { default: Hex }] = await Promise.all([
      import('crypto-js/hmac-sha256'),
      import('crypto-js/enc-hex'),
    ]);
    cryptoJsHmac = { hmacSHA256, Hex };
  }
  const { hmacSHA256, Hex } = cryptoJsHmac;
  return hmacSHA256(message, secret).toString(Hex);
}

export default function ShopAndShip() {
  const { getAccountTransferDetails, getPaymentQrCodeUrl } = useSettings();
  const [form, setForm] = useState({
    sourceStore: '',
    cartLinks: '',
    notes: '',
    name: '',
    email: '',
    phone: '',
    deliveryAddress: '',
    usdTotal: '',
    exchangeRate: DEFAULT_RATE.toString(),
    paymentType: 'bank_transfer',
    paymentReference: '',
    paymentDate: '',
    paymentSlip: null,
    paymentSlipName: '',
    paymentBank: 'bml',
  });
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState(null);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1);
  const location = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const productName = params.get('name');
    const productLink = params.get('link');
    const store = params.get('store');
    if (!productName && !productLink && !store) return;
    setForm((prev) => {
      const next = { ...prev };
      if (store && !next.sourceStore) next.sourceStore = store;
      if (productName && !next.notes) {
        next.notes = `Preorder request for ${productName}`;
      }
      if (productLink && !next.cartLinks.includes(productLink)) {
        next.cartLinks = next.cartLinks ? `${productLink}\n${next.cartLinks}` : productLink;
      }
      return next;
    });
  }, [location.search]);

  const normalizedLinks = useMemo(() => {
    return form.cartLinks
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, [form.cartLinks]);

  const mvrEstimate = useMemo(() => {
    const usd = Number(form.usdTotal);
    const rate = Number(form.exchangeRate) || DEFAULT_RATE;
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return Math.round(usd * rate * 100) / 100;
  }, [form.usdTotal, form.exchangeRate]);

  const totalSteps = SHOP_STEPS.length;
  const isFinalStep = step === totalSteps;

  const validateStep = (currentStep) => {
    if (currentStep === 1) {
      if (normalizedLinks.length === 0) {
        setError('Please paste at least one cart link to continue.');
        return false;
      }
      return true;
    }
    if (currentStep === 2) {
      if (!form.name.trim() || !form.email.trim() || !form.phone.trim() || !form.deliveryAddress.trim()) {
        setError('Please share your contact information and delivery address.');
        return false;
      }
      return true;
    }
    if (currentStep === 3) {
      const usd = Number(form.usdTotal);
      if (!Number.isFinite(usd) || usd <= 0) {
        setError('Enter the USD total so we can estimate the local amount.');
        return false;
      }
      if (form.paymentType === 'qr_code' && !form.paymentReference.trim()) {
        setError('QR payments need a transaction reference from your banking app.');
        return false;
      }
      return true;
    }
    return true;
  };

  const handleNextStep = () => {
    setError('');
    if (!validateStep(step)) return;
    setStep((prev) => Math.min(totalSteps, prev + 1));
  };

  const handlePrevStep = () => {
    setError('');
    setStep((prev) => Math.max(1, prev - 1));
  };

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setForm((prev) => ({ ...prev, paymentSlip: null, paymentSlipName: '' }));
      return;
    }
    try {
      if (file.size > 6 * 1024 * 1024) {
        setError('Payment slip is too large. Please choose a file up to 6MB.');
        return;
      }
      const encoded = await toBase64(file);
      setForm((prev) => ({
        ...prev,
        paymentSlip: encoded,
        paymentSlipName: file.name,
      }));
      setError('');
    } catch (err) {
      console.error('Failed to read payment slip', err);
      setError('Failed to read the payment slip file.');
    }
  };

  const resetForm = () => {
    setForm({
      sourceStore: '',
      cartLinks: '',
      notes: '',
      name: '',
      email: '',
      phone: '',
      deliveryAddress: '',
      usdTotal: '',
      exchangeRate: DEFAULT_RATE.toString(),
      paymentType: 'bank_transfer',
      paymentReference: '',
      paymentDate: '',
      paymentSlip: null,
      paymentSlipName: '',
      paymentBank: 'bml',
    });
    setStep(1);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!isFinalStep) {
      handleNextStep();
      return;
    }
    setError('');
    setSuccessId(null);

    const { name, email, phone, usdTotal, deliveryAddress } = form;
    if (!name.trim() || !email.trim() || !phone.trim() || !usdTotal.trim() || !deliveryAddress.trim()) {
      setError('Name, email, mobile number, delivery address, and USD total are required fields.');
      return;
    }

    if (normalizedLinks.length === 0) {
      setError('Please paste at least one cart link.');
      return;
    }

    const payload = {
      sourceStore: form.sourceStore || null,
      cartLinks: normalizedLinks,
      notes: form.notes || null,
      deliveryAddress: form.deliveryAddress.trim() || null,
      customer: {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
      },
      usdTotal: Number(form.usdTotal),
      exchangeRate: Number(form.exchangeRate) || DEFAULT_RATE,
      payment: {
        type: form.paymentType,
        reference: form.paymentReference || null,
        date: form.paymentDate || null,
        slip: form.paymentSlip,
        bank: form.paymentBank,
      },
    };

    setSubmitting(true);
    try {
      const payloadString = JSON.stringify(payload);
      const headers = {};
      if (STOREFRONT_API_KEY) {
        headers['x-storefront-key'] = STOREFRONT_API_KEY;
      }
      if (STOREFRONT_API_SECRET) {
        try {
          const timestamp = Date.now().toString();
          const signature = await createSignature(STOREFRONT_API_SECRET, `${timestamp}.${payloadString}`);
          headers['x-storefront-timestamp'] = timestamp;
          headers['x-storefront-signature'] = signature;
        } catch (sigErr) {
          console.error('Failed to produce preorder signature', sigErr);
          setError('Secure submission is unavailable in this environment. Please reach out to support or try again later.');
          setSubmitting(false);
          return;
        }
      }

      const response = await api.post('/api/public/preorders', payloadString, { headers });
      setSuccessId(response?.id || null);
      resetForm();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      console.error('Preorder submission failed', err);
      const message = err?.message || 'We were unable to submit your request. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const cartSection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Cart details</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">
            Store or platform (optional)
            <input
              type="text"
              value={form.sourceStore}
              onChange={handleChange('sourceStore')}
              placeholder="Shein, Temu, Amazon..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Cart links*
            <textarea
              value={form.cartLinks}
              onChange={handleChange('cartLinks')}
              placeholder="Paste each link on a new line"
              rows={4}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">
            Notes for our shoppers (optional)
            <textarea
              value={form.notes}
              onChange={handleChange('notes')}
              placeholder="Sizing tips, substitutions, deadlines..."
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-600">
        Paste unlimited links – we compile everything into a single concierge request so you only pay for one shipment.
      </div>
    </div>
  );

  const contactSection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Contact & delivery</p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            Full name*
            <input
              type="text"
              value={form.name}
              onChange={handleChange('name')}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Email*
            <input
              type="email"
              value={form.email}
              onChange={handleChange('email')}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Mobile number*
            <input
              type="tel"
              value={form.phone}
              onChange={handleChange('phone')}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
        </div>
        <label className="mt-4 block text-sm font-semibold text-slate-700">
          Delivery address*
          <textarea
            value={form.deliveryAddress}
            onChange={handleChange('deliveryAddress')}
            rows={3}
            required
            placeholder="Where should we deliver or hand over when the shipment arrives?"
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
          />
        </label>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 text-sm text-slate-600">
        We keep you updated via email and SMS as soon as the parcel clears customs or if we need clarification.
      </div>
    </div>
  );

  const paymentSection = (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Payment method</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {['bank_transfer', 'qr_code', 'cash'].map((type) => (
            <label
              key={type}
              className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                form.paymentType === type
                  ? 'border-rose-300 bg-rose-50 text-rose-600'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
              }`}
            >
              <input
                type="radio"
                name="paymentType"
                value={type}
                checked={form.paymentType === type}
                onChange={handleChange('paymentType')}
                className="h-4 w-4 text-rose-500 focus:ring-rose-400"
              />
              {type === 'qr_code' && <FaQrcode className="text-base" />}
              {PAYMENT_LABELS[type]}
            </label>
          ))}
        </div>
      </div>

      {form.paymentType === 'bank_transfer' && getAccountTransferDetails() && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-800">
          <h3 className="font-semibold mb-2">Bank Transfer Details</h3>
          <div className="whitespace-pre-line">{getAccountTransferDetails()}</div>
        </div>
      )}

      {form.paymentType === 'qr_code' && getPaymentQrCodeUrl() && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4">
          <h3 className="mb-2 font-semibold text-blue-900">QR Code Payment</h3>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <img src={getPaymentQrCodeUrl()} alt="Payment QR Code" className="h-40 w-40 rounded-lg border border-slate-200 object-contain" />
            <p className="text-sm text-blue-700">
              Scan with your banking app, then note the transaction reference so we can reconcile it quickly.
            </p>
          </div>
        </div>
      )}

      {form.paymentType === 'cash' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-800">
          Cash payments are collected when your order arrives. No slip required.
        </div>
      )}

      <div>
        <p className="text-xs uppercase tracking-wide text-slate-400">Totals</p>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-semibold text-slate-700">
            USD total*
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.usdTotal}
              onChange={handleChange('usdTotal')}
              required
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Exchange rate
            <div className="relative mt-1">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.exchangeRate}
                onChange={handleChange('exchangeRate')}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-rose-400">MVR</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <FaInfoCircle aria-hidden="true" />
              <span>Adjust if your bank publishes a different rate today.</span>
            </div>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            Estimated MVR
            <input
              type="text"
              value={mvrEstimate != null ? mvrEstimate.toFixed(2) : ''}
              readOnly
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 shadow-sm"
            />
          </label>
        </div>
      </div>

      {(form.paymentType === 'bank_transfer' || form.paymentType === 'qr_code') && (
        <div className="space-y-4">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Bank used for payment</span>
            <div className="flex flex-wrap gap-3">
              {['bml', 'mib'].map((bank) => (
                <label
                  key={bank}
                  className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    form.paymentBank === bank
                      ? 'border-rose-300 bg-rose-50 text-rose-600'
                      : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentBank"
                    value={bank}
                    checked={form.paymentBank === bank}
                    onChange={handleChange('paymentBank')}
                    className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                  />
                  {bank === 'bml' ? 'Bank of Maldives' : 'Maldives Islamic Bank'}
                </label>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">Same rate for either bank – pick whichever slip you have.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm font-semibold text-slate-700">
              {form.paymentType === 'qr_code' ? 'Transaction reference*' : 'Payment reference (optional)'}
              <input
                type="text"
                value={form.paymentReference}
                onChange={handleChange('paymentReference')}
                required={form.paymentType === 'qr_code'}
                placeholder={form.paymentType === 'qr_code' ? 'Enter the app transaction ID' : 'Transaction ID'}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Payment date (optional)
              <input
                type="date"
                value={form.paymentDate}
                onChange={handleChange('paymentDate')}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              {form.paymentType === 'bank_transfer' ? 'Payment slip (optional)' : 'Payment confirmation (optional)'}
              <label className="mt-1 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/60 px-4 py-6 text-center text-sm font-semibold text-rose-500 transition hover:border-rose-300">
                <FaCloudUploadAlt className="mb-2 text-2xl" aria-hidden="true" />
                <span>{form.paymentSlipName || `Upload ${form.paymentType === 'bank_transfer' ? 'receipt' : 'confirmation'} (max 6MB)`}</span>
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
              </label>
            </label>
          </div>
        </div>
      )}
    </div>
  );

  const reviewSection = (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-100 bg-white/80 p-4 text-sm text-slate-700">
        <p className="text-xs uppercase tracking-wide text-slate-400">Cart summary</p>
        {normalizedLinks.length ? (
          <ol className="mt-3 space-y-1 list-decimal pl-4">
            {normalizedLinks.map((link, index) => (
              <li key={link + index} className="break-words text-slate-600">
                {link}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No cart links yet.</p>
        )}
        {form.notes && <p className="mt-3 text-xs text-slate-500">Notes: {form.notes}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="text-xs uppercase tracking-wide text-slate-400">Contact</p>
          <ul className="mt-3 space-y-1">
            <li><span className="font-semibold">Name:</span> {form.name || '—'}</li>
            <li><span className="font-semibold">Email:</span> {form.email || '—'}</li>
            <li><span className="font-semibold">Phone:</span> {form.phone || '—'}</li>
            <li><span className="font-semibold">Address:</span> {form.deliveryAddress || '—'}</li>
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-sm text-slate-700">
          <p className="text-xs uppercase tracking-wide text-slate-400">Payment</p>
          <ul className="mt-3 space-y-1">
            <li><span className="font-semibold">Method:</span> {PAYMENT_LABELS[form.paymentType] || '—'}</li>
            <li><span className="font-semibold">USD total:</span> {form.usdTotal || '—'}</li>
            <li><span className="font-semibold">Rate:</span> {form.exchangeRate || DEFAULT_RATE}</li>
            <li><span className="font-semibold">Est. MVR:</span> {mvrEstimate != null ? mvrEstimate.toFixed(2) : '—'}</li>
            {form.paymentReference && <li><span className="font-semibold">Reference:</span> {form.paymentReference}</li>}
          </ul>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-100 bg-white/90 p-4 text-sm text-slate-700">
        <p className="text-xs uppercase tracking-wide text-slate-400">Uploads</p>
        <ul className="mt-3 space-y-1">
          <li>Payment slip: {form.paymentSlipName || '—'}</li>
          <li>Preferred bank: {form.paymentBank.toUpperCase()}</li>
          <li>Payment date: {form.paymentDate || '—'}</li>
        </ul>
      </div>
    </div>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return cartSection;
      case 2:
        return contactSection;
      case 3:
        return paymentSection;
      default:
        return reviewSection;
    }
  };

  return (
    <section className="bg-gradient-to-br from-slate-50 via-white to-rose-50 py-14 px-4">
      <div className="mx-auto w-full max-w-screen-2xl space-y-8">
        <div className="rounded-3xl border border-rose-100 bg-white/95 p-8 shadow-2xl shadow-rose-100/60 backdrop-blur">
          <div className="space-y-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-600">
                Concierge desk
              </span>
              <h1 className="mt-3 text-3xl font-bold text-slate-900 md:text-4xl">Shop &amp; Ship Concierge</h1>
              <p className="mt-3 text-slate-600 md:max-w-2xl">
                Paste your carts from Shein, Temu, Amazon, or any global storefront and we will handle the overseas checkout, shipping, and customs handoff for you.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] sm:gap-3 sm:text-sm">
              {SHOP_HIGHLIGHTS.map((card) => (
                <div key={card.label} className="rounded-2xl border border-rose-100 bg-rose-50/70 px-3 py-2 shadow-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-rose-500">{card.label}</div>
                  <div className="text-sm font-bold text-rose-700 sm:text-base">{card.value}</div>
                  <div className="text-[10px] text-rose-400">{card.helper}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {successId && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-6 py-4 text-rose-800 shadow-sm">
            <p className="font-semibold">
              Order received! Reference number <span className="font-bold">#{successId}</span>
            </p>
            <p className="mt-1 text-sm text-rose-700">We emailed you a confirmation and will update you as soon as we review the cart.</p>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-6 py-4 text-rose-600 shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 rounded-3xl border border-white/60 bg-white/95 p-6 shadow-xl shadow-rose-100/40 backdrop-blur">
          <div className="grid grid-cols-2 gap-2 rounded-2xl border border-rose-100 bg-rose-50/50 p-3 sm:flex sm:flex-row sm:flex-wrap">
            {SHOP_STEPS.map((item) => (
              <div
                key={item.id}
                className={`flex flex-col rounded-xl border px-3 py-2 text-xs ${
                  step === item.id ? 'border-rose-400 bg-white shadow-sm' : 'border-transparent text-slate-500'
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Step {item.id}</div>
                <div className="text-sm font-semibold text-slate-800">{item.title}</div>
                <p className="text-[10px] text-slate-500">{item.description}</p>
              </div>
            ))}
          </div>

          {renderStepContent()}

          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-xs text-slate-500">
            By submitting you agree to our{' '}
            <a href="/use" className="font-semibold text-rose-600 underline">
              acceptable use policy
            </a>
            . We only charge once we confirm availability of all cart items.
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t bg-white/95 pb-3 pt-4 sm:static sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:pb-0">
            <div className="text-xs text-slate-400">Step {step} of {totalSteps}</div>
            <div className="flex flex-wrap gap-2 sm:items-center">
              <button
                type="button"
                onClick={resetForm}
                className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                disabled={submitting}
              >
                Clear form
              </button>
              {step > 1 && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                  disabled={submitting}
                >
                  Back
                </button>
              )}
              <button
                type="submit"
                disabled={isFinalStep && submitting}
                className="rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200/70 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isFinalStep ? (submitting ? 'Submitting…' : 'Send preorder') : 'Continue'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
