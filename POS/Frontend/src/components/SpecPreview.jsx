import React from 'react';

const SpecCard = ({ children }) => (
  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-700 shadow-sm">
    {children}
  </div>
);

export default function SpecPreview({ value }) {
  if (!value || !String(value).trim()) {
    return (
      <SpecCard>
        <p className="text-sm text-slate-500">No technical details provided.</p>
      </SpecCard>
    );
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return (
        <SpecCard>
          <ul className="list-disc list-inside space-y-1">
            {parsed.map((it, i) => (
              <li key={i}>{typeof it === 'string' ? it : JSON.stringify(it)}</li>
            ))}
          </ul>
        </SpecCard>
      );
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <SpecCard>
          <dl className="space-y-1">
            {Object.entries(parsed).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4">
                <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">{k}</dt>
                <dd className="text-sm text-slate-700">{String(v)}</dd>
              </div>
            ))}
          </dl>
        </SpecCard>
      );
    }
  } catch (e) {
    if (import.meta.env.DEV) {
      // keep a lightweight debug message during development only
      console.debug('SpecPreview JSON parse failed (falling back to plain text)', e?.message || e);
    }
    // fallback to lines
  }
  return (
    <SpecCard>
      <div className="space-y-1">
        {String(value)
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line, idx) => (
            <div key={idx} className="text-sm text-slate-700">
              • {line}
            </div>
          ))}
      </div>
    </SpecCard>
  );
}
