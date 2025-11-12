import React, { useState } from 'react';

export default function SpecsPanel({ specs = {} }) {
  const entries = Object.entries(specs || {});
  const [open, setOpen] = useState(entries.length <= 6);

  if (!entries.length) return null;

  return (
    <section className="space-y-3 rounded-lg border border-slate-100 bg-white p-4 text-slate-700">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Specifications</h2>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-sm text-rose-500 hover:text-rose-600"
        >
          {open ? 'Collapse' : `Show ${entries.length}`}
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {entries.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{k}</span>
              <span className="text-sm text-slate-700">{String(v)}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
