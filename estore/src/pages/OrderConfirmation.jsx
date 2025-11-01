import { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { FaCheckCircle, FaHome, FaShoppingBag } from 'react-icons/fa';
import { useSettings } from '../components/SettingsContext';

export default function OrderConfirmation() {
  const location = useLocation();
  const navigate = useNavigate();
  const { formatCurrency } = useSettings();
  const state = location.state || {};
  const [confettiPieces, setConfettiPieces] = useState([]);

  useEffect(() => {
    // If someone lands here without state, send them home
    if (!state.type) {
      navigate('/', { replace: true });
    }
  }, [state, navigate]);

  useEffect(() => {
    // Persist last order/quote to localStorage so Home can show recap after refresh
    try {
      if (state.type === 'order') {
        localStorage.setItem('lastOrder', JSON.stringify({ type: 'order', order: state.order || null, ts: Date.now() }));
      } else if (state.type === 'quote') {
        localStorage.setItem(
          'lastOrder',
          JSON.stringify({ type: 'quote', cart: state.cart || null, total: state.total || 0, quote: state.quote || null, ts: Date.now() })
        );
      }
    } catch (e) {
      // ignore storage failures
    }
  }, [state]);

  useEffect(() => {
    // create a small confetti burst
    const pieces = Array.from({ length: 24 }).map(() => ({
      id: Math.random().toString(36).slice(2, 9),
      left: 40 + Math.random() * 20, // center-ish percent
      color: ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6'][Math.floor(Math.random() * 6)],
      rotate: Math.random() * 360,
      delay: Math.random() * 600
    }));
    setConfettiPieces(pieces);
    const t = setTimeout(() => setConfettiPieces([]), 3000);
    return () => clearTimeout(t);
  }, []);

  if (!state.type) return null;

  const isOrder = state.type === 'order';
  const title = isOrder ? 'Order Confirmed!' : 'Quote Request Sent!';
  const subtitle = isOrder ? 'Thanks — your order is on its way.' : 'We received your quote request.';
  const items = (state.order && state.order.items) || state.cart || [];
  const total = (state.order && state.order.total) || state.total || 0;
  const paymentMethod = state.order?.paymentMethod || null;
  const paymentReference = state.order?.paymentReference || null;
  const quoteInfo = state.quote || null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-white to-gray-50 p-6">
      <div className="relative max-w-xl w-full bg-white rounded-xl shadow-lg p-8 text-center overflow-hidden">
        {/* confetti layer */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          {confettiPieces.map(p => (
            <div key={p.id}
              style={{ left: `${p.left}%`, top: '10%', transform: `rotate(${p.rotate}deg)` }}
              className="absolute w-2 h-4 rounded-sm"
              role="presentation"
            >
              <span style={{ background: p.color, display: 'block', animation: `fall 1.4s ${p.delay}ms ease-out forwards` }} className="block w-full h-full" />
            </div>
          ))}
        </div>

  <FaCheckCircle className="mx-auto text-green-500 animate-scale-up" size={64} aria-hidden />
  <h1 className="text-3xl font-bold mt-4">{title}</h1>
  <p className="text-gray-600 mt-2 mb-6" role="status" aria-live="polite">{subtitle}</p>

        {items.length > 0 && (
          <div className="text-left border-t pt-4 mt-4">
            <h3 className="font-semibold mb-2">Summary</h3>
            <ul className="space-y-2">
              {items.map((it, idx) => (
                <li key={idx} className="flex justify-between">
                  <span className="text-gray-800">{it.name} x {it.quantity}</span>
                  <span className="font-semibold">{formatCurrency((it.price || 0) * (it.quantity || 1))}</span>
                </li>
              ))}
            </ul>
            <div className="flex justify-between font-bold text-lg mt-4">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>
        )}

        {isOrder && paymentMethod && (
          <div className="mt-6 text-left border-t pt-4">
            <h3 className="font-semibold mb-2">Payment</h3>
            <p className="text-sm text-gray-600">
              Method: {paymentMethod === 'transfer' ? 'Bank transfer' : 'Cash on delivery'}
            </p>
            {paymentReference && (
              <p className="text-sm text-gray-600">Reference: {paymentReference}</p>
            )}
          </div>
        )}

        {!isOrder && quoteInfo && (
          <div className="mt-6 text-left border-t pt-4">
            <h3 className="font-semibold mb-2">Quote preferences</h3>
            <p className="text-sm text-gray-600 capitalize">Request type: {quoteInfo.quoteType}</p>
            {quoteInfo.company && <p className="text-sm text-gray-600">Company: {quoteInfo.company}</p>}
            {quoteInfo.registrationNumber && (
              <p className="text-sm text-gray-600">Registration: {quoteInfo.registrationNumber}</p>
            )}
            {quoteInfo.existingAccountRef && (
              <p className="text-sm text-gray-600">Account reference: {quoteInfo.existingAccountRef}</p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-center gap-4">
          <Link to="/store" className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <FaShoppingBag aria-hidden /> Continue shopping
          </Link>
          <Link to="/" className="inline-flex items-center gap-2 border px-4 py-2 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300">
            <FaHome aria-hidden /> Home
          </Link>
        </div>

        <style>{`\n          @keyframes fall { to { transform: translateY(300px) rotate(360deg); opacity: 0; } }\n          @keyframes scaleUp { from { transform: scale(0.9); } to { transform: scale(1); } }\n          .animate-scale-up { animation: scaleUp 400ms ease-out both; }\n        `}</style>
      </div>
    </div>
  );
}
