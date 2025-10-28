import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { FaShoppingCart, FaSearch } from 'react-icons/fa';

export default function PublicProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', subcategory: '', search: '' });
  const { addToCart, cartCount } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, [filters]);

  const fetchProducts = async () => {
    try {
      const query = new URLSearchParams(filters).toString();
      const res = await api.get(`/products?${query}`);
      setProducts(res);
    } catch (err) {
      console.error("Failed to load products", err);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/products/categories');
      setCategories(res);
    } catch (err) {
      console.error("Failed to load categories", err);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const newFilters = { ...prev, [name]: value };
      if (name === 'category') {
        newFilters.subcategory = '';
      }
      return newFilters;
    });
  };
  
  const availableSubcategories = useMemo(() => {
    return filters.category ? categories[filters.category] || [] : [];
  }, [filters.category, categories]);

  return (
    <div className="bg-gray-50 min-h-screen">
      <div className="container mx-auto p-6">
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
          <h1 className="text-4xl font-bold text-gray-800">Our Products</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <input 
                type="text"
                name="search"
                placeholder="Search products..."
                value={filters.search}
                onChange={handleFilterChange}
                className="p-2 border rounded-md pl-10"
              />
              <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            </div>
            <Link to="/cart" className="relative">
              <FaShoppingCart className="text-2xl text-gray-600 hover:text-blue-600" />
              {cartCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Link>
          </div>
        </div>

        <div className="flex gap-4 mb-8">
          <select name="category" value={filters.category} onChange={handleFilterChange} className="p-2 border rounded-md bg-white">
            <option value="">All Categories</option>
            {Object.keys(categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select name="subcategory" value={filters.subcategory} onChange={handleFilterChange} className="p-2 border rounded-md bg-white" disabled={!filters.category}>
            <option value="">All Subcategories</option>
            {availableSubcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {products.map(product => (
            <div key={product.id} className="bg-white rounded-lg shadow-md overflow-hidden transform hover:scale-105 transition-transform duration-300">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-gray-800 mb-2 h-14">{product.name}</h2>
                <p className="text-sm text-gray-500 mb-4">{product.category} &gt; {product.subcategory}</p>
                <div className="flex justify-between items-center">
                  <p className="text-2xl font-bold text-blue-600">{formatCurrency(product.price)}</p>
                  <button 
                    onClick={() => addToCart(product)}
                    className="bg-blue-500 text-white p-2 rounded-full hover:bg-blue-700 transition-colors"
                    aria-label={`Add ${product.name} to cart`}
                  >
                    <FaShoppingCart />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
