import React from 'react';
import { FiShoppingCart } from 'react-icons/fi';

export default function OrderSummaryDrawer({
  open,
  onClose,
  items,
  formatCurrency,
  deliveryFee = 0,
  discount = 0,
  deliveryLabel = 'Delivery',
  triggerLabel = 'Order summary',
}) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const finalTotal = subtotal + deliveryFee - discount;
  return (
    <>
      <button
        type="button"
        onClick={() => onClose(!open)}
        className="group fixed bottom-6 right-6 z-30 inline-flex items-center gap-2 rounded-full bg-rose-500/95 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-600 md:right-10"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <FiShoppingCart className="text-base" aria-hidden="true" />
        <span>{triggerLabel}</span>
        <span className="rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">{items.length}</span>
      </button>
      <div
        className={`fixed inset-x-0 bottom-0 z-40 transform rounded-t-3xl border-t border-rose-100 bg-white/95 p-5 text-slate-700 shadow-2xl transition-all duration-300 md:inset-y-0 md:right-0 md:top-0 md:h-full md:w-96 md:rounded-none md:border-l ${
          open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800">Order summary</h3>
          <button
            type="button"
            onClick={() => onClose(false)}
            className="rounded-full border border-rose-200 px-3 py-1 text-xs font-semibold text-rose-500 hover:bg-rose-50"
          >
            Close
          </button>
        </div>
        <div className="mt-4 space-y-3 overflow-y-auto pb-4 pr-1" style={{ maxHeight: '50vh' }}>
          {items.map((item) => (
            <div key={`${item.id}-${item.name}`} className="flex items-center gap-3 rounded-2xl border border-rose-50 bg-white p-3 shadow-sm">
              {item.image ? (
                <img src={item.image} alt={item.name} className="h-12 w-12 rounded-xl object-cover" />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-xs font-semibold text-rose-400">
                  {item.name?.slice(0, 2)?.toUpperCase()}
                </div>
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-800 line-clamp-1">{item.name}</p>
                <p className="text-xs text-slate-500">
                  Qty {item.quantity} • {formatCurrency(item.price * item.quantity)}
                </p>
              </div>
            </div>
          ))}
          {!items.length && <p className="text-xs text-slate-400">Your cart is empty.</p>}
        </div>
        <div className="space-y-2 border-t border-slate-100 pt-4 text-sm">
          <div className="flex justify-between text-slate-500">
            <span>Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>{deliveryLabel}</span>
            <span>{deliveryFee ? formatCurrency(deliveryFee) : 'Included'}</span>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>Discounts</span>
            <span className={discount ? 'text-emerald-600' : ''}>{discount ? `- ${formatCurrency(discount)}` : 'None'}</span>
          </div>
          <div className="flex items-center justify-between text-base font-semibold text-slate-800">
            <span>Total</span>
            <span>{formatCurrency(finalTotal)}</span>
          </div>
        </div>
      </div>
    </>
  );
}
