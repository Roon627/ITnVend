import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FaCloudUploadAlt, FaInfoCircle, FaQrcode } from 'react-icons/fa';
import api from '../lib/api';
import { useSettings } from '../components/SettingsContext';

const DEFAULT_RATE = 15.42;
const STOREFRONT_API_KEY = import.meta.env.VITE_STOREFRONT_API_KEY || '';
const STOREFRONT_API_SECRET = import.meta.env.VITE_STOREFRONT_API_SECRET || '';

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

  const mvrEstimate = useMemo(() => {
    const usd = Number(form.usdTotal);
    const rate = Number(form.exchangeRate) || DEFAULT_RATE;
    if (!Number.isFinite(usd) || usd <= 0) return null;
    return Math.round(usd * rate * 100) / 100;
  }, [form.usdTotal, form.exchangeRate]);

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
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccessId(null);

    const { name, email, phone, cartLinks, usdTotal, deliveryAddress } = form;
    if (!name.trim() || !email.trim() || !phone.trim() || !usdTotal.trim() || !deliveryAddress.trim()) {
      setError('Name, email, mobile number, delivery address, and USD total are required fields.');
      return;
    }

    const links = cartLinks
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    if (links.length === 0) {
      setError('Please paste at least one cart link.');
      return;
    }

    const payload = {
      sourceStore: form.sourceStore || null,
      cartLinks: links,
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

  return (
    <section className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-10 rounded-3xl bg-white/80 p-8 shadow-xl shadow-rose-100/60 backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-slate-800 md:text-4xl">Shop &amp; Ship Concierge</h1>
              <p className="mt-3 text-slate-600 md:max-w-2xl">
                Share your Shein, Temu or other online shopping carts and we'll bring them to the Maldives.
                Submit your details with the Maldives bank exchange helper below, and we'll confirm next steps by email.
              </p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/70 px-6 py-4 text-center shadow">
              <div className="text-xs font-semibold uppercase tracking-wider text-rose-400">
                Reference bank rate (BML / MIB)
              </div>
              <div className="mt-1 text-2xl font-bold text-rose-600">1 USD = 15.42 MVR</div>
              <div className="mt-1 text-xs text-rose-400">Updated daily</div>
            </div>
          </div>
        </div>

        {successId && (
          <div className="mb-6 rounded-2xl border border-emerald-100 bg-emerald-50 px-6 py-4 text-emerald-700 shadow-sm">
            <p className="font-semibold">
              Order received! Reference number <span className="font-bold text-emerald-800">#{successId}</span>
            </p>
            <p className="mt-1 text-sm text-emerald-600">
              We’ve emailed you a confirmation. Our team will review and get in touch with updates shortly.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50 px-6 py-4 text-rose-600 shadow-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-10 rounded-3xl bg-white/85 p-8 shadow-2xl shadow-rose-100/70 backdrop-blur">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">1. Cart details</h2>
            <p className="mt-1 text-sm text-slate-500">
              Paste the share URLs or exported cart links. Add any notes we should know before ordering.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Store or platform (optional)</label>
                <input
                  type="text"
                  value={form.sourceStore}
                  onChange={handleChange('sourceStore')}
                  placeholder="Shein, Temu, Amazon..."
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Cart links*</label>
                <textarea
                  value={form.cartLinks}
                  onChange={handleChange('cartLinks')}
                  placeholder="Paste each link on a new line"
                  rows={4}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">Notes for our shoppers (optional)</label>
                <textarea
                  value={form.notes}
                  onChange={handleChange('notes')}
                  placeholder="Sizing tips, substitutions, deadlines..."
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-800">2. Contact &amp; delivery</h2>
            <p className="mt-1 text-sm text-slate-500">
              Tell us how to reach you. We’ll keep you in the loop as your order progresses.
            </p>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Full name*</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={handleChange('name')}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Email*</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Mobile number*</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={handleChange('phone')}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-semibold text-slate-700">Delivery address*</label>
              <textarea
                value={form.deliveryAddress}
                onChange={handleChange('deliveryAddress')}
                rows={3}
                required
                placeholder="Where should we deliver or hand over when the shipment arrives?"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
              />
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-800">3. Payment confirmation</h2>
            <p className="mt-1 text-sm text-slate-500">
              Choose your payment method and enter the USD amount charged. We'll estimate the Maldives amount.
            </p>

            <div className="mt-4 space-y-4">
              <div>
                <span className="block text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
                  Payment method
                </span>
                <div className="flex flex-wrap gap-3">
                  <label
                    className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                      form.paymentType === 'bank_transfer'
                        ? 'border-rose-300 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentType"
                      value="bank_transfer"
                      checked={form.paymentType === 'bank_transfer'}
                      onChange={handleChange('paymentType')}
                      className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                    />
                    Bank Transfer
                  </label>
                  <label
                    className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                      form.paymentType === 'qr_code'
                        ? 'border-rose-300 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentType"
                      value="qr_code"
                      checked={form.paymentType === 'qr_code'}
                      onChange={handleChange('paymentType')}
                      className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                    />
                    <FaQrcode className="text-lg" />
                    QR Code Payment
                  </label>
                  <label
                    className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                      form.paymentType === 'cash'
                        ? 'border-rose-300 bg-rose-50 text-rose-600'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="paymentType"
                      value="cash"
                      checked={form.paymentType === 'cash'}
                      onChange={handleChange('paymentType')}
                      className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                    />
                    Cash Payment
                  </label>
                </div>
              </div>

              {/* Payment Details */}
              {form.paymentType === 'bank_transfer' && getAccountTransferDetails() && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
                  <h3 className="font-semibold text-amber-800 mb-2">Bank Transfer Details</h3>
                  <div className="text-sm text-amber-700 whitespace-pre-line">
                    {getAccountTransferDetails()}
                  </div>
                </div>
              )}

              {form.paymentType === 'qr_code' && getPaymentQrCodeUrl() && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">QR Code Payment</h3>
                  <div className="flex items-center gap-4">
                    <img
                      src={getPaymentQrCodeUrl()}
                      alt="Payment QR Code"
                      className="w-48 h-48 object-contain border border-slate-200 rounded-lg"
                    />
                    <div className="text-sm text-blue-700">
                      <p className="mb-2">Scan this QR code with your banking app to make payment.</p>
                      <p className="font-medium">Enter the transaction reference below after payment.</p>
                    </div>
                  </div>
                </div>
              )}

              {form.paymentType === 'cash' && (
                <div className="rounded-xl border border-green-200 bg-green-50/50 p-4">
                  <h3 className="font-semibold text-green-800 mb-2">Cash Payment</h3>
                  <p className="text-sm text-green-700">
                    You can pay in cash when your order arrives. No payment slip required.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">USD total*</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.usdTotal}
                  onChange={handleChange('usdTotal')}
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Exchange rate</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.exchangeRate}
                    onChange={handleChange('exchangeRate')}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-12 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  />
                  <span className="absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-rose-400">
                    MVR
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
                  <FaInfoCircle aria-hidden="true" />
                  <span>You can adjust if the published rate changes.</span>
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">Estimated MVR</label>
                <input
                  type="text"
                  value={mvrEstimate != null ? mvrEstimate.toFixed(2) : ''}
                  readOnly
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 shadow-sm"
                />
              </div>
            </div>

            {(form.paymentType === 'bank_transfer' || form.paymentType === 'qr_code') && (
              <>
                <div className="mt-6 space-y-2">
                  <span className="block text-sm font-semibold uppercase tracking-wide text-slate-500">
                    Bank used for payment
                  </span>
                  <div className="flex flex-wrap gap-3">
                    <label
                      className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                        form.paymentBank === 'bml'
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentBank"
                        value="bml"
                        checked={form.paymentBank === 'bml'}
                        onChange={handleChange('paymentBank')}
                        className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                      />
                      Bank of Maldives
                    </label>
                    <label
                      className={`inline-flex items-center gap-3 rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                        form.paymentBank === 'mib'
                          ? 'border-rose-300 bg-rose-50 text-rose-600'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-rose-200'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentBank"
                        value="mib"
                        checked={form.paymentBank === 'mib'}
                        onChange={handleChange('paymentBank')}
                        className="h-4 w-4 text-rose-500 focus:ring-rose-400"
                      />
                      Maldives Islamic Bank
                    </label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Same exchange rate applies for both banks so you can choose the slip you have on hand.
                  </p>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {form.paymentType === 'qr_code' ? 'Transaction reference*' : 'Payment reference (optional)'}
                    </label>
                    <input
                      type="text"
                      value={form.paymentReference}
                      onChange={handleChange('paymentReference')}
                      required={form.paymentType === 'qr_code'}
                      placeholder={form.paymentType === 'qr_code' ? 'Enter transaction ID from your app' : 'Transaction ID'}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">Payment date (optional)</label>
                    <input
                      type="date"
                      value={form.paymentDate}
                      onChange={handleChange('paymentDate')}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700">
                      {form.paymentType === 'bank_transfer' ? 'Payment slip (optional)' : 'Payment confirmation (optional)'}
                    </label>
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-rose-200 bg-rose-50/40 px-4 py-6 text-center text-sm font-semibold text-rose-500 transition hover:border-rose-300">
                      <FaCloudUploadAlt className="mb-2 text-2xl" aria-hidden="true" />
                      <span>{form.paymentSlipName || `Upload ${form.paymentType === 'bank_transfer' ? 'receipt' : 'confirmation'} (max 6MB)`}</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileChange} />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-500">
              By submitting you agree to our{' '}
              <a href="/use" className="font-semibold text-rose-500 underline">
                acceptable use policy
              </a>
              .
            </div>
            <div className="flex gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="btn-sm btn-sm-outline inline-flex items-center rounded-full border border-slate-200 text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
                  disabled={submitting}
                >
                  Clear form
                </button>
                <button
                  type="submit"
                  className="btn-sm btn-sm-primary inline-flex items-center rounded-full bg-gradient-to-r from-rose-500 to-sky-400 text-white shadow-lg shadow-rose-200/80 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                  disabled={submitting}
                >
                  {submitting ? 'Submitting.' : 'Send preorder'}
                </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
