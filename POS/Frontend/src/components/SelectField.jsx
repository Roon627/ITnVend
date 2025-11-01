import React, { useState } from 'react';

export default function SelectField({ label, value, onChange, options = [], placeholder = 'Select', name, disabled, className = '', allowCreate = false, createLabel = 'Add new...', onCreate }) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const CREATE_NEW_VALUE = 'CREATE_NEW';

  const handleSelectChange = (e) => {
    const selectedValue = e.target.value;
    if (selectedValue === CREATE_NEW_VALUE) {
      setAdding(true);
      // Don't bubble up the special value
    } else {
      setAdding(false); // Hide input if user selects a regular option
      if (onChange) {
        onChange(selectedValue);
      }
    }
  };

  return (
    <div className="block text-sm font-medium text-slate-700">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <select
        name={name}
        value={adding ? CREATE_NEW_VALUE : (value || '')}
        onChange={handleSelectChange}
        disabled={disabled}
        className={`mt-1 w-full rounded-md border-slate-300 shadow-sm bg-white px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500
                   disabled:bg-slate-50 disabled:text-slate-400 ${className}`}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.id ?? opt.value ?? opt} value={opt.id ?? opt.value ?? opt}>
            {opt.name ?? opt.label ?? opt}
          </option>
        ))}
        {allowCreate && (
          <option value={CREATE_NEW_VALUE} className="text-sky-600 font-medium">
            {createLabel}
          </option>
        )}
      </select>
      {allowCreate && adding && (
        <div className="mt-2 flex items-center gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={`New ${label?.toLowerCase?.() || 'item'}`}
            className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="button"
            className="rounded-md bg-emerald-500 text-white text-sm px-3 py-2 hover:bg-emerald-600 disabled:bg-emerald-300"
            onClick={async () => {
              const name = (draft || '').trim();
              if (!name || !onCreate) return;
              const success = await onCreate(name);
              if (success) {
                setDraft('');
                setAdding(false);
              }
            }}
            disabled={!draft.trim()}
          >
            Save
          </button>
        </div>
      )}
    </div>
  );
}
