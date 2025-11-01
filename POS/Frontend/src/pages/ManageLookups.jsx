import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { useToast } from '../components/ToastContext';
import CategoryManager from '../components/CategoryManager';

const EditableList = ({ title, items, onUpdate, onDelete, onAdd }) => {
  const [drafts, setDrafts] = useState({});
  const [newItem, setNewItem] = useState('');

  useEffect(() => {
    // Reset drafts when items change to avoid stale state
    setDrafts({});
  }, [items]);

  const handleUpdate = (id) => {
    const name = drafts[id]?.trim();
    if (name && name !== items.find(i => i.id === id)?.name) {
      onUpdate(id, name);
      setDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(newItem.trim());
      setNewItem('');
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h2 className="text-xl font-semibold text-slate-700 mb-4">{title}</h2>
      <div className="max-h-60 overflow-y-auto pr-2">
        <ul className="space-y-2">
          {items.map(item => (
            <li key={item.id} className="flex items-center gap-2">
              <input
                type="text"
                value={drafts[item.id] ?? item.name}
                onChange={(e) => setDrafts(prev => ({ ...prev, [item.id]: e.target.value }))}
                onBlur={() => handleUpdate(item.id)}
                onKeyDown={(e) => e.key === 'Enter' && handleUpdate(item.id)}
                className="flex-1 rounded-md border-slate-300 shadow-sm px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={() => onDelete(item.id)}
                className="px-3 py-1 text-sm rounded-md bg-red-500 text-white hover:bg-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-4 pt-4 border-t flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder={`New ${title.slice(0, -1).toLowerCase()}`}
          className="flex-1 rounded-md border-slate-300 shadow-sm px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        <button
          onClick={handleAdd}
          className="px-3 py-1 text-sm rounded-md bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-emerald-300"
          disabled={!newItem.trim()}
        >
          Add
        </button>
      </div>
    </div>
  );
};

export default function ManageLookups() {
  const [lookups, setLookups] = useState({ brands: [], materials: [], colors: [], tags: [] });
  const [categories, setCategories] = useState([]);
  const toast = useToast();

  const fetchLookups = useCallback(async () => {
    try {
      const [lu, cats] = await Promise.all([
        api.get('/lookups'),
        api.get('/categories/tree?depth=10') // Fetch full tree
      ]);
      setLookups(lu || { brands: [], materials: [], colors: [], tags: [] });
      setCategories(cats || []);
    } catch (err) {
      toast.push('Failed to load lookup data', 'error');
    }
  }, [toast]);

  useEffect(() => {
    fetchLookups();
  }, [fetchLookups]);

  const handleGenericUpdate = async (type, id, name) => {
    try {
      await api.put(`/${type}/${id}`, { name });
      toast.push(`${type.slice(0, -1)} updated`, 'success');
      fetchLookups();
    } catch (err) {
      toast.push(`Failed to update ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleGenericDelete = async (type, id) => {
    if (!window.confirm(`Are you sure you want to delete this ${type.slice(0, -1)}? This might affect existing products.`)) return;
    try {
      await api.del(`/${type}/${id}`);
      toast.push(`${type.slice(0, -1)} deleted`, 'success');
      fetchLookups();
    } catch (err) {
      toast.push(`Failed to delete ${type.slice(0, -1)}`, 'error');
    }
  };

  const handleGenericAdd = async (type, name) => {
    try {
      await api.post(`/${type}`, { name });
      toast.push(`${type.slice(0, -1)} added`, 'success');
      fetchLookups();
    } catch (err) {
      toast.push(`Failed to add ${type.slice(0, -1)}`, 'error');
    }
  };

  return (
    <div className="p-6 bg-slate-50 min-h-full">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-6">Manage Lookups</h1>
        
        <div className="mb-8">
          <CategoryManager categories={categories} onMutate={fetchLookups} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <EditableList
            title="Brands"
            items={lookups.brands}
            onUpdate={(id, name) => handleGenericUpdate('brands', id, name)}
            onDelete={(id) => handleGenericDelete('brands', id)}
            onAdd={(name) => handleGenericAdd('brands', name)}
          />
          <EditableList
            title="Materials"
            items={lookups.materials}
            onUpdate={(id, name) => handleGenericUpdate('materials', id, name)}
            onDelete={(id) => handleGenericDelete('materials', id)}
            onAdd={(name) => handleGenericAdd('materials', name)}
          />
          <EditableList
            title="Colors"
            items={lookups.colors}
            onUpdate={(id, name) => handleGenericUpdate('colors', id, name)}
            onDelete={(id) => handleGenericDelete('colors', id)}
            onAdd={(name) => handleGenericAdd('colors', name)}
          />
          <EditableList
            title="Tags"
            items={lookups.tags}
            onUpdate={(id, name) => handleGenericUpdate('tags', id, name)}
            onDelete={(id) => handleGenericDelete('tags', id)}
            onAdd={(name) => handleGenericAdd('tags', name)}
          />
        </div>
      </div>
    </div>
  );
}
