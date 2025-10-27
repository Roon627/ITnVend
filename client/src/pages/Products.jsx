import { useState, useEffect, useMemo } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';
import { useSettings } from '../components/SettingsContext';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState({});
  const [filters, setFilters] = useState({ category: '', subcategory: '' });
  const [form, setForm] = useState({ name: '', price: '', stock: '', category: '', subcategory: '' });
  const toast = useToast();
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
      toast.push('Failed to load products', 'error');
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await api.get('/products/categories');
      setCategories(res);
    } catch (err) {
      toast.push('Failed to load categories', 'error');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => {
      const newFilters = { ...prev, [name]: value };
      if (name === 'category') {
        newFilters.subcategory = ''; // Reset subcategory when category changes
      }
      return newFilters;
    });
  };

  const handleFormChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products', { ...form, price: parseFloat(form.price), stock: parseInt(form.stock || '0') });
      setForm({ name: '', price: '', stock: '', category: '', subcategory: '' });
      fetchProducts();
      toast.push('Product added', 'info');
    } catch (err) {
      toast.push('Failed to add product', 'error');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return;
    try {
      await api.del(`/products/${id}`);
      fetchProducts();
      toast.push('Product deleted', 'info');
    } catch (err) {
      toast.push('Failed to delete product', 'error');
    }
  };

  const handleEdit = async (p) => {
    const name = prompt('Name', p.name);
    const price = prompt('Price', p.price);
    const stock = prompt('Stock', p.stock);
    const category = prompt('Category', p.category);
    const subcategory = prompt('Subcategory', p.subcategory);
    if (name == null) return;
    try {
      await api.put(`/products/${p.id}`, { name, price: parseFloat(price), stock: parseInt(stock), category, subcategory });
      fetchProducts();
      toast.push('Product updated', 'info');
    } catch (err) {
      toast.push('Failed to update product', 'error');
    }
  };

  const availableSubcategories = useMemo(() => {
    return filters.category ? categories[filters.category] || [] : [];
  }, [filters.category, categories]);

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Products</h2>
      
      {/* Add Product Form */}
      <div className="bg-white p-4 rounded-md shadow mb-6">
        <h3 className="text-lg font-semibold mb-2">Add New Product</h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <input name="name" value={form.name} onChange={handleFormChange} placeholder="Name" className="p-2 border rounded" required />
          <input name="price" value={form.price} onChange={handleFormChange} placeholder="Price" className="p-2 border rounded" type="number" step="0.01" required />
          <input name="stock" value={form.stock} onChange={handleFormChange} placeholder="Stock" className="p-2 border rounded" type="number" />
          <input name="category" value={form.category} onChange={handleFormChange} placeholder="Category" className="p-2 border rounded" />
          <input name="subcategory" value={form.subcategory} onChange={handleFormChange} placeholder="Subcategory" className="p-2 border rounded" />
          <button className="bg-blue-600 text-white px-4 py-2 rounded col-span-full sm:col-span-1">Add Product</button>
        </form>
      </div>

      {/* Filters and Product Table */}
      <div className="bg-white p-4 rounded-md shadow">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <select name="category" value={filters.category} onChange={handleFilterChange} className="p-2 border rounded">
            <option value="">All Categories</option>
            {Object.keys(categories).map(cat => <option key={cat} value={cat}>{cat}</option>)}
          </select>
          <select name="subcategory" value={filters.subcategory} onChange={handleFilterChange} className="p-2 border rounded" disabled={!filters.category}>
            <option value="">All Subcategories</option>
            {availableSubcategories.map(sub => <option key={sub} value={sub}>{sub}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-auto">
            <thead className="bg-gray-50">
              <tr className="text-left text-gray-600 uppercase text-sm">
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Subcategory</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Stock</th>
                <th className="p-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="text-gray-700">
              {products.map((p) => (
                <tr key={p.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">{p.name}</td>
                  <td className="p-3">{p.category}</td>
                  <td className="p-3">{p.subcategory}</td>
                  <td className="p-3 text-right">{formatCurrency(p.price)}</td>
                  <td className="p-3 text-right">{p.stock}</td>
                  <td className="p-3 text-center">
                    <button onClick={() => handleEdit(p)} className="mr-2 text-indigo-600 hover:underline">Edit</button>
                    <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:underline">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
