import { Link } from 'react-router-dom';
import { FaArrowRight, FaCheckCircle, FaFacebookF, FaInstagram, FaLinkedinIn, FaTelegramPlane, FaTiktok, FaTwitter, FaWhatsapp, FaYoutube } from 'react-icons/fa';
import { resolveMediaUrl } from '../lib/media';

const SOCIAL_ICON_MAP = {
  instagram: FaInstagram,
  facebook: FaFacebookF,
  twitter: FaTwitter,
  linkedin: FaLinkedinIn,
  youtube: FaYoutube,
  tiktok: FaTiktok,
  whatsapp: FaWhatsapp,
  telegram: FaTelegramPlane,
};

export default function VendorCard({ vendor }) {
  if (!vendor) return null;
  const hero = resolveMediaUrl(vendor.hero_image || vendor.logo_url || '');
  const logo = resolveMediaUrl(vendor.logo_url || '');
  const socials = Object.entries(vendor.social_links || {}).filter(([key, value]) => SOCIAL_ICON_MAP[key] && value);
  const isVerified = Number(vendor.verified ?? vendor.is_verified ?? 0) === 1;
  const heroSizes = '(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 360px';

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
            decoding="async"
            sizes={heroSizes}
            width={640}
            height={220}
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
            decoding="async"
            width={64}
            height={64}
          />
        )}
      </div>

      <div className="space-y-3 px-5 pb-5 pt-10">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-rose-300">Partner</p>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-semibold text-slate-900">{vendor.legal_name}</h3>
            {isVerified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                <FaCheckCircle />
                Verified
              </span>
            )}
          </div>
          {vendor.tagline && <p className="text-sm text-slate-500 line-clamp-2">{vendor.tagline}</p>}
        </div>
        {socials.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {socials.map(([key, url]) => {
              const Icon = SOCIAL_ICON_MAP[key];
              return (
                <a
                  key={key}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-100 bg-white text-slate-500 shadow-sm transition hover:text-rose-500"
                >
                  <Icon />
                </a>
              );
            })}
          </div>
        )}
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
