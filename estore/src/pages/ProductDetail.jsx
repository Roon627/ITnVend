import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../lib/api';
import { useCart } from '../components/CartContext';
import { useSettings } from '../components/SettingsContext';
import { resolveMediaUrl } from '../lib/media';

export default function ProductDetail() {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const { addToCart } = useCart();
  const { formatCurrency } = useSettings();

  useEffect(() => {
    let mounted = true;
    api
      .get(`/products/${id}`)
      .then((p) => {
        if (mounted) setProduct(p);
      })
      .catch(() => setProduct(null));
    return () => {
      mounted = false;
    };
  }, [id]);

  if (!product) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-gradient-to-br from-rose-50 via-white to-sky-50">
        <p className="rounded-full border border-rose-200 bg-white px-6 py-3 text-sm font-semibold text-rose-500 shadow-sm">
          Loading your item...
        </p>
      </div>
    );
  }

  const imageSrc = resolveMediaUrl(product.image || product.image_source || product.imageUrl);

  return (
    <div className="bg-gradient-to-br from-rose-50 via-white to-sky-50 py-16">
      <div className="container mx-auto px-6">
        <div className="mb-6 text-sm text-rose-500">
          <Link to="/" className="font-semibold hover:text-rose-600">
            ITnVend Home
          </Link>
          <span className="mx-2 text-rose-300">/</span>
          <Link to="/market" className="font-semibold hover:text-rose-600">
            Market Hub
          </Link>
          <span className="mx-2 text-rose-300">/</span>
          <span className="text-rose-400">{product.name}</span>
        </div>

        <div className="grid gap-10 rounded-3xl border border-white/60 bg-white/90 p-6 shadow-rose-100 sm:p-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex items-center justify-center rounded-2xl bg-gradient-to-br from-white via-rose-50 to-sky-50 p-6 shadow-inner">
            {imageSrc ? (
              <img
                src={imageSrc}
                alt={product.name}
                loading="lazy"
                className="max-h-[26rem] w-full object-contain drop-shadow-lg"
              />
            ) : (
              <div className="flex h-64 w-full items-center justify-center rounded-xl border border-dashed border-rose-200 bg-white text-sm text-rose-300">
                Image coming soon
              </div>
            )}
          </div>

          <div className="flex flex-col gap-6">
            <header className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-rose-600">
                {product.category || 'Market item'}
              </span>
              <h1 className="text-3xl font-black text-slate-900 sm:text-4xl">{product.name}</h1>
              <p className="text-sm uppercase tracking-widest text-rose-400">{product.subcategory || ''}</p>
            </header>

            <div className="rounded-2xl bg-rose-50/60 p-5 text-rose-700 shadow-inner">
              <p className="text-sm font-semibold uppercase tracking-wider text-rose-400">Price</p>
              <p className="mt-1 text-3xl font-bold text-rose-600">{formatCurrency(product.price)}</p>
              <p className="mt-3 text-sm text-rose-500">
                Your POS will pull this value directly when a cart containing this item is submitted from the storefront.
              </p>
            </div>

            <section className="space-y-3 rounded-2xl border border-rose-100 bg-white p-6 text-slate-700 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Details</h2>
              <p className="leading-relaxed text-slate-600">
                {product.description || 'This item syncs with ITnVend POS for ordering, fulfilment, and inventory workflows.'}
              </p>
              {product.notes && (
                <p className="rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-600">
                  Notes: {product.notes}
                </p>
              )}
            </section>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => addToCart(product)}
                className="inline-flex items-center gap-3 rounded-full bg-rose-500 px-6 py-3 text-white shadow-lg shadow-rose-300 transition hover:-translate-y-0.5 hover:bg-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200"
                aria-label={`Add ${product.name} to cart`}
              >
                Add to cart
              </button>
              <Link
                to="/market"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                Back to Market Hub
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
              >
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
