import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FaFacebookF, FaInstagram, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';
import { useSettings } from '../components/SettingsContext';

const BASE_CHANNELS = [
  {
    key: 'facebook',
    name: 'Facebook',
    defaultHandle: '@itnvend',
    caption: 'Community drops, product polls, and launch livestreams.',
    fallback: 'https://facebook.com/itnvend',
    icon: FaFacebookF,
    accent: 'from-blue-100 to-blue-200',
  },
  {
    key: 'instagram',
    name: 'Instagram',
    defaultHandle: '@itnvend',
    caption: 'Stories from the warehouse, unboxing reels, and customer shout-outs.',
    fallback: 'https://instagram.com/itnvend',
    icon: FaInstagram,
    accent: 'from-pink-100 to-rose-100',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    defaultHandle: '+960 000 0000',
    caption: 'Ping us for quick order updates or to confirm stock before you checkout.',
    fallback: 'https://wa.me/9600000000',
    icon: FaWhatsapp,
    accent: 'from-emerald-100 to-teal-100',
  },
  {
    key: 'telegram',
    name: 'Telegram',
    defaultHandle: '@itnvend',
    caption: 'Early adopter alerts, beta tester invites, and API status broadcasts.',
    fallback: 'https://t.me/itnvend',
    icon: FaTelegramPlane,
    accent: 'from-sky-100 to-sky-200',
  },
];

export default function Socials() {
  const { settings } = useSettings();

  const channels = useMemo(() => {
    const linkMap = settings?.social_links;
    const deriveHandle = (link, fallbackHandle) => {
      if (!link) return fallbackHandle;
      try {
        const url = new URL(link);
        const cleanPath = url.pathname.replace(/^\//, '').split('/')[0];
        if (url.hostname.includes('wa.me')) return url.pathname.replace(/^\//, '') || link;
        if (url.hostname.includes('t.me')) return cleanPath ? `@${cleanPath}` : link;
        if (url.hostname.includes('instagram.com') || url.hostname.includes('facebook.com')) {
          return cleanPath ? `@${cleanPath}` : fallbackHandle;
        }
        return link;
      } catch (err) {
        return link;
      }
    };

    return BASE_CHANNELS
      .map(({ key, fallback, defaultHandle, ...rest }) => {
        const hasKey = linkMap && Object.prototype.hasOwnProperty.call(linkMap, key);
        const candidate = hasKey ? linkMap[key] : settings?.[`social_${key}`];
        const href = candidate ?? (linkMap ? null : fallback);
        if (!href) return null;
        return {
          ...rest,
          href,
          handle: deriveHandle(candidate ?? fallback, defaultHandle),
        };
      })
      .filter(Boolean);
  }, [settings]);

  return (
    <div className="bg-gradient-to-br from-sky-50 via-white to-rose-50 py-16">
      <div className="container mx-auto max-w-5xl px-6">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-400">Signal Boost</p>
          <h1 className="mt-3 text-4xl font-bold text-slate-800">Where ITnVend hangs out online</h1>
          <p className="mt-4 text-sm text-slate-500 sm:text-base">
            Slide into the community channel that suits you best. Each link below uses a placeholder URL&mdash;swap it when your official handles are ready.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {channels.map(({ name, handle, caption, href, icon: Icon, accent }) => (
            <a
              key={name}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-3xl border border-rose-100 bg-white/95 p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              <div className={`absolute -top-8 -right-8 h-32 w-32 rounded-full bg-gradient-to-br ${accent} opacity-60 blur-3xl`} aria-hidden="true" />
              <div className="relative flex flex-col gap-4">
                <div className="inline-flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-rose-500 shadow-md shadow-rose-100 transition group-hover:text-rose-600">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800">{name}</h2>
                    <p className="text-sm font-medium text-rose-400">{handle}</p>
                  </div>
                </div>
                <p className="text-sm text-slate-600">{caption}</p>
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-rose-500">
                  Join the conversation
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </a>
          ))}
        </div>
        {channels.length === 0 && (
          <div className="mt-6 rounded-3xl border border-dashed border-rose-200 bg-white/60 p-8 text-center text-sm text-rose-400">
            Add your social handles from the admin settings page to showcase them here.
          </div>
        )}

        <div className="mt-12 grid gap-4 rounded-3xl border border-slate-100 bg-white/70 p-6 text-center shadow-sm sm:p-10">
          <h2 className="text-2xl font-semibold text-slate-800">Launch new channels, fast</h2>
          <p className="text-sm text-slate-600 sm:text-base">
            Need a new broadcast list or a one-off campaign? Drop us a note and we will spin up the assets for you.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-rose-500 px-5 py-2 text-sm font-semibold text-white shadow-md shadow-rose-200 transition hover:-translate-y-0.5"
            >
              Contact the team
            </Link>
            <Link
              to="/market"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 px-5 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-50"
            >
              Browse what’s trending
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
