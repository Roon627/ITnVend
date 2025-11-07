const STATUS_META = {
  preorder: {
    label: 'PREORDER',
    className: 'bg-rose-100 text-rose-600',
  },
  vendor: {
    label: 'THROUGH VENDOR',
    className: 'bg-amber-100 text-amber-600',
  },
  used: {
    label: 'USED',
    className: 'bg-slate-100 text-slate-600',
  },
  in_stock: {
    label: 'IN STOCK',
    className: 'bg-emerald-100 text-emerald-600',
  },
};

export default function AvailabilityTag({ availabilityStatus = 'in_stock', className = '' }) {
  const key = (availabilityStatus || '').toString().toLowerCase();
  const meta = STATUS_META[key] || STATUS_META.in_stock;
  return (
    <span
      className={`pointer-events-none select-none absolute top-2 left-2 z-10 rounded-full px-3 py-1 text-[0.65rem] font-semibold tracking-wide shadow-sm ${meta.className} ${className}`.trim()}
    >
      {meta.label}
    </span>
  );
}
