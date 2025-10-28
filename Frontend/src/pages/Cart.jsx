import { Link } from 'react-router-dom';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaTrash, FaPlus, FaMinus, FaShoppingBag, FaFileAlt } from 'react-icons/fa';

export default function Cart() {
  const { cart, removeFromCart, updateQuantity, cartTotal, clearCart } = useCart();
  const { formatCurrency } = useSettings();

  if (cart.length === 0) {
    return (
      <div className="container mx-auto p-6 text-center">
        <FaShoppingBag className="text-6xl text-gray-300 mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-4">Your Cart is Empty</h1>
        <p className="text-gray-500 mb-6">Looks like you haven't added anything to your cart yet.</p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/store" className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors">
            Start Shopping
          </Link>
          <Link to="/" className="px-4 py-3 border rounded-md hover:bg-gray-50">Home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Your Shopping Cart</h1>
      <div className="bg-white shadow-md rounded-lg p-6">
        {cart.map(item => (
          <div key={item.id} className="flex items-center justify-between border-b py-4">
            <div>
              <h2 className="text-lg font-semibold">{item.name}</h2>
              <p className="text-gray-600">{formatCurrency(item.price)}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center border rounded-md" role="group" aria-label={`Quantity controls for ${item.name}`}>
                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300" aria-label={`Decrease quantity of ${item.name}`}><FaMinus /></button>
                <span className="px-4" aria-live="polite">{item.quantity}</span>
                <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-2 text-gray-600 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-300" aria-label={`Increase quantity of ${item.name}`}><FaPlus /></button>
              </div>
              <p className="font-semibold w-28 text-right">{formatCurrency(item.price * item.quantity)}</p>
              <button onClick={() => removeFromCart(item.id)} className="text-red-500 hover:text-red-700 focus:outline-none focus:ring-2 focus:ring-red-300" aria-label={`Remove ${item.name} from cart`}><FaTrash /></button>
            </div>
          </div>
        ))}
        <div className="mt-6 flex justify-end items-center">
          <h2 className="text-2xl font-bold">Total: {formatCurrency(cartTotal)}</h2>
        </div>
        <div className="mt-6 flex justify-between">
          <div className="flex items-center gap-4">
            <button onClick={clearCart} className="text-gray-500 hover:underline">Clear Cart</button>
            <Link to="/" className="px-3 py-2 border rounded-md hover:bg-gray-50">Home</Link>
          </div>
          <div className="flex gap-4">
            <Link to="/checkout?quote=true" className="bg-gray-200 text-gray-800 px-6 py-3 rounded-md hover:bg-gray-300 flex items-center gap-2">
              <FaFileAlt /> Request a Quote
            </Link>
            <Link to="/checkout" className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 flex items-center gap-2">
              <FaShoppingBag /> Checkout as Guest
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
