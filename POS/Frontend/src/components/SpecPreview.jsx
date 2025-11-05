import React from 'react';

export default function SpecPreview({ value }) {
  if (!value || !String(value).trim()) {
    return <p className="text-sm text-slate-500">No technical details provided.</p>;
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return (
        <ul className="list-disc list-inside text-sm text-slate-700">
          {parsed.map((it, i) => <li key={i}>{typeof it === 'string' ? it : JSON.stringify(it)}</li>)}
        </ul>
      );
    }
    if (typeof parsed === 'object' && parsed !== null) {
      return (
        <dl className="text-sm">
          {Object.entries(parsed).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1">
              <dt className="text-slate-600">{k}</dt>
              <dd className="text-slate-800">{String(v)}</dd>
            </div>
          ))}
        </dl>
      );
    }
  } catch (e) {
    console.warn('SpecPreview JSON parse failed', e);
    // fallback to lines
  }
  return (
    <div className="text-sm">
      {String(value).split(/\r?\n/).map((line, idx) => (
        <div key={idx} className="py-1 text-slate-700">• {line}</div>
      ))}
    </div>
  );
}
