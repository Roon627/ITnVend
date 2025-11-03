import { Link } from 'react-router-dom';
import { FaTrash, FaPlus, FaMinus, FaShoppingBag, FaFileAlt } from 'react-icons/fa';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { resolveMediaUrl } from '../lib/media';
import { isPreorderProduct } from '../lib/preorder';

export default function Cart() {
  const { cart, removeFromCart, updateQuantity, cartTotal, clearCart } = useCart();
  const { formatCurrency } = useSettings();

  const cartHasPreorder = cart.some((item) => item?.preorder || isPreorderProduct(item));

  if (cart.length === 0) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-sky-50 px-6 text-center">
        <div className="max-w-md space-y-5 rounded-3xl border border-rose-200 bg-white p-10 shadow-rose-100">
          <FaShoppingBag className="mx-auto text-5xl text-rose-400" />
          <h1 className="text-3xl font-bold text-slate-900">Your cart is feeling lonely</h1>
          <p className="text-sm text-rose-400">Add a few Market Hub goodies and they will sync straight to the POS for speedy fulfilment.</p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/market"
              className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-400"
            >
              Start shopping
            </Link>
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
            >
              Back home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="container mx-auto px-6">
        <h1 className="text-3xl font-bold text-slate-900">Your Cart</h1>
        <p className="mt-2 text-sm text-rose-400">
          Everything here will pop into the POS as soon as you complete checkout or request a proposal.
        </p>
        {cartHasPreorder && (
          <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-sm text-rose-600">
            <p className="font-semibold">Preorder reminder</p>
            <p className="mt-1 text-rose-500">
              One or more items are preorder-only. Please have your bank transfer slip ready—checkout will ask for it and a phone number so we can validate the reservation.
            </p>
          </div>
        )}

        <div className="mt-8 rounded-3xl border border-rose-200 bg-white/95 p-6 shadow-rose-100">
          {cart.map((item) => {
            const imageSrc = resolveMediaUrl(item.image || item.image_source || item.imageUrl);
            const preorder = item?.preorder || isPreorderProduct(item);
            return (
              <div
                key={item.id}
                className="flex flex-col gap-4 border-b border-rose-100 py-4 last:border-b-0 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex flex-1 items-center gap-4">
                  <div className="h-20 w-20 overflow-hidden rounded-2xl border border-rose-100 bg-rose-50">
                    {imageSrc ? (
                      <img src={imageSrc} alt={item.name} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-rose-300">No image</div>
                    )}
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">{item.name}</h2>
                    <p className="text-sm text-rose-400">{formatCurrency(item.price)}</p>
                    {preorder && (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-500">
                        Preorder item
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <div
                    className="flex items-center overflow-hidden rounded-full border border-rose-200 bg-white"
                    role="group"
                    aria-label={`Quantity controls for ${item.name}`}
                  >
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="px-3 py-2 text-rose-500 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      aria-label={`Decrease quantity of ${item.name}`}
                    >
                      <FaMinus />
                    </button>
                    <span className="px-4 text-sm font-semibold text-slate-700" aria-live="polite">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="px-3 py-2 text-rose-500 hover:bg-rose-50 focus:outline-none focus:ring-2 focus:ring-rose-200"
                      aria-label={`Increase quantity of ${item.name}`}
                    >
                      <FaPlus />
                    </button>
                  </div>
                  <p className="w-28 text-right text-sm font-semibold text-rose-500">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                  <button
                    onClick={() => removeFromCart(item.id)}
                    className="text-rose-400 transition hover:text-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                    aria-label={`Remove ${item.name} from cart`}
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="mt-6 flex flex-col items-center justify-between gap-4 rounded-2xl bg-rose-50/70 p-4 text-rose-500 md:flex-row">
            <button onClick={clearCart} className="text-sm font-semibold hover:text-rose-400">
              Clear cart
            </button>
            <div className="text-2xl font-bold text-rose-500">Total: {formatCurrency(cartTotal)}</div>
          </div>

          <div className="mt-6 flex flex-wrap justify-between gap-4">
            <Link
              to="/market"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
            >
              Continue shopping
            </Link>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/checkout?quote=true"
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-rose-500 shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-50"
              >
                <FaFileAlt /> Request a quote
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-rose-200 transition hover:-translate-y-0.5 hover:bg-rose-400"
              >
                <FaShoppingBag /> Checkout as guest
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
