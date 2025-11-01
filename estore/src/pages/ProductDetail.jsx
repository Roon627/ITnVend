import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    let mounted = true;
    api.get(`/products/${id}`).then(p => { if (mounted) setProduct(p); }).catch(() => setProduct(null));
    return () => { mounted = false; };
  }, [id]);

  if (!product) return (
    <div className="container mx-auto p-6">Loading…</div>
  );

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col md:flex-row gap-8">
        <div className="md:w-1/2 bg-white p-4 rounded shadow flex items-center justify-center">
          {product.image ? (
            <img src={product.image} alt={product.name} loading="lazy" className="max-h-96 object-contain" />
          ) : (
            <div className="text-gray-400">No image</div>
          )}
        </div>

        <div className="md:w-1/2">
          <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
          <p className="text-gray-600 mb-4">{product.category} &gt; {product.subcategory}</p>
          <div className="text-2xl font-bold text-blue-600 mb-4">{formatCurrency(product.price)}</div>
          <p className="mb-6 text-gray-700">{product.description || 'No description available.'}</p>

          <div className="flex gap-3">
            <button onClick={() => addToCart(product)} className="bg-blue-600 text-white px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400" aria-label={`Add ${product.name} to cart`}>Add to cart</button>
            <Link to="/store" className="px-4 py-2 border rounded-md">Back to Store</Link>
            <Link to="/" className="px-4 py-2 border rounded-md">Home</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
