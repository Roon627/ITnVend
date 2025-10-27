import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import Footer from '../components/Footer';
import { FaShoppingCart, FaShieldAlt, FaPaintBrush, FaTasks, FaCogs } from 'react-icons/fa';
import { useSettings } from '../components/SettingsContext';

export default function Home() {
  const [products, setProducts] = useState([]);
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    // Fetch a limited number of products for the homepage
    api.get('/products').then(allProducts => setProducts(allProducts.slice(0, 6))).catch(() => setProducts([]));
  }, []);

  return (
    <div className="bg-white text-gray-800">
      {/* Header */}
      <header className="container mx-auto px-6 py-4 flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">ITnVend</h1>
        <Link to="/cart" className="relative">
          <FaShoppingCart className="text-2xl text-gray-600 hover:text-blue-600" />
          {cartCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
              {cartCount}
            </span>
          )}
        </Link>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <h2 className="text-5xl font-extrabold text-gray-900 mb-4">The Integrated Partner for Modern Business</h2>
        <p className="text-lg text-gray-600 mb-8">Secure IT, Compelling Media, Efficient Procurement, and Smart Unattended Retail.</p>
  <p className="text-xl font-semibold text-blue-600 mb-3">Smart Vending, Smarter Business</p>
  <p className="text-base text-gray-500 mb-9" dir="rtl">އައި.ޓީ ހިދުމަތް، ޑިޖިޓަލް މީޑިއާ، އަދި ވިޔަފާރީ ހައްލުތައް ފޯރުކޮށްދިނުން</p>
        <Link to="/store" className="bg-blue-600 text-white px-8 py-4 rounded-full font-semibold hover:bg-blue-700 transition-transform transform hover:scale-105 inline-block">
          Explore Our Solutions
        </Link>
      </section>

      {/* Featured Products */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6">
          <h3 className="text-3xl font-bold text-center mb-10">Our Digital Marketplace</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((p) => (
              <div key={p.id} className="bg-white rounded-lg p-6 shadow-md transform hover:-translate-y-2 transition-transform duration-300">
                <h4 className="font-bold text-xl mb-2">{p.name}</h4>
                <p className="text-gray-500 text-sm mb-4">{p.category} &gt; {p.subcategory}</p>
                <div className="flex justify-between items-center">
                  <div className="text-2xl font-bold text-blue-600">{formatCurrency(p.price)}</div>
                  <button onClick={() => addToCart(p)} className="bg-blue-600 text-white p-3 rounded-full hover:bg-blue-700 transition-colors">
                    <FaShoppingCart />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offerings Section */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6">
          <h3 className="text-3xl font-bold text-center mb-12">Our Core Offerings</h3>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 text-center">
            <div>
              <FaShieldAlt className="text-5xl text-blue-600 mx-auto mb-4" />
              <h4 className="text-2xl font-bold mb-2">Managed IT (MSP)</h4>
              <p className="text-gray-600">Tiered support, cloud & security bundles to keep your operations secure and running.</p>
            </div>
            <div>
              <FaPaintBrush className="text-5xl text-blue-600 mx-auto mb-4" />
              <h4 className="text-2xl font-bold mb-2">Digital Media</h4>
              <p className="text-gray-600">Retainers for content, campaigns, and analytics to drive digital growth.</p>
            </div>
            <div>
              <FaTasks className="text-5xl text-blue-600 mx-auto mb-4" />
              <h4 className="text-2xl font-bold mb-2">Procurement</h4>
              <p className="text-gray-600">Streamlined sourcing, licensing, and lifecycle management for all your business needs.</p>
            </div>
            <div>
              <FaCogs className="text-5xl text-blue-600 mx-auto mb-4" />
              <h4 className="text-2xl font-bold mb-2">Smart Vending</h4>
              <p className="text-gray-600">Hardware, payment integration, and predictive restocking for unattended retail.</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
