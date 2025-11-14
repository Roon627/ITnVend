import React, { useState } from 'react';

export default function SelectField({
  label,
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  name,
  disabled,
  className = '',
  allowCreate = false,
  createLabel = 'Add',
  onCreate,
  helperText,
}) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const canCreate = allowCreate && typeof onCreate === 'function';

  const normalizedValue =
    value === undefined || value === null ? '' : String(value);

  const optionValue = (opt) => {
    if (opt && typeof opt === 'object') {
      if (opt.value !== undefined && opt.value !== null) return String(opt.value);
      if (opt.id !== undefined && opt.id !== null) return String(opt.id);
    }
    return String(opt ?? '');
  };

  const handleCreate = async () => {
    const trimmed = draft.trim();
    if (!trimmed || !onCreate) return;
    const result = await onCreate(trimmed);
    if (result !== false) {
      setDraft('');
      setAdding(false);
    }
  };

  const normalizedOptions = Array.isArray(options)
    ? options.map((opt) => {
        if (!opt && opt !== 0) return null;
        if (typeof opt === 'string' || typeof opt === 'number') {
          return { id: String(opt), name: opt };
        }
        const id =
          opt.id ??
          opt.value ??
          opt.slug ??
          (typeof opt.name === 'string' ? opt.name : '');
        return {
          ...opt,
          id: String(id),
          name: opt.name || opt.label || String(id),
        };
      }).filter(Boolean)
    : [];

  return (
    <div className="space-y-2 text-sm text-slate-700">
      {label && (
        <div className="flex items-center justify-between gap-3">
          <label className="font-medium text-slate-700">{label}</label>
          {canCreate && !disabled && (
            <button
              type="button"
              onClick={() => {
                setAdding((prev) => !prev);
                if (adding) setDraft('');
              }}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:text-rose-600"
            >
              {adding ? 'Close' : createLabel}
            </button>
          )}
        </div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white/80 px-3 py-2 shadow-sm focus-within:border-rose-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-rose-100">
        <select
          name={name}
          value={normalizedValue}
          onChange={(e) => onChange && onChange(e.target.value)}
          disabled={disabled}
          className={`w-full bg-transparent text-sm text-slate-700 outline-none ${disabled ? 'text-slate-400' : ''} ${className}`}
        >
          <option value="">{placeholder}</option>
        {normalizedOptions.map((opt) => {
          const optionId =
            opt?.lookupId != null ? `lookup-${opt.lookupId}` : opt?.id;
          return (
            <option key={optionId || opt?.name} value={optionValue(opt)}>
              {opt.name}
            </option>
          );
        })}
        </select>
        {helperText && (
          <p className="mt-1 text-xs text-slate-400">{helperText}</p>
        )}
      </div>
      {canCreate && adding && (
        <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-3 text-xs shadow-inner">
          <p className="mb-2 font-semibold text-rose-500">
            Create a new {label?.toLowerCase?.() || 'item'}
          </p>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`New ${label?.toLowerCase?.() || 'item'} name`}
            className="w-full rounded-lg border border-white/70 bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-100"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft('');
                setAdding(false);
              }}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:border-slate-300"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreate}
              disabled={!draft.trim()}
              className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1 text-xs font-semibold text-white shadow hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
