import { FaFacebookF, FaInstagram, FaTelegramPlane, FaWhatsapp } from 'react-icons/fa';

const SOCIAL_FIELDS = [
  {
    key: 'social_facebook',
    label: 'Facebook',
    placeholder: 'https://facebook.com/yourpage',
    icon: FaFacebookF,
    helper: 'Point customers to your primary Facebook page or group.',
  },
  {
    key: 'social_instagram',
    label: 'Instagram',
    placeholder: 'https://instagram.com/yourhandle',
    icon: FaInstagram,
    helper: 'Use the main handle that showcases drops and stories.',
  },
  {
    key: 'social_whatsapp',
    label: 'WhatsApp',
    placeholder: 'https://wa.me/9600000000',
    icon: FaWhatsapp,
    helper: 'Direct chat link for quick order confirmations or support.',
  },
  {
    key: 'social_telegram',
    label: 'Telegram',
    placeholder: 'https://t.me/yourchannel',
    icon: FaTelegramPlane,
    helper: 'Broadcast channel for announcements and early access alerts.',
  },
];

export default function SocialLinksPanel({ formState, updateField, canEdit }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-6 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">Social presence</p>
          <h3 className="text-lg font-semibold text-slate-800">Publish storefront social links</h3>
          <p className="text-sm text-slate-500">
            These links power the public footer and the dedicated socials page. Update them whenever a handle changes.&nbsp;
            Empty fields are hidden from customers.
          </p>
        </div>
        {!canEdit && (
          <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-500">
            Admin only
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        {SOCIAL_FIELDS.map(({ key, label, placeholder, icon, helper }) => {
          const IconComponent = icon;
          return (
            <div key={key} className="rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-inner">
              <label className="flex items-center gap-3 text-sm font-semibold text-slate-700" htmlFor={key}>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 text-rose-500">
                  <IconComponent aria-hidden="true" />
                </span>
                {label}
              </label>
              <input
                id={key}
                name={key}
                type="url"
                inputMode="url"
                autoComplete="off"
                value={formState[key] || ''}
                onChange={(event) => updateField(key, event.target.value)}
                placeholder={placeholder}
                disabled={!canEdit}
                className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:cursor-not-allowed disabled:bg-slate-50"
              />
              <p className="mt-2 text-xs text-slate-500">{helper}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
