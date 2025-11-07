import { Link } from 'react-router-dom';
import { FaArrowRight } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';

export default function VendorCard({ vendor }) {
  if (!vendor) return null;
  const hero = resolveMediaUrl(vendor.hero_image || vendor.logo_url || '');
  const logo = resolveMediaUrl(vendor.logo_url || '');

  return (
    <Link
      to={`/vendors/${vendor.slug}`}
      className="group relative overflow-hidden rounded-3xl border border-rose-100 bg-white shadow-lg shadow-rose-100 transition hover:-translate-y-1 hover:shadow-rose-200"
    >
      <div className="relative h-40 w-full overflow-hidden">
        {hero ? (
          <img
            src={hero}
            alt={vendor.legal_name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-rose-100 via-white to-sky-100" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
        {logo && (
          <img
            src={logo}
            alt={`${vendor.legal_name} logo`}
            className="absolute left-5 -bottom-8 h-16 w-16 rounded-2xl border-4 border-white object-cover shadow-lg"
            loading="lazy"
          />
        )}
      </div>

      <div className="space-y-3 px-5 pb-5 pt-10">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-rose-300">Partner</p>
          <h3 className="text-xl font-semibold text-slate-900">{vendor.legal_name}</h3>
          {vendor.tagline && <p className="text-sm text-slate-500 line-clamp-2">{vendor.tagline}</p>}
        </div>
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{vendor.product_count || 0} products live</span>
          <span className="inline-flex items-center gap-2 font-semibold text-rose-500 group-hover:gap-3">
            View profile
            <FaArrowRight />
          </span>
        </div>
      </div>
    </Link>
  );
}
