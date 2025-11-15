import React from 'react';

export default function RegularCustomerLookup({
  enabled,
  onToggle,
  query,
  onQueryChange,
  status,
  error,
  onSubmit,
  match,
  onClearMatch,
}) {
  const searching = status === 'searching';
  return (
    <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-4 text-sm text-rose-600 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-rose-700">I&apos;m a regular</h3>
          <p className="text-xs text-rose-500">
            We can autofill your details if you share any identifier you used before (name, email, or phone).
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600">
          <input type="checkbox" checked={enabled} onChange={(event) => onToggle(event.target.checked)} />
          Use lookup
        </label>
      </div>
      {enabled && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Type your name, email, or phone"
              className="flex-1 rounded-md border border-rose-200 px-3 py-2 text-sm focus:border-rose-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={onSubmit}
              disabled={!query.trim() || searching}
              className="inline-flex items-center justify-center rounded-md bg-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-600 disabled:opacity-50"
            >
              {searching ? 'Searching…' : 'Find me'}
            </button>
          </div>
          {error && <p className="text-xs text-rose-500">{error}</p>}
          {match && (
            <div className="rounded-xl border border-emerald-100 bg-white/90 p-3 text-xs text-emerald-700 shadow-inner">
              <p className="font-semibold text-emerald-800">We found a match</p>
              <ul className="mt-1 space-y-0.5 text-emerald-600">
                {match.name && (
                  <li>
                    <span className="font-medium">Name:</span> {match.name}
                  </li>
                )}
                {match.email && (
                  <li>
                    <span className="font-medium">Email:</span> {match.email}
                  </li>
                )}
                {match.phone && (
                  <li>
                    <span className="font-medium">Phone:</span> {match.phone}
                  </li>
                )}
                {match.delivery_preference && (
                  <li>
                    <span className="font-medium">Last delivery:</span> {match.delivery_preference}
                  </li>
                )}
              </ul>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                  Details applied
                </span>
                <button
                  type="button"
                  onClick={onClearMatch}
                  className="text-xs font-semibold text-rose-500 underline-offset-2 hover:underline"
                >
                  Search again
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
