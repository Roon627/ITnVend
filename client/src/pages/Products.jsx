import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useToast } from '../components/ToastContext';

export default function Products() {
  const [products, setProducts] = useState([]);
  const [form, setForm] = useState({ name: '', price: '', stock: '' });
  const toast = useToast();

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res);
    } catch (err) {
      toast.push('Failed to load products', 'error');
    }
  };

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await api.post('/products', { name: form.name, price: parseFloat(form.price), stock: parseInt(form.stock || '0') });
      setForm({ name: '', price: '', stock: '' });
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
    if (name == null) return;
    try {
      await api.put(`/products/${p.id}`, { name, price: parseFloat(price), stock: parseInt(stock) });
      fetchProducts();
      toast.push('Product updated', 'info');
    } catch (err) {
      toast.push('Failed to update product', 'error');
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Products</h2>
      <div className="bg-white p-4 rounded-md shadow mb-6">
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <input name="name" value={form.name} onChange={handleChange} placeholder="Name" className="p-2 border rounded" />
          <input name="price" value={form.price} onChange={handleChange} placeholder="Price" className="p-2 border rounded" />
          <input name="stock" value={form.stock} onChange={handleChange} placeholder="Stock" className="p-2 border rounded" />
          <button className="bg-blue-600 text-white px-4 py-2 rounded">Add Product</button>
        </form>
      </div>

      <div className="bg-white p-4 rounded-md shadow">
        <table className="w-full table-auto">
          <thead>
            <tr className="text-left">
              <th className="p-2">Name</th>
              <th className="p-2">Price</th>
              <th className="p-2">Stock</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="p-2">{p.name}</td>
                <td className="p-2">${p.price.toFixed(2)}</td>
                <td className="p-2">{p.stock}</td>
                <td className="p-2">
                  <button onClick={() => handleEdit(p)} className="mr-2 text-indigo-600">Edit</button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-600">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
