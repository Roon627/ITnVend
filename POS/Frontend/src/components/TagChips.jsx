import React, { useMemo, useState } from 'react';
import api from '../lib/api';
import { useToast } from './ToastContext';

export default function TagChips({ options = [], value = [], onChange, onTagsChanged }) {
  const [query, setQuery] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const toast = useToast();

  const selected = useMemo(() => {
    const map = {};
    (options || []).forEach((o) => (map[o.id] = o));
    return (value || []).map((id) => map[id]).filter(Boolean);
  }, [options, value]);

  const filtered = useMemo(() => {
    const q = String(query || '').toLowerCase().trim();
    if (!q) return (options || []);
    return (options || []).filter((o) => (o.name || '').toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (id) => {
    const next = new Set(value || []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange && onChange(Array.from(next));
  };

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    if ((options || []).some(opt => opt.name.toLowerCase() === name.toLowerCase())) {
        toast.push('Tag already exists', 'warning');
        return;
    }
    setIsCreating(true);
    try {
        const newTag = await api.post('/tags', { name });
        toast.push('Tag created', 'info');
        setNewTagName('');
        if (onTagsChanged) {
          await onTagsChanged();
        }
        // Automatically select the new tag
        const next = new Set(value || []);
        next.add(newTag.id);
        onChange && onChange(Array.from(next));
    } catch (err) {
        toast.push(err?.message || 'Failed to create tag', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex min-h-[40px] flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
        {selected.length === 0 && (
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-400">No tags selected</div>
        )}
        {selected.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-medium text-rose-800 transition hover:bg-rose-200"
          >
            {t.name}
            <span className="text-rose-500 font-bold">×</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or add tags..."
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow focus:border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-100"
        />
        <div className="relative">
          {query && (
          <div className="absolute right-0 bottom-full mb-2 w-64 max-h-60 overflow-auto rounded-2xl border border-rose-100 bg-white/95 p-3 text-sm shadow-xl shadow-rose-100">
            {filtered.map((opt) => (
              <div key={opt.id} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-rose-50">
                <div className="text-slate-800">{opt.name}</div>
                <button
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${
                    value.includes(opt.id)
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {value.includes(opt.id) ? 'Remove' : 'Add'}
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="rounded-2xl border border-dashed border-rose-100 bg-rose-50/60 p-4 text-center">
                <p className="mb-2 text-sm text-rose-600">No tag found for "{query}"</p>
                <input 
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={`New tag: ${query}`}
                  className="w-full rounded-lg border border-white bg-white px-3 py-2 text-sm text-slate-700 shadow focus:border-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-100"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); }}}
                />
                 <button 
                    onClick={handleCreateTag}
                    disabled={isCreating}
                    className="mt-3 w-full rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:bg-emerald-300"
                  >
                   {isCreating ? 'Creating...' : `Create "${newTagName || query}"`}
                  </button>
              </div>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
