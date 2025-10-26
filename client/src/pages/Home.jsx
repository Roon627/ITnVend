import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api.get('/products').then((p) => {
      if (!mounted) return;
      setProducts(p || []);
    }).catch(() => {}).finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-6">
        <section className="bg-white rounded-lg p-8 shadow mb-8">
          <h2 className="text-3xl font-bold mb-2">Welcome to ITnVend</h2>
          <p className="text-gray-600">Browse our featured products and contact us to place an order. This is the public-facing customer page.</p>
        </section>

        <section>
          <h3 className="text-2xl font-semibold mb-4">Products</h3>
          {loading ? (
            <div>Loading products…</div>
          ) : products.length === 0 ? (
            <div className="text-gray-500">No products available.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
              {products.map((p) => (
                <div key={p.id} className="bg-white rounded-lg p-4 shadow">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{p.name}</h4>
                    <div className="text-lg font-bold">{p.price}</div>
                  </div>
                  <p className="text-sm text-gray-500 mt-2">Stock: {p.stock ?? '—'}</p>
                  <div className="mt-4 flex items-center gap-2">
                    <a href="/customers" className="text-sm px-3 py-2 bg-blue-600 text-white rounded">Contact / Order</a>
                    <button disabled className="text-sm px-3 py-2 border rounded text-gray-500">Add to cart</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
