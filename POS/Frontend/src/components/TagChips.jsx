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
      <div className="flex gap-2 flex-wrap p-2 rounded-md bg-slate-50 border min-h-[40px]">
        {selected.length === 0 && <div className="text-xs text-slate-400 px-2 py-1">No tags selected</div>}
        {selected.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => toggle(t.id)}
            className="inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-sm font-medium text-rose-800 hover:bg-rose-200 transition-colors"
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
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <div className="relative">
          {query && (
          <div className="absolute right-0 bottom-full mb-2 w-64 max-h-48 overflow-auto rounded-lg border bg-white p-2 shadow-lg z-10">
            {filtered.map((opt) => (
              <div key={opt.id} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-sky-50">
                <div className="text-sm text-slate-800">{opt.name}</div>
                <button
                  type="button"
                  onClick={() => toggle(opt.id)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold ${value.includes(opt.id) ? 'bg-rose-100 text-rose-700' : 'bg-sky-100 text-sky-700'}`}
                >
                  {value.includes(opt.id) ? 'Remove' : 'Add'}
                </button>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="p-4 text-center">
                <p className="text-sm text-slate-600 mb-2">No tag found for "{query}"</p>
                <input 
                  type="text"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder={`New tag: ${query}`}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); }}}
                />
                 <button 
                    onClick={handleCreateTag}
                    disabled={isCreating}
                    className="mt-2 w-full text-sm px-3 py-2 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-300"
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
